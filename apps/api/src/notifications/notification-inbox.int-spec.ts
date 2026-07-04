import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GymStatus, NotificationCategory, Role } from '@fit/db';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationInboxService } from './notification-inbox.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import { asTenant, disconnect, prisma, resetDb } from '../test/integration-db';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The member notification inbox proven against a real Postgres (T8.4 / T6.10):
 * a member reads their own `(gym, user)` notifications newest-first with a live
 * unread count, marks them read, and — via the explicit `(gymId, userId)` filter
 * — never sees another member's or another gym's rows. The dispatch seam (T8.1)
 * is exercised end-to-end alongside the read side.
 */
const prismaService = { client: prisma } as unknown as PrismaService;
const inbox = new NotificationInboxService(prismaService, new TenantContext());
const dispatch = new NotificationDispatchService(prismaService);

function member(gymId: string, userId: string): TenantState {
  return { userId, gymId, role: Role.MEMBER, allowCrossTenant: false };
}

describe('NotificationInboxService (integration)', () => {
  let gymId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const gym = await prisma.gym.create({
      data: { name: 'Alpha Gym', slug: 'alpha-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;
    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    userId = user.id;
    await prisma.gymMember.create({ data: { userId, gymId, role: Role.MEMBER } });
  });

  afterAll(disconnect);

  it('dispatches an inbox item and reads it back for the recipient', async () => {
    await dispatch.dispatch({
      gymId,
      userId,
      category: NotificationCategory.BOOKING,
      title: 'Booking confirmed',
      body: 'Morning HIIT · Mon 08:00',
      href: '/bookings',
    });

    const result = await asTenant(member(gymId, userId), () => inbox.list({ page: 1, limit: 20 }));

    expect(result.total).toBe(1);
    expect(result.unread).toBe(1);
    expect(result.data[0]).toMatchObject({
      category: 'BOOKING',
      title: 'Booking confirmed',
      href: '/bookings',
      readAt: null,
    });
    expect(typeof result.data[0]?.createdAt).toBe('string');
  });

  it('lists newest-first and reports the unread total', async () => {
    await prisma.notification.create({
      data: {
        gymId,
        userId,
        category: NotificationCategory.SYSTEM,
        title: 'Older',
        body: 'first',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        readAt: new Date('2026-06-02T00:00:00.000Z'),
      },
    });
    await prisma.notification.create({
      data: {
        gymId,
        userId,
        category: NotificationCategory.BILLING,
        title: 'Newer',
        body: 'second',
        createdAt: new Date('2026-06-10T00:00:00.000Z'),
      },
    });

    const result = await asTenant(member(gymId, userId), () => inbox.list({ page: 1, limit: 20 }));

    expect(result.data.map((n) => n.title)).toEqual(['Newer', 'Older']);
    expect(result.total).toBe(2);
    expect(result.unread).toBe(1); // only "Newer" is unread
  });

  it('filters to unread when unreadOnly is set', async () => {
    await prisma.notification.create({
      data: {
        gymId,
        userId,
        category: NotificationCategory.SYSTEM,
        title: 'Read one',
        body: 'x',
        readAt: new Date('2026-06-02T00:00:00.000Z'),
      },
    });
    await prisma.notification.create({
      data: {
        gymId,
        userId,
        category: NotificationCategory.SYSTEM,
        title: 'Unread one',
        body: 'y',
      },
    });

    const result = await asTenant(member(gymId, userId), () =>
      inbox.list({ page: 1, limit: 20, unreadOnly: true }),
    );

    expect(result.data.map((n) => n.title)).toEqual(['Unread one']);
    expect(result.total).toBe(1);
    expect(result.unread).toBe(1);
  });

  it('marks specific ids read and returns the resulting unread count', async () => {
    const a = await prisma.notification.create({
      data: { gymId, userId, category: NotificationCategory.SYSTEM, title: 'A', body: 'a' },
    });
    await prisma.notification.create({
      data: { gymId, userId, category: NotificationCategory.SYSTEM, title: 'B', body: 'b' },
    });

    const result = await asTenant(member(gymId, userId), () => inbox.markRead({ ids: [a.id] }));

    expect(result).toEqual({ updated: 1, unread: 1 });
    const stillUnread = await asTenant(member(gymId, userId), () => inbox.unreadCount());
    expect(stillUnread).toEqual({ unread: 1 });
  });

  it('marks every unread item read when no ids are given', async () => {
    await prisma.notification.create({
      data: { gymId, userId, category: NotificationCategory.SYSTEM, title: 'A', body: 'a' },
    });
    await prisma.notification.create({
      data: { gymId, userId, category: NotificationCategory.SYSTEM, title: 'B', body: 'b' },
    });

    const result = await asTenant(member(gymId, userId), () => inbox.markRead({}));

    expect(result).toEqual({ updated: 2, unread: 0 });
  });

  it('never returns another member’s or another gym’s notifications', async () => {
    // Another user in the same gym.
    const otherUser = await prisma.user.create({ data: { email: 'other@example.com' } });
    await prisma.gymMember.create({ data: { userId: otherUser.id, gymId, role: Role.MEMBER } });
    await prisma.notification.create({
      data: {
        gymId,
        userId: otherUser.id,
        category: NotificationCategory.SYSTEM,
        title: 'Not yours',
        body: 'x',
      },
    });
    // The caller in a different gym.
    const otherGym = await prisma.gym.create({
      data: { name: 'Beta Gym', slug: 'beta-gym', status: GymStatus.ACTIVE },
    });
    await prisma.notification.create({
      data: {
        gymId: otherGym.id,
        userId,
        category: NotificationCategory.SYSTEM,
        title: 'Wrong gym',
        body: 'y',
      },
    });
    // One that IS the caller's.
    await prisma.notification.create({
      data: { gymId, userId, category: NotificationCategory.SYSTEM, title: 'Mine', body: 'z' },
    });

    const result = await asTenant(member(gymId, userId), () => inbox.list({ page: 1, limit: 20 }));

    expect(result.data.map((n) => n.title)).toEqual(['Mine']);
    expect(result.total).toBe(1);
    expect(result.unread).toBe(1);
  });
});
