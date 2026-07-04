import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { NotificationInboxService } from './notification-inbox.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const GYM_ID = 'gym-1';
const USER_ID = 'user-1';

/** A loose view of the query args the service passes — enough to assert on. */
interface QueryArgs {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  skip?: number;
  take?: number;
  data?: Record<string, unknown>;
}

function row(over?: Partial<Record<string, unknown>>) {
  return {
    id: 'ntf-1',
    category: 'BOOKING',
    title: 'Booking confirmed',
    body: 'Morning HIIT',
    href: '/bookings',
    readAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    ...over,
  };
}

function setup(opts?: {
  userId?: string | null;
  findMany?: unknown[];
  counts?: number[]; // resolved in call order
  updateCount?: number;
}) {
  const counts = opts?.counts ? [...opts.counts] : [3, 2];
  const notification = {
    findMany: vi
      .fn<(args: QueryArgs) => Promise<unknown>>()
      .mockResolvedValue(opts?.findMany ?? []),
    count: vi
      .fn<(args: QueryArgs) => Promise<number>>()
      .mockImplementation(() => Promise.resolve(counts.shift() ?? 0)),
    updateMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: opts?.updateCount ?? 0 }),
  };
  const client = {
    notification,
    // The real client awaits an array of already-issued query promises.
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const prisma = { client } as unknown as PrismaService;
  const tenant = {
    userId: opts?.userId === undefined ? USER_ID : opts.userId,
    gymId: GYM_ID,
  } as unknown as TenantContext;

  return { service: new NotificationInboxService(prisma, tenant), notification };
}

describe('NotificationInboxService', () => {
  describe('list', () => {
    it('rejects an unauthenticated caller with MEMBER_SESSION_REQUIRED', async () => {
      const { service, notification } = setup({ userId: null });
      await expect(service.list({ page: 1, limit: 20 })).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: 'MEMBER_SESSION_REQUIRED' },
      });
      expect(notification.findMany).not.toHaveBeenCalled();
    });

    it('returns the (gym, user)-scoped page newest-first with the unread total', async () => {
      const { service, notification } = setup({
        findMany: [row()],
        counts: [1, 1], // total, unread
      });

      const result = await service.list({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: [
          {
            id: 'ntf-1',
            category: 'BOOKING',
            title: 'Booking confirmed',
            body: 'Morning HIIT',
            href: '/bookings',
            readAt: null,
            createdAt: '2026-07-01T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        unread: 1,
      });

      const args = notification.findMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({ gymId: GYM_ID, userId: USER_ID });
      expect(args?.orderBy).toEqual({ createdAt: 'desc' });
      expect(args?.skip).toBe(0);
      expect(args?.take).toBe(20);
    });

    it('applies the unreadOnly filter and offset paging', async () => {
      const { service, notification } = setup({ findMany: [], counts: [0, 5] });

      await service.list({ page: 3, limit: 10, unreadOnly: true });

      const args = notification.findMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({ gymId: GYM_ID, userId: USER_ID, readAt: null });
      expect(args?.skip).toBe(20);
      expect(args?.take).toBe(10);
    });
  });

  describe('unreadCount', () => {
    it('counts the unread rows for the caller', async () => {
      const { service, notification } = setup({ counts: [4] });
      const result = await service.unreadCount();
      expect(result).toEqual({ unread: 4 });
      expect(notification.count).toHaveBeenCalledWith({
        where: { gymId: GYM_ID, userId: USER_ID, readAt: null },
      });
    });
  });

  describe('markRead', () => {
    it('marks the given ids read (scoped to the caller and unread rows)', async () => {
      const { service, notification } = setup({ updateCount: 2, counts: [1] });

      const result = await service.markRead({ ids: ['ntf-1', 'ntf-2'] });

      expect(result).toEqual({ updated: 2, unread: 1 });
      const args = notification.updateMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({
        gymId: GYM_ID,
        userId: USER_ID,
        readAt: null,
        id: { in: ['ntf-1', 'ntf-2'] },
      });
      expect(args?.data?.readAt).toBeInstanceOf(Date);
    });

    it('marks every unread item read when ids is omitted', async () => {
      const { service, notification } = setup({ updateCount: 3, counts: [0] });

      const result = await service.markRead({});

      expect(result).toEqual({ updated: 3, unread: 0 });
      const args = notification.updateMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({ gymId: GYM_ID, userId: USER_ID, readAt: null });
    });

    it('treats an empty ids list as mark-all (no id filter)', async () => {
      const { service, notification } = setup({ updateCount: 0, counts: [0] });

      await service.markRead({ ids: [] });

      const args = notification.updateMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({ gymId: GYM_ID, userId: USER_ID, readAt: null });
    });
  });
});
