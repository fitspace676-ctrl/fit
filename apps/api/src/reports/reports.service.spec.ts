import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus } from '@fit/db';
import { ReportsService } from './reports.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/**
 * Stub the tenant-scoped Prisma delegates the reports read. The tenant extension
 * (gym scoping) is exercised by the real client in integration; here we assert the
 * service's own aggregation, grouping, and row shaping.
 */
function setup() {
  const paymentGroupBy = vi.fn();
  const paymentFindFirst = vi.fn().mockResolvedValue({ currency: 'GEL' });
  const bookingFindMany = vi.fn();
  const gymMemberFindMany = vi.fn();

  const client = {
    payment: { groupBy: paymentGroupBy, findFirst: paymentFindFirst },
    booking: { findMany: bookingFindMany },
    gymMember: { findMany: gymMemberFindMany },
  };
  const prisma = { client } as unknown as TenantPrismaService;

  return {
    service: new ReportsService(prisma),
    paymentGroupBy,
    paymentFindFirst,
    bookingFindMany,
    gymMemberFindMany,
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
        { class: 'Yoga', trainer: 'Mia', attended: 3, noShow: 1, attendanceRate: 75 },
        { class: 'Spin', trainer: 'Unassigned', attended: 1, noShow: 1, attendanceRate: 50 },
      ]);
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

  describe('membership-growth', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('buckets new members and carries a running cumulative off the pre-window baseline', async () => {
      const { service, gymMemberFindMany } = setup();
      gymMemberFindMany.mockResolvedValue([
        // Two joined before the 7-day window → baseline of 2.
        { joinedAt: new Date('2026-01-01T00:00:00.000Z') },
        { joinedAt: new Date('2026-05-01T00:00:00.000Z') },
        // One joined inside the window.
        { joinedAt: new Date('2026-06-12T09:00:00.000Z') },
      ]);

      const result = await service.runReport('membership-growth', { range: '7d' });

      const totalNew = result.rows.reduce((sum, r) => sum + (r.newMembers as number), 0);
      const cumulatives = result.rows.map((r) => r.cumulativeMembers as number);
      expect(totalNew).toBe(1);
      // Cumulative starts from the baseline and is monotonic non-decreasing.
      expect(cumulatives[0]).toBeGreaterThanOrEqual(2);
      expect(cumulatives.at(-1)).toBe(3);
      for (let i = 1; i < cumulatives.length; i++) {
        expect(cumulatives[i]).toBeGreaterThanOrEqual(cumulatives[i - 1]!);
      }
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
