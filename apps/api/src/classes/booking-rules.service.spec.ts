import type { ArgumentsHost } from '@nestjs/common';
import {
  AllExceptionsFilter,
  type ErrorResponseBody,
} from '../common/filters/all-exceptions.filter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@fit/db';
import { gymSettingsStoredSchema } from '@fit/types';
import { BookingRulesService } from './booking-rules.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreditPacksService } from '../billing/credit-packs.service';
import type { NotificationService } from '../notifications/notification.service';
import type { AutomationExecutorService } from '../automation/automation-executor.service';
import type { ClassOccupancyPublisher } from './class-occupancy.publisher';

const NOW = new Date('2026-11-19T12:00:00Z');
const DAY = 86_400_000;
const rule = {
  strikeLimit: 3,
  strikeWindowDays: 30,
  blockDays: 7,
  strikesSince: '2026-10-01T00:00:00Z',
};
function block() {
  return {
    id: 'block-1',
    gymId: 'gym-1',
    memberId: 'member-1',
    reason: 'NO_SHOW_LIMIT',
    noShowCount: 3,
    startsAt: NOW,
    endsAt: new Date(+NOW + 7 * DAY),
    liftedAt: null,
    liftedByUserId: null,
    liftReason: null,
    expiryNotifiedAt: null,
    createdAt: NOW,
    member: { userId: 'u-1', user: { name: 'Ana', email: 'ana@example.com' } },
    liftedBy: null,
  };
}
function setup(count = 3) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const settings = gymSettingsStoredSchema.parse({ noShow: rule, locale: { language: 'ka' } });
  const bookingBlock = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(block()),
    update: vi.fn().mockResolvedValue(block()),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findFirstOrThrow: vi.fn().mockResolvedValue({
      ...block(),
      liftedAt: NOW,
      liftReason: 'STAFF',
      liftedBy: { name: 'Staff' },
    }),
  };
  const booking = {
    findMany: vi
      .fn()
      .mockResolvedValueOnce(Array.from({ length: count }, (_, i) => ({ id: `strike-${i}` })))
      .mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const client = {
    gym: { findUnique: vi.fn().mockResolvedValue({ settings }) },
    gymMember: { findFirst: vi.fn().mockResolvedValue({ userId: 'u-1' }) },
    bookingBlock,
    booking,
    classInstance: { updateMany: vi.fn(), findFirst: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(client));
  const credit = {
    refundCredit: vi.fn().mockResolvedValue(undefined),
    chargeSeatCredit: vi.fn().mockResolvedValue('pack-promoted'),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ deduped: false }) };
  const automation = { dispatchForGym: vi.fn().mockResolvedValue(0) };
  const occupancy = { publishForGym: vi.fn().mockResolvedValue(undefined) };
  const service = new BookingRulesService(
    { client } as unknown as PrismaService,
    credit as unknown as CreditPacksService,
    notifications as unknown as NotificationService,
    automation as unknown as AutomationExecutorService,
    occupancy as unknown as ClassOccupancyPublisher,
  );
  return {
    service,
    client,
    settings,
    booking,
    bookingBlock,
    credit,
    notifications,
    automation,
    occupancy,
  };
}
afterEach(() => vi.useRealTimers());

describe('BookingRulesService', () => {
  it('creates a block at K strikes, refunds seats, promotes the queue and removes future waitlist entries', async () => {
    const c = setup();
    const seat = {
      id: 'seat',
      classInstanceId: 'class-1',
      status: 'BOOKED',
      creditPackId: 'pack-1',
      waitlistPosition: null,
    };
    const wait = {
      id: 'wait',
      classInstanceId: 'class-2',
      status: 'WAITLIST',
      creditPackId: null,
      waitlistPosition: 2,
    };
    c.booking.findMany.mockResolvedValueOnce([seat, wait]);
    c.booking.findFirst
      .mockResolvedValueOnce(seat)
      .mockResolvedValueOnce({ id: 'promoted', memberId: 'member-2', waitlistPosition: 1 })
      .mockResolvedValueOnce(wait);
    await c.service.evaluateMember('gym-1', 'member-1');
    expect(c.bookingBlock.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          gymId: 'gym-1',
          memberId: 'member-1',
          noShowCount: 3,
          startsAt: NOW,
          endsAt: new Date(+NOW + 7 * DAY),
        }),
      }),
    );
    expect(c.booking.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        where: expect.objectContaining<Record<string, unknown>>({
          gymId: 'gym-1',
          memberId: 'member-1',
          status: { in: ['BOOKED', 'WAITLIST'] },
          classInstance: {
            gymId: 'gym-1',
            status: 'SCHEDULED',
            startsAt: { gt: NOW, lt: new Date(+NOW + 7 * DAY) },
          },
        }),
      }),
    );
    expect(c.credit.refundCredit).toHaveBeenCalledExactlyOnceWith(c.client, 'pack-1', 'gym-1');
    expect(c.credit.chargeSeatCredit).toHaveBeenCalledWith(c.client, 'member-2', {
      required: false,
      gymId: 'gym-1',
    });
    expect(c.booking.update).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', id: 'wait' },
      data: { status: 'CANCELED', waitlistPosition: null },
    });
    expect(c.booking.updateMany).toHaveBeenCalledWith({
      where: {
        gymId: 'gym-1',
        classInstanceId: 'class-2',
        status: 'WAITLIST',
        waitlistPosition: { gt: 2 },
      },
      data: { waitlistPosition: { decrement: 1 } },
    });
    expect(c.occupancy.publishForGym).toHaveBeenCalledWith('gym-1', 'class-1');
    expect(c.automation.dispatchForGym).toHaveBeenCalledWith('gym-1', 'class_booked', {
      entityId: 'promoted',
      entityType: 'booking',
    });
    expect(c.notifications.send).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        dedupeKey: 'booking-block:block-1',
        channels: ['IN_APP', 'EMAIL', 'PUSH'],
        title: 'კლასებზე ჯავშანი დროებით შეზღუდულია',
      }),
    );
  });
  it('warns at K-1 using the triggering booking key, without a block', async () => {
    const c = setup(2);
    await c.service.evaluateMember('gym-1', 'member-1');
    expect(c.bookingBlock.create).not.toHaveBeenCalled();
    expect(c.notifications.send).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({ dedupeKey: 'noshow-warning:strike-0' }),
    );
  });
  it('does not warn for K=1 and blocks on the first no-show', async () => {
    const c = setup(1);
    c.settings.noShow.strikeLimit = 1;
    await c.service.evaluateMember('gym-1', 'member-1');
    expect(c.bookingBlock.create).toHaveBeenCalled();
    expect(c.notifications.send).toHaveBeenCalledTimes(1);
  });
  it.each(['strikeLimit', 'strikeWindowDays', 'blockDays'] as const)(
    'does nothing when %s is zero',
    async (key) => {
      const c = setup();
      c.settings.noShow[key] = 0;
      await c.service.evaluateMember('gym-1', 'member-1');
      expect(c.client.$transaction).not.toHaveBeenCalled();
      expect(c.notifications.send).not.toHaveBeenCalled();
      expect((await c.service.getStanding('gym-1', 'member-1')).noShow).toMatchObject({
        active: false,
        count: 0,
        remaining: null,
      });
    },
  );
  it('serializes evaluation and skips an existing active block', async () => {
    const c = setup();
    c.bookingBlock.findFirst.mockResolvedValue(block());
    await c.service.evaluateMember('gym-1', 'member-1');
    expect(c.client.$queryRaw).toHaveBeenCalled();
    expect(c.bookingBlock.create).not.toHaveBeenCalled();
  });
  it('sets an exclusive floor at the latest prior block end, ignoring corrections', async () => {
    const c = setup();
    const ended = new Date(+NOW - DAY);
    c.bookingBlock.findMany.mockResolvedValue([
      { liftedAt: ended, endsAt: new Date(+NOW + DAY) },
      { liftedAt: null, endsAt: new Date(+NOW - 5 * DAY) },
    ]);
    await c.service.strikes('gym-1', 'member-1', c.settings.noShow, NOW);
    expect(c.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        where: {
          gymId: 'gym-1',
          memberId: 'member-1',
          status: 'NO_SHOW',
          classInstance: { gymId: 'gym-1', startsAt: { gt: ended, lte: NOW } },
        },
      }),
    );
    expect(c.bookingBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        where: expect.objectContaining<Record<string, unknown>>({
          AND: expect.arrayContaining<unknown>([
            { OR: [{ liftReason: null }, { liftReason: { not: 'CORRECTION' } }] },
          ]),
        }),
      }),
    );
  });
  it('excludes strikes outside W and before activation', async () => {
    const c = setup();
    await c.service.strikes('gym-1', 'member-1', c.settings.noShow, NOW);
    expect(c.booking.findMany.mock.calls[0]?.[0] as unknown).toMatchObject({
      where: { classInstance: { startsAt: { gt: new Date(+NOW - 30 * DAY) } } },
    });
    c.settings.noShow.strikesSince = new Date(+NOW - DAY).toISOString();
    await c.service.strikes('gym-1', 'member-1', c.settings.noShow, NOW);
    expect(c.booking.findMany.mock.lastCall?.[0] as unknown).toMatchObject({
      where: { classInstance: { startsAt: { gt: new Date(+NOW - DAY) } } },
    });
  });
  it('lifts on correction only when the count at block creation falls below K', async () => {
    const c = setup(2);
    c.bookingBlock.findFirst.mockResolvedValue(block());
    await c.service.onNoShowCorrected('gym-1', 'member-1');
    expect(c.bookingBlock.update).toHaveBeenCalledWith({
      where: { id: 'block-1', gymId: 'gym-1' },
      data: { liftedAt: NOW, liftReason: 'CORRECTION' },
    });
    expect(c.bookingBlock.findMany.mock.calls[0]?.[0] as unknown).toMatchObject({
      where: { id: { not: 'block-1' } },
    });
    expect(c.notifications.send).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({ dedupeKey: 'booking-unblock:block-1' }),
    );
    expect(c.booking.update).not.toHaveBeenCalled();
  });
  it('retains a block when enough strikes remain after correction', async () => {
    const c = setup(3);
    c.bookingBlock.findFirst.mockResolvedValue(block());
    await c.service.onNoShowCorrected('gym-1', 'member-1');
    expect(c.bookingBlock.update).not.toHaveBeenCalled();
  });
  it('rejects booking with the expiry date, then permits expired/lifted blocks', async () => {
    const c = setup();
    c.bookingBlock.findFirst.mockResolvedValueOnce(block()).mockResolvedValue(null);
    const tx = c.client as unknown as Prisma.TransactionClient;
    await expect(c.service.assertCanBook('gym-1', 'member-1', tx)).rejects.toMatchObject({
      response: {
        code: 'MEMBER_BOOKING_BLOCKED',
        data: { blockedUntil: block().endsAt.toISOString(), reason: 'NO_SHOW_LIMIT' },
      },
    });
    await expect(c.service.assertCanBook('gym-1', 'member-1', tx)).resolves.toBeUndefined();
    expect(c.bookingBlock.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        where: { gymId: 'gym-1', memberId: 'member-1', liftedAt: null, endsAt: { gt: NOW } },
      }),
    );
  });
  it('preserves block details through the global exception filter', async () => {
    const c = setup();
    c.bookingBlock.findFirst.mockResolvedValue(block());
    const error: unknown = await c.service
      .assertCanBook('gym-1', 'member-1', c.client as unknown as Prisma.TransactionClient)
      .catch((caught: unknown) => caught);
    const json = vi.fn<(body: ErrorResponseBody) => void>();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'POST',
          url: '/class-instances/class-1/bookings',
          id: 'req-block',
        }),
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledExactlyOnceWith({
      code: 'MEMBER_BOOKING_BLOCKED',
      message: 'Class booking is temporarily blocked',
      details: null,
      data: { blockedUntil: block().endsAt.toISOString(), reason: 'NO_SHOW_LIMIT' },
      requestId: 'req-block',
    });
  });
  it('allows staff lift and rejects lifting an expired/already lifted block with 409', async () => {
    const c = setup();
    expect(await c.service.liftBlock('gym-1', 'block-1', 'staff')).toMatchObject({
      active: false,
      liftReason: 'STAFF',
      liftedByName: 'Staff',
    });
    expect(c.bookingBlock.updateMany).toHaveBeenCalledWith({
      where: { id: 'block-1', gymId: 'gym-1', liftedAt: null, endsAt: { gt: NOW } },
      data: { liftedAt: NOW, liftedByUserId: 'staff', liftReason: 'STAFF' },
    });
    c.bookingBlock.updateMany.mockResolvedValue({ count: 0 });
    await expect(c.service.liftBlock('gym-1', 'block-1', 'staff')).rejects.toMatchObject({
      status: 409,
      response: { code: 'BOOKING_BLOCK_NOT_ACTIVE' },
    });
  });
  it('notification failure cannot fail a committed block or lift', async () => {
    const c = setup();
    c.notifications.send.mockRejectedValue(new Error('offline'));
    await expect(c.service.evaluateMember('gym-1', 'member-1')).resolves.toBeUndefined();
    await expect(c.service.liftBlock('gym-1', 'block-1', 'staff')).resolves.toMatchObject({
      active: false,
    });
  });
  it('lists only this gym and defaults to active blocks', async () => {
    const c = setup();
    c.bookingBlock.findMany.mockResolvedValue([block()]);
    expect((await c.service.listBlocks('gym-1', {})).blocks[0]).toMatchObject({
      active: true,
      memberName: 'Ana',
    });
    expect((c.bookingBlock.findMany.mock.lastCall?.[0] as { where: unknown }).where).toEqual({
      gymId: 'gym-1',
      liftedAt: null,
      endsAt: { gt: NOW },
    });
    await c.service.listBlocks('gym-1', { status: 'all', memberId: 'member-1' });
    expect((c.bookingBlock.findMany.mock.lastCall?.[0] as { where: unknown }).where).toEqual({
      gymId: 'gym-1',
      memberId: 'member-1',
    });
  });
});
