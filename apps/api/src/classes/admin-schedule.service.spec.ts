import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, InstanceStatus } from '@fit/db';
import type { AdminScheduleQuery } from '@fit/types';
import { AdminScheduleService } from './admin-schedule.service';
import type { CreditPacksService } from '../billing/credit-packs.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** A joined occurrence row as the schedule projection selects it. */
interface ScheduleRow {
  id: string;
  templateId: string;
  startsAt: Date;
  endsAt: Date;
  capacityOverride: number | null;
  bookedCount: number;
  status: InstanceStatus;
  template: {
    title: string;
    category: string;
    color: string;
    room: string | null;
    capacity: number;
    durationMinutes: number;
    trainer: { name: string } | null;
    location: { name: string } | null;
  };
}

interface FindManyArgs {
  where?: {
    startsAt?: { gte?: Date; lt?: Date };
    template?: { trainerId?: unknown; locationId?: unknown };
  };
  orderBy?: unknown;
  select?: unknown;
}

const row = (over?: Partial<ScheduleRow>): ScheduleRow => ({
  id: 'ci-1',
  templateId: 'ct-1',
  startsAt: new Date('2026-06-01T09:00:00.000Z'),
  endsAt: new Date('2026-06-01T10:00:00.000Z'),
  capacityOverride: null,
  bookedCount: 4,
  status: InstanceStatus.SCHEDULED,
  template: {
    title: 'Morning Flow',
    category: 'Yoga',
    color: '#2563eb',
    room: 'Studio A',
    capacity: 12,
    durationMinutes: 60,
    trainer: { name: 'Nino Beridze' },
    location: { name: 'Vake Branch' },
  },
  ...over,
});

function setup(findManyResult: ScheduleRow[] = []) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<ScheduleRow[]>>(() =>
    Promise.resolve(findManyResult),
  );
  const client = { classInstance: { findMany } } as unknown;
  const prisma = { client } as unknown as TenantPrismaService;
  const creditPacks = { refundCredit: vi.fn() } as unknown as CreditPacksService;
  return { service: new AdminScheduleService(prisma, creditPacks), findMany };
}

const query = (over?: Partial<AdminScheduleQuery>): AdminScheduleQuery => ({
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-08T00:00:00.000Z',
  ...over,
});

describe('AdminScheduleService', () => {
  afterEach(() => vi.clearAllMocks());

  it('windows the query to [from, to) on startsAt and orders by start then id', async () => {
    const { service, findMany } = setup([row()]);

    await service.listSchedule(query());

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0]![0];
    expect(args.where?.startsAt).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lt: new Date('2026-06-08T00:00:00.000Z'),
    });
    // No template filter when neither trainer nor location is requested.
    expect(args.where?.template).toBeUndefined();
    expect(args.orderBy).toEqual([{ startsAt: 'asc' }, { id: 'asc' }]);
  });

  it('projects an occurrence to the denormalised calendar block', async () => {
    const { service } = setup([row()]);

    const { instances } = await service.listSchedule(query());

    expect(instances).toEqual([
      {
        id: 'ci-1',
        templateId: 'ct-1',
        title: 'Morning Flow',
        category: 'Yoga',
        color: '#2563eb',
        startsAt: '2026-06-01T09:00:00.000Z',
        endsAt: '2026-06-01T10:00:00.000Z',
        durationMinutes: 60,
        trainerName: 'Nino Beridze',
        locationName: 'Vake Branch',
        room: 'Studio A',
        capacity: 12,
        bookedCount: 4,
        status: 'SCHEDULED',
      },
    ]);
  });

  it('prefers the per-occurrence capacity override over the template capacity', async () => {
    const { service } = setup([row({ capacityOverride: 8 })]);

    const { instances } = await service.listSchedule(query());

    expect(instances[0]!.capacity).toBe(8);
  });

  it('flattens an absent trainer / location / room to null (the admin convention)', async () => {
    const { service } = setup([
      row({ template: { ...row().template, trainer: null, location: null, room: null } }),
    ]);

    const { instances } = await service.listSchedule(query());

    expect(instances[0]!.trainerName).toBeNull();
    expect(instances[0]!.locationName).toBeNull();
    expect(instances[0]!.room).toBeNull();
  });

  it('returns occurrences of every status, not just SCHEDULED', async () => {
    const { service } = setup([
      row({ id: 'ci-a', status: InstanceStatus.SCHEDULED }),
      row({ id: 'ci-b', status: InstanceStatus.CANCELED }),
      row({ id: 'ci-c', status: InstanceStatus.COMPLETED }),
    ]);

    const { instances } = await service.listSchedule(query());

    expect(instances.map((i) => i.status)).toEqual(['SCHEDULED', 'CANCELED', 'COMPLETED']);
  });

  it('narrows through the template relation when a trainer filter is set', async () => {
    const { service, findMany } = setup();

    await service.listSchedule(query({ trainerId: 'tr-9' }));

    expect(findMany.mock.calls[0]![0].where?.template).toEqual({ trainerId: 'tr-9' });
  });

  it('narrows on both trainer and location together', async () => {
    const { service, findMany } = setup();

    await service.listSchedule(query({ trainerId: 'tr-9', locationId: 'loc-3' }));

    expect(findMany.mock.calls[0]![0].where?.template).toEqual({
      trainerId: 'tr-9',
      locationId: 'loc-3',
    });
  });

  it('returns an empty window as a normal result', async () => {
    const { service } = setup([]);

    await expect(service.listSchedule(query())).resolves.toEqual({ instances: [] });
  });
});

/** A roster booking row as ROSTER_SELECT projects it. */
const rosterRow = (
  id: string,
  status: BookingStatus,
  over?: {
    waitlistPosition?: number | null;
    createdAt?: Date;
    name?: string | null;
    email?: string;
    creditPackId?: string | null;
  },
) => ({
  id,
  memberId: `gm-${id}`,
  status,
  waitlistPosition: over?.waitlistPosition ?? null,
  createdAt: over?.createdAt ?? new Date('2026-06-01T08:00:00.000Z'),
  member: { user: { name: over?.name ?? 'Ada Lovelace', email: over?.email ?? 'ada@example.com' } },
});

/** Wire the tenant-scoped Prisma + credit-packs mocks for the drawer methods. */
function setupDetail() {
  const classInstance = {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
    update: vi.fn<(args: unknown) => Promise<unknown>>(),
  };
  const booking = {
    findMany: vi.fn<(args: { where?: Record<string, unknown> }) => Promise<unknown>>(() =>
      Promise.resolve([]),
    ),
    updateMany: vi.fn<(args: unknown) => Promise<unknown>>(),
  };
  const $transaction = vi.fn<(cb: (tx: unknown) => unknown) => unknown>();
  const client = { classInstance, booking, $transaction };
  $transaction.mockImplementation((cb) => cb(client));
  const prisma = { client } as unknown as TenantPrismaService;
  const refundCredit = vi.fn<(tx: unknown, id: string | null) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const creditPacks = { refundCredit } as unknown as CreditPacksService;
  return {
    service: new AdminScheduleService(prisma, creditPacks),
    classInstance,
    booking,
    refundCredit,
  };
}

describe('AdminScheduleService.getInstanceDetail', () => {
  afterEach(() => vi.clearAllMocks());

  it('404s an unknown / cross-tenant occurrence', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce(null);

    await expect(ctx.service.getInstanceDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects the block with its roster, ordering held seats before the waitlist', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce(row({ bookedCount: 2 }));
    // Returned in booking order; the projection re-orders held-seats-first.
    ctx.booking.findMany.mockResolvedValueOnce([
      rosterRow('wl-1', BookingStatus.WAITLIST, { waitlistPosition: 1 }),
      rosterRow('bk-1', BookingStatus.BOOKED, { createdAt: new Date('2026-06-01T07:00:00.000Z') }),
      rosterRow('bk-2', BookingStatus.ATTENDED, {
        createdAt: new Date('2026-06-01T07:30:00.000Z'),
      }),
      rosterRow('wl-2', BookingStatus.WAITLIST, { waitlistPosition: 2 }),
    ]);

    const detail = await ctx.service.getInstanceDetail('ci-1');

    expect(detail.roster.map((entry) => entry.bookingId)).toEqual(['bk-1', 'bk-2', 'wl-1', 'wl-2']);
    expect(detail.waitlistCount).toBe(2);
    expect(detail.roster[0]).toMatchObject({
      status: 'BOOKED',
      memberName: 'Ada Lovelace',
      memberEmail: 'ada@example.com',
      waitlistPosition: null,
    });
    expect(detail.roster[2]).toMatchObject({ status: 'WAITLIST', waitlistPosition: 1 });
    // Only non-canceled bookings are read for the roster.
    const rosterWhere = ctx.booking.findMany.mock.calls[0]![0].where ?? {};
    expect(rosterWhere.classInstanceId).toBe('ci-1');
    expect(rosterWhere.status).toHaveProperty('in');
  });
});

describe('AdminScheduleService.cancelInstance', () => {
  afterEach(() => vi.clearAllMocks());

  it('404s an unknown occurrence', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce(null);

    await expect(ctx.service.cancelInstance('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s a non-scheduled occurrence (already canceled / completed)', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce({
      id: 'ci-1',
      status: InstanceStatus.CANCELED,
    });

    await expect(ctx.service.cancelInstance('ci-1')).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.classInstance.update).not.toHaveBeenCalled();
  });

  it('refunds each held seat, releases all bookings, and empties the occurrence', async () => {
    const ctx = setupDetail();
    // 1) tx: load instance (SCHEDULED) → 2) tx: held-seat credit reads →
    // then getInstanceDetail re-reads the instance + (empty) roster.
    ctx.classInstance.findFirst
      .mockResolvedValueOnce({ id: 'ci-1', status: InstanceStatus.SCHEDULED })
      .mockResolvedValueOnce(row({ status: InstanceStatus.CANCELED, bookedCount: 0 }));
    ctx.booking.findMany
      .mockResolvedValueOnce([{ creditPackId: 'cp-1' }, { creditPackId: null }])
      .mockResolvedValueOnce([]); // getInstanceDetail roster read

    const detail = await ctx.service.cancelInstance('ci-1');

    // Only the credit-charged held seat is refunded (null pack is a no-op input).
    expect(ctx.refundCredit).toHaveBeenCalledTimes(2);
    expect(ctx.refundCredit.mock.calls[0]![1]).toBe('cp-1');
    // Every live booking is flipped to CANCELED with its queue slot cleared.
    expect(ctx.booking.updateMany).toHaveBeenCalledWith({
      where: { classInstanceId: 'ci-1', status: { not: BookingStatus.CANCELED } },
      data: { status: BookingStatus.CANCELED, waitlistPosition: null },
    });
    // The occurrence is canceled and emptied.
    expect(ctx.classInstance.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { status: InstanceStatus.CANCELED, bookedCount: 0 },
    });
    expect(detail.status).toBe('CANCELED');
    expect(detail.bookedCount).toBe(0);
    expect(detail.roster).toEqual([]);
  });
});
