import { describe, expect, it, vi } from 'vitest';
import { NotificationCategory } from '@fit/db';
import { NotificationDispatchService } from './notification-dispatch.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A loose view of the create args the service passes — enough to assert on. */
interface QueryArgs {
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

function setup() {
  const notification = {
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({ id: 'ntf-1' }),
  };
  const prisma = { client: { notification } } as unknown as PrismaService;
  return { service: new NotificationDispatchService(prisma), notification };
}

describe('NotificationDispatchService', () => {
  it('persists a notification addressed by (gymId, userId) and returns its id', async () => {
    const { service, notification } = setup();

    const result = await service.dispatch({
      gymId: 'gym-1',
      userId: 'user-1',
      category: NotificationCategory.BOOKING,
      title: 'Booking confirmed',
      body: 'Morning HIIT · Mon 08:00',
      href: '/bookings',
    });

    expect(result).toEqual({ id: 'ntf-1' });
    expect(notification.create.mock.calls[0]?.[0]?.data).toEqual({
      gymId: 'gym-1',
      userId: 'user-1',
      category: NotificationCategory.BOOKING,
      title: 'Booking confirmed',
      body: 'Morning HIIT · Mon 08:00',
      href: '/bookings',
      dedupeKey: null,
    });
  });

  it('persists a supplied dedupeKey and normalises an omitted one to null', async () => {
    const { service, notification } = setup();

    await service.dispatch({
      gymId: 'gym-1',
      userId: 'user-1',
      category: NotificationCategory.BOOKING,
      title: 'Reminder',
      body: 'Class in 2h',
      dedupeKey: 'reminder:booking-9',
    });
    expect(notification.create.mock.calls[0]?.[0]?.data).toMatchObject({
      dedupeKey: 'reminder:booking-9',
    });

    await service.dispatch({
      gymId: 'gym-1',
      userId: 'user-1',
      category: NotificationCategory.SYSTEM,
      title: 'Notice',
      body: 'Hello',
    });
    expect(notification.create.mock.calls[1]?.[0]?.data).toMatchObject({ dedupeKey: null });
  });

  it('normalises an omitted href to null', async () => {
    const { service, notification } = setup();

    await service.dispatch({
      gymId: 'gym-1',
      userId: 'user-1',
      category: NotificationCategory.SYSTEM,
      title: 'Welcome',
      body: 'Thanks for joining.',
    });

    expect(notification.create.mock.calls[0]?.[0]?.data).toMatchObject({ href: null });
  });
});
