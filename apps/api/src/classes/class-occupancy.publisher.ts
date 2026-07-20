import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@fit/db';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { OccupancyStreamService } from '../live/occupancy-stream.service';

/**
 * The occupancy producer for the live schedule + member class-detail views
 * (T8.10). A single seam the booking flow ({@link BookingsService}) and the
 * front-desk schedule actions ({@link AdminScheduleService}) share so every
 * seat-count change — a self book / cancel, a waitlist auto-promote, a desk
 * cancel / promote / book-on-behalf — broadcasts the *same* occupancy snapshot
 * the same way, and the two services can never drift on the wire shape.
 *
 * Callers invoke {@link publish} **after** their transaction commits (never
 * inside it) and do not await it: it re-reads the occurrence's settled counts and
 * hands a snapshot to the debounced {@link OccupancyStreamService}. Re-reading
 * (rather than trusting the mutation's own return) keeps the broadcast correct
 * even when concurrent bookings landed in between, and lets the one method serve
 * every call site regardless of what each already had in hand. Strictly
 * best-effort: any failure (the occurrence vanished, Redis down) is logged and
 * swallowed so a live-push hiccup can never disturb the write the caller just
 * completed — the client's next fetch of the occurrence catches the counts up.
 */
@Injectable()
export class ClassOccupancyPublisher {
  private readonly logger = new Logger(ClassOccupancyPublisher.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly stream: OccupancyStreamService,
  ) {}

  /**
   * Read the occurrence's current occupancy and broadcast it to the gym's live
   * subscribers. Fire-and-forget and best-effort — see the class doc. A `null`
   * occurrence (deleted / cross-tenant) is a silent no-op: there is nothing to
   * broadcast.
   */
  async publish(classInstanceId: string): Promise<void> {
    try {
      const instance = await this.prisma.client.classInstance.findFirst({
        where: { id: classInstanceId },
        select: {
          status: true,
          bookedCount: true,
          capacityOverride: true,
          template: { select: { capacity: true } },
          classType: { select: { capacity: true } },
        },
      });
      if (!instance) {
        return;
      }

      const waitlistCount = await this.prisma.client.booking.count({
        where: { classInstanceId, status: BookingStatus.WAITLIST },
      });

      const capacity =
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0;

      this.stream.publish(this.tenant.gymId, {
        classInstanceId,
        capacity,
        bookedCount: instance.bookedCount,
        available: Math.max(0, capacity - instance.bookedCount),
        waitlistCount,
        // The Prisma `InstanceStatus` is generated value-identical to the
        // `ClassInstanceStatus` wire union, so it needs no mapping/cast — the same
        // way the schedule projection assigns it straight through.
        status: instance.status,
        at: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`occupancy publish failed: ${(err as Error).message}`);
    }
  }
}
