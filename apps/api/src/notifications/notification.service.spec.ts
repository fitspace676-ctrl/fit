import { describe, expect, it, vi } from 'vitest';
import { NotificationCategory, NotificationChannel, Prisma } from '@fit/db';
import {
  EmailNotificationChannel,
  InAppNotificationChannel,
  PushNotificationChannel,
  buildChannelRegistry,
} from './notification-channels';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationService } from './notification.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A P2002 unique-violation as Prisma raises it, targeting a given index. */
function uniqueViolation(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function setup() {
  const notification = {
    findUnique: vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(null),
    create: vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ id: 'ntf-1' }),
  };
  const notificationPreference = {
    findMany: vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue([]),
  };
  const prisma = {
    client: { notification, notificationPreference },
  } as unknown as PrismaService;

  const registry = buildChannelRegistry([
    new InAppNotificationChannel(new NotificationDispatchService(prisma)),
    new EmailNotificationChannel(),
    new PushNotificationChannel(),
  ]);
  const service = new NotificationService(prisma, registry);
  return { service, notification, notificationPreference };
}

const BASE = {
  gymId: 'gym-1',
  userId: 'user-1',
  category: NotificationCategory.BOOKING,
  title: 'Booking confirmed',
  body: 'Morning HIIT · Mon 08:00',
  href: '/bookings',
};

describe('NotificationService.send', () => {
  it('delivers in-app by default and reports the created row id', async () => {
    const { service, notification } = setup();

    const result = await service.send(BASE);

    expect(result).toEqual({
      deduped: false,
      delivered: [{ channel: NotificationChannel.IN_APP, ref: 'ntf-1' }],
      suppressed: [],
    });
    expect(notification.create).toHaveBeenCalledTimes(1);
    expect(notification.create.mock.calls[0]?.[0]).toMatchObject({
      data: { gymId: 'gym-1', userId: 'user-1', dedupeKey: null },
    });
  });

  it('subtracts a muted channel and still delivers the enabled ones', async () => {
    const { service, notification, notificationPreference } = setup();
    notificationPreference.findMany.mockResolvedValue([{ channel: NotificationChannel.EMAIL }]);

    const result = await service.send({
      ...BASE,
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });

    expect(result.suppressed).toEqual([NotificationChannel.EMAIL]);
    expect(result.delivered).toEqual([{ channel: NotificationChannel.IN_APP, ref: 'ntf-1' }]);
    // The mute query is keyed on (gymId, userId, category) and only false rows.
    expect(notificationPreference.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        gymId: 'gym-1',
        userId: 'user-1',
        category: NotificationCategory.BOOKING,
        enabled: false,
      },
    });
    expect(notification.create).toHaveBeenCalledTimes(1);
  });

  it('routes to email/push adapters as pending placeholders without writing an inbox row', async () => {
    const { service, notification } = setup();

    const result = await service.send({
      ...BASE,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
    });

    expect(result.deduped).toBe(false);
    expect(result.delivered).toEqual([
      { channel: NotificationChannel.EMAIL, ref: null, pending: true },
      { channel: NotificationChannel.PUSH, ref: null, pending: true },
    ]);
    expect(notification.create).not.toHaveBeenCalled();
  });

  it('de-duplicates repeated channels while preserving order', async () => {
    const { service } = setup();

    const result = await service.send({
      ...BASE,
      channels: [NotificationChannel.EMAIL, NotificationChannel.EMAIL, NotificationChannel.PUSH],
    });

    expect(result.delivered.map((d) => d.channel)).toEqual([
      NotificationChannel.EMAIL,
      NotificationChannel.PUSH,
    ]);
  });

  it('skips the send entirely when the dedupeKey was already delivered', async () => {
    const { service, notification } = setup();
    notification.findUnique.mockResolvedValue({ id: 'prior' });

    const result = await service.send({ ...BASE, dedupeKey: 'reminder:booking-9' });

    expect(result).toEqual({ deduped: true, delivered: [], suppressed: [] });
    expect(notification.findUnique.mock.calls[0]?.[0]).toMatchObject({
      where: { userId_dedupeKey: { userId: 'user-1', dedupeKey: 'reminder:booking-9' } },
    });
    expect(notification.create).not.toHaveBeenCalled();
  });

  it('treats a dedupe unique-violation race as deduped rather than an error', async () => {
    const { service, notification } = setup();
    // Pre-check misses (null), but a concurrent send wins the insert race.
    notification.create.mockRejectedValue(uniqueViolation(['userId', 'dedupeKey']));

    const result = await service.send({ ...BASE, dedupeKey: 'reminder:booking-9' });

    expect(result.deduped).toBe(true);
  });

  it('rethrows a unique-violation that is not the dedupe index', async () => {
    const { service, notification } = setup();
    notification.create.mockRejectedValue(uniqueViolation(['some_other_key']));

    await expect(service.send({ ...BASE, dedupeKey: 'k' })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});
