import { describe, expect, it, vi } from 'vitest';
import { BookingRulesJobService } from './booking-rules-job.service';
import type { BookingRulesService } from './booking-rules.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { AutomationExecutorService } from '../automation/automation-executor.service';

const now = new Date('2026-11-19T12:00:00Z');
const rule = {
  strikeLimit: 3,
  strikeWindowDays: 30,
  blockDays: 7,
  strikesSince: '2026-11-18T00:00:00Z',
};
const row = (id = 'booking-1') => ({
  id,
  memberId: 'member-1',
  classInstance: {
    startsAt: new Date('2026-11-19T10:00:00Z'),
    endsAt: new Date('2026-11-19T11:00:00Z'),
  },
});
function setup() {
  const client = {
    gym: { findMany: vi.fn().mockResolvedValue([{ id: 'gym-1', settings: { noShow: rule } }]) },
    booking: {
      findMany: vi.fn().mockResolvedValueOnce([row()]).mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
    },
    checkIn: { findFirst: vi.fn().mockResolvedValue(null) },
    bookingBlock: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const rules = {
    evaluateMember: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn().mockResolvedValue(true),
  };
  const automation = { dispatchForGym: vi.fn().mockResolvedValue(0) };
  const redis = { client: { set: vi.fn().mockResolvedValue('OK') } };
  const service = new BookingRulesJobService(
    { client } as unknown as PrismaService,
    redis as unknown as RedisService,
    rules as unknown as BookingRulesService,
    automation as unknown as AutomationExecutorService,
  );
  return { service, client, rules, automation, redis };
}
describe('BookingRulesJobService', () => {
  it('only marks BOOKED seats past the grace, never canceled occurrences or before activation', async () => {
    const c = setup();
    expect(await c.service.runSweep({ now })).toEqual({
      attended: 0,
      noShows: 1,
      expired: 0,
      errors: 0,
    });
    expect((c.client.booking.findMany.mock.calls[0]?.[0] as { where: unknown }).where).toEqual({
      gymId: 'gym-1',
      status: 'BOOKED',
      classInstance: {
        gymId: 'gym-1',
        status: { not: 'CANCELED' },
        endsAt: { gt: new Date(rule.strikesSince), lte: new Date('2026-11-19T11:30:00Z') },
      },
    });
    expect(c.client.booking.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'booking-1',
        gymId: 'gym-1',
        status: 'BOOKED',
        classInstance: { gymId: 'gym-1', status: { not: 'CANCELED' } },
      },
      data: { status: 'NO_SHOW' },
    });
    expect(c.rules.evaluateMember).toHaveBeenCalledWith('gym-1', 'member-1', now);
    expect(c.automation.dispatchForGym).toHaveBeenCalledWith('gym-1', 'attendance_marked', {
      entityId: 'booking-1',
      entityType: 'booking',
    });
  });
  it('checks the inclusive check-in window and marks ATTENDED instead of NO_SHOW', async () => {
    const c = setup();
    c.client.checkIn.findFirst.mockResolvedValue({ id: 'visit' });
    expect((await c.service.runSweep({ now })).attended).toBe(1);
    expect(c.client.checkIn.findFirst).toHaveBeenCalledWith({
      where: {
        gymId: 'gym-1',
        gymMemberId: 'member-1',
        checkedInAt: {
          gte: new Date('2026-11-19T08:00:00Z'),
          lte: new Date('2026-11-19T11:00:00Z'),
        },
      },
      select: { id: true },
    });
    expect(c.client.booking.updateMany.mock.calls[0]?.[0] as unknown).toMatchObject({
      data: { status: 'ATTENDED' },
    });
    expect(c.rules.evaluateMember).not.toHaveBeenCalled();
    expect(c.automation.dispatchForGym).toHaveBeenCalledWith('gym-1', 'first_class_attended', {
      entityId: 'booking-1',
      entityType: 'booking',
    });
  });
  it('does not overwrite a concurrent staff mark or dispatch for an unchanged seat', async () => {
    const c = setup();
    c.client.booking.updateMany.mockResolvedValue({ count: 0 });
    expect((await c.service.runSweep({ now })).noShows).toBe(0);
    expect(c.automation.dispatchForGym).not.toHaveBeenCalled();
    expect(c.rules.evaluateMember).not.toHaveBeenCalled();
  });
  it('skips gyms with the rule off', async () => {
    const c = setup();
    c.client.gym.findMany.mockResolvedValue([{ id: 'gym-1', settings: {} }]);
    await c.service.runSweep({ now });
    expect(c.client.booking.findMany).not.toHaveBeenCalled();
  });
  it('limits backfill to seven days even with an older activation', async () => {
    const c = setup();
    c.client.gym.findMany.mockResolvedValue([
      { id: 'gym-1', settings: { noShow: { ...rule, strikesSince: '2026-10-01T00:00:00Z' } } },
    ]);
    await c.service.runSweep({ now });
    expect(c.client.booking.findMany.mock.calls[0]?.[0] as unknown).toMatchObject({
      where: { classInstance: { endsAt: { gt: new Date('2026-11-12T12:00:00Z') } } },
    });
  });
  it('one failed booking does not abort later bookings', async () => {
    const c = setup();
    c.client.booking.findMany
      .mockReset()
      .mockResolvedValueOnce([row('bad'), row('good')])
      .mockResolvedValue([]);
    c.client.checkIn.findFirst.mockRejectedValueOnce(new Error('offline'));
    expect(await c.service.runSweep({ now })).toMatchObject({ noShows: 1, errors: 1 });
  });
  it('retries evaluation for previously marked no-shows', async () => {
    const c = setup();
    c.client.booking.findMany
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ memberId: 'member-2' }]);
    await c.service.runSweep({ now });
    expect(c.rules.evaluateMember).toHaveBeenCalledWith('gym-1', 'member-2', now);
  });
  it('expiry notifies once and stamps only successfully notified blocks', async () => {
    const c = setup();
    c.client.bookingBlock.findMany.mockResolvedValueOnce([
      { id: 'block-1', gymId: 'gym-1', memberId: 'member-1' },
    ]);
    await c.service.runSweep({ now });
    await c.service.runSweep({ now });
    expect(c.rules.notify).toHaveBeenCalledExactlyOnceWith(
      'gym-1',
      'member-1',
      'unblocked',
      'block-1',
    );
    expect(c.client.bookingBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endsAt: { lte: now }, liftedAt: null, expiryNotifiedAt: null },
      }),
    );
    expect(c.client.bookingBlock.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'block-1',
        gymId: 'gym-1',
        liftedAt: null,
        expiryNotifiedAt: null,
        endsAt: { lte: now },
      },
      data: { expiryNotifiedAt: now },
    });
  });
  it('notification failure keeps expiry eligible for retry', async () => {
    const c = setup();
    c.client.bookingBlock.findMany.mockResolvedValue([
      { id: 'block-1', gymId: 'gym-1', memberId: 'member-1' },
    ]);
    c.rules.notify.mockResolvedValue(false);
    expect((await c.service.runSweep({ now })).errors).toBe(1);
    expect(c.client.bookingBlock.updateMany).not.toHaveBeenCalled();
  });
  it('fails closed when Redis lock is unavailable', async () => {
    const c = setup();
    c.redis.client.set.mockRejectedValue(new Error('redis offline'));
    await c.service.runScheduled();
    expect(c.client.gym.findMany).not.toHaveBeenCalled();
  });
});
