import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GymMemberStatus, Prisma, SubscriptionStatus } from '@fit/db';
import { DEFAULT_ZKTECO_DEVICE_SETTINGS, DEFAULT_ZKTECO_SETTINGS } from '@fit/types';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  ZktecoUnavailableError,
  type PushOutcome,
  type ZktecoGateway,
  type ZktecoTarget,
} from './zkteco-gateway';
import { FIRST_PIN, ZktecoMemberSync, desiredState } from './zkteco-member-sync.service';
import type { ZktecoPhotoLoader } from './zkteco-photo-loader';

const now = new Date('2026-11-20T08:00:00.000Z');
const later = new Date('2026-12-20T08:00:00.000Z');
const earlier = new Date('2026-10-20T08:00:00.000Z');
const zkbio: ZktecoTarget = {
  type: 'zkbio',
  zkbio: { baseUrl: 'https://bio.example.ge', apiToken: 't' },
  options: { ...DEFAULT_ZKTECO_SETTINGS, syncPhoto: true },
};
const device: ZktecoTarget = {
  type: 'device',
  device: { host: '203.0.113.10' },
  recordSize: 72,
  options: DEFAULT_ZKTECO_DEVICE_SETTINGS,
};

function facts(
  status: SubscriptionStatus | null,
  overrides: { periodEnd?: Date; memberStatus?: GymMemberStatus; deletedAt?: Date | null } = {},
) {
  return {
    status: overrides.memberStatus ?? GymMemberStatus.ACTIVE,
    deletedAt: overrides.deletedAt ?? null,
    subscriptions: status
      ? [{ status, currentPeriodStart: earlier, currentPeriodEnd: overrides.periodEnd ?? later }]
      : [],
  };
}

describe('desiredState', () => {
  it('opens the gate for a live period with its window', () => {
    for (const status of [
      SubscriptionStatus.TRIAL,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
    ]) {
      expect(desiredState(facts(status), zkbio.options, 'zkbio', now)).toEqual({
        action: 'activate',
        validFrom: earlier,
        validUntil: later,
      });
    }
  });
  it('applies the end action to a lapsed, canceled, suspended or trashed member', () => {
    const options = { ...zkbio.options, onExpiry: 'disable' as const };
    expect(
      desiredState(facts(SubscriptionStatus.ACTIVE, { periodEnd: earlier }), options, 'zkbio', now)
        .action,
    ).toBe('disable');
    expect(desiredState(facts(SubscriptionStatus.CANCELED), options, 'zkbio', now).action).toBe(
      'disable',
    );
    expect(desiredState(facts(null), options, 'zkbio', now).action).toBe('disable');
    expect(
      desiredState(
        facts(SubscriptionStatus.ACTIVE, { memberStatus: 'SUSPENDED' as GymMemberStatus }),
        options,
        'zkbio',
        now,
      ).action,
    ).toBe('disable');
    expect(
      desiredState(facts(SubscriptionStatus.ACTIVE, { deletedAt: earlier }), options, 'zkbio', now)
        .action,
    ).toBe('disable');
    expect(desiredState(null, options, 'zkbio', now).action).toBe('delete');
  });
  it('blocks a freeze without deleting where the connection can disable', () => {
    const frozen = facts(SubscriptionStatus.FROZEN);
    expect(
      desiredState(frozen, { ...zkbio.options, onExpiry: 'delete' }, 'zkbio', now).action,
    ).toBe('disable');
    expect(
      desiredState(frozen, { ...zkbio.options, onExpiry: 'remove_access' }, 'zkbio', now).action,
    ).toBe('remove_access');
    expect(
      desiredState(frozen, { ...zkbio.options, blockOnFreeze: false }, 'zkbio', now),
    ).toMatchObject({
      action: 'activate',
      validUntil: null,
    });
  });
  it('always deletes on a standalone device', () => {
    expect(
      desiredState(facts(SubscriptionStatus.FROZEN), device.options, 'device', now).action,
    ).toBe('delete');
    expect(
      desiredState(facts(SubscriptionStatus.EXPIRED), device.options, 'device', now).action,
    ).toBe('delete');
  });
});

function member(
  id: string,
  status: SubscriptionStatus | null,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    ...facts(status),
    firstName: null,
    lastName: null,
    photoUrl: null,
    accessCardNumber: null,
    user: { name: 'ნინო ბერიძე' },
    ...extra,
  };
}
function identity(id: string, pin: string, gymMemberId: string | null, state = 'none') {
  return {
    id,
    gymId: 'gym',
    gymMemberId,
    pin,
    deviceUid: Number(pin),
    state,
    dirty: true,
    photoRef: null,
    syncedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: earlier,
  };
}

function setup() {
  const db = {
    zktecoMember: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _max: { deviceUid: null } }),
    },
    gymMember: { findMany: vi.fn().mockResolvedValue([]) },
    subscription: { findMany: vi.fn().mockResolvedValue([]) },
    zktecoSyncState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const gateway = {
    apply: vi.fn(
      (_t: unknown, pushes: { pin: string }[]): Promise<PushOutcome[]> =>
        Promise.resolve(pushes.map((p) => ({ pin: p.pin, ok: true }))),
    ),
    listRemotePins: vi.fn().mockResolvedValue(new Set<string>()),
  };
  const photos = { load: vi.fn().mockResolvedValue('photo-base64') };
  const sync = new ZktecoMemberSync(
    { client: db } as unknown as PrismaService,
    gateway as unknown as ZktecoGateway,
    photos as unknown as ZktecoPhotoLoader,
  );
  return { sync, db, gateway, photos };
}
let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('ZktecoMemberSync.scanChanges', () => {
  it('reads the change feed with an overlap and gives newly active members a PIN', async () => {
    ctx.db.zktecoSyncState.findUnique.mockResolvedValue({ lastChangeScanAt: earlier });
    ctx.db.subscription.findMany.mockResolvedValue([{ memberId: 'm1' }, { memberId: 'm2' }]);
    ctx.db.zktecoMember.findMany.mockResolvedValue([{ gymMemberId: 'm1' }]);
    ctx.db.gymMember.findMany
      .mockResolvedValueOnce([]) // trashed
      .mockResolvedValueOnce([member('m2', SubscriptionStatus.ACTIVE)]);
    ctx.db.zktecoMember.aggregate.mockResolvedValue({ _max: { deviceUid: 20005 } });

    expect(await ctx.sync.scanChanges('gym', zkbio, now)).toBe(2);

    const { where } = ctx.db.subscription.findMany.mock.calls[0]![0] as {
      where: { gymId: string; OR: { updatedAt: { gt: Date } }[] };
    };
    expect(where.gymId).toBe('gym');
    expect(where.OR[0]!.updatedAt.gt).toEqual(new Date(earlier.getTime() - 2 * 60_000));
    expect(ctx.db.zktecoMember.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym', gymMemberId: { in: ['m1'] } },
      data: { dirty: true },
    });
    expect(ctx.db.zktecoMember.create).toHaveBeenCalledWith({
      data: { gymId: 'gym', gymMemberId: 'm2', pin: '20006', deviceUid: 20006, dirty: true },
    });
    expect(ctx.db.zktecoSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastChangeScanAt: now } }),
    );
  });
  it('does not give a PIN to a member who should not be on the turnstile', async () => {
    ctx.db.subscription.findMany.mockResolvedValue([{ memberId: 'm3' }]);
    ctx.db.gymMember.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('m3', SubscriptionStatus.EXPIRED)]);
    await ctx.sync.scanChanges('gym', zkbio, now);
    expect(ctx.db.zktecoMember.create).not.toHaveBeenCalled();
  });
  it('starts at the first PIN and retries the next number on a collision', async () => {
    ctx.db.subscription.findMany.mockResolvedValue([{ memberId: 'm4' }]);
    ctx.db.gymMember.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('m4', SubscriptionStatus.ACTIVE)]);
    ctx.db.zktecoMember.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      )
      .mockResolvedValueOnce({});
    ctx.db.zktecoMember.aggregate
      .mockResolvedValueOnce({ _max: { deviceUid: null } })
      .mockResolvedValueOnce({ _max: { deviceUid: FIRST_PIN } });
    await ctx.sync.scanChanges('gym', zkbio, now);
    expect(
      ctx.db.zktecoMember.create.mock.calls.map(
        (c) => (c[0] as { data: { pin: string } }).data.pin,
      ),
    ).toEqual([String(FIRST_PIN), String(FIRST_PIN + 1)]);
  });
});

describe('ZktecoMemberSync.pushDirty', () => {
  it('pushes the desired state, loads a changed photo and clears the mark', async () => {
    ctx.db.zktecoMember.findMany.mockResolvedValue([identity('i1', '20001', 'm1')]);
    ctx.db.gymMember.findMany.mockResolvedValue([
      member('m1', SubscriptionStatus.ACTIVE, {
        photoUrl: 'https://cdn.example.ge/p.jpg',
        accessCardNumber: '42',
      }),
    ]);
    expect(await ctx.sync.pushDirty('gym', zkbio, now)).toEqual({ synced: 1, failed: 0 });
    const pushes = ctx.gateway.apply.mock.calls[0]![1];
    expect(pushes).toEqual([
      expect.objectContaining({
        pin: '20001',
        action: 'activate',
        firstName: 'ნინო',
        lastName: 'ბერიძე',
        cardNumber: '42',
        photo: 'photo-base64',
        validUntil: later,
      }),
    ]);
    expect(ctx.db.zktecoMember.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', updatedAt: earlier },
      data: {
        state: 'active',
        lastError: null,
        photoRef: 'https://cdn.example.ge/p.jpg',
        dirty: false,
        syncedAt: now,
      },
    });
  });
  it('tells the turnstile nothing for a never-pushed member who has ended', async () => {
    ctx.db.zktecoMember.findMany.mockResolvedValue([identity('i2', '20002', 'm2', 'none')]);
    ctx.db.gymMember.findMany.mockResolvedValue([member('m2', SubscriptionStatus.EXPIRED)]);
    expect(await ctx.sync.pushDirty('gym', zkbio, now)).toEqual({ synced: 0, failed: 0 });
    expect(ctx.gateway.apply).not.toHaveBeenCalled();
  });
  it('deletes a purged member from the turnstile, then forgets the PIN', async () => {
    ctx.db.zktecoMember.findMany.mockResolvedValue([identity('i3', '20003', null, 'active')]);
    await ctx.sync.pushDirty('gym', zkbio, now);
    expect(ctx.gateway.apply.mock.calls[0]![1]).toEqual([
      expect.objectContaining({ pin: '20003', action: 'delete' }),
    ]);
    expect(ctx.db.zktecoMember.deleteMany).toHaveBeenCalledWith({ where: { id: 'i3' } });
  });
  it('records a refusal and leaves everything pending when the connection fails', async () => {
    ctx.db.zktecoMember.findMany.mockResolvedValue([identity('i4', '20004', 'm4')]);
    ctx.db.gymMember.findMany.mockResolvedValue([member('m4', SubscriptionStatus.ACTIVE)]);
    ctx.gateway.apply.mockResolvedValueOnce([{ pin: '20004', ok: false, error: 'card_in_use' }]);
    expect(await ctx.sync.pushDirty('gym', zkbio, now)).toEqual({ synced: 0, failed: 1 });
    expect(ctx.db.zktecoMember.updateMany.mock.calls[0]![0]).toMatchObject({
      data: { lastError: 'card_in_use', dirty: false },
    });
    ctx.db.zktecoMember.updateMany.mockClear();
    ctx.gateway.apply.mockRejectedValueOnce(new ZktecoUnavailableError('unreachable'));
    expect(await ctx.sync.pushDirty('gym', zkbio, now)).toEqual({
      synced: 0,
      failed: 0,
      error: 'unreachable',
    });
    expect(ctx.db.zktecoMember.updateMany).not.toHaveBeenCalled();
  });
  it('keeps the mark when the member changed while being pushed', async () => {
    ctx.db.zktecoMember.findMany.mockResolvedValue([identity('i5', '20005', 'm5')]);
    ctx.db.gymMember.findMany.mockResolvedValue([member('m5', SubscriptionStatus.ACTIVE)]);
    ctx.db.zktecoMember.updateMany.mockResolvedValueOnce({ count: 0 });
    await ctx.sync.pushDirty('gym', zkbio, now);
    expect(ctx.db.zktecoMember.updateMany.mock.calls[1]![0]).toEqual({
      where: { id: 'i5' },
      data: { state: 'active', lastError: null, syncedAt: now },
    });
  });
  it('does nothing while member sync is switched off', async () => {
    const off = { ...zkbio, options: { ...zkbio.options, syncMembers: false } } as ZktecoTarget;
    await ctx.sync.pushDirty('gym', off, now);
    expect(ctx.db.zktecoMember.findMany).not.toHaveBeenCalled();
  });
});

describe('ZktecoMemberSync.reconcileRemote', () => {
  it('re-marks drift only among the gym’s own identities', async () => {
    ctx.gateway.listRemotePins.mockResolvedValue(new Set(['20002', '99999']));
    ctx.db.zktecoMember.findMany.mockResolvedValue([
      { id: 'a', pin: '20001', state: 'active' },
      { id: 'b', pin: '20002', state: 'delete' },
      { id: 'c', pin: '20003', state: 'remove_access' },
    ]);
    expect(await ctx.sync.reconcileRemote('gym', device, now)).toBe(2);
    expect(ctx.db.zktecoMember.updateMany).toHaveBeenCalledWith({
      where: { gymId: 'gym', id: { in: ['a', 'b'] } },
      data: { dirty: true },
    });
  });
});
