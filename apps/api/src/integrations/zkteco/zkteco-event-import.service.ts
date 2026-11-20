import { Injectable, Logger } from '@nestjs/common';
import { CheckInMethod, Prisma, Role } from '@fit/db';
import { CheckInService } from '../../check-in/check-in.service';
import { tenantStorage } from '../../common/tenant/tenant.context';
import { PrismaService } from '../../prisma/prisma.service';
import { ZktecoGateway, ZktecoUnavailableError, type ZktecoTarget } from './zkteco-gateway';

/** ZKBio asks for at least 10 seconds between polls; a device log read is heavier still. */
export const MIN_POLL_MS: Record<ZktecoTarget['type'], number> = {
  zkbio: 10_000,
  device: 30_000,
};
/**
 * One visit often crosses two readers (the street gate, then the hall door).
 * A second passage by the same member this close to a recorded one is not a
 * second arrival.
 */
export const SAME_VISIT_MS = 2 * 60_000;

export interface ImportSummary {
  imported: number;
  /** Passages by PINs the gym does not know (staff cards, someone else's people). */
  ignoredUnknown: number;
  /** Already imported, or the same visit as a recorded passage. */
  duplicates: number;
  failed: number;
  /** True when the poll was skipped because the last one was too recent. */
  throttled?: boolean;
  error?: string;
}

/**
 * Turns turnstile passages into check-ins. Each passage goes through the same
 * `CheckInService.recordCheckIn` the reception desk uses (method `TURNSTILE`),
 * so loyalty points, milestones and the live feed behave exactly as for a desk
 * check-in. The `(gymId, eventKey)` claim makes the import idempotent across
 * overlapping polls and API instances.
 */
@Injectable()
export class ZktecoEventImport {
  private readonly logger = new Logger(ZktecoEventImport.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ZktecoGateway,
    private readonly checkIns: CheckInService,
  ) {}

  async importGym(gymId: string, target: ZktecoTarget, now: Date): Promise<ImportSummary> {
    const summary: ImportSummary = { imported: 0, ignoredUnknown: 0, duplicates: 0, failed: 0 };
    if (!target.options.importEvents) return summary;
    const db = this.prisma.client;
    const state = await db.zktecoSyncState.findUnique({ where: { gymId } });
    if (
      state?.lastImportAt &&
      now.getTime() - state.lastImportAt.getTime() < MIN_POLL_MS[target.type]
    )
      return { ...summary, throttled: true };

    let batch;
    try {
      batch = await this.gateway.readEvents(target, state?.eventCursor ?? null, now);
    } catch (error) {
      const reason = error instanceof ZktecoUnavailableError ? error.reason : 'unreachable';
      // Stamp the attempt too, so a dead server is not polled faster than the floor.
      await db.zktecoSyncState.upsert({
        where: { gymId },
        create: { gymId, lastImportAt: now, lastError: reason, lastErrorAt: now },
        update: { lastImportAt: now, lastError: reason, lastErrorAt: now },
      });
      return { ...summary, error: reason };
    }

    const pins = [...new Set(batch.events.map((e) => e.pin))];
    const identities = pins.length
      ? await db.zktecoMember.findMany({
          where: { gymId, pin: { in: pins }, gymMemberId: { not: null } },
          select: { pin: true, gymMemberId: true },
        })
      : [];
    const memberByPin = new Map(identities.map((i) => [i.pin, i.gymMemberId!]));
    const locations = await this.validLocations(gymId, target);

    let newest = state?.lastEventAt ?? null;
    const events = [...batch.events].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const event of events) {
      const gymMemberId = memberByPin.get(event.pin);
      if (!gymMemberId) {
        summary.ignoredUnknown += 1;
        continue;
      }
      if (!(await this.claim(gymId, event.key, event.pin, event.at))) {
        summary.duplicates += 1;
        continue;
      }
      try {
        const sameVisit = await db.checkIn.findFirst({
          where: {
            gymId,
            gymMemberId,
            method: CheckInMethod.TURNSTILE,
            checkedInAt: {
              gte: new Date(event.at.getTime() - SAME_VISIT_MS),
              lte: new Date(event.at.getTime() + SAME_VISIT_MS),
            },
          },
          select: { id: true },
        });
        if (sameVisit) {
          await db.zktecoEvent.updateMany({
            where: { gymId, eventKey: event.key },
            data: { checkInId: sameVisit.id },
          });
          summary.duplicates += 1;
          continue;
        }
        const locationId = (event.deviceSn && locations.get(event.deviceSn)) || undefined;
        const recorded = await tenantStorage.run(
          { userId: null, gymId, role: Role.OWNER, allowCrossTenant: false },
          () =>
            this.checkIns.recordCheckIn(
              { gymMemberId, method: 'MANUAL', ...(locationId ? { locationId } : {}) },
              { turnstile: true, checkedInAt: event.at },
            ),
        );
        await db.zktecoEvent.updateMany({
          where: { gymId, eventKey: event.key },
          data: { checkInId: recorded.checkIn.id },
        });
        summary.imported += 1;
        if (!newest || event.at > newest) newest = event.at;
      } catch (error) {
        // Release the claim so the next poll (inside the overlap window) tries again.
        await db.zktecoEvent.deleteMany({ where: { gymId, eventKey: event.key } });
        summary.failed += 1;
        this.logger.warn(
          `ZKTeco passage could not be recorded for gym ${gymId} (${error instanceof Error ? error.name : 'error'})`,
        );
      }
    }

    await db.zktecoSyncState.upsert({
      where: { gymId },
      create: {
        gymId,
        eventCursor: batch.cursor,
        lastImportAt: now,
        lastEventAt: newest,
        eventsImported: summary.imported,
        eventsIgnored: summary.ignoredUnknown,
      },
      update: {
        eventCursor: batch.cursor,
        lastImportAt: now,
        lastEventAt: newest,
        eventsImported: { increment: summary.imported },
        eventsIgnored: { increment: summary.ignoredUnknown },
      },
    });
    return summary;
  }

  /**
   * Device serial → branch, keeping only branches that still belong to this gym.
   * Anything else falls back to the default branch inside `recordCheckIn`.
   */
  private async validLocations(gymId: string, target: ZktecoTarget): Promise<Map<string, string>> {
    const mapping = target.options.deviceLocations;
    const ids = [...new Set(Object.values(mapping))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.client.location.findMany({
      where: { gymId, id: { in: ids } },
      select: { id: true },
    });
    const valid = new Set(rows.map((r) => r.id));
    return new Map(Object.entries(mapping).filter(([, id]) => valid.has(id)));
  }

  private async claim(gymId: string, eventKey: string, pin: string, at: Date): Promise<boolean> {
    try {
      await this.prisma.client.zktecoEvent.create({
        data: { gymId, eventKey, pin, occurredAt: at },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return false;
      throw error;
    }
  }
}
