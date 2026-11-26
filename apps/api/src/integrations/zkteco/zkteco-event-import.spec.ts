import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckInMethod, Prisma } from '@fit/db';
import { DEFAULT_ZKTECO_SETTINGS } from '@fit/types';
import type { CheckInService } from '../../check-in/check-in.service';
import { tenantStorage } from '../../common/tenant/tenant.context';
import type { PrismaService } from '../../prisma/prisma.service';
import { ZktecoEventImport } from './zkteco-event-import.service';
import { ZktecoUnavailableError, type ZktecoGateway, type ZktecoTarget } from './zkteco-gateway';

const now = new Date('2026-11-20T08:00:00.000Z');
const target: ZktecoTarget = {
  type: 'zkbio',
  zkbio: { baseUrl: 'https://bio.example.ge', apiToken: 't' },
  options: { ...DEFAULT_ZKTECO_SETTINGS, deviceLocations: { SN1: 'loc-vake', SN9: 'loc-gone' } },
};
const event = (key: string, pin: string, at: string, deviceSn: string | null = 'SN1') => ({
  key,
  pin,
  at: new Date(at),
  deviceSn,
});

function setup() {
  const db = {
    zktecoSyncState: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ eventCursor: 'c0', lastImportAt: null, lastEventAt: null }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    zktecoMember: {
      findMany: vi.fn().mockResolvedValue([{ pin: '20001', gymMemberId: 'm1' }]),
    },
    zktecoEvent: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    checkIn: { findFirst: vi.fn().mockResolvedValue(null) },
    location: { findMany: vi.fn().mockResolvedValue([{ id: 'loc-vake' }]) },
  };
  const gateway = {
    readEvents: vi.fn().mockResolvedValue({
      events: [event('access:SN1:e1:20001', '20001', '2026-11-20T07:59:00Z')],
      skipped: 0,
      cursor: 'c1',
    }),
  };
  const seenGyms: (string | null | undefined)[] = [];
  const checkIns = {
    recordCheckIn: vi.fn(() => {
      seenGyms.push(tenantStorage.getStore()?.gymId);
      return Promise.resolve({ checkIn: { id: 'ci1' } });
    }),
  };
  const importer = new ZktecoEventImport(
    { client: db } as unknown as PrismaService,
    gateway as unknown as ZktecoGateway,
    checkIns as unknown as CheckInService,
  );
  return { importer, db, gateway, checkIns, seenGyms };
}
let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('ZktecoEventImport', () => {
  it('records a passage as a TURNSTILE check-in in the gym’s own tenant, at its branch', async () => {
    const summary = await ctx.importer.importGym('gym', target, now);
    expect(summary).toEqual({ imported: 1, ignoredUnknown: 0, duplicates: 0, failed: 0 });
    expect(ctx.gateway.readEvents).toHaveBeenCalledWith(target, 'c0', now);
    expect(ctx.checkIns.recordCheckIn).toHaveBeenCalledWith(
      { gymMemberId: 'm1', method: 'MANUAL', locationId: 'loc-vake' },
      { turnstile: true, checkedInAt: new Date('2026-11-20T07:59:00Z') },
    );
    expect(ctx.seenGyms).toEqual(['gym']);
    expect(ctx.db.zktecoEvent.create).toHaveBeenCalledWith({
      data: {
        gymId: 'gym',
        eventKey: 'access:SN1:e1:20001',
        pin: '20001',
        occurredAt: new Date('2026-11-20T07:59:00Z'),
      },
    });
    expect(ctx.db.zktecoEvent.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym', eventKey: 'access:SN1:e1:20001' },
      data: { checkInId: 'ci1' },
    });
    const upsert = ctx.db.zktecoSyncState.upsert.mock.calls[0]![0] as { update: object };
    expect(upsert.update).toMatchObject({
      eventCursor: 'c1',
      lastImportAt: now,
      eventsImported: { increment: 1 },
      eventsIgnored: { increment: 0 },
    });
  });
  it('ignores unknown PINs and falls back to the default branch for an unmapped device', async () => {
    ctx.gateway.readEvents.mockResolvedValue({
      events: [
        event('k1', '77777', '2026-11-20T07:58:00Z'),
        event('k2', '20001', '2026-11-20T07:59:00Z', 'SN9'),
      ],
      skipped: 0,
      cursor: 'c1',
    });
    const summary = await ctx.importer.importGym('gym', target, now);
    expect(summary).toMatchObject({ imported: 1, ignoredUnknown: 1 });
    // SN9 maps to a branch the gym no longer has: no locationId, so the default applies.
    expect(ctx.checkIns.recordCheckIn).toHaveBeenCalledWith(
      { gymMemberId: 'm1', method: 'MANUAL' },
      expect.anything(),
    );
  });
  it('is idempotent: an already claimed passage is never recorded again', async () => {
    ctx.db.zktecoEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await ctx.importer.importGym('gym', target, now)).toMatchObject({
      imported: 0,
      duplicates: 1,
    });
    expect(ctx.checkIns.recordCheckIn).not.toHaveBeenCalled();
  });
  it('treats a second reader in the same visit as the same arrival', async () => {
    ctx.db.checkIn.findFirst.mockResolvedValue({ id: 'ci0' });
    expect(await ctx.importer.importGym('gym', target, now)).toMatchObject({ duplicates: 1 });
    expect(
      (ctx.db.checkIn.findFirst.mock.calls[0]![0] as { where: { method: string } }).where.method,
    ).toBe(CheckInMethod.TURNSTILE);
    expect(ctx.checkIns.recordCheckIn).not.toHaveBeenCalled();
  });
  it('releases the claim when the check-in cannot be written, so the next poll retries', async () => {
    ctx.checkIns.recordCheckIn.mockRejectedValueOnce(new Error('boom'));
    expect(await ctx.importer.importGym('gym', target, now)).toMatchObject({ failed: 1 });
    expect(ctx.db.zktecoEvent.deleteMany).toHaveBeenCalledWith({
      where: { gymId: 'gym', eventKey: 'access:SN1:e1:20001' },
    });
  });
  it('never polls zkbio faster than every 10 seconds', async () => {
    ctx.db.zktecoSyncState.findUnique.mockResolvedValue({
      eventCursor: 'c0',
      lastImportAt: new Date(now.getTime() - 9_000),
    });
    expect(await ctx.importer.importGym('gym', target, now)).toMatchObject({ throttled: true });
    expect(ctx.gateway.readEvents).not.toHaveBeenCalled();
  });
  it('records an unreachable server and stamps the attempt', async () => {
    ctx.gateway.readEvents.mockRejectedValue(new ZktecoUnavailableError('unreachable'));
    expect(await ctx.importer.importGym('gym', target, now)).toMatchObject({
      error: 'unreachable',
    });
    expect(ctx.db.zktecoSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { lastImportAt: now, lastError: 'unreachable', lastErrorAt: now },
      }),
    );
  });
  it('does nothing when importing passages is switched off', async () => {
    const off = { ...target, options: { ...target.options, importEvents: false } } as ZktecoTarget;
    await ctx.importer.importGym('gym', off, now);
    expect(ctx.gateway.readEvents).not.toHaveBeenCalled();
  });
});
