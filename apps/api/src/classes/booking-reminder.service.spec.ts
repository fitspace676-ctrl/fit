import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { BookingStatus, InstanceStatus, NotificationCategory, NotificationChannel } from '@fit/db';
import { BookingReminderService } from './booking-reminder.service';
import type {
  NotificationService,
  SendNotificationResult,
} from '../notifications/notification.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

/** A booking row shaped exactly as the sweep's `select` projects it. */
interface BookingRow {
  id: string;
  gymId: string;
  member: { userId: string };
  classInstance: { startsAt: Date; template: { title: string } };
}

const bookingRow = (over?: Partial<BookingRow>): BookingRow => ({
  id: 'booking-1',
  gymId: 'gym-1',
  member: { userId: 'user-1' },
  classInstance: {
    startsAt: new Date('2026-06-10T02:00:00.000Z'),
    template: { title: 'Morning HIIT' },
  },
  ...over,
});

const sent = (over?: Partial<SendNotificationResult>): SendNotificationResult => ({
  deduped: false,
  delivered: [{ channel: NotificationChannel.IN_APP, ref: 'notif-1' }],
  suppressed: [],
  ...over,
});

function setup(
  options: {
    due?: BookingRow[];
    enabled?: boolean;
    leadMinutes?: number;
    lock?: 'OK' | null;
    gymSettings?: unknown;
    send?: (input: unknown) => SendNotificationResult | Promise<SendNotificationResult>;
  } = {},
) {
  const {
    due = [],
    enabled = true,
    leadMinutes = 120,
    lock = 'OK',
    gymSettings = null,
    send = () => sent(),
  } = options;

  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, {
    BOOKING_REMINDERS_ENABLED: enabled,
    BOOKING_REMINDER_LEAD_MINUTES: leadMinutes,
  });

  const bookingFindMany = vi.fn<(args: unknown) => Promise<BookingRow[]>>().mockResolvedValue(due);
  const gymFindUnique = vi
    .fn<(args: unknown) => Promise<{ settings: unknown } | null>>()
    .mockResolvedValue({ settings: gymSettings });
  const prisma = {
    client: {
      booking: { findMany: bookingFindMany },
      gym: { findUnique: gymFindUnique },
    },
  } as unknown as PrismaService;

  const set = vi.fn<(...args: unknown[]) => Promise<'OK' | null>>().mockResolvedValue(lock);
  const redis = { client: { set } } as unknown as RedisService;

  const sendFn = vi.fn(async (input: unknown) => send(input));
  const notifications = { send: sendFn } as unknown as NotificationService;

  return {
    service: new BookingReminderService(prisma, redis, notifications),
    bookingFindMany,
    gymFindUnique,
    set,
    sendFn,
  };
}

const NOW = new Date('2026-06-10T00:00:00.000Z');

afterEach(() => vi.restoreAllMocks());

describe('BookingReminderService.runReminders', () => {
  it('reminds a due confirmed booking over the member preferred channels, deduped per booking', async () => {
    const { service, sendFn } = setup({ due: [bookingRow()] });

    const summary = await service.runReminders({ now: NOW });

    expect(summary).toMatchObject({
      bookingsMatched: 1,
      reminded: 1,
      deduped: 0,
      errors: 0,
    });
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0]![0]).toMatchObject({
      gymId: 'gym-1',
      userId: 'user-1',
      category: NotificationCategory.BOOKING,
      href: '/account/bookings',
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
      dedupeKey: 'booking-reminder:booking-1',
    });
    // The class title rides in the (English-by-default) body.
    expect(sendFn.mock.calls[0]![0]).toMatchObject({ title: 'Class reminder' });
    expect((sendFn.mock.calls[0]![0] as { body: string }).body).toContain('Morning HIIT');
  });

  it('queries only BOOKED seats on SCHEDULED occurrences inside (now, now + lead]', async () => {
    const { service, bookingFindMany } = setup({ leadMinutes: 120 });

    await service.runReminders({ now: NOW });

    const where = (bookingFindMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      status: BookingStatus.BOOKED,
      classInstance: {
        status: InstanceStatus.SCHEDULED,
        startsAt: { gt: NOW, lte: new Date('2026-06-10T02:00:00.000Z') },
      },
    });
  });

  it('counts an already-sent reminder as deduped, not a fresh send', async () => {
    const { service } = setup({ due: [bookingRow()], send: () => sent({ deduped: true }) });

    const summary = await service.runReminders({ now: NOW });

    expect(summary).toMatchObject({ bookingsMatched: 1, reminded: 0, deduped: 1, errors: 0 });
  });

  it('localises the copy to the gym language and resolves each gym once per sweep', async () => {
    const { service, sendFn, gymFindUnique } = setup({
      due: [bookingRow({ id: 'b1' }), bookingRow({ id: 'b2' })],
      gymSettings: { locale: { language: 'ka', timezone: 'Asia/Tbilisi' } },
    });

    const summary = await service.runReminders({ now: NOW });

    expect(summary.reminded).toBe(2);
    // Both bookings share gym-1, so its settings are read a single time (cached).
    expect(gymFindUnique).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0]![0]).toMatchObject({ title: 'ვარჯიშის შეხსენება' });
  });

  it('isolates a per-booking failure: one send throwing does not abort the rest', async () => {
    const send = vi
      .fn<(input: unknown) => Promise<SendNotificationResult>>()
      .mockRejectedValueOnce(new Error('push transport down'))
      .mockResolvedValue(sent());
    const { service } = setup({
      due: [bookingRow({ id: 'b1' }), bookingRow({ id: 'b2' })],
      send: (input) => send(input),
    });

    const summary = await service.runReminders({ now: NOW });

    expect(summary).toMatchObject({ bookingsMatched: 2, reminded: 1, errors: 1 });
  });

  it('no due bookings is a clean no-op', async () => {
    const { service, sendFn } = setup({ due: [] });

    const summary = await service.runReminders({ now: NOW });

    expect(summary).toMatchObject({ bookingsMatched: 0, reminded: 0, deduped: 0, errors: 0 });
    expect(sendFn).not.toHaveBeenCalled();
  });
});

describe('BookingReminderService.runScheduled', () => {
  it('skips entirely when the feature flag is off', async () => {
    const { service, bookingFindMany, set } = setup({ enabled: false, due: [bookingRow()] });

    await service.runScheduled();

    expect(set).not.toHaveBeenCalled();
    expect(bookingFindMany).not.toHaveBeenCalled();
  });

  it('skips when another instance holds the tick lock', async () => {
    const { service, bookingFindMany } = setup({ lock: null, due: [bookingRow()] });

    await service.runScheduled();

    expect(bookingFindMany).not.toHaveBeenCalled();
  });

  it('runs the sweep once it owns the lock', async () => {
    const { service, sendFn } = setup({ due: [bookingRow()] });

    await service.runScheduled();

    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('swallows a sweep error so a failing tick never crashes the scheduler', async () => {
    const { service } = setup({ due: [bookingRow()] });
    // Force the sweep to throw by making the query reject.
    (service as unknown as { prisma: PrismaService }).prisma.client.booking.findMany = vi
      .fn()
      .mockRejectedValue(new Error('db down'));

    await expect(service.runScheduled()).resolves.toBeUndefined();
  });
});
