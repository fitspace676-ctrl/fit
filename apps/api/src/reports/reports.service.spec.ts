import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus } from '@fit/db';
import { ReportsService } from './reports.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/**
 * Stub the tenant-scoped Prisma delegates the reports read. The tenant extension
 * (gym scoping) is exercised by the real client in integration; here we assert the
 * service's own aggregation, grouping, and row shaping.
 */
function setup() {
  const paymentGroupBy = vi.fn();
  const paymentFindFirst = vi.fn().mockResolvedValue({ currency: 'GEL' });
  const paymentFindMany = vi.fn().mockResolvedValue([]);
  const bookingFindMany = vi.fn().mockResolvedValue([]);
  const gymMemberFindMany = vi.fn().mockResolvedValue([]);
  const refundFindMany = vi.fn().mockResolvedValue([]);
  const orderFindMany = vi.fn().mockResolvedValue([]);
  const promoRedemptionFindMany = vi.fn().mockResolvedValue([]);

  const subscriptionFindMany = vi.fn().mockResolvedValue([]);
  const checkInFindMany = vi.fn().mockResolvedValue([]);
  const invoiceFindMany = vi.fn().mockResolvedValue([]);
  const locationFindMany = vi.fn().mockResolvedValue([]);
  const classInstanceFindMany = vi.fn().mockResolvedValue([]);
  const ptSessionFindMany = vi.fn().mockResolvedValue([]);

  const client = {
    payment: { groupBy: paymentGroupBy, findFirst: paymentFindFirst, findMany: paymentFindMany },
    booking: { findMany: bookingFindMany },
    gymMember: { findMany: gymMemberFindMany },
    refund: { findMany: refundFindMany },
    order: { findMany: orderFindMany },
    promoRedemption: { findMany: promoRedemptionFindMany },
    subscription: { findMany: subscriptionFindMany },
    checkIn: { findMany: checkInFindMany },
    invoice: { findMany: invoiceFindMany },
    location: { findMany: locationFindMany },
    classInstance: { findMany: classInstanceFindMany },
    ptSession: { findMany: ptSessionFindMany },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  // `CheckIn` is not in the tenant extension's model set, so the check-in log pins
  // the gym itself — the stub has to carry one.
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new ReportsService(prisma, tenant),
    paymentGroupBy,
    paymentFindFirst,
    paymentFindMany,
    bookingFindMany,
    gymMemberFindMany,
    refundFindMany,
    orderFindMany,
    promoRedemptionFindMany,
    subscriptionFindMany,
    checkInFindMany,
    invoiceFindMany,
    locationFindMany,
    classInstanceFindMany,
    ptSessionFindMany,
  };
}

/** A completed booking row as the service's `select` projects it (attendance/no-show). */
function booking(
  status: BookingStatus,
  template: {
    id: string;
    title: string;
    trainerId: string | null;
    name: string | null;
  },
) {
  return {
    status,
    classInstance: {
      template: {
        id: template.id,
        title: template.title,
        trainerId: template.trainerId,
        trainer: template.name === null ? null : { name: template.name },
      },
    },
  };
}

describe('ReportsService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('sales-summary', () => {
    it('buckets refunds by WHEN THEY WERE ISSUED, not against the original sale', async () => {
      const { service, paymentFindMany, refundFindMany } = setup();
      const today = new Date();
      const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
      // The sale happened three days ago; the refund against it landed today.
      paymentFindMany.mockResolvedValue([{ amount: 10_000, createdAt: threeDaysAgo }]);
      refundFindMany.mockResolvedValue([{ amount: 4_000, createdAt: today }]);

      const result = await service.runReport('sales-summary', { range: '7d' });

      const saleDay = result.rows.find((row) => row.gross === 10_000);
      const refundDay = result.rows.find((row) => row.refunded === 4_000);
      expect(saleDay).toBeDefined();
      expect(refundDay).toBeDefined();
      // Two DIFFERENT buckets. Reading `Payment.refundedAmount` instead would have
      // put the refund back on the sale's day and restated an already-reported one.
      expect(saleDay).not.toBe(refundDay);
      expect(saleDay!.refunded).toBe(0);
      expect(refundDay!.net).toBe(-4_000);
    });

    it('fills every period in the window, so a day with no takings reads as a real zero', async () => {
      const { service } = setup();

      const result = await service.runReport('sales-summary', { range: '7d' });

      expect(result.rows.length).toBeGreaterThan(1);
      expect(result.rows.every((row) => row.gross === 0 && row.net === 0)).toBe(true);
    });
  });

  describe('sales-by-staff', () => {
    it('nets off refunds and gives unattributed sales their own row', async () => {
      const { service, orderFindMany } = setup();
      orderFindMany.mockResolvedValue([
        {
          soldById: 'staff-1',
          payment: { amount: 9_000, refundedAmount: 4_500 },
          soldBy: { role: 'MANAGER', firstName: 'Mariam', lastName: 'Beridze', user: null },
        },
        {
          soldById: 'staff-1',
          payment: { amount: 2_500, refundedAmount: 0 },
          soldBy: { role: 'MANAGER', firstName: 'Mariam', lastName: 'Beridze', user: null },
        },
        // A self-serve online purchase: captured, but nobody sold it.
        { soldById: null, payment: { amount: 12_000, refundedAmount: 0 }, soldBy: null },
      ]);

      const result = await service.runReport('sales-by-staff', { range: '30d' });

      expect(result.rows).toEqual([
        { staff: 'Unattributed', role: '', orders: 1, gross: 12_000, net: 12_000 },
        { staff: 'Mariam Beridze', role: 'MANAGER', orders: 2, gross: 11_500, net: 7_000 },
      ]);
      // The rows have to add up to the gym's own total, which they cannot do if the
      // sales nobody rang are dropped.
      expect(result.rows.reduce((sum, row) => sum + Number(row.gross), 0)).toBe(23_500);
    });

    it('falls back to the cross-gym user name when the staff row has no split name', async () => {
      const { service, orderFindMany } = setup();
      orderFindMany.mockResolvedValue([
        {
          soldById: 'staff-2',
          payment: { amount: 1_000, refundedAmount: 0 },
          soldBy: {
            role: 'RECEPTIONIST',
            firstName: null,
            lastName: null,
            user: { name: 'Giorgi Nadiradze' },
          },
        },
      ]);

      const result = await service.runReport('sales-by-staff', { range: '30d' });

      expect(result.rows[0]!.staff).toBe('Giorgi Nadiradze');
    });
  });

  describe('refunds-detail', () => {
    it('names the operator from the REFUND, which a partial refund logs no status event for', async () => {
      const { service, refundFindMany } = setup();
      refundFindMany.mockResolvedValue([
        {
          createdAt: new Date('2026-08-07T10:30:00.000Z'),
          orderId: 'cmabcdefgh12345678',
          amount: 4_500,
          reason: 'Wrong size, one returned',
          processedBy: { firstName: 'Mariam', lastName: 'Beridze', user: null },
        },
      ]);

      const result = await service.runReport('refunds-detail', { range: '30d' });

      expect(result.rows[0]).toEqual({
        date: '2026-08-07',
        order: '12345678',
        amount: 4_500,
        reason: 'Wrong size, one returned',
        processedBy: 'Mariam Beridze',
      });
    });

    it('says so plainly when a refund predates the attribution', async () => {
      const { service, refundFindMany } = setup();
      refundFindMany.mockResolvedValue([
        {
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          orderId: 'order-old',
          amount: 100,
          reason: 'Goodwill',
          processedBy: null,
        },
      ]);

      const result = await service.runReport('refunds-detail', { range: '12m' });

      expect(result.rows[0]!.processedBy).toBe('Unattributed');
    });
  });

  describe('discounts-and-promotions', () => {
    it('totals the redemption ledger per code, ranked by what it gave away', async () => {
      const { service, promoRedemptionFindMany } = setup();
      const summer = { id: 'p1', code: 'SUMMER25', discountType: 'percent' };
      promoRedemptionFindMany.mockResolvedValue([
        { discountAmount: 2_500, promoCode: summer },
        { discountAmount: 1_500, promoCode: summer },
        { discountAmount: 900, promoCode: { id: 'p2', code: 'WELCOME', discountType: 'fixed' } },
      ]);

      const result = await service.runReport('discounts-and-promotions', { range: '30d' });

      expect(result.rows).toEqual([
        { code: 'SUMMER25', discountType: 'percent', redemptions: 2, discountGiven: 4_000 },
        { code: 'WELCOME', discountType: 'fixed', redemptions: 1, discountGiven: 900 },
      ]);
    });
  });

  describe('pos-transaction-log', () => {
    it('folds the sale’s lines into one cell and labels the settlement method', async () => {
      const { service, orderFindMany } = setup();
      orderFindMany.mockResolvedValue([
        {
          id: 'cmxxxxxxxxabcd1234',
          createdAt: new Date('2026-08-08T14:05:00.000Z'),
          total: 12_500,
          items: [
            { label: 'Whey Protein 1kg', qty: 1 },
            { label: 'Microfibre Gym Towel ×2', qty: 2 },
          ],
          payment: { method: 'CARD' },
          soldBy: { firstName: 'Mariam', lastName: 'Beridze', user: null },
        },
      ]);

      const result = await service.runReport('pos-transaction-log', { range: '7d' });

      expect(result.rows[0]).toEqual({
        date: '2026-08-08',
        time: '14:05',
        order: 'ABCD1234',
        items: 'Whey Protein 1kg, Microfibre Gym Towel ×2',
        method: 'Card',
        total: 12_500,
        staff: 'Mariam Beridze',
      });
    });
  });

  describe('revenue-by-channel', () => {
    it('splits captured takings into POS/ONLINE with net = gross − refunded, sorted by net', async () => {
      const { service, paymentGroupBy } = setup();
      paymentGroupBy.mockResolvedValue([
        { provider: 'pos', _sum: { amount: 5000, refundedAmount: 500 }, _count: { _all: 3 } },
        { provider: 'stub', _sum: { amount: 12000, refundedAmount: 0 }, _count: { _all: 4 } },
        { provider: 'card', _sum: { amount: 1000, refundedAmount: 0 }, _count: { _all: 1 } },
      ]);

      const result = await service.runReport('revenue-by-channel', { range: '30d' });

      expect(result.currency).toBe('GEL');
      // ONLINE (stub 12000 + card 1000 = 13000 net) ranks above POS (net 4500).
      expect(result.rows).toEqual([
        { channel: 'ONLINE', orders: 5, gross: 13000, refunded: 0, net: 13000 },
        { channel: 'POS', orders: 3, gross: 5000, refunded: 500, net: 4500 },
      ]);
    });

    it('returns no rows when the gym has no captured payments in-window', async () => {
      const { service, paymentGroupBy } = setup();
      paymentGroupBy.mockResolvedValue([]);
      const result = await service.runReport('revenue-by-channel', { range: '30d' });
      expect(result.rows).toEqual([]);
    });
  });

  describe('attendance-by-class', () => {
    it('tallies attended/no-show per class with the attendance rate, ranked by volume', async () => {
      const { service, bookingFindMany } = setup();
      const yoga = { id: 't1', title: 'Yoga', trainerId: 'tr1', name: 'Mia' };
      const spin = { id: 't2', title: 'Spin', trainerId: null, name: null };
      bookingFindMany.mockResolvedValue([
        booking(BookingStatus.ATTENDED, yoga),
        booking(BookingStatus.ATTENDED, yoga),
        booking(BookingStatus.ATTENDED, yoga),
        booking(BookingStatus.NO_SHOW, yoga),
        booking(BookingStatus.ATTENDED, spin),
        booking(BookingStatus.NO_SHOW, spin),
      ]);

      const result = await service.runReport('attendance-by-class', { range: '30d' });

      expect(result.rows).toEqual([
        {
          class: 'Yoga',
          trainer: 'Mia',
          booked: 4,
          attended: 3,
          noShow: 1,
          attendanceRate: 75,
          noShowRate: 25,
        },
        {
          class: 'Spin',
          trainer: 'Unassigned',
          booked: 2,
          attended: 1,
          noShow: 1,
          attendanceRate: 50,
          noShowRate: 50,
        },
      ]);
    });

    it('reports a class whose register was never taken as booked with NO rate', async () => {
      const { service, bookingFindMany } = setup();
      const yoga = { id: 't1', title: 'Yoga', trainerId: 'tr1', name: 'Mia' };
      // Seats held, but nobody marked anyone off.
      bookingFindMany.mockResolvedValue([
        booking(BookingStatus.BOOKED, yoga),
        booking(BookingStatus.BOOKED, yoga),
      ]);

      const result = await service.runReport('attendance-by-class', { range: '30d' });

      // 0% attendance would read as everyone skipping; the truth is nobody knows yet.
      expect(result.rows[0]).toEqual({
        class: 'Yoga',
        trainer: 'Mia',
        booked: 2,
        attended: 0,
        noShow: 0,
        attendanceRate: null,
        noShowRate: null,
      });
    });
  });

  describe('waitlist-demand', () => {
    it('counts a session as full when anyone was waitlisted, even if a seat later freed', async () => {
      const { service, classInstanceFindMany } = setup();
      classInstanceFindMany.mockResolvedValue([
        {
          // Capacity 10, only 8 confirmed by the time it ran — but two people were
          // refused a seat while it was full, which is the demand signal.
          capacityOverride: 10,
          template: { id: 't1', title: 'Yoga', capacity: 10 },
          classType: null,
          bookings: [
            ...Array.from({ length: 8 }, () => ({ status: 'BOOKED' })),
            { status: 'WAITLIST' },
            { status: 'WAITLIST' },
          ],
        },
        {
          capacityOverride: 10,
          template: { id: 't1', title: 'Yoga', capacity: 10 },
          classType: null,
          bookings: [{ status: 'BOOKED' }],
        },
      ]);

      const result = await service.runReport('waitlist-demand', { range: '30d' });

      expect(result.rows[0]).toEqual({
        class: 'Yoga',
        sessions: 2,
        sessionsFull: 1,
        waitlisted: 2,
        fullRate: 50,
      });
    });
  });

  describe('class-utilization', () => {
    it('sums capacity across sessions rather than treating it as the room’s size', async () => {
      const { service, classInstanceFindMany } = setup();
      classInstanceFindMany.mockResolvedValue([
        {
          capacityOverride: null,
          template: { id: 't1', title: 'Yoga', capacity: 10 },
          classType: null,
          bookings: [{ id: 'b1' }, { id: 'b2' }],
        },
        {
          // An override on one session must win over the template's own capacity.
          capacityOverride: 5,
          template: { id: 't1', title: 'Yoga', capacity: 10 },
          classType: null,
          bookings: [{ id: 'b3' }],
        },
      ]);

      const result = await service.runReport('class-utilization', { range: '30d' });

      // Two sessions offered 10 + 5 seats and sold 3 → 20%, not 3 of 10.
      expect(result.rows[0]).toEqual({
        class: 'Yoga',
        sessions: 2,
        capacity: 15,
        booked: 3,
        utilization: 20,
      });
    });
  });

  describe('trainer-performance', () => {
    it('keeps classes and PT sessions as separate units of work', async () => {
      const { service, classInstanceFindMany, ptSessionFindMany } = setup();
      classInstanceFindMany.mockResolvedValue([
        {
          capacityOverride: null,
          trainerId: null,
          trainer: null,
          template: { capacity: 10, trainerId: 'tr1', trainer: { name: 'Mia' } },
          classType: null,
          bookings: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
        },
      ]);
      ptSessionFindMany.mockResolvedValue([
        { trainerId: 'tr1', trainer: { name: 'Mia' } },
        { trainerId: 'tr1', trainer: { name: 'Mia' } },
      ]);

      const result = await service.runReport('trainer-performance', { range: '30d' });

      // One class and two PT hours are not "three sessions" — a group class and a
      // private hour are different work.
      expect(result.rows[0]).toEqual({
        trainer: 'Mia',
        classes: 1,
        ptSessions: 2,
        seatsOffered: 10,
        seatsBooked: 3,
        utilization: 30,
      });
    });

    it('leaves utilization null for a PT-only trainer, who had no class to fill', async () => {
      const { service, ptSessionFindMany } = setup();
      ptSessionFindMany.mockResolvedValue([{ trainerId: 'tr2', trainer: { name: 'Leo' } }]);

      const result = await service.runReport('trainer-performance', { range: '30d' });

      expect(result.rows[0]).toMatchObject({
        trainer: 'Leo',
        classes: 0,
        ptSessions: 1,
        utilization: null,
      });
    });

    it('folds an instance onto its TEMPLATE’s trainer, so one person is not two rows', async () => {
      const { service, classInstanceFindMany } = setup();
      classInstanceFindMany.mockResolvedValue([
        // Generated from a template that names the trainer.
        {
          capacityOverride: null,
          trainerId: null,
          trainer: null,
          template: { capacity: 10, trainerId: 'tr1', trainer: { name: 'Mia' } },
          classType: null,
          bookings: [{ id: 'b1' }],
        },
        // Scheduled straight from a type, with the trainer on the instance itself.
        {
          capacityOverride: 8,
          trainerId: 'tr1',
          trainer: { name: 'Mia' },
          template: null,
          classType: { capacity: 8 },
          bookings: [{ id: 'b2' }],
        },
      ]);

      const result = await service.runReport('trainer-performance', { range: '30d' });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ trainer: 'Mia', classes: 2, seatsOffered: 18 });
    });
  });

  describe('pt-sessions', () => {
    it('divides the completion rate by SETTLED sessions, not by those still to come', async () => {
      const { service, ptSessionFindMany } = setup();
      const mia = { id: 'tr1', name: 'Mia' };
      ptSessionFindMany.mockResolvedValue([
        { status: 'COMPLETED', trainer: mia },
        { status: 'COMPLETED', trainer: mia },
        { status: 'CANCELED', trainer: mia },
        // Still scheduled — it has not happened, so it divides nothing.
        { status: 'SCHEDULED', trainer: mia },
      ]);

      const result = await service.runReport('pt-sessions', { range: '30d' });

      expect(result.rows[0]).toEqual({
        trainer: 'Mia',
        sessions: 4,
        completed: 2,
        cancelled: 1,
        completionRate: 66.7,
      });
    });
  });

  describe('no-show-rate', () => {
    it('groups completed bookings by trainer and ranks by no-show rate', async () => {
      const { service, bookingFindMany } = setup();
      const mia = { id: 't1', title: 'Yoga', trainerId: 'tr1', name: 'Mia' };
      const leo = { id: 't2', title: 'Spin', trainerId: 'tr2', name: 'Leo' };
      bookingFindMany.mockResolvedValue([
        // Mia: 1 no-show of 4 → 25%.
        booking(BookingStatus.ATTENDED, mia),
        booking(BookingStatus.ATTENDED, mia),
        booking(BookingStatus.ATTENDED, mia),
        booking(BookingStatus.NO_SHOW, mia),
        // Leo: 1 no-show of 2 → 50%.
        booking(BookingStatus.ATTENDED, leo),
        booking(BookingStatus.NO_SHOW, leo),
      ]);

      const result = await service.runReport('no-show-rate', { range: '30d' });

      expect(result.rows).toEqual([
        { trainer: 'Leo', completed: 2, noShow: 1, noShowRate: 50 },
        { trainer: 'Mia', completed: 4, noShow: 1, noShowRate: 25 },
      ]);
    });
  });

  describe('membership-movement', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('buckets new members and carries a running total off the pre-window baseline', async () => {
      const { service, gymMemberFindMany } = setup();
      gymMemberFindMany.mockResolvedValue([
        // Two joined before the 7-day window → baseline of 2.
        { joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        { joinedAt: new Date('2026-05-01T00:00:00.000Z') },
        // One joined inside the window.
        { joinedAt: new Date('2026-06-12T09:00:00.000Z') },
      ]);

      const result = await service.runReport('membership-movement', { range: '7d' });

      const totalNew = result.rows.reduce((sum, r) => sum + (r.newMembers as number), 0);
      const totals = result.rows.map((r) => r.totalMembers as number);
      expect(totalNew).toBe(1);
      // The running total starts from the baseline and is monotonic non-decreasing.
      expect(totals[0]).toBeGreaterThanOrEqual(2);
      expect(totals.at(-1)).toBe(3);
      for (let i = 1; i < totals.length; i++) {
        expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]!);
      }
    });

    it('counts a cancellation against the period and nets it off the change', async () => {
      const { service, gymMemberFindMany, subscriptionFindMany } = setup();
      gymMemberFindMany.mockResolvedValue([
        { joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        { joinedAt: new Date('2026-06-12T09:00:00.000Z') },
      ]);
      subscriptionFindMany.mockResolvedValue([
        // Cancelled inside the window, on a different day from the signup.
        {
          status: 'CANCELED',
          canceledAt: new Date('2026-06-13T09:00:00.000Z'),
          updatedAt: new Date('2026-06-13T09:00:00.000Z'),
        },
        // Still live — must not count as a cancellation.
        { status: 'ACTIVE', canceledAt: null, updatedAt: new Date('2026-06-13T09:00:00.000Z') },
      ]);

      const result = await service.runReport('membership-movement', { range: '7d' });

      const signupDay = result.rows.find((r) => r.newMembers === 1);
      const cancelDay = result.rows.find((r) => r.cancellations === 1);
      expect(signupDay!.netChange).toBe(1);
      expect(cancelDay!.netChange).toBe(-1);
      expect(result.rows.reduce((sum, r) => sum + (r.cancellations as number), 0)).toBe(1);
    });

    it('reads an EXPIRED subscription as churn even though it was never cancelled', async () => {
      const { service, subscriptionFindMany } = setup();
      subscriptionFindMany.mockResolvedValue([
        // No `canceledAt` — it lapsed rather than being cancelled. Treating that as
        // "never churned" would flatter every retention figure the gym looks at.
        {
          status: 'EXPIRED',
          canceledAt: null,
          updatedAt: new Date('2026-06-12T09:00:00.000Z'),
        },
      ]);

      const result = await service.runReport('membership-movement', { range: '7d' });

      expect(result.rows.reduce((sum, r) => sum + (r.cancellations as number), 0)).toBe(1);
    });
  });

  describe('revenue-summary', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('normalises a yearly plan to a twelfth and ignores a TRIAL entirely', async () => {
      const { service, subscriptionFindMany } = setup();
      subscriptionFindMany.mockResolvedValue([
        {
          memberId: 'm1',
          priceAmount: 12_000,
          interval: 'YEAR',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          canceledAt: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          memberId: 'm2',
          priceAmount: 5_000,
          interval: 'MONTH',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          canceledAt: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        // A trial is not recurring revenue, however much the row looks like one.
        {
          memberId: 'm3',
          priceAmount: 9_999,
          interval: 'TRIAL',
          status: 'TRIAL',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          canceledAt: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.runReport('revenue-summary', { range: '7d' });

      const last = result.rows.at(-1)!;
      // 12_000/12 + 5_000 — the trial contributes nothing and is not counted as a
      // subscribed member either.
      expect(last.mrr).toBe(6_000);
      expect(last.activeMembers).toBe(2);
      expect(last.arpm).toBe(3_000);
    });

    it('treats MRR as a stock at period end, not something the periods sum to', async () => {
      const { service, subscriptionFindMany } = setup();
      subscriptionFindMany.mockResolvedValue([
        {
          memberId: 'm1',
          priceAmount: 5_000,
          interval: 'MONTH',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          canceledAt: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.runReport('revenue-summary', { range: '7d' });

      // Every day carries the SAME 5_000 base. Adding the column up would report a
      // month's MRR as 35_000, which is the classic way this figure gets misread.
      expect(result.rows.every((row) => row.mrr === 5_000)).toBe(true);
    });

    it('reports no average when nobody is subscribed, rather than a zero', async () => {
      const { service } = setup();

      const result = await service.runReport('revenue-summary', { range: '7d' });

      expect(result.rows.every((row) => row.arpm === null)).toBe(true);
    });
  });

  describe('refunds-accounting', () => {
    it('leaves the share of gross null for a period that took nothing', async () => {
      const { service, refundFindMany } = setup();
      refundFindMany.mockResolvedValue([{ amount: 4_000, createdAt: new Date() }]);

      const result = await service.runReport('refunds-accounting', { range: '7d' });

      const refundDay = result.rows.find((row) => row.refunded === 4_000)!;
      // A refund against no takings is not "100% of gross" — it is undefined.
      expect(refundDay.gross).toBe(0);
      expect(refundDay.shareOfGross).toBeNull();
    });
  });

  describe('revenue-by-location', () => {
    it('groups takings with no branch instead of dropping them', async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        { amount: 10_000, refundedAmount: 0, order: { location: { name: 'Downtown' } } },
        { amount: 4_000, refundedAmount: 1_000, order: { location: null } },
      ]);

      const result = await service.runReport('revenue-by-location', { range: '30d' });

      expect(result.rows).toEqual([
        { location: 'Downtown', orders: 1, gross: 10_000, refunded: 0, net: 10_000 },
        { location: 'No location', orders: 1, gross: 4_000, refunded: 1_000, net: 3_000 },
      ]);
      // The rows have to add up to the gym's own gross.
      expect(result.rows.reduce((sum, row) => sum + Number(row.gross), 0)).toBe(14_000);
    });
  });

  describe('retention-and-churn', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('reports null — not zero — for a window in which nobody was subscribed', async () => {
      const { service } = setup();

      const result = await service.runReport('retention-and-churn', { range: '7d' });

      // "0% churn" and "nobody to churn" are different facts, and a rate with no
      // denominator is the second one.
      expect(result.rows.every((row) => row.churnRate30 === null)).toBe(true);
      expect(result.rows.every((row) => row.retentionRate30 === null)).toBe(true);
    });

    it('reports retention as the complement of the 30-day churn rate', async () => {
      const { service, subscriptionFindMany } = setup();
      subscriptionFindMany.mockResolvedValue([
        // Four live well before the window; one of them churns inside it → 25%.
        ...Array.from({ length: 3 }, () => ({
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          canceledAt: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        })),
        {
          status: 'CANCELED',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          canceledAt: new Date('2026-06-14T09:00:00.000Z'),
          updatedAt: new Date('2026-06-14T09:00:00.000Z'),
        },
      ]);

      const result = await service.runReport('retention-and-churn', { range: '7d' });

      const last = result.rows.at(-1)!;
      expect(last.churnRate30).toBe(25);
      expect(last.retentionRate30).toBe(75);
    });
  });

  describe('serialization', () => {
    it('streams CSV with a header row then formatted, escaped data rows', async () => {
      const { service, paymentGroupBy } = setup();
      paymentGroupBy.mockResolvedValue([
        { provider: 'pos', _sum: { amount: 5000, refundedAmount: 500 }, _count: { _all: 3 } },
      ]);

      const chunks: string[] = [];
      for await (const chunk of service.streamReportCsv('revenue-by-channel', { range: '30d' })) {
        chunks.push(chunk);
      }
      const lines = chunks.join('').trimEnd().split('\r\n');

      expect(lines[0]).toBe('Channel,Orders,Gross,Refunded,Net');
      // Money columns render as major-unit decimals (5000 → 50.00, net 4500 → 45.00).
      expect(lines[1]).toBe('POS,3,50.00,5.00,45.00');
    });

    it('builds an XLSX workbook buffer for the report', async () => {
      const { service, paymentGroupBy } = setup();
      paymentGroupBy.mockResolvedValue([
        { provider: 'pos', _sum: { amount: 5000, refundedAmount: 0 }, _count: { _all: 1 } },
      ]);

      const workbook = await service.buildReportXlsx('revenue-by-channel', { range: '30d' });

      expect(workbook.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      const text = workbook.toString('latin1');
      expect(text).toContain('<t xml:space="preserve">Channel</t>');
      // POS gross 5000 minor → 50 major, written as a numeric cell.
      expect(text).toContain('<v>50</v>');
    });
  });
});
