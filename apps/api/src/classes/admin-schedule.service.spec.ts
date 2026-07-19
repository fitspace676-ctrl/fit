import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, InstanceStatus, Prisma, SubscriptionStatus } from '@fit/db';
import type { AdminScheduleQuery } from '@fit/types';
import { AdminScheduleService } from './admin-schedule.service';
import type { ClassOccupancyPublisher } from './class-occupancy.publisher';
import type { CreditPacksService } from '../billing/credit-packs.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A stub live-occupancy producer (T8.10) the mutation methods fire after commit. */
function occupancyStub() {
  return {
    publish: vi.fn<(classInstanceId: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

/** A fixed tenant context — the service stamps `gymId` on a booking it creates. */
const tenantCtx = { gymId: 'gym-1' } as unknown as TenantContext;

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
  const occupancy = occupancyStub();
  return {
    service: new AdminScheduleService(
      prisma,
      creditPacks,
      tenantCtx,
      occupancy as unknown as ClassOccupancyPublisher,
    ),
    findMany,
  };
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

  it('narrows on the trainer at either the occurrence or its template', async () => {
    const { service, findMany } = setup();

    await service.listSchedule(query({ trainerId: 'tr-9' }));

    // A trainer filter matches the occurrence's own assignment (a class scheduled
    // from a type) or its template's default (a generated one).
    expect(findMany.mock.calls[0]![0].where?.AND).toEqual([
      { OR: [{ trainerId: 'tr-9' }, { template: { trainerId: 'tr-9' } }] },
    ]);
  });

  it('narrows on both trainer and location together', async () => {
    const { service, findMany } = setup();

    await service.listSchedule(query({ trainerId: 'tr-9', locationId: 'loc-3' }));

    expect(findMany.mock.calls[0]![0].where?.AND).toEqual([
      { OR: [{ trainerId: 'tr-9' }, { template: { trainerId: 'tr-9' } }] },
      { OR: [{ locationId: 'loc-3' }, { template: { locationId: 'loc-3' } }] },
    ]);
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
    updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 1 }),
    ),
  };
  const booking = {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
    findMany: vi.fn<(args: { where?: Record<string, unknown> }) => Promise<unknown>>(() =>
      Promise.resolve([]),
    ),
    aggregate: vi.fn<(args: unknown) => Promise<{ _max: { waitlistPosition: number | null } }>>(
      () => Promise.resolve({ _max: { waitlistPosition: null } }),
    ),
    create: vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
      Promise.resolve({ id: 'bk-new' }),
    ),
    update: vi.fn<(args: unknown) => Promise<unknown>>(),
    updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 1 }),
    ),
  };
  const gymMember = {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve({ id: 'gm-1' })),
  };
  const subscription = {
    findFirst: vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve(null)),
  };
  const $transaction = vi.fn<(cb: (tx: unknown) => unknown) => unknown>();
  const client = { classInstance, booking, gymMember, subscription, $transaction };
  $transaction.mockImplementation((cb) => cb(client));
  const prisma = { client } as unknown as TenantPrismaService;
  const refundCredit = vi.fn<(tx: unknown, id: string | null) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const chargeSeatCredit = vi.fn<
    (tx: unknown, memberId: string, opts?: unknown) => Promise<string | null>
  >(() => Promise.resolve(null));
  const creditPacks = { refundCredit, chargeSeatCredit } as unknown as CreditPacksService;
  const occupancy = occupancyStub();
  return {
    service: new AdminScheduleService(
      prisma,
      creditPacks,
      tenantCtx,
      occupancy as unknown as ClassOccupancyPublisher,
    ),
    classInstance,
    booking,
    gymMember,
    subscription,
    refundCredit,
    chargeSeatCredit,
    occupancy,
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
    // The emptied occurrence is pushed to the live occupancy stream (T8.10).
    expect(ctx.occupancy.publish).toHaveBeenCalledWith('ci-1');
  });
});

describe('AdminScheduleService.promoteWaitlistEntry', () => {
  afterEach(() => vi.clearAllMocks());

  it('404s an unknown / cross-tenant occurrence', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce(null);

    await expect(ctx.service.promoteWaitlistEntry('nope', 'bk-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ctx.booking.updateMany).not.toHaveBeenCalled();
  });

  it('409s a non-scheduled occurrence (canceled / completed)', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce({
      id: 'ci-1',
      status: InstanceStatus.CANCELED,
    });

    await expect(ctx.service.promoteWaitlistEntry('ci-1', 'bk-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.booking.findFirst).not.toHaveBeenCalled();
  });

  it('404s a booking that is not on the occurrence', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce({
      id: 'ci-1',
      status: InstanceStatus.SCHEDULED,
    });
    ctx.booking.findFirst.mockResolvedValueOnce(null);

    await expect(ctx.service.promoteWaitlistEntry('ci-1', 'bk-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ctx.booking.updateMany).not.toHaveBeenCalled();
  });

  it('409s a booking that is not a live waitlist entry (a held seat)', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce({
      id: 'ci-1',
      status: InstanceStatus.SCHEDULED,
    });
    ctx.booking.findFirst.mockResolvedValueOnce({
      id: 'bk-1',
      status: BookingStatus.BOOKED,
      waitlistPosition: null,
      memberId: 'gm-1',
    });

    await expect(ctx.service.promoteWaitlistEntry('ci-1', 'bk-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Never attempts the claim for a non-waitlisted booking.
    expect(ctx.booking.updateMany).not.toHaveBeenCalled();
    expect(ctx.classInstance.update).not.toHaveBeenCalled();
  });

  it('409s when the entry was auto-promoted concurrently (the claim loses the race)', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce({
      id: 'ci-1',
      status: InstanceStatus.SCHEDULED,
    });
    ctx.booking.findFirst.mockResolvedValueOnce({
      id: 'wl-1',
      status: BookingStatus.WAITLIST,
      waitlistPosition: 1,
      memberId: 'gm-1',
    });
    // The guarded claim flips no row — another cancellation already took it.
    ctx.booking.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(ctx.service.promoteWaitlistEntry('ci-1', 'wl-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    // The seat is never added when the claim fails.
    expect(ctx.classInstance.update).not.toHaveBeenCalled();
    expect(ctx.chargeSeatCredit).not.toHaveBeenCalled();
  });

  it('promotes the entry into an added seat, charges a credit, and closes the queue gap', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst
      // tx: load the occurrence (SCHEDULED)
      .mockResolvedValueOnce({ id: 'ci-1', status: InstanceStatus.SCHEDULED })
      // getInstanceDetail re-read after the promote
      .mockResolvedValueOnce(row({ bookedCount: 6 }));
    ctx.booking.findFirst.mockResolvedValueOnce({
      id: 'wl-1',
      status: BookingStatus.WAITLIST,
      waitlistPosition: 1,
      memberId: 'gm-1',
    });
    // The claim succeeds (default count 1); the promoted member draws a pack.
    ctx.chargeSeatCredit.mockResolvedValueOnce('cp-9');

    const detail = await ctx.service.promoteWaitlistEntry('ci-1', 'wl-1');

    // The queued entry is claimed guarded on WAITLIST → BOOKED, queue slot cleared.
    expect(ctx.booking.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'wl-1', status: BookingStatus.WAITLIST },
      data: { status: BookingStatus.BOOKED, waitlistPosition: null },
    });
    // The promoted member pays a class credit best-effort; the pack is recorded.
    expect(ctx.chargeSeatCredit).toHaveBeenCalledWith(expect.anything(), 'gm-1', {
      required: false,
    });
    expect(ctx.booking.update).toHaveBeenCalledWith({
      where: { id: 'wl-1' },
      data: { creditPackId: 'cp-9' },
    });
    // A manual promote *adds* a held seat — bookedCount grows by one.
    expect(ctx.classInstance.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { bookedCount: { increment: 1 } },
    });
    // The gap behind the promoted entry is closed so the queue stays 1..N.
    expect(ctx.booking.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        classInstanceId: 'ci-1',
        status: BookingStatus.WAITLIST,
        waitlistPosition: { gt: 1 },
      },
      data: { waitlistPosition: { decrement: 1 } },
    });
    expect(detail.bookedCount).toBe(6);
    // The added seat is pushed to the live occupancy stream (T8.10).
    expect(ctx.occupancy.publish).toHaveBeenCalledWith('ci-1');
  });

  it('still promotes a member with no credits left (best-effort charge is a no-op)', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst
      .mockResolvedValueOnce({ id: 'ci-1', status: InstanceStatus.SCHEDULED })
      .mockResolvedValueOnce(row({ bookedCount: 6 }));
    ctx.booking.findFirst.mockResolvedValueOnce({
      id: 'wl-1',
      status: BookingStatus.WAITLIST,
      waitlistPosition: 1,
      memberId: 'gm-1',
    });
    // Out of credits → null pack: the seat is still granted, uncharged.
    ctx.chargeSeatCredit.mockResolvedValueOnce(null);

    await ctx.service.promoteWaitlistEntry('ci-1', 'wl-1');

    // No pack to record, but the seat is still added.
    expect(ctx.booking.update).not.toHaveBeenCalled();
    expect(ctx.classInstance.update).toHaveBeenCalledWith({
      where: { id: 'ci-1' },
      data: { bookedCount: { increment: 1 } },
    });
  });
});

describe('AdminScheduleService.bookMemberOntoClass', () => {
  afterEach(() => vi.clearAllMocks());

  /** The occurrence-load projection the book transaction reads first. */
  const scheduledInstance = (over?: {
    bookedCount?: number;
    capacityOverride?: number | null;
  }) => ({
    id: 'ci-1',
    status: InstanceStatus.SCHEDULED,
    bookedCount: over?.bookedCount ?? 4,
    capacityOverride: over?.capacityOverride ?? null,
    template: { capacity: 12 },
  });

  it('404s an unknown / cross-tenant member', async () => {
    const ctx = setupDetail();
    ctx.gymMember.findFirst.mockResolvedValueOnce(null);

    await expect(ctx.service.bookMemberOntoClass('ci-1', 'gm-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Never opens the booking transaction for an unknown member.
    expect(ctx.booking.create).not.toHaveBeenCalled();
  });

  it('409s a member whose membership is frozen', async () => {
    const ctx = setupDetail();
    ctx.subscription.findFirst.mockResolvedValueOnce({ id: 'sub-1' });

    await expect(ctx.service.bookMemberOntoClass('ci-1', 'gm-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.subscription.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { memberId: 'gm-1', status: SubscriptionStatus.FROZEN },
    });
    expect(ctx.booking.create).not.toHaveBeenCalled();
  });

  it('404s an unknown occurrence', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce(null);

    await expect(ctx.service.bookMemberOntoClass('nope', 'gm-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ctx.booking.create).not.toHaveBeenCalled();
  });

  it('409s a non-scheduled occurrence (canceled / completed)', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce({
      id: 'ci-1',
      status: InstanceStatus.CANCELED,
      bookedCount: 0,
      capacityOverride: null,
      template: { capacity: 12 },
    });

    await expect(ctx.service.bookMemberOntoClass('ci-1', 'gm-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
    expect(ctx.booking.create).not.toHaveBeenCalled();
  });

  it('409s a member who already holds a live booking', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce(scheduledInstance());
    ctx.booking.findFirst.mockResolvedValueOnce({ id: 'bk-existing' });

    await expect(ctx.service.bookMemberOntoClass('ci-1', 'gm-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ctx.classInstance.updateMany).not.toHaveBeenCalled();
    expect(ctx.booking.create).not.toHaveBeenCalled();
  });

  it('books the member into a held seat and draws a required class credit', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst
      // tx: load the occurrence (SCHEDULED, room to spare)
      .mockResolvedValueOnce(scheduledInstance({ bookedCount: 4 }))
      // getInstanceDetail re-read after the booking
      .mockResolvedValueOnce(row({ bookedCount: 5 }));
    ctx.booking.findFirst.mockResolvedValueOnce(null); // no live booking yet
    ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 }); // seat claimed
    ctx.chargeSeatCredit.mockResolvedValueOnce('cp-1');

    const detail = await ctx.service.bookMemberOntoClass('ci-1', 'gm-1');

    // The atomic seat claim runs only while there is room.
    expect(ctx.classInstance.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ci-1',
        status: InstanceStatus.SCHEDULED,
        bookedCount: { lt: 12 },
      },
      data: { bookedCount: { increment: 1 } },
    });
    // A held seat draws a required credit (default, so no `required: false`).
    expect(ctx.chargeSeatCredit).toHaveBeenCalledWith(expect.anything(), 'gm-1');
    // The booking is created BOOKED, stamped with the tenant gym + the drawn pack.
    expect(ctx.booking.create).toHaveBeenCalledTimes(1);
    const created = ctx.booking.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({
      gymId: 'gym-1',
      classInstanceId: 'ci-1',
      memberId: 'gm-1',
      status: BookingStatus.BOOKED,
      waitlistPosition: null,
      creditPackId: 'cp-1',
    });
    expect(created.data.idempotencyKey).toEqual(expect.any(String));
    // The waitlist tail is never read for a seated booking.
    expect(ctx.booking.aggregate).not.toHaveBeenCalled();
    expect(detail.bookedCount).toBe(5);
    // The front-desk booking is pushed to the live occupancy stream (T8.10).
    expect(ctx.occupancy.publish).toHaveBeenCalledWith('ci-1');
  });

  it('waitlists the member at the tail when the occurrence is full', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst
      .mockResolvedValueOnce(scheduledInstance({ bookedCount: 12 }))
      .mockResolvedValueOnce(row({ bookedCount: 12 }));
    ctx.booking.findFirst.mockResolvedValueOnce(null);
    // No room — the guarded seat claim flips no row.
    ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 0 });
    // Two already queued → the new entry lands at position 3.
    ctx.booking.aggregate.mockResolvedValueOnce({ _max: { waitlistPosition: 2 } });

    await ctx.service.bookMemberOntoClass('ci-1', 'gm-1');

    // A waitlist entry holds no seat, so no credit is drawn.
    expect(ctx.chargeSeatCredit).not.toHaveBeenCalled();
    const created = ctx.booking.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({
      status: BookingStatus.WAITLIST,
      waitlistPosition: 3,
      creditPackId: null,
    });
  });

  it('maps a partial-unique race on insert to a 409 ALREADY_BOOKED', async () => {
    const ctx = setupDetail();
    ctx.classInstance.findFirst.mockResolvedValueOnce(scheduledInstance());
    ctx.booking.findFirst.mockResolvedValueOnce(null);
    ctx.classInstance.updateMany.mockResolvedValueOnce({ count: 1 });
    ctx.chargeSeatCredit.mockResolvedValueOnce('cp-1');
    // A concurrent duplicate booking won the partial unique first.
    ctx.booking.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(ctx.service.bookMemberOntoClass('ci-1', 'gm-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
