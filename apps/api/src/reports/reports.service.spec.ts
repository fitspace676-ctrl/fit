import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus } from '@fit/db';
import { REPORT_KEYS } from '@fit/types';
import { ReportsService } from './reports.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { GymLocaleService } from '../gyms/gym-locale.service';

/**
 * The gym row `catalog()` reads settings from — mutable per test, reset in
 * `beforeEach`. `null` models a tenant context pointing at a gym row that no
 * longer exists (e.g. a deleted gym).
 */
let gymRow: { name: string; settings: unknown } | null;

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
  const classInstanceFindMany = vi.fn().mockResolvedValue([]);
  const ptSessionFindMany = vi.fn().mockResolvedValue([]);
  const gymFindFirst = vi.fn(() => Promise.resolve(gymRow));

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
    classInstance: { findMany: classInstanceFindMany },
    ptSession: { findMany: ptSessionFindMany },
    gym: { findFirst: gymFindFirst },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  // The check-in log still pins the gym by hand — redundant since Stage 3 put
  // `CheckIn` in the tenant extension's model set, kept as belt and braces — so the
  // stub has to carry one.
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  // The gym's configured currency (Settings → General) — every report is
  // denominated in it rather than in whatever its last payment happened to be.
  const locale = {
    get: () => Promise.resolve({ language: 'en', currency: 'GEL', timezone: 'Asia/Tbilisi' }),
  } as unknown as GymLocaleService;

  return {
    service: new ReportsService(prisma, tenant, locale),
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
    classInstanceFindMany,
    ptSessionFindMany,
    gymFindFirst,
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
  beforeEach(() => {
    gymRow = { name: 'FitSpace', settings: {} };
  });
  afterEach(() => vi.clearAllMocks());

  describe('catalog', () => {
    it('offers every report by default', async () => {
      const { service } = setup();

      const catalog = await service.catalog();

      expect(catalog.reports).toHaveLength(REPORT_KEYS.length);
    });

    it('omits a report the gym switched off', async () => {
      const { service } = setup();
      gymRow!.settings = { reports: { 'refunds-detail': false } };

      const catalog = await service.catalog();

      expect(catalog.reports.some((r) => r.key === 'refunds-detail')).toBe(false);
      expect(catalog.reports.some((r) => r.key === 'sales-summary')).toBe(true);
    });

    it('returns an empty catalogue when every report is off, rather than throwing', async () => {
      const { service } = setup();
      gymRow!.settings = {
        reports: Object.fromEntries(REPORT_KEYS.map((key) => [key, false])),
      };

      await expect(service.catalog()).resolves.toEqual({ reports: [] });
    });

    it('falls back to the full catalogue when the gym row is missing', async () => {
      gymRow = null;
      const { service } = setup();

      const catalog = await service.catalog();

      expect(catalog.reports).toHaveLength(REPORT_KEYS.length);
    });

    // The boundary this whole feature rests on. "Hidden" is not "forbidden": a
    // future contributor's natural instinct is to make these routes 403 on a
    // disabled report, which would break every bookmarked link and scheduled
    // export the moment a gym tidies its hub. This test is what makes that
    // instinct fail loudly for the ON-SCREEN PREVIEW route.
    it('still previews a report the gym has switched off', async () => {
      const { service } = setup();
      gymRow!.settings = { reports: { 'sales-summary': false } };

      await expect(service.runReport('sales-summary', { range: '30d' })).resolves.toBeDefined();
    });

    // The same instinct is more tempting on the EXPORT route — "don't let them
    // download what we hid" reads as reasonable — and it does more damage: a
    // broken bookmarked preview is an annoyance, a broken scheduled export is a
    // job that silently stops producing. `runReport` and `streamReportCsv` only
    // SHARE `computeReport` today; they are not the same route, so a check
    // added to one would not be caught by a test pinning only the other. This
    // pins the export path independently, and actually drains the generator —
    // not just calls it — so a check placed anywhere computeReport is reached
    // is caught, not skipped past by a lazily-never-executed iterator.
    it('still exports a report the gym has switched off', async () => {
      const { service } = setup();
      gymRow!.settings = { reports: { 'sales-summary': false } };

      const chunks: string[] = [];
      for await (const chunk of service.streamReportCsv('sales-summary', { range: '30d' })) {
        chunks.push(chunk);
      }

      // At least the header row came out, proving the generator actually ran
      // computeReport rather than returning an inert, never-executed iterator.
      expect(chunks.length).toBeGreaterThan(0);
    });

    // `buildReportXlsx` is the third sibling on the same computeReport funnel
    // (reached by `GET :report/export?format=xlsx`) and shares nothing with the
    // CSV path but `computeReport` itself — a check added at the top of this
    // method specifically would slip past the other two boundary tests. Pinned
    // independently, and the workbook bytes are inspected (not just "resolved")
    // so a stub that returns an empty buffer without really building anything
    // would not pass.
    it('still exports XLSX for a report the gym has switched off', async () => {
      const { service } = setup();
      gymRow!.settings = { reports: { 'sales-summary': false } };

      const workbook = await service.buildReportXlsx('sales-summary', { range: '30d' });

      expect(workbook.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    });
  });

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
        { amount: 10_000, refundedAmount: 0, location: { name: 'Downtown' } },
        { amount: 4_000, refundedAmount: 1_000, location: null },
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

  /**
   * The branch filter (roadmap Stage 1). Two things are pinned here, and the second
   * matters more than the first: WHICH reports narrow to a branch, and — for the
   * ones that cannot — that they do not silently pretend to. A report that filtered
   * on a column nothing writes would return an empty table reading as "this branch
   * had no activity", which is worse than an honestly gym-wide figure.
   */
  describe('branch filter', () => {
    /** The `where` the nth call to a stubbed delegate was issued with. */
    const whereOf = (mock: { mock: { calls: unknown[][] } }, call = 0) =>
      (mock.mock.calls[call]?.[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {};

    it('adds no location predicate at all when no branch is selected', async () => {
      const { service, paymentFindMany, refundFindMany } = setup();

      await service.runReport('sales-summary', { range: '30d' });

      // Not `locationId: undefined` — the key is absent, so the gym-wide roll-up
      // issues exactly the query it issued before this feature existed.
      expect(whereOf(paymentFindMany)).not.toHaveProperty('order');
      expect(whereOf(paymentFindMany)).not.toHaveProperty('locationId');
      expect(whereOf(refundFindMany)).not.toHaveProperty('order');
    });

    // Stage 5 gave `Payment` and `Refund` the `locationId` the previous version of
    // this test said they lacked. Inverted, not deleted: the property is unchanged —
    // both money tables narrow, by the branch that rang the sale up — and the
    // relation shape is now the regression to guard against, because it cannot use
    // `(gymId, locationId, createdAt)` and it re-reads the order live.
    it('scopes payments and refunds on their own branch column', async () => {
      const { service, paymentFindMany, refundFindMany } = setup();

      await service.runReport('sales-summary', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(paymentFindMany).locationId).toBe('loc-1');
      expect(whereOf(refundFindMany).locationId).toBe('loc-1');
      expect(whereOf(paymentFindMany)).not.toHaveProperty('order');
      expect(whereOf(refundFindMany)).not.toHaveProperty('order');
    });

    it('scopes order-backed reports on the order’s own column', async () => {
      const { service, orderFindMany } = setup();

      await service.runReport('pos-transaction-log', { range: '30d', locationId: 'loc-1' });
      await service.runReport('plan-performance', { range: '30d', locationId: 'loc-1' });
      await service.runReport('sales-by-staff', { range: '30d', locationId: 'loc-1' });

      // Plain equality, no `OR locationId IS NULL` arm: Stage 0 backfilled every
      // null on `orders` to the gym's default branch.
      for (const call of [0, 1, 2]) {
        expect(whereOf(orderFindMany, call).locationId).toBe('loc-1');
      }
    });

    it('scopes the payment groupBy reports too, not just the findMany ones', async () => {
      const { service, paymentGroupBy } = setup();
      paymentGroupBy.mockResolvedValue([]);

      await service.runReport('revenue-by-channel', { range: '30d', locationId: 'loc-1' });
      await service.runReport('sales-by-payment-method', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(paymentGroupBy, 0).locationId).toBe('loc-1');
      expect(whereOf(paymentGroupBy, 1).locationId).toBe('loc-1');
      // A groupBy is the shape that suffered most from the join — it aggregates the
      // whole window before grouping.
      expect(whereOf(paymentGroupBy, 0)).not.toHaveProperty('order');
    });

    it('scopes class reports through the instance that carries the branch', async () => {
      const { service, classInstanceFindMany, bookingFindMany } = setup();

      await service.runReport('class-utilization', { range: '30d', locationId: 'loc-1' });
      await service.runReport('attendance-by-class', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(classInstanceFindMany).locationId).toBe('loc-1');
      // A booking reaches a branch only through the session it holds a seat on.
      expect(whereOf(bookingFindMany).classInstance).toMatchObject({ locationId: 'loc-1' });
    });

    // Stage 2 gave `GymMember` a home branch, so this assertion is the inverse of
    // the one that stood here. The honesty rule it enforces is unchanged: a report
    // narrows by a branch the ROW can actually answer for, and every read inside
    // one report narrows the same way or its columns stop reconciling.
    it('narrows member-backed reports by the member’s home branch', async () => {
      const { service, gymMemberFindMany, subscriptionFindMany } = setup();

      await service.runReport('member-roster', { range: '30d', locationId: 'loc-1' });
      await service.runReport('retention-and-churn', { range: '30d', locationId: 'loc-1' });

      // `GymMember` owns the column; a `Subscription` reaches it through `member`.
      expect(whereOf(gymMemberFindMany).locationId).toBe('loc-1');
      expect(whereOf(subscriptionFindMany).member).toEqual({ locationId: 'loc-1' });
    });

    // `membership-movement` subtracts cancellations from signups in one row. Half a
    // filter would make `netChange` a subtraction across two populations, so both
    // halves are pinned together.
    it('narrows both halves of membership movement, never one', async () => {
      const { service, gymMemberFindMany, subscriptionFindMany } = setup();

      await service.runReport('membership-movement', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(gymMemberFindMany).locationId).toBe('loc-1');
      expect(whereOf(subscriptionFindMany).member).toEqual({ locationId: 'loc-1' });
    });

    // Not `locationId: undefined`, and no empty `member` key: "all branches" must
    // leave each read's original, index-served plan untouched.
    it('sends no member clause at all when no branch is selected', async () => {
      const { service, gymMemberFindMany, subscriptionFindMany } = setup();

      await service.runReport('member-roster', { range: '30d' });
      await service.runReport('retention-and-churn', { range: '30d' });

      expect(whereOf(gymMemberFindMany)).not.toHaveProperty('locationId');
      expect(whereOf(subscriptionFindMany)).not.toHaveProperty('member');
    });

    // Stage 3 gave `CheckIn.locationId` an FK and a write path, so this assertion is
    // the inverse of the one that stood here. The property it protects is unchanged
    // and is the whole reason the inversion is safe to make: the log narrows by the
    // branch the row itself names — the door the visitor came through — and NOT by
    // the visitor's home branch, which would print a log whose own `location` column
    // named a different branch from the one that was filtered on.
    it('narrows the check-in log by the branch the visit happened at', async () => {
      const { service, checkInFindMany } = setup();

      await service.runReport('member-check-in-log', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(checkInFindMany).locationId).toBe('loc-1');
      // Never the member hop: a visit is an event at a place, not a property of a
      // person, so `GymMember.locationId` must not appear anywhere in this `where`.
      expect(whereOf(checkInFindMany)).not.toHaveProperty('member');
      // Still pinned to the gym by hand — redundant now that `CheckIn` is in the
      // tenant extension's model set, kept because it is the belt to that braces.
      expect(whereOf(checkInFindMany).gymId).toBe('gym-1');
    });

    // "All branches" must leave the query exactly as it was — not `locationId:
    // undefined`, which Prisma reads as "the column IS NULL" on some shapes and
    // would silently return only the un-homed visits.
    it('sends no location clause on the check-in log when no branch is selected', async () => {
      const { service, checkInFindMany } = setup();

      await service.runReport('member-check-in-log', { range: '30d' });

      expect(whereOf(checkInFindMany)).not.toHaveProperty('locationId');
      expect(whereOf(checkInFindMany).gymId).toBe('gym-1');
    });

    // The branch name on screen and the branch filtered on now come from the SAME
    // relation, so the log can no longer contradict itself in adjacent cells — the
    // exact failure the old exemption existed to prevent.
    it('reads the branch name off the location relation, not a second lookup', async () => {
      const { service, checkInFindMany } = setup();
      checkInFindMany.mockResolvedValue([
        {
          checkedInAt: new Date('2026-05-20T08:15:00.000Z'),
          method: 'QR',
          location: { name: 'Vake' },
          member: { firstName: 'Nino', lastName: 'B', user: { name: null } },
        },
        // `location` is `SetNull`, so a visit whose branch was deleted keeps the
        // row and loses only the name. It must not fall out of the log.
        {
          checkedInAt: new Date('2026-05-20T07:00:00.000Z'),
          method: 'MANUAL',
          location: null,
          member: { firstName: 'Data', lastName: 'B', user: { name: null } },
        },
      ]);

      const result = await service.runReport('member-check-in-log', {
        range: '30d',
        locationId: 'loc-1',
      });

      expect(result.rows.map((row) => row.location)).toEqual(['Vake', '']);
    });

    it('leaves trainer performance gym-wide rather than mixing two scopes in a row', async () => {
      const { service, classInstanceFindMany, ptSessionFindMany } = setup();

      await service.runReport('trainer-performance', { range: '30d', locationId: 'loc-1' });

      // `ClassInstance` could be filtered and `PtSession` could not; filtering half
      // would rank trainers on one branch's classes plus every branch's PT hours.
      expect(whereOf(classInstanceFindMany)).not.toHaveProperty('locationId');
      expect(whereOf(ptSessionFindMany)).not.toHaveProperty('locationId');
    });

    it('leaves discounts gym-wide — its ledger is half anonymous by design', async () => {
      const { service, promoRedemptionFindMany } = setup();

      await service.runReport('discounts-and-promotions', { range: '30d', locationId: 'loc-1' });

      // `PromoRedemption.orderId` is a relation-less scalar and half the ledger has
      // no order at all. The member hop is available here and still refused:
      // `memberId` is routinely null — the schema's own comment says it is null for
      // an anonymous walk-in sale — so attributing by member would drop exactly the
      // walk-in promotions this report exists to price.
      expect(whereOf(promoRedemptionFindMany)).not.toHaveProperty('order');
      expect(whereOf(promoRedemptionFindMany)).not.toHaveProperty('member');
    });

    // The invoice set MIXES order-backed and subscription rows. "Order branch if it
    // has one, member branch otherwise" is available and is the trap: a total whose
    // attribution changes row by row means nothing. One rule covers every invoice.
    // The debt belongs to the branch its member called home WHEN IT WAS RAISED.
    // Inverted twice now — first from gym-wide to the member hop, now from the hop
    // to the snapshot — and both inversions preserved the same property: one rule
    // for every invoice, and never the order path. This set mixes order-backed and
    // subscription invoices, so an order rule would attribute the minority one way
    // and the majority another.
    it('narrows outstanding invoices on the invoice’s own branch, never through the order', async () => {
      const { service, invoiceFindMany } = setup();

      await service.runReport('outstanding-invoices', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(invoiceFindMany)).not.toHaveProperty('order');
      // Nor the live member hop: a transfer used to drag every past debt onto the
      // new branch, restating months already closed at both.
      expect(whereOf(invoiceFindMany)).not.toHaveProperty('member');
      expect(whereOf(invoiceFindMany).locationId).toBe('loc-1');
    });

    describe('revenue-by-location', () => {
      it('degrades to the selected branch’s single row', async () => {
        const { service, paymentFindMany } = setup();
        paymentFindMany.mockResolvedValue([
          {
            amount: 10_000,
            refundedAmount: 1_000,
            location: { name: 'Vake' },
          },
        ]);

        const result = await service.runReport('revenue-by-location', {
          range: '30d',
          locationId: 'loc-1',
        });

        expect(whereOf(paymentFindMany).locationId).toBe('loc-1');
        // One row, same columns. The contract fixes the shape, not the row count —
        // ignoring the filter here would name every other branch on a screen the
        // operator has scoped to one.
        expect(result.rows).toEqual([
          { location: 'Vake', orders: 1, gross: 10_000, refunded: 1_000, net: 9_000 },
        ]);
      });

      it('still buckets an unattributed sale under "No location" when unfiltered', async () => {
        const { service, paymentFindMany } = setup();
        paymentFindMany.mockResolvedValue([{ amount: 5_000, refundedAmount: 0, location: null }]);

        const result = await service.runReport('revenue-by-location', { range: '30d' });

        // The Stage 0 backfill should make this unreachable in production, but the
        // bucket stays: a branch deleted out from under an order (onDelete: SetNull)
        // must still be counted, or these rows stop adding up to the gym's total.
        expect(result.rows).toEqual([
          { location: 'No location', orders: 1, gross: 5_000, refunded: 0, net: 5_000 },
        ]);
      });
    });

    describe('revenue-summary', () => {
      // Until Stage 2 the three subscription columns returned `null` under a branch
      // filter, because a recurring base could not be attributed to one. They now
      // report real per-branch figures, so this spec asserts the reverse of what it
      // used to — and pins the SPLIT ATTRIBUTION that makes the row coherent: the
      // FLOW follows the order (the till that took the money), the STOCKS follow
      // the member's home branch (whose membership it is).
      it('freezes the revenue half and keeps MRR on the live member hop', async () => {
        const { service, paymentFindMany, subscriptionFindMany } = setup();
        paymentFindMany.mockResolvedValue([{ amount: 9_000, createdAt: new Date() }]);
        subscriptionFindMany.mockResolvedValue([
          {
            memberId: 'member-1',
            priceAmount: 6_000,
            interval: 'MONTH',
            status: 'ACTIVE',
            createdAt: new Date('2020-01-01T00:00:00.000Z'),
            canceledAt: null,
            updatedAt: new Date('2020-01-01T00:00:00.000Z'),
          },
        ]);

        const result = await service.runReport('revenue-summary', {
          range: '7d',
          locationId: 'loc-1',
        });

        // **The two rules on one row, and this is the test that pins them apart.**
        //
        // The flow reads the payment's OWN column — takings belong to the drawer
        // they went into, frozen at write time by Stage 5.
        expect(whereOf(paymentFindMany).locationId).toBe('loc-1');
        expect(whereOf(paymentFindMany)).not.toHaveProperty('order');
        // The stock still hops through the member, LIVE, and must keep doing so: a
        // membership is not sold at a till, and the gym owner decided a
        // transferring member's recurring revenue follows them. Give `Subscription`
        // a column to "finish" the denormalisation and this line fails — correctly.
        expect(whereOf(subscriptionFindMany).member).toEqual({ locationId: 'loc-1' });
        expect(whereOf(subscriptionFindMany)).not.toHaveProperty('locationId');

        expect(result.rows.at(-1)!.mrr).toBe(6_000);
        expect(result.rows.at(-1)!.activeMembers).toBe(1);
        expect(result.rows.some((row) => row.revenue === 9_000)).toBe(true);
        // `null` in these columns goes back to meaning only what it means gym-wide:
        // no members to divide by. It is no longer a stand-in for "not per branch".
        expect(result.rows.every((row) => row.mrr !== null)).toBe(true);
      });

      it('keeps reporting MRR gym-wide when no branch is selected', async () => {
        const { service, subscriptionFindMany } = setup();
        subscriptionFindMany.mockResolvedValue([
          {
            memberId: 'member-1',
            priceAmount: 6_000,
            interval: 'MONTH',
            status: 'ACTIVE',
            createdAt: new Date('2020-01-01T00:00:00.000Z'),
            canceledAt: null,
            updatedAt: new Date('2020-01-01T00:00:00.000Z'),
          },
        ]);

        const result = await service.runReport('revenue-summary', { range: '7d' });

        expect(result.rows.at(-1)!.mrr).toBe(6_000);
        expect(result.rows.at(-1)!.activeMembers).toBe(1);
      });
    });

    // A CSV that disagrees with the screen it was downloaded from is worse than no
    // filter: the reader has no way to tell which of the two is the real figure.
    // Both file formats reach `computeReport` by their own path, so both are pinned.
    it('applies the same filter to the CSV and XLSX exports as to the preview', async () => {
      const { service, orderFindMany } = setup();

      for await (const _chunk of service.streamReportCsv('pos-transaction-log', {
        range: '30d',
        locationId: 'loc-1',
      })) {
        // drained so the generator actually issues its query
      }
      await service.buildReportXlsx('pos-transaction-log', {
        range: '30d',
        locationId: 'loc-1',
      });

      expect(whereOf(orderFindMany, 0).locationId).toBe('loc-1');
      expect(whereOf(orderFindMany, 1).locationId).toBe('loc-1');
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
