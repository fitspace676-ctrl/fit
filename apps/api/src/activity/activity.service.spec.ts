import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListActivityQuery } from '@fit/types';
import { ActivityService } from './activity.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** Loose view of the arg shapes the assertions inspect. */
interface QueryArgs {
  where?: {
    gymId?: unknown;
    role?: unknown;
    status?: unknown;
    joinedAt?: { gte?: Date; lt?: Date };
    createdAt?: { gte?: Date; lt?: Date };
    checkedInAt?: { gte?: Date; lt?: Date };
  };
  orderBy?: unknown;
  take?: number;
}

/** Per-source rows the fake client returns, and the counts it reports. */
interface Rows {
  signups?: unknown[];
  bookings?: unknown[];
  checkins?: unknown[];
  sales?: unknown[];
  subscriptions?: unknown[];
  counts?: Partial<Record<'signup' | 'booking' | 'checkin' | 'sale' | 'subscription', number>>;
}

function setup(rows?: Rows) {
  const gymMember = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>(() =>
      Promise.resolve(rows?.signups ?? []),
    ),
    count: vi.fn<(args: QueryArgs) => Promise<number>>(() =>
      Promise.resolve(rows?.counts?.signup ?? 0),
    ),
  };
  const booking = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>(() =>
      Promise.resolve(rows?.bookings ?? []),
    ),
    count: vi.fn<(args: QueryArgs) => Promise<number>>(() =>
      Promise.resolve(rows?.counts?.booking ?? 0),
    ),
  };
  const checkIn = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>(() =>
      Promise.resolve(rows?.checkins ?? []),
    ),
    count: vi.fn<(args: QueryArgs) => Promise<number>>(() =>
      Promise.resolve(rows?.counts?.checkin ?? 0),
    ),
  };
  const payment = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>(() =>
      Promise.resolve(rows?.sales ?? []),
    ),
    count: vi.fn<(args: QueryArgs) => Promise<number>>(() =>
      Promise.resolve(rows?.counts?.sale ?? 0),
    ),
  };
  const subscription = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>(() =>
      Promise.resolve(rows?.subscriptions ?? []),
    ),
    count: vi.fn<(args: QueryArgs) => Promise<number>>(() =>
      Promise.resolve(rows?.counts?.subscription ?? 0),
    ),
  };

  const client = { gymMember, booking, checkIn, payment, subscription };
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new ActivityService(prisma, tenant),
    gymMember,
    booking,
    checkIn,
    payment,
    subscription,
  };
}

/** Build a full list query with defaults, overridable per test. */
function query(overrides?: Partial<ListActivityQuery>): ListActivityQuery {
  return { page: 1, limit: 20, ...overrides };
}

const identity = { user: { name: 'Ada Member', email: 'ada@gym.io' } };

const signupRow = (over?: Record<string, unknown>) => ({
  id: 'gm-1',
  joinedAt: new Date('2026-02-01T09:00:00.000Z'),
  ...identity,
  ...over,
});
const bookingRow = (over?: Record<string, unknown>) => ({
  id: 'bk-1',
  status: 'BOOKED',
  createdAt: new Date('2026-02-01T10:00:00.000Z'),
  member: { id: 'gm-1', ...identity },
  classInstance: { template: { title: 'Spin Express' } },
  ...over,
});
const checkinRow = (over?: Record<string, unknown>) => ({
  id: 'ci-1',
  method: 'QR',
  checkedInAt: new Date('2026-02-01T11:00:00.000Z'),
  member: { id: 'gm-1', ...identity },
  ...over,
});
const saleRow = (over?: Record<string, unknown>) => ({
  id: 'pay-1',
  amount: 4500,
  currency: 'GEL',
  method: 'CARD',
  createdAt: new Date('2026-02-01T12:00:00.000Z'),
  order: { customerName: null, member: { id: 'gm-1', ...identity } },
  ...over,
});
const subscriptionRow = (over?: Record<string, unknown>) => ({
  id: 'sub-1',
  status: 'ACTIVE',
  createdAt: new Date('2026-02-01T08:00:00.000Z'),
  member: { id: 'gm-1', ...identity },
  plan: { name: 'Monthly' },
  ...over,
});

describe('ActivityService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listActivity', () => {
    it('merges every source newest-first and sums the totals', async () => {
      const { service } = setup({
        signups: [signupRow()],
        bookings: [bookingRow()],
        checkins: [checkinRow()],
        sales: [saleRow()],
        subscriptions: [subscriptionRow()],
        counts: { signup: 1, booking: 1, checkin: 1, sale: 1, subscription: 1 },
      });

      const result = await service.listActivity(query());

      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      // Newest first: sale 12:00 > checkin 11:00 > booking 10:00 > signup 09:00 > sub 08:00.
      expect(result.data.map((e) => e.type)).toEqual([
        'sale',
        'checkin',
        'booking',
        'signup',
        'subscription',
      ]);
    });

    it('projects a captured sale with its amount, currency and member', async () => {
      const { service } = setup({ sales: [saleRow()], counts: { sale: 1 } });

      const [event] = (await service.listActivity(query({ type: 'sale' }))).data;

      expect(event).toEqual({
        id: 'sale:pay-1',
        type: 'sale',
        title: 'Sale captured',
        detail: 'Card',
        memberId: 'gm-1',
        memberName: 'Ada Member',
        amount: 4500,
        currency: 'GEL',
        at: '2026-02-01T12:00:00.000Z',
      });
    });

    it('falls back to the guest customer name and null member on a guest sale', async () => {
      const { service } = setup({
        sales: [saleRow({ order: { customerName: 'Guest Gary', member: null } })],
        counts: { sale: 1 },
      });

      const [event] = (await service.listActivity(query({ type: 'sale' }))).data;

      expect(event).toMatchObject({ memberId: null, memberName: 'Guest Gary' });
    });

    it('leaves amount/currency null on non-sale kinds', async () => {
      const { service } = setup({ checkins: [checkinRow()], counts: { checkin: 1 } });

      const [event] = (await service.listActivity(query({ type: 'checkin' }))).data;

      expect(event).toMatchObject({
        type: 'checkin',
        title: 'Checked in',
        detail: 'QR scan',
        amount: null,
        currency: null,
      });
    });

    it('restricts to a single source when a type filter is given', async () => {
      const { service, gymMember, booking, checkIn, payment, subscription } = setup();

      await service.listActivity(query({ type: 'booking' }));

      expect(booking.findMany).toHaveBeenCalledTimes(1);
      expect(booking.count).toHaveBeenCalledTimes(1);
      expect(gymMember.findMany).not.toHaveBeenCalled();
      expect(checkIn.findMany).not.toHaveBeenCalled();
      expect(payment.findMany).not.toHaveBeenCalled();
      expect(subscription.findMany).not.toHaveBeenCalled();
    });

    it('scopes signups to MEMBER-role rows', async () => {
      const { service, gymMember } = setup();

      await service.listActivity(query({ type: 'signup' }));

      expect(gymMember.findMany.mock.calls[0]?.[0]?.where).toMatchObject({ role: 'MEMBER' });
    });

    it('pins the non-auto-scoped check-in query to the caller’s gym explicitly', async () => {
      const { service, checkIn } = setup();

      await service.listActivity(query({ type: 'checkin' }));

      expect(checkIn.findMany.mock.calls[0]?.[0]?.where).toMatchObject({ gymId: 'gym-1' });
      expect(checkIn.count.mock.calls[0]?.[0]?.where).toMatchObject({ gymId: 'gym-1' });
    });

    it('filters sales to captured payments', async () => {
      const { service, payment } = setup();

      await service.listActivity(query({ type: 'sale' }));

      expect(payment.findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'CAPTURED' });
    });

    it('bounds each source by page*limit so a page is a subset of the source tops', async () => {
      const { service, booking } = setup();

      await service.listActivity(query({ page: 3, limit: 10, type: 'booking' }));

      expect(booking.findMany.mock.calls[0]?.[0]?.take).toBe(30);
    });

    it('slices the requested page out of the merged, sorted stream', async () => {
      // Three bookings at descending times; page 2 of size 1 is the middle one.
      const { service } = setup({
        bookings: [
          bookingRow({ id: 'b-new', createdAt: new Date('2026-02-03T00:00:00.000Z') }),
          bookingRow({ id: 'b-mid', createdAt: new Date('2026-02-02T00:00:00.000Z') }),
          bookingRow({ id: 'b-old', createdAt: new Date('2026-02-01T00:00:00.000Z') }),
        ],
        counts: { booking: 3 },
      });

      const result = await service.listActivity(query({ page: 2, limit: 1, type: 'booking' }));

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe('booking:b-mid');
    });

    it('translates from/to into an inclusive UTC instant window per source', async () => {
      const { service, gymMember, checkIn } = setup();

      await service.listActivity(query({ from: '2026-02-01', to: '2026-02-28' }));

      const joinedAt = gymMember.findMany.mock.calls[0]?.[0]?.where?.joinedAt;
      expect(joinedAt?.gte).toEqual(new Date('2026-02-01T00:00:00.000Z'));
      expect(joinedAt?.lt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
      // The window is applied on each source's own timestamp column.
      const checkedInAt = checkIn.findMany.mock.calls[0]?.[0]?.where?.checkedInAt;
      expect(checkedInAt?.gte).toEqual(new Date('2026-02-01T00:00:00.000Z'));
      expect(checkedInAt?.lt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    });

    it('omits the date filter entirely when neither bound is given', async () => {
      const { service, booking } = setup();

      await service.listActivity(query({ type: 'booking' }));

      expect(booking.findMany.mock.calls[0]?.[0]?.where?.createdAt).toBeUndefined();
    });

    it('returns an empty page with a zero total when nothing matches', async () => {
      const { service } = setup();

      const result = await service.listActivity(query());

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });
  });
});
