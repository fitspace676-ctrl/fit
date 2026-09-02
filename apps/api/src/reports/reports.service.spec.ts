import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus } from '@fit/db';
import { OFFERED_REPORT_KEYS, REPORT_KEYS } from '@fit/types';
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
  const productFindMany = vi.fn().mockResolvedValue([]);
  const stockMovementFindMany = vi.fn().mockResolvedValue([]);
  const userFindMany = vi.fn().mockResolvedValue([]);
  const promoRedemptionFindMany = vi.fn().mockResolvedValue([]);

  const subscriptionFindMany = vi.fn().mockResolvedValue([]);
  const checkInFindMany = vi.fn().mockResolvedValue([]);
  const invoiceFindMany = vi.fn().mockResolvedValue([]);
  const locationFindMany = vi.fn().mockResolvedValue([]);
  const classInstanceFindMany = vi.fn().mockResolvedValue([]);
  const ptSessionFindMany = vi.fn().mockResolvedValue([]);
  const serviceSessionFindMany = vi.fn().mockResolvedValue([]);
  const creditPackFindMany = vi.fn().mockResolvedValue([]);
  const shiftSlotFindMany = vi.fn().mockResolvedValue([]);
  const auditLogFindMany = vi.fn().mockResolvedValue([]);
  const trainerFindMany = vi.fn().mockResolvedValue([]);
  const gymFindFirst = vi.fn(() => Promise.resolve(gymRow));

  const client = {
    payment: { groupBy: paymentGroupBy, findFirst: paymentFindFirst, findMany: paymentFindMany },
    booking: { findMany: bookingFindMany },
    gymMember: { findMany: gymMemberFindMany },
    refund: { findMany: refundFindMany },
    order: { findMany: orderFindMany },
    product: { findMany: productFindMany },
    stockMovement: { findMany: stockMovementFindMany },
    user: { findMany: userFindMany },
    promoRedemption: { findMany: promoRedemptionFindMany },
    subscription: { findMany: subscriptionFindMany },
    checkIn: { findMany: checkInFindMany },
    invoice: { findMany: invoiceFindMany },
    location: { findMany: locationFindMany },
    classInstance: { findMany: classInstanceFindMany },
    ptSession: { findMany: ptSessionFindMany },
    serviceSession: { findMany: serviceSessionFindMany },
    creditPack: { findMany: creditPackFindMany },
    shiftSlot: { findMany: shiftSlotFindMany },
    auditLog: { findMany: auditLogFindMany },
    trainer: { findMany: trainerFindMany },
    gym: { findFirst: gymFindFirst },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  // `CheckIn` is not in the tenant extension's model set, so the check-in log pins
  // the gym itself — the stub has to carry one.
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
    productFindMany,
    stockMovementFindMany,
    userFindMany,
    promoRedemptionFindMany,
    subscriptionFindMany,
    checkInFindMany,
    invoiceFindMany,
    locationFindMany,
    classInstanceFindMany,
    ptSessionFindMany,
    serviceSessionFindMany,
    creditPackFindMany,
    shiftSlotFindMany,
    auditLogFindMany,
    trainerFindMany,
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
    it('offers every OFFERED report by default, and no retired one', async () => {
      const { service } = setup();

      const catalog = await service.catalog();

      expect(catalog.reports.map((r) => r.key)).toEqual([...OFFERED_REPORT_KEYS]);
      expect(catalog.reports.some((r) => r.key === 'sales-summary')).toBe(false);
    });

    it('omits a report the gym switched off', async () => {
      const { service } = setup();
      gymRow!.settings = { reports: { 'refunds-detail': false } };

      const catalog = await service.catalog();

      expect(catalog.reports.some((r) => r.key === 'refunds-detail')).toBe(false);
      expect(catalog.reports.some((r) => r.key === 'sales-transactions')).toBe(true);
    });

    it('speaks the asked-for language: report copy and the segment headings', async () => {
      const { service } = setup();
      const catalog = await service.catalog('ka');
      const transactions = catalog.reports.find((r) => r.key === 'sales-transactions');
      expect(transactions?.name).toBe('გაყიდვების ტრანზაქციები');
      expect(transactions?.description).toMatch(/[ა-ჰ]/);
      expect(catalog.segments.sales).toBe('გაყიდვები');
      // English carries the definitions verbatim, and English segment labels.
      const en = await service.catalog();
      expect(en.reports.find((r) => r.key === 'sales-transactions')?.name).toBe(
        'Sales transactions',
      );
      expect(en.segments.classes).toBe('Classes & training');
    });

    it('can list the whole offered catalogue, hidden reports included, for the settings screen', async () => {
      const { service } = setup();
      gymRow!.settings = { reports: { 'refunds-detail': false } };
      const full = await service.catalog('ka', { includeHidden: true });
      expect(full.reports.some((r) => r.key === 'refunds-detail')).toBe(true);
      expect(full.reports).toHaveLength(OFFERED_REPORT_KEYS.length);
      expect(full.reports.find((r) => r.key === 'refunds-detail')?.name).toBe('დაბრუნებები');
    });

    // A retired report is a product decision, not a gym preference: the settings
    // screen must not offer a switch for it, so a gym cannot bring it back.
    it('keeps a retired report out even of the settings listing', async () => {
      const { service } = setup();
      const full = await service.catalog(null, { includeHidden: true });
      expect(full.reports.some((r) => r.key === 'sales-summary')).toBe(false);
    });

    it('returns an empty catalogue when every report is off, rather than throwing', async () => {
      const { service } = setup();
      gymRow!.settings = {
        reports: Object.fromEntries(REPORT_KEYS.map((key) => [key, false])),
      };

      await expect(service.catalog()).resolves.toMatchObject({ reports: [] });
    });

    it('falls back to the full catalogue when the gym row is missing', async () => {
      gymRow = null;
      const { service } = setup();

      const catalog = await service.catalog();

      expect(catalog.reports).toHaveLength(OFFERED_REPORT_KEYS.length);
    });

    // The boundary this whole feature rests on. "Hidden" is not "forbidden": a
    // future contributor's natural instinct is to make these routes 403 on a
    // disabled report, which would break every bookmarked link and scheduled
    // export the moment a gym tidies its hub. This test is what makes that
    // instinct fail loudly for the ON-SCREEN PREVIEW route.
    it('still previews a report the gym has switched off', async () => {
      const { service } = setup();
      gymRow!.settings = { reports: { 'sales-summary': false } };

      await expect(service.runReport('sales-summary', { range: 'mtd' })).resolves.toBeDefined();
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
      for await (const chunk of service.streamReportCsv('sales-summary', { range: 'mtd' })) {
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

      const workbook = await service.buildReportXlsx('sales-summary', { range: 'mtd' });

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

  describe('reporting zone', () => {
    // 00:30Z on the 31st is 04:30 in Tbilisi. The payment at 21:00Z the evening
    // before is 01:00 on the 31st there — TODAY for the gym, yesterday in UTC.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T00:30:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it("windows and buckets `today` in the gym's own zone", async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        { amount: 10_000, createdAt: new Date('2026-08-30T21:00:00.000Z') },
      ]);

      const result = await service.runReport('sales-summary', { range: 'today' });

      expect(result.range).toBe('today');
      expect(result.rows).toEqual([
        { period: '2026-08-31', orders: 1, gross: 10_000, refunded: 0, net: 10_000 },
      ]);
      const { where } = paymentFindMany.mock.calls[0]?.[0] as {
        where: { createdAt: { gte: Date; lt: Date } };
      };
      expect(where.createdAt.gte.toISOString()).toBe('2026-08-30T20:00:00.000Z');
      expect(where.createdAt.lt.toISOString()).toBe('2026-08-31T00:30:00.000Z');
    });

    it('a custom range covers its days inclusively and echoes them back', async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        // 23:30Z on the 3rd is 03:30 on the 4th in Tbilisi: outside the window.
        { amount: 5_000, createdAt: new Date('2026-08-03T23:30:00.000Z') },
        { amount: 7_000, createdAt: new Date('2026-08-02T10:00:00.000Z') },
      ]);

      const result = await service.runReport('sales-summary', {
        range: 'custom',
        from: '2026-08-01',
        to: '2026-08-03',
      });

      expect(result).toMatchObject({ range: 'custom', from: '2026-08-01', to: '2026-08-03' });
      expect(result.rows.map((row) => [row.period, row.gross])).toEqual([
        ['2026-08-01', 0],
        ['2026-08-02', 7_000],
        ['2026-08-03', 0],
      ]);
    });

    it('echoes the days a preset resolved to, so the screen can show the window it got', async () => {
      const { service } = setup();
      const result = await service.runReport('sales-summary', { range: '7d' });
      expect(result).toMatchObject({ range: '7d', from: '2026-08-24', to: '2026-08-31' });
    });

    it('computes a digest section over a window preset the console no longer offers', async () => {
      const { service, paymentFindMany } = setup();
      const section = await service.runDigestSection('sales-summary', '30d');
      expect(section.key).toBe('sales-summary');
      // 30 days back from 04:30 on the 31st (Tbilisi) opens on 1 August, so the
      // dense series has 31 calendar days in it.
      expect(section.rows).toHaveLength(31);
      expect('range' in section).toBe(false);
      const { where } = paymentFindMany.mock.calls[0]?.[0] as {
        where: { createdAt: { gte: Date } };
      };
      expect(where.createdAt.gte.toISOString()).toBe('2026-08-01T00:30:00.000Z');
    });
  });

  describe('language', () => {
    it('answers in Georgian when asked: report name, column labels and the values it writes itself', async () => {
      const { service, orderFindMany } = setup();
      orderFindMany.mockResolvedValue([
        {
          soldById: null,
          soldBy: null,
          payment: { amount: 5_000, refundedAmount: 0 },
        },
      ]);

      const result = await service.runReport('sales-by-staff', { range: 'mtd' }, 'ka');

      expect(result.name).toBe('გაყიდვები თანამშრომლების მიხედვით');
      expect(result.columns.map((c) => c.key)).toEqual(['staff', 'role', 'orders', 'gross', 'net']);
      expect(result.columns.map((c) => c.label)).toEqual([
        'თანამშრომელი',
        'როლი',
        'გაყიდვები',
        'მთლიანი',
        'წმინდა',
      ]);
      expect(result.rows[0]?.staff).toBe('მიუკუთვნებელი');
    });

    it('defaults to English when no language is asked for', async () => {
      const { service } = setup();
      const result = await service.runReport('sales-by-staff', { range: 'mtd' });
      expect(result.name).toBe('Sales by staff member');
    });

    it('exports the CSV header in the asked-for language too', async () => {
      const { service } = setup();
      const chunks: string[] = [];
      for await (const chunk of service.streamReportCsv('sales-summary', { range: 'mtd' }, 'ka')) {
        chunks.push(chunk);
      }
      expect(chunks[0]).toBe('პერიოდი,შეკვეთები,მთლიანი,დაბრუნებული,წმინდა\r\n');
    });
  });

  describe('sales-transactions', () => {
    /** A till sale of a categorised product and a walk-in, and an online plan purchase. */
    function twoOrders() {
      return [
        {
          id: 'cmxxxxxxxxabcd1234',
          createdAt: new Date('2026-08-08T14:05:00.000Z'),
          total: 12_500,
          status: 'PAID',
          customerName: null,
          packageId: null,
          member: null,
          location: { name: 'Vake' },
          items: [
            { label: 'Whey Protein 1kg', productVariantId: 'prod-1:base', serviceId: null },
            { label: 'Promo SUMMER25', productVariantId: null, serviceId: null },
          ],
          payment: { method: 'CARD', provider: 'pos', refundedAmount: 0 },
          soldBy: { firstName: 'Mariam', lastName: 'Beridze', user: null },
        },
        {
          id: 'cmyyyyyyyywxyz9876',
          createdAt: new Date('2026-08-09T08:00:00.000Z'),
          total: 90_000,
          status: 'PAID',
          customerName: null,
          packageId: 'plan-1',
          member: { firstName: 'Giorgi', lastName: 'Kapanadze', user: null },
          location: null,
          items: [{ label: 'Monthly membership', productVariantId: null, serviceId: null }],
          payment: { method: 'CARD', provider: 'stub', refundedAmount: 30_000 },
          soldBy: null,
        },
      ];
    }

    it('lists one row per transaction with who, what, how much, how paid, where and by whom', async () => {
      const { service, orderFindMany, productFindMany } = setup();
      orderFindMany.mockResolvedValue(twoOrders());
      productFindMany.mockResolvedValue([{ id: 'prod-1', category: { name: 'Supplements' } }]);

      const result = await service.runReport('sales-transactions', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-08',
          time: '18:05',
          reference: 'ABCD1234',
          customer: 'Walk-in',
          items: 'Whey Protein 1kg, Promo SUMMER25',
          category: 'Supplements',
          amount: 12_500,
          method: 'Card',
          channel: 'Point of sale',
          location: 'Vake',
          staff: 'Mariam Beridze',
          status: 'Paid',
        },
        {
          date: '2026-08-09',
          time: '12:00',
          reference: 'WXYZ9876',
          customer: 'Giorgi Kapanadze',
          items: 'Monthly membership',
          category: 'Membership plan',
          amount: 90_000,
          method: 'Card',
          channel: 'Online',
          location: '',
          staff: 'Unattributed',
          status: 'Partially refunded',
        },
      ]);
      // Only the product lines are looked up, by the product half of their variant ref.
      expect(productFindMany.mock.calls[0]?.[0]).toMatchObject({
        where: { id: { in: ['prod-1'] } },
      });
    });

    it('speaks Georgian for everything it writes itself', async () => {
      const { service, orderFindMany } = setup();
      orderFindMany.mockResolvedValue(twoOrders());

      const result = await service.runReport('sales-transactions', { range: 'mtd' }, 'ka');

      expect(result.rows[0]).toMatchObject({
        customer: 'სტუმარი',
        category: 'კატეგორიის გარეშე',
        channel: 'სალარო',
        status: 'გადახდილი',
      });
      expect(result.rows[1]).toMatchObject({
        category: 'წევრობის გეგმა',
        channel: 'ონლაინ',
        staff: 'მიუკუთვნებელი',
        status: 'ნაწილობრივ დაბრუნებული',
      });
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

      const result = await service.runReport('sales-by-staff', { range: 'mtd' });

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

      const result = await service.runReport('sales-by-staff', { range: 'mtd' });

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
          order: {
            customerName: null,
            member: { firstName: 'Nino', lastName: 'Gelashvili', user: null },
            location: { name: 'Vake' },
            items: [{ label: 'Gym Towel ×2' }],
          },
        },
      ]);

      const result = await service.runReport('refunds-detail', { range: 'mtd' });

      expect(result.rows[0]).toEqual({
        date: '2026-08-07',
        time: '14:30',
        customer: 'Nino Gelashvili',
        order: '12345678',
        items: 'Gym Towel ×2',
        amount: 4_500,
        reason: 'Wrong size, one returned',
        processedBy: 'Mariam Beridze',
        location: 'Vake',
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
          order: { customerName: null, member: null, location: null, items: [] },
        },
      ]);

      const result = await service.runReport('refunds-detail', {
        range: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(result.rows[0]!.processedBy).toBe('Unattributed');
    });
  });

  describe('plan-performance', () => {
    it("ranks plans, services and products by revenue, per location, with each one's share", async () => {
      const { service, orderFindMany, productFindMany } = setup();
      orderFindMany.mockResolvedValue([
        // A monthly plan bought online: no lines, the order total is the plan.
        {
          total: 90_000,
          packageId: 'plan-1',
          package: { id: 'plan-1', name: 'Monthly', billingInterval: 'MONTH', sessionCount: null },
          location: null,
          items: [],
        },
        // A mixed till basket at Vake: a 10-session PT pack plus a shaker, promo line ignored.
        {
          total: 60_500,
          packageId: 'pack-1',
          package: { id: 'pack-1', name: 'PT 10', billingInterval: 'ONE_TIME', sessionCount: 10 },
          location: { name: 'Vake' },
          items: [
            { label: 'PT 10', amount: 50_000, qty: 1, productVariantId: null, serviceId: null },
            {
              label: 'Shaker ×2',
              amount: 3_000,
              qty: 2,
              productVariantId: 'prod-1:base',
              serviceId: null,
            },
            { label: 'Promo X', amount: -500, qty: 1, productVariantId: null, serviceId: null },
          ],
        },
        // A single PT session at Vake, sold as a service.
        {
          total: 8_000,
          packageId: null,
          package: null,
          location: { name: 'Vake' },
          items: [
            {
              label: 'PT session',
              amount: 8_000,
              qty: 1,
              productVariantId: null,
              serviceId: 'svc-1',
              service: { id: 'svc-1', name: 'PT session', type: 'PERSONAL_TRAINING' },
            },
          ],
        },
      ]);
      productFindMany.mockResolvedValue([
        { id: 'prod-1', name: 'Shaker', category: { name: 'Accessories' } },
      ]);

      const result = await service.runReport('plan-performance', { range: 'mtd' });

      // 90_000 + 50_000 + 3_000 + 8_000 = 151_000 in all.
      expect(result.rows).toEqual([
        {
          item: 'Monthly',
          category: 'Membership',
          sold: 1,
          revenue: 90_000,
          share: 59.6,
          location: '',
        },
        {
          item: 'PT 10',
          category: 'Session pack',
          sold: 1,
          revenue: 50_000,
          share: 33.1,
          location: 'Vake',
        },
        {
          item: 'PT session',
          category: 'Personal training',
          sold: 1,
          revenue: 8_000,
          share: 5.3,
          location: 'Vake',
        },
        {
          item: 'Shaker',
          category: 'Accessories',
          sold: 2,
          revenue: 3_000,
          share: 2,
          location: 'Vake',
        },
      ]);
    });
  });

  describe('daily-reconciliation', () => {
    // 00:30Z on the 31st is 04:30 in Tbilisi; the window is the gym's month so far.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-03T00:30:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('totals each day by how the money was collected, with the refunds and the receipts behind it', async () => {
      const { service, paymentFindMany, refundFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        {
          amount: 10_000,
          createdAt: new Date('2026-08-01T08:00:00.000Z'),
          method: 'CASH',
          provider: 'pos',
          orderId: 'cmaaaaaaaa00000001',
        },
        {
          amount: 20_000,
          createdAt: new Date('2026-08-01T09:00:00.000Z'),
          method: 'CARD',
          provider: 'pos',
          orderId: 'cmaaaaaaaa00000002',
        },
        {
          amount: 5_000,
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          method: 'MEMBER_ACCOUNT',
          provider: 'pos',
          orderId: 'cmaaaaaaaa00000003',
        },
        // 21:00Z on the 1st is already the 2nd in Tbilisi.
        {
          amount: 90_000,
          createdAt: new Date('2026-08-01T21:00:00.000Z'),
          method: 'CARD',
          provider: 'stub',
          orderId: 'cmaaaaaaaa00000004',
        },
        {
          amount: 40_000,
          createdAt: new Date('2026-08-02T06:00:00.000Z'),
          method: 'BANK_TRANSFER',
          provider: 'pos',
          orderId: 'cmaaaaaaaa00000005',
        },
      ]);
      refundFindMany.mockResolvedValue([
        { amount: 2_000, createdAt: new Date('2026-08-02T10:00:00.000Z') },
      ]);

      const result = await service.runReport('daily-reconciliation', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-01',
          total: 35_000,
          cash: 10_000,
          card: 20_000,
          online: 0,
          bankTransfer: 0,
          other: 5_000,
          refunds: 0,
          transactions: 3,
          references: '00000001, 00000002, 00000003',
        },
        {
          date: '2026-08-02',
          total: 130_000,
          cash: 0,
          card: 0,
          online: 90_000,
          bankTransfer: 40_000,
          other: 0,
          refunds: 2_000,
          transactions: 2,
          references: '00000004, 00000005',
        },
        {
          date: '2026-08-03',
          total: 0,
          cash: 0,
          card: 0,
          online: 0,
          bankTransfer: 0,
          other: 0,
          refunds: 0,
          transactions: 0,
          references: '',
        },
      ]);
    });
  });

  describe('member reports', () => {
    // The clock is 10:00Z on 31 August; the window is the gym's month so far.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    const user = (name: string, email: string) => ({ name, email, phone: '+995 555 000' });
    const sub = (overrides: Record<string, unknown>) => ({
      status: 'ACTIVE',
      priceAmount: 9_000,
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      plan: { name: 'Monthly' },
      ...overrides,
    });

    it('membership report: one row per member with the status the front desk uses, visits in the window and value', async () => {
      const { service, gymMemberFindMany } = setup();
      gymMemberFindMany.mockResolvedValue([
        {
          firstName: 'Nino',
          lastName: 'Gelashvili',
          user: user('Nino', 'nino@example.com'),
          joinedAt: new Date('2026-08-20T09:00:00.000Z'),
          startDate: null,
          subscriptions: [
            sub({
              createdAt: new Date('2026-08-20T09:00:00.000Z'),
              currentPeriodEnd: new Date('2026-09-20T00:00:00.000Z'),
            }),
          ],
          checkIns: [{ checkedInAt: new Date('2026-08-30T18:00:00.000Z') }],
          _count: { checkIns: 4 },
        },
        {
          firstName: 'Giorgi',
          lastName: 'Kapanadze',
          user: user('Giorgi', 'giorgi@example.com'),
          joinedAt: new Date('2025-01-10T09:00:00.000Z'),
          startDate: new Date('2025-01-15T00:00:00.000Z'),
          subscriptions: [
            sub({ status: 'FROZEN', frozenUntil: new Date('2026-09-10T00:00:00.000Z') }),
          ],
          checkIns: [],
          _count: { checkIns: 0 },
        },
        {
          firstName: 'Lika',
          lastName: 'Beridze',
          user: user('Lika', 'lika@example.com'),
          joinedAt: new Date('2025-06-01T09:00:00.000Z'),
          startDate: null,
          subscriptions: [
            sub({
              status: 'CANCELED',
              canceledAt: new Date('2026-08-25T00:00:00.000Z'),
              currentPeriodEnd: new Date('2026-08-25T00:00:00.000Z'),
            }),
          ],
          checkIns: [{ checkedInAt: new Date('2026-08-01T18:00:00.000Z') }],
          _count: { checkIns: 1 },
        },
      ]);

      const result = await service.runReport('member-roster', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          member: 'Nino Gelashvili',
          phone: '+995 555 000',
          email: 'nino@example.com',
          status: 'New',
          plan: 'Monthly',
          joined: '2026-08-20',
          startDate: '2026-08-20',
          expiresOn: '2026-09-20',
          lastVisit: '2026-08-30',
          visits: 4,
          value: 9_000,
          nextRenewal: '2026-09-20',
        },
        {
          member: 'Giorgi Kapanadze',
          phone: '+995 555 000',
          email: 'giorgi@example.com',
          status: 'Frozen',
          plan: 'Monthly',
          joined: '2025-01-10',
          startDate: '2025-01-15',
          expiresOn: '2026-09-01',
          lastVisit: null,
          visits: 0,
          value: 9_000,
          nextRenewal: null,
        },
        {
          member: 'Lika Beridze',
          phone: '+995 555 000',
          email: 'lika@example.com',
          status: 'Cancelled',
          plan: 'Monthly',
          joined: '2025-06-01',
          startDate: '2026-05-01',
          expiresOn: '2026-08-25',
          lastVisit: '2026-08-01',
          visits: 1,
          value: 9_000,
          nextRenewal: null,
        },
      ]);
      // The visit count is a filtered relation count over the window, not a second query.
      const args = gymMemberFindMany.mock.calls[0]?.[0] as {
        select: {
          _count: { select: { checkIns: { where: { checkedInAt: { gte: Date; lt: Date } } } } };
        };
      };
      expect(args.select._count.select.checkIns.where.checkedInAt.gte).toBeInstanceOf(Date);
    });

    it('membership report: renewal due and expiring read off the period end and whether it renews', async () => {
      const { service, gymMemberFindMany } = setup();
      const base = {
        firstName: 'A',
        lastName: 'B',
        user: user('A', 'a@example.com'),
        joinedAt: new Date('2025-01-01T00:00:00.000Z'),
        startDate: null,
        checkIns: [],
        _count: { checkIns: 0 },
      };
      gymMemberFindMany.mockResolvedValue([
        // Renews in 10 days: renewal due.
        {
          ...base,
          subscriptions: [sub({ currentPeriodEnd: new Date('2026-09-10T00:00:00.000Z') })],
        },
        // Ends in 10 days and will not renew: expiring.
        {
          ...base,
          subscriptions: [
            sub({
              currentPeriodEnd: new Date('2026-09-10T00:00:00.000Z'),
              cancelAtPeriodEnd: true,
            }),
          ],
        },
        // Payment failed: renewal due, whatever the date.
        { ...base, subscriptions: [sub({ status: 'PAST_DUE' })] },
        // Ran out: expired.
        {
          ...base,
          subscriptions: [
            sub({ status: 'EXPIRED', currentPeriodEnd: new Date('2026-08-10T00:00:00.000Z') }),
          ],
        },
        // Nothing at all.
        { ...base, subscriptions: [] },
      ]);

      const result = await service.runReport('member-roster', { range: 'mtd' });

      expect(result.rows.map((row) => [row.status, row.nextRenewal])).toEqual([
        ['Renewal due', '2026-09-10'],
        ['Expiring', null],
        ['Renewal due', '2026-09-01'],
        ['Expired', null],
        ['No membership', null],
      ]);
      expect(result.rows[4]).toMatchObject({ plan: 'No plan', value: null, expiresOn: null });
    });

    it('check-in report: names the method in words', async () => {
      const { service, checkInFindMany, locationFindMany } = setup();
      checkInFindMany.mockResolvedValue([
        {
          checkedInAt: new Date('2026-08-30T05:00:00.000Z'),
          method: 'QR',
          locationId: 'loc-1',
          member: { firstName: 'Nino', lastName: 'Gelashvili', user: null },
        },
      ]);
      locationFindMany.mockResolvedValue([{ id: 'loc-1', name: 'Vake' }]);

      const result = await service.runReport('member-check-in-log', { range: 'mtd' });
      expect(result.rows[0]).toEqual({
        date: '2026-08-30',
        time: '09:00',
        member: 'Nino Gelashvili',
        method: 'QR code',
        location: 'Vake',
      });
      const ka = await service.runReport('member-check-in-log', { range: 'mtd' }, 'ka');
      expect(ka.rows[0]?.method).toBe('QR კოდი');
    });

    it('retention & engagement: files each member under the one group that needs attention first', async () => {
      const { service, gymMemberFindMany } = setup();
      const base = {
        firstName: 'A',
        lastName: 'B',
        user: user('A', 'a@example.com'),
        joinedAt: new Date('2025-01-01T00:00:00.000Z'),
        startDate: null,
        checkIns: [{ checkedInAt: new Date('2026-08-30T18:00:00.000Z') }],
        _count: { checkIns: 3 },
      };
      const at = (d: string) => new Date(`${d}T00:00:00.000Z`);
      gymMemberFindMany.mockResolvedValue([
        {
          ...base,
          firstName: 'Renew',
          subscriptions: [sub({ currentPeriodEnd: at('2026-09-05') })],
        },
        {
          ...base,
          firstName: 'Expiring',
          subscriptions: [sub({ currentPeriodEnd: at('2026-09-20'), cancelAtPeriodEnd: true })],
        },
        {
          ...base,
          firstName: 'Lapsed',
          subscriptions: [
            sub({
              status: 'EXPIRED',
              currentPeriodEnd: at('2026-08-15'),
              updatedAt: at('2026-08-15'),
            }),
          ],
        },
        {
          ...base,
          firstName: 'Cancelled',
          subscriptions: [
            sub({
              status: 'CANCELED',
              canceledAt: at('2026-08-20'),
              currentPeriodEnd: at('2026-08-20'),
            }),
          ],
        },
        {
          ...base,
          firstName: 'Back',
          subscriptions: [
            sub({ createdAt: at('2026-08-25'), currentPeriodEnd: at('2026-09-25') }),
            sub({ status: 'CANCELED', canceledAt: at('2026-03-01'), createdAt: at('2025-01-01') }),
          ],
        },
        {
          ...base,
          firstName: 'Absent',
          subscriptions: [sub({ currentPeriodEnd: at('2026-10-30') })],
          checkIns: [{ checkedInAt: at('2026-07-20') }],
          _count: { checkIns: 0 },
        },
        // Fine: renews in two months, came in yesterday, no group.
        {
          ...base,
          firstName: 'Fine',
          subscriptions: [sub({ currentPeriodEnd: at('2026-10-30') })],
        },
        // Cancelled long ago: not "recent", no group.
        {
          ...base,
          firstName: 'Old',
          subscriptions: [
            sub({
              status: 'CANCELED',
              canceledAt: at('2026-01-20'),
              currentPeriodEnd: at('2026-01-20'),
            }),
          ],
        },
      ]);

      const result = await service.runReport('members-at-risk', { range: 'mtd' });

      expect(result.rows.map((row) => [row.member, row.group, row.renewal])).toEqual([
        ['Renew B', 'Renewal due', '2026-09-05'],
        ['Expiring B', 'Expiring soon', 'Expiring'],
        ['Lapsed B', 'Recently expired, not renewed', 'Expired'],
        ['Cancelled B', 'Recently cancelled', 'Cancelled'],
        ['Back B', 'Reactivated', '2026-09-25'],
        ['Absent B', 'No visit for 21 days', '2026-10-30'],
      ]);
      expect(result.rows[5]).toMatchObject({
        lastVisit: '2026-07-20',
        daysSince: 42,
        value: 9_000,
      });
    });
  });

  describe('revenue reports', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    const member = (first: string) => ({ firstName: first, lastName: 'B', user: null });

    it("invoices & payments: every invoice with its status in the desk's words, what was paid and how", async () => {
      const { service, invoiceFindMany } = setup();
      invoiceFindMany.mockResolvedValue([
        // A till sale, paid by card at Vake.
        {
          number: 'INV-2026-0001',
          issuedAt: new Date('2026-08-10T09:00:00.000Z'),
          dueDate: null,
          amount: 5_000,
          status: 'PAID',
          type: 'PRODUCT',
          description: '',
          member: member('Nino'),
          subscription: null,
          order: {
            items: [{ label: 'Shaker' }],
            location: { name: 'Vake' },
            payment: {
              method: 'CARD',
              provider: 'pos',
              createdAt: new Date('2026-08-10T09:01:00.000Z'),
            },
          },
        },
        // A membership renewal that failed and is past its date.
        {
          number: 'INV-2026-0002',
          issuedAt: new Date('2026-08-20T00:00:00.000Z'),
          dueDate: new Date('2026-08-25T00:00:00.000Z'),
          amount: 9_000,
          status: 'FAILED',
          type: 'MEMBERSHIP',
          description: '',
          member: member('Giorgi'),
          subscription: { plan: { name: 'Monthly' } },
          order: null,
        },
        // A renewal not yet due.
        {
          number: 'INV-2026-0003',
          issuedAt: new Date('2026-08-28T00:00:00.000Z'),
          dueDate: new Date('2026-09-05T00:00:00.000Z'),
          amount: 9_000,
          status: 'PENDING',
          type: 'MEMBERSHIP',
          description: '',
          member: member('Lika'),
          subscription: { plan: { name: 'Monthly' } },
          order: null,
        },
        // Pending with no date at all.
        {
          number: 'INV-2026-0004',
          issuedAt: new Date('2026-08-29T00:00:00.000Z'),
          dueDate: null,
          amount: 2_000,
          status: 'PENDING',
          type: 'OTHER',
          description: 'Locker key',
          member: null,
          subscription: null,
          order: null,
        },
      ]);

      const result = await service.runReport('outstanding-invoices', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          invoice: 'INV-2026-0001',
          member: 'Nino B',
          item: 'Shaker',
          issuedAt: '2026-08-10',
          dueDate: null,
          amount: 5_000,
          paid: 5_000,
          outstanding: 0,
          status: 'Paid',
          method: 'Card',
          paidAt: '2026-08-10',
          location: 'Vake',
        },
        {
          invoice: 'INV-2026-0002',
          member: 'Giorgi B',
          item: 'Monthly',
          issuedAt: '2026-08-20',
          dueDate: '2026-08-25',
          amount: 9_000,
          paid: 0,
          outstanding: 9_000,
          status: 'Overdue',
          method: 'Online',
          paidAt: null,
          location: '',
        },
        {
          invoice: 'INV-2026-0003',
          member: 'Lika B',
          item: 'Monthly',
          issuedAt: '2026-08-28',
          dueDate: '2026-09-05',
          amount: 9_000,
          paid: 0,
          outstanding: 9_000,
          status: 'Upcoming',
          method: 'Online',
          paidAt: null,
          location: '',
        },
        {
          invoice: 'INV-2026-0004',
          member: 'Unknown',
          item: 'Locker key',
          issuedAt: '2026-08-29',
          dueDate: null,
          amount: 2_000,
          paid: 0,
          outstanding: 2_000,
          status: 'Unpaid',
          method: '',
          paidAt: null,
          location: '',
        },
      ]);
      // Issued in the window, OR still owed whenever it was issued - an obligation
      // does not stop being one because the month rolled over.
      expect(invoiceFindMany.mock.calls[0]?.[0]).toMatchObject({
        where: { OR: [{ issuedAt: {} }, { status: { in: ['PENDING', 'FAILED'] } }] },
      });
    });

    it('recurring & projected: each live subscription with its monthly value and what it will charge in the window ahead', async () => {
      const { service, subscriptionFindMany } = setup();
      const at = (d: string) => new Date(`${d}T00:00:00.000Z`);
      subscriptionFindMany.mockResolvedValue([
        // Monthly, renews on the 5th and again on 5 Oct - both inside the ~31 days ahead? Only the 5th.
        {
          status: 'ACTIVE',
          priceAmount: 9_000,
          interval: 'MONTH',
          currentPeriodEnd: at('2026-09-05'),
          cancelAtPeriodEnd: false,
          plan: { name: 'Monthly' },
          member: member('Nino'),
        },
        // Yearly: 1/12 a month, next charge far off, nothing expected in the window.
        {
          status: 'ACTIVE',
          priceAmount: 96_000,
          interval: 'YEAR',
          currentPeriodEnd: at('2027-03-01'),
          cancelAtPeriodEnd: false,
          plan: { name: 'Yearly' },
          member: member('Giorgi'),
        },
        // Cancelling at period end: still recurring today, nothing expected, no next charge.
        {
          status: 'ACTIVE',
          priceAmount: 9_000,
          interval: 'MONTH',
          currentPeriodEnd: at('2026-09-10'),
          cancelAtPeriodEnd: true,
          plan: { name: 'Monthly' },
          member: member('Lika'),
        },
        // Payment failed: renewal due, the charge still expected.
        {
          status: 'PAST_DUE',
          priceAmount: 9_000,
          interval: 'MONTH',
          currentPeriodEnd: at('2026-09-02'),
          cancelAtPeriodEnd: false,
          plan: { name: 'Monthly' },
          member: member('Dato'),
        },
      ]);

      // The month so far is 31 days, so the window ahead runs to 1 October.
      const result = await service.runReport('projected-revenue', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          member: 'Dato B',
          plan: 'Monthly',
          recurring: 9_000,
          interval: 'Monthly',
          monthly: 9_000,
          nextCharge: '2026-09-02',
          expected: 9_000,
          status: 'Renewal due',
        },
        {
          member: 'Nino B',
          plan: 'Monthly',
          recurring: 9_000,
          interval: 'Monthly',
          monthly: 9_000,
          nextCharge: '2026-09-05',
          expected: 9_000,
          status: 'Active',
        },
        {
          member: 'Giorgi B',
          plan: 'Yearly',
          recurring: 96_000,
          interval: 'Yearly',
          monthly: 8_000,
          nextCharge: '2027-03-01',
          expected: 0,
          status: 'Active',
        },
        {
          member: 'Lika B',
          plan: 'Monthly',
          recurring: 9_000,
          interval: 'Monthly',
          monthly: 9_000,
          nextCharge: null,
          expected: 0,
          status: 'Expiring',
        },
      ]);
    });

    it('revenue by payment method: net of refunds, with a share per method and branch', async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        {
          amount: 10_000,
          refundedAmount: 0,
          method: 'CASH',
          provider: 'pos',
          order: { location: { name: 'Vake' } },
        },
        {
          amount: 20_000,
          refundedAmount: 5_000,
          method: 'CARD',
          provider: 'pos',
          order: { location: { name: 'Vake' } },
        },
        {
          amount: 30_000,
          refundedAmount: 0,
          method: 'CARD',
          provider: 'stub',
          order: { location: null },
        },
        {
          amount: 40_000,
          refundedAmount: 0,
          method: 'BANK_TRANSFER',
          provider: 'pos',
          order: { location: { name: 'Saburtalo' } },
        },
        {
          amount: 5_000,
          refundedAmount: 0,
          method: 'MEMBER_ACCOUNT',
          provider: 'pos',
          order: { location: { name: 'Vake' } },
        },
      ]);

      const result = await service.runReport('revenue-by-payment-method', { range: 'mtd' });

      // 10 + 15 + 30 + 40 + 5 = 100_000 net.
      expect(result.rows).toEqual([
        { method: 'Bank transfer', payments: 1, revenue: 40_000, share: 40, location: 'Saburtalo' },
        { method: 'Online', payments: 1, revenue: 30_000, share: 30, location: '' },
        { method: 'Card / POS', payments: 1, revenue: 15_000, share: 15, location: 'Vake' },
        { method: 'Cash', payments: 1, revenue: 10_000, share: 10, location: 'Vake' },
        { method: 'Other', payments: 1, revenue: 5_000, share: 5, location: 'Vake' },
      ]);
    });
  });

  describe('product reports', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    /** A shaker in two sizes at 15 / 12 cost, and a towel with no cost recorded. */
    const products = [
      {
        id: 'prod-1',
        name: 'Shaker',
        costAmount: 1_000,
        priceAmount: 1_500,
        stock: null,
        lowStockThreshold: 5,
        category: { name: 'Accessories' },
        variants: [
          { name: '500ml', sku: 'SHK-500', priceAmount: 1_500, stock: 3 },
          { name: '750ml', sku: 'SHK-750', priceAmount: null, stock: 0 },
        ],
      },
      {
        id: 'prod-2',
        name: 'Towel',
        costAmount: null,
        priceAmount: 2_000,
        stock: 12,
        lowStockThreshold: null,
        category: null,
        variants: [],
      },
    ];
    const staff = { firstName: 'Mariam', lastName: 'Beridze', user: null };
    const orders = [
      // Till: two 500ml shakers and a towel, card, Vake.
      {
        id: 'cmxxxxxxxxabcd1234',
        createdAt: new Date('2026-08-08T14:05:00.000Z'),
        customerName: null,
        member: { firstName: 'Nino', lastName: 'Gelashvili', user: null },
        location: { name: 'Vake' },
        soldBy: staff,
        payment: { method: 'CARD', provider: 'pos' },
        items: [
          {
            label: 'Shaker 500ml ×2',
            amount: 3_000,
            qty: 2,
            productVariantId: 'prod-1:0',
            serviceId: null,
          },
          {
            label: 'Towel',
            amount: 2_000,
            qty: 1,
            productVariantId: 'prod-2:base',
            serviceId: null,
          },
          { label: 'Promo X', amount: -500, qty: 1, productVariantId: null, serviceId: null },
        ],
      },
      // Online: one 500ml shaker, no branch, nobody sold it.
      {
        id: 'cmyyyyyyyywxyz9876',
        createdAt: new Date('2026-08-09T08:00:00.000Z'),
        customerName: 'Walk-in Dato',
        member: null,
        location: null,
        soldBy: null,
        payment: { method: 'CARD', provider: 'stub' },
        items: [
          {
            label: 'Shaker 500ml',
            amount: 1_500,
            qty: 1,
            productVariantId: 'prod-1:0',
            serviceId: null,
          },
        ],
      },
    ];

    it('product sales: per product, variant and branch, with cost, margin, average price and the channel split', async () => {
      const { service, orderFindMany, productFindMany } = setup();
      orderFindMany.mockResolvedValue(orders);
      productFindMany.mockResolvedValue(products);

      const result = await service.runReport('product-sales', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          product: 'Shaker',
          variant: '500ml',
          sku: 'SHK-500',
          category: 'Accessories',
          quantity: 2,
          revenue: 3_000,
          cogs: 2_000,
          margin: 1_000,
          marginPct: 33.3,
          avgPrice: 1_500,
          posSales: 3_000,
          onlineSales: 0,
          transactions: 1,
          location: 'Vake',
        },
        {
          product: 'Towel',
          variant: '',
          sku: '',
          category: 'Uncategorised',
          quantity: 1,
          revenue: 2_000,
          cogs: null,
          margin: null,
          marginPct: null,
          avgPrice: 2_000,
          posSales: 2_000,
          onlineSales: 0,
          transactions: 1,
          location: 'Vake',
        },
        {
          product: 'Shaker',
          variant: '500ml',
          sku: 'SHK-500',
          category: 'Accessories',
          quantity: 1,
          revenue: 1_500,
          cogs: 1_000,
          margin: 500,
          marginPct: 33.3,
          avgPrice: 1_500,
          posSales: 0,
          onlineSales: 1_500,
          transactions: 1,
          location: '',
        },
      ]);
    });

    it('product sales detail: one row per sold line with who, where, how and the margin', async () => {
      const { service, orderFindMany, productFindMany } = setup();
      orderFindMany.mockResolvedValue(orders);
      productFindMany.mockResolvedValue(products);

      const result = await service.runReport('product-sales-detail', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-08',
          time: '18:05',
          product: 'Shaker',
          variant: '500ml',
          quantity: 2,
          customer: 'Nino Gelashvili',
          channel: 'Point of sale',
          price: 3_000,
          cost: 2_000,
          margin: 1_000,
          method: 'Card',
          location: 'Vake',
          staff: 'Mariam Beridze',
          reference: 'ABCD1234',
        },
        {
          date: '2026-08-08',
          time: '18:05',
          product: 'Towel',
          variant: '',
          quantity: 1,
          customer: 'Nino Gelashvili',
          channel: 'Point of sale',
          price: 2_000,
          cost: null,
          margin: null,
          method: 'Card',
          location: 'Vake',
          staff: 'Mariam Beridze',
          reference: 'ABCD1234',
        },
        {
          date: '2026-08-09',
          time: '12:00',
          product: 'Shaker',
          variant: '500ml',
          quantity: 1,
          customer: 'Walk-in Dato',
          channel: 'Online',
          price: 1_500,
          cost: 1_000,
          margin: 500,
          method: 'Card',
          location: '',
          staff: 'Unattributed',
          reference: 'WXYZ9876',
        },
      ]);
    });

    it('stock & inventory: every position with its value and a status against its own threshold', async () => {
      const { service, productFindMany } = setup();
      productFindMany.mockResolvedValue([
        ...products,
        {
          id: 'prod-3',
          name: 'Gift card',
          costAmount: null,
          priceAmount: 5_000,
          stock: null,
          lowStockThreshold: null,
          category: null,
          variants: [],
        },
      ]);

      const result = await service.runReport('stock-inventory', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          product: 'Shaker',
          variant: '500ml',
          sku: 'SHK-500',
          stock: 3,
          unitCost: 1_000,
          stockValue: 3_000,
          threshold: 5,
          status: 'Low stock',
        },
        {
          product: 'Shaker',
          variant: '750ml',
          sku: 'SHK-750',
          stock: 0,
          unitCost: 1_000,
          stockValue: 0,
          threshold: 5,
          status: 'Out of stock',
        },
        {
          product: 'Towel',
          variant: '',
          sku: '',
          stock: 12,
          unitCost: null,
          stockValue: null,
          threshold: null,
          status: 'In stock',
        },
        {
          product: 'Gift card',
          variant: '',
          sku: '',
          stock: null,
          unitCost: null,
          stockValue: null,
          threshold: null,
          status: 'Not tracked',
        },
      ]);
    });

    it('stock movements: every change with its type in words, before and after, value impact, reference and who', async () => {
      const { service, stockMovementFindMany, orderFindMany, userFindMany } = setup();
      const product = {
        id: 'prod-1',
        name: 'Shaker',
        costAmount: 1_000,
        variants: products[0]!.variants,
      };
      stockMovementFindMany.mockResolvedValue([
        {
          createdAt: new Date('2026-08-01T06:00:00.000Z'),
          variantIndex: 0,
          variantLabel: '500ml',
          delta: 10,
          resultingStock: 10,
          reason: 'RECEIVE',
          note: 'Opening count',
          actorId: 'user-1',
          orderId: null,
          product,
        },
        {
          createdAt: new Date('2026-08-08T14:05:00.000Z'),
          variantIndex: 0,
          variantLabel: '500ml',
          delta: -2,
          resultingStock: 8,
          reason: 'SALE',
          note: '',
          actorId: null,
          orderId: 'cmxxxxxxxxabcd1234',
          product,
        },
        {
          createdAt: new Date('2026-08-09T08:00:00.000Z'),
          variantIndex: 0,
          variantLabel: '500ml',
          delta: -1,
          resultingStock: 7,
          reason: 'SALE',
          note: '',
          actorId: null,
          orderId: 'cmyyyyyyyywxyz9876',
          product,
        },
        {
          createdAt: new Date('2026-08-10T09:00:00.000Z'),
          variantIndex: 0,
          variantLabel: '500ml',
          delta: 1,
          resultingStock: 8,
          reason: 'REFUND_RESTOCK',
          note: '',
          actorId: 'user-1',
          orderId: 'cmxxxxxxxxabcd1234',
          product,
        },
        {
          createdAt: new Date('2026-08-11T09:00:00.000Z'),
          variantIndex: 0,
          variantLabel: '500ml',
          delta: -5,
          resultingStock: 3,
          reason: 'WRITE_OFF',
          note: 'Cracked in transit',
          actorId: 'user-2',
          orderId: null,
          product,
        },
      ]);
      orderFindMany.mockResolvedValue([
        { id: 'cmxxxxxxxxabcd1234', payment: { provider: 'pos' } },
        { id: 'cmyyyyyyyywxyz9876', payment: { provider: 'stub' } },
      ]);
      userFindMany.mockResolvedValue([
        { id: 'user-1', name: 'Mariam Beridze', email: 'm@example.com' },
      ]);

      const result = await service.runReport('stock-movements', { range: 'mtd' });

      expect(
        result.rows.map((r) => [
          r.type,
          r.delta,
          r.before,
          r.after,
          r.valueImpact,
          r.reference,
          r.staff,
          r.note,
        ]),
      ).toEqual([
        ['Initial stock', 10, 0, 10, 10_000, '', 'Mariam Beridze', 'Opening count'],
        ['POS sale', -2, 10, 8, -2_000, 'ABCD1234', '', ''],
        ['Online sale', -1, 8, 7, -1_000, 'WXYZ9876', '', ''],
        ['Customer return', 1, 7, 8, 1_000, 'ABCD1234', 'Mariam Beridze', ''],
        ['Write-off', -5, 8, 3, -5_000, '', 'Unknown', 'Cracked in transit'],
      ]);
      expect(result.rows[0]).toMatchObject({
        date: '2026-08-01',
        time: '10:00',
        product: 'Shaker',
        variant: '500ml',
        sku: 'SHK-500',
      });
    });
  });

  describe('classes & training reports', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    const nino = { id: 'm1', firstName: 'Nino', lastName: 'Gelashvili', user: null };
    const dato = { id: 'm2', firstName: 'Dato', lastName: 'Kapanadze', user: null };
    const lika = { id: 'm3', firstName: 'Lika', lastName: 'Beridze', user: null };

    it('classes & attendance: one row per session with every seat count and utilisation against capacity', async () => {
      const { service, classInstanceFindMany } = setup();
      classInstanceFindMany.mockResolvedValue([
        {
          startsAt: new Date('2026-08-20T05:00:00.000Z'),
          capacityOverride: null,
          status: 'COMPLETED',
          trainer: { name: 'Mia' },
          location: { name: 'Vake' },
          template: { title: 'Yoga', capacity: 10, trainer: null, location: null },
          classType: null,
          bookings: [
            { status: 'ATTENDED' },
            { status: 'ATTENDED' },
            { status: 'NO_SHOW' },
            { status: 'CANCELED' },
            { status: 'WAITLIST' },
            { status: 'BOOKED' },
          ],
        },
        {
          startsAt: new Date('2026-08-21T15:00:00.000Z'),
          capacityOverride: 5,
          status: 'SCHEDULED',
          trainer: null,
          location: null,
          template: {
            title: 'Spin',
            capacity: 12,
            trainer: { name: 'Leo' },
            location: { name: 'Saburtalo' },
          },
          classType: null,
          bookings: [],
        },
      ]);

      const result = await service.runReport('attendance-by-class', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-20',
          time: '09:00',
          class: 'Yoga',
          trainer: 'Mia',
          location: 'Vake',
          capacity: 10,
          booked: 4,
          attended: 2,
          cancelled: 1,
          noShows: 1,
          waitlist: 1,
          utilization: 40,
        },
        {
          date: '2026-08-21',
          time: '19:00',
          class: 'Spin',
          trainer: 'Leo',
          location: 'Saburtalo',
          capacity: 5,
          booked: 0,
          attended: 0,
          cancelled: 0,
          noShows: 0,
          waitlist: 0,
          utilization: 0,
        },
      ]);
    });

    it('class bookings: every booking with its outcome, whether the member checked in around the class, and the waitlist place', async () => {
      const { service, bookingFindMany, checkInFindMany } = setup();
      const yoga = {
        startsAt: new Date('2026-08-20T05:00:00.000Z'),
        endsAt: new Date('2026-08-20T06:00:00.000Z'),
        trainer: { name: 'Mia' },
        location: { name: 'Vake' },
        template: { title: 'Yoga', trainer: null, location: null },
        classType: null,
      };
      bookingFindMany.mockResolvedValue([
        {
          status: 'ATTENDED',
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
          waitlistPosition: null,
          memberId: 'm1',
          member: nino,
          classInstance: yoga,
        },
        {
          status: 'NO_SHOW',
          createdAt: new Date('2026-08-19T10:00:00.000Z'),
          waitlistPosition: null,
          memberId: 'm2',
          member: dato,
          classInstance: yoga,
        },
        {
          status: 'WAITLIST',
          createdAt: new Date('2026-08-19T11:00:00.000Z'),
          waitlistPosition: 2,
          memberId: 'm3',
          member: lika,
          classInstance: yoga,
        },
      ]);
      checkInFindMany.mockResolvedValue([
        // Nino came in 40 minutes before the class; Dato came in the day before.
        { gymMemberId: 'm1', checkedInAt: new Date('2026-08-20T04:20:00.000Z') },
        { gymMemberId: 'm2', checkedInAt: new Date('2026-08-19T04:20:00.000Z') },
      ]);

      const result = await service.runReport('class-cancellations', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-20',
          time: '09:00',
          class: 'Yoga',
          trainer: 'Mia',
          location: 'Vake',
          member: 'Nino Gelashvili',
          bookedAt: '2026-08-18 14:00',
          status: 'Attended',
          checkedIn: 'Yes',
          waitlistPosition: null,
        },
        {
          date: '2026-08-20',
          time: '09:00',
          class: 'Yoga',
          trainer: 'Mia',
          location: 'Vake',
          member: 'Dato Kapanadze',
          bookedAt: '2026-08-19 14:00',
          status: 'No-show',
          checkedIn: 'No',
          waitlistPosition: null,
        },
        {
          date: '2026-08-20',
          time: '09:00',
          class: 'Yoga',
          trainer: 'Mia',
          location: 'Vake',
          member: 'Lika Beridze',
          bookedAt: '2026-08-19 15:00',
          status: 'Waitlisted',
          checkedIn: 'No',
          waitlistPosition: 2,
        },
      ]);
    });

    it("pt sessions: booked personal-training slots with their member and invoice, and the trainer calendar's own sessions", async () => {
      const { service, serviceSessionFindMany, ptSessionFindMany } = setup();
      serviceSessionFindMany.mockResolvedValue([
        {
          startsAt: new Date('2026-08-20T05:00:00.000Z'),
          endsAt: new Date('2026-08-20T06:00:00.000Z'),
          status: 'COMPLETED',
          member: nino,
          staff: { firstName: 'Mariam', lastName: 'Beridze', user: null },
          service: { name: 'PT session' },
          invoice: { amount: 8_000 },
        },
      ]);
      ptSessionFindMany.mockResolvedValue([
        {
          startsAt: new Date('2026-08-22T07:00:00.000Z'),
          endsAt: new Date('2026-08-22T07:45:00.000Z'),
          status: 'SCHEDULED',
          trainer: { name: 'Mia' },
        },
      ]);

      const result = await service.runReport('pt-sessions', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-20',
          time: '09:00',
          member: 'Nino Gelashvili',
          trainer: 'Mariam Beridze',
          location: '',
          status: 'Completed',
          duration: 60,
          value: 8_000,
        },
        {
          date: '2026-08-22',
          time: '11:00',
          member: '',
          trainer: 'Mia',
          location: '',
          status: 'Scheduled',
          duration: 45,
          value: null,
        },
      ]);
    });

    it('credit usage: purchased, used and remaining per pack, with the last session it paid for', async () => {
      const { service, creditPackFindMany } = setup();
      creditPackFindMany.mockResolvedValue([
        {
          name: 'PT 10',
          totalCredits: 10,
          remainingCredits: 4,
          expiresAt: new Date('2026-12-31T20:00:00.000Z'),
          status: 'ACTIVE',
          member: nino,
          plan: { name: 'PT 10-pack' },
          bookings: [{ classInstance: { startsAt: new Date('2026-08-28T05:00:00.000Z') } }],
        },
        {
          name: 'Class 5',
          totalCredits: 5,
          remainingCredits: 0,
          expiresAt: null,
          status: 'ACTIVE',
          member: dato,
          plan: null,
          bookings: [],
        },
        {
          name: 'Old pack',
          totalCredits: 5,
          remainingCredits: 2,
          expiresAt: new Date('2026-06-30T20:00:00.000Z'),
          status: 'EXPIRED',
          member: lika,
          plan: null,
          bookings: [],
        },
      ]);

      const result = await service.runReport('credit-usage', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          member: 'Nino Gelashvili',
          package: 'PT 10-pack',
          purchased: 10,
          used: 6,
          remaining: 4,
          expiresOn: '2027-01-01',
          lastSession: '2026-08-28',
          status: 'Active',
        },
        {
          member: 'Dato Kapanadze',
          package: 'Class 5',
          purchased: 5,
          used: 5,
          remaining: 0,
          expiresOn: null,
          lastSession: null,
          status: 'Used up',
        },
        {
          member: 'Lika Beridze',
          package: 'Old pack',
          purchased: 5,
          used: 3,
          remaining: 2,
          expiresOn: '2026-07-01',
          lastSession: null,
          status: 'Expired',
        },
      ]);
    });
  });

  describe('trainers & staff reports', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    const mariam = {
      id: 's1',
      firstName: 'Mariam',
      lastName: 'Beridze',
      user: null,
      role: 'TRAINER',
    };
    const nino = { firstName: 'Nino', lastName: 'Gelashvili', user: null };

    it('trainer sales: packages by who sold them, sessions by who delivers them, with the detail behind', async () => {
      const { service, orderFindMany, serviceSessionFindMany } = setup();
      orderFindMany.mockResolvedValue([
        {
          id: 'o1',
          createdAt: new Date('2026-08-05T09:00:00.000Z'),
          total: 50_000,
          member: nino,
          customerName: null,
          location: { name: 'Vake' },
          soldBy: mariam,
          package: { name: 'PT 10', billingInterval: 'ONE_TIME', sessionCount: 10 },
        },
        // A monthly membership: not a PT package, not counted.
        {
          id: 'o2',
          createdAt: new Date('2026-08-06T09:00:00.000Z'),
          total: 90_000,
          member: nino,
          customerName: null,
          location: { name: 'Vake' },
          soldBy: mariam,
          package: { name: 'Monthly', billingInterval: 'MONTH', sessionCount: null },
        },
      ]);
      serviceSessionFindMany.mockResolvedValue([
        {
          startsAt: new Date('2026-08-20T05:00:00.000Z'),
          endsAt: new Date('2026-08-20T06:00:00.000Z'),
          status: 'COMPLETED',
          member: nino,
          staff: mariam,
          service: { name: 'PT session' },
          invoice: { amount: 8_000 },
        },
      ]);

      const summary = await service.runReport('trainer-sales', { range: 'mtd' });
      expect(summary.rows).toEqual([
        {
          trainer: 'Mariam Beridze',
          packagesSold: 1,
          sessionsSold: 0,
          totalValue: 50_000,
          location: 'Vake',
        },
        {
          trainer: 'Mariam Beridze',
          packagesSold: 0,
          sessionsSold: 1,
          totalValue: 8_000,
          location: '',
        },
      ]);

      const detail = await service.runReport('trainer-sales-detail', { range: 'mtd' });
      expect(detail.rows).toEqual([
        {
          date: '2026-08-05',
          trainer: 'Mariam Beridze',
          member: 'Nino Gelashvili',
          package: 'PT 10',
          sessions: 10,
          amount: 50_000,
          location: 'Vake',
        },
        {
          date: '2026-08-20',
          trainer: 'Mariam Beridze',
          member: 'Nino Gelashvili',
          package: 'PT session',
          sessions: 1,
          amount: 8_000,
          location: '',
        },
      ]);
    });

    it('staff schedule: every weekly shift on every day of the window it falls on', async () => {
      const { service, shiftSlotFindMany } = setup();
      shiftSlotFindMany.mockResolvedValue([
        // Mondays 09:00-17:00 at the front desk; Sundays off.
        {
          dayOfWeek: 0,
          startTime: '09:00',
          endTime: '17:00',
          location: 'Front desk',
          staff: mariam,
        },
      ]);

      const result = await service.runReport('staff-schedule', { range: 'mtd' });

      // August 2026 has five Mondays: 3, 10, 17, 24, 31.
      expect(result.rows.map((r) => r.date)).toEqual([
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
        '2026-08-31',
      ]);
      expect(result.rows[0]).toEqual({
        staff: 'Mariam Beridze',
        role: 'Trainer',
        date: '2026-08-03',
        start: '09:00',
        end: '17:00',
        location: 'Front desk',
      });
    });

    it('audit log: each entry with who, the action in words, the record, and the values before and after', async () => {
      const { service, auditLogFindMany, userFindMany } = setup();
      auditLogFindMany.mockResolvedValue([
        {
          createdAt: new Date('2026-08-10T06:00:00.000Z'),
          action: 'gym.status.update',
          actorId: 'u1',
          targetId: null,
          metadata: { previousStatus: 'ACTIVE', status: 'SUSPENDED' },
        },
        {
          createdAt: new Date('2026-08-12T06:00:00.000Z'),
          action: 'review.hide',
          actorId: 'u2',
          targetId: 'cmrrrrrrrrrev12345',
          metadata: { previousStatus: 'VISIBLE', status: 'HIDDEN', rating: 2 },
        },
      ]);
      userFindMany.mockResolvedValue([{ id: 'u1', name: 'Operator', email: 'ops@example.com' }]);

      const result = await service.runReport('audit-log', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-10',
          time: '10:00',
          staff: 'Operator',
          action: 'Status changed',
          target: '',
          previous: 'ACTIVE',
          next: 'SUSPENDED',
        },
        {
          date: '2026-08-12',
          time: '10:00',
          staff: 'Unknown',
          action: 'review.hide',
          target: 'REV12345',
          previous: 'VISIBLE',
          next: 'HIDDEN',
        },
      ]);
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

      const result = await service.runReport('discounts-and-promotions', { range: 'mtd' });

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
        time: '18:05', // 14:05Z on the gym's clock (Tbilisi, UTC+4)
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

      const result = await service.runReport('revenue-by-channel', { range: 'mtd' });

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
      const result = await service.runReport('revenue-by-channel', { range: 'mtd' });
      expect(result.rows).toEqual([]);
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

      const result = await service.runReport('waitlist-demand', { range: 'mtd' });

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

      const result = await service.runReport('class-utilization', { range: 'mtd' });

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

      const result = await service.runReport('trainer-performance', { range: 'mtd' });

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

      const result = await service.runReport('trainer-performance', { range: 'mtd' });

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

      const result = await service.runReport('trainer-performance', { range: 'mtd' });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ trainer: 'Mia', classes: 2, seatsOffered: 18 });
    });
  });

  describe('trainer-activity', () => {
    // The clock is 10:00Z on 31 August; the window is the gym's month so far.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('counts classes, PT sessions from both sources, distinct members, and how bookings ended, per trainer', async () => {
      const {
        service,
        classInstanceFindMany,
        ptSessionFindMany,
        serviceSessionFindMany,
        trainerFindMany,
      } = setup();
      // Mia's staff login is linked to her trainer record; Leo has no trainer record.
      trainerFindMany.mockResolvedValue([{ id: 'tr1', staffId: 'st1', name: 'Mia' }]);
      classInstanceFindMany.mockResolvedValue([
        {
          trainerId: null,
          trainer: null,
          location: null,
          template: { trainerId: 'tr1', trainer: { name: 'Mia' }, location: { name: 'Vake' } },
          bookings: [
            { status: BookingStatus.ATTENDED, memberId: 'm1' },
            { status: BookingStatus.ATTENDED, memberId: 'm2' },
            { status: BookingStatus.NO_SHOW, memberId: 'm3' },
            { status: BookingStatus.CANCELED, memberId: 'm4' },
            { status: BookingStatus.WAITLIST, memberId: 'm5' },
          ],
        },
        {
          trainerId: 'tr1',
          trainer: { name: 'Mia' },
          location: { name: 'Saburtalo' },
          template: null,
          bookings: [{ status: BookingStatus.ATTENDED, memberId: 'm1' }],
        },
      ]);
      ptSessionFindMany.mockResolvedValue([{ trainerId: 'tr1', trainer: { name: 'Mia' } }]);
      serviceSessionFindMany.mockResolvedValue([
        { staffId: 'st1', memberId: 'm6', staff: { firstName: 'Mia', lastName: 'K', user: null } },
        { staffId: 'st9', memberId: 'm7', staff: { firstName: 'Leo', lastName: null, user: null } },
      ]);

      const result = await service.runReport('trainer-activity', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          trainer: 'Mia',
          location: 'Saburtalo, Vake',
          classes: 2,
          // One calendar session plus one booked slot, joined through her staff login.
          ptSessions: 2,
          // m1 (twice), m2, m3 held seats; m4 cancelled and m5 only waited; m6 had a PT slot.
          membersTrained: 4,
          attended: 3,
          cancellations: 1,
          noShows: 1,
        },
        {
          trainer: 'Leo',
          location: '',
          classes: 0,
          ptSessions: 1,
          membersTrained: 1,
          attended: 0,
          cancellations: 0,
          noShows: 0,
        },
      ]);
    });

    it('detail: every class booking and PT session in the window under its trainer, oldest first', async () => {
      const { service, bookingFindMany, serviceSessionFindMany, ptSessionFindMany } = setup();
      bookingFindMany.mockResolvedValue([
        {
          status: BookingStatus.ATTENDED,
          member: { firstName: 'Nino', lastName: 'Gelashvili', user: null },
          classInstance: {
            // 05:00Z is 09:00 in Tbilisi.
            startsAt: new Date('2026-08-20T05:00:00.000Z'),
            trainer: null,
            location: null,
            template: { title: 'Yoga', trainer: { name: 'Mia' }, location: { name: 'Vake' } },
            classType: null,
          },
        },
      ]);
      serviceSessionFindMany.mockResolvedValue([
        {
          startsAt: new Date('2026-08-20T07:00:00.000Z'),
          status: 'COMPLETED',
          member: { firstName: 'Dato', lastName: 'Kapanadze', user: null },
          staff: { firstName: 'Mia', lastName: 'K', user: null },
          service: { name: 'Personal training' },
        },
      ]);
      ptSessionFindMany.mockResolvedValue([
        {
          startsAt: new Date('2026-08-19T07:00:00.000Z'),
          status: 'SCHEDULED',
          trainer: { name: 'Leo' },
          classType: null,
        },
      ]);

      const result = await service.runReport('trainer-activity-detail', { range: 'mtd' });

      expect(result.rows).toEqual([
        {
          date: '2026-08-19',
          time: '11:00',
          trainer: 'Leo',
          type: 'PT session',
          session: 'PT session',
          member: '',
          location: '',
          status: 'Scheduled',
        },
        {
          date: '2026-08-20',
          time: '09:00',
          trainer: 'Mia',
          type: 'Class',
          session: 'Yoga',
          member: 'Nino Gelashvili',
          location: 'Vake',
          status: 'Attended',
        },
        {
          date: '2026-08-20',
          time: '11:00',
          trainer: 'Mia K',
          type: 'PT session',
          session: 'Personal training',
          member: 'Dato Kapanadze',
          location: '',
          status: 'Completed',
        },
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

      const result = await service.runReport('no-show-rate', { range: 'mtd' });

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

      const result = await service.runReport('revenue-by-location', { range: 'mtd' });

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
      for await (const chunk of service.streamReportCsv('revenue-by-channel', { range: 'mtd' })) {
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

      const workbook = await service.buildReportXlsx('revenue-by-channel', { range: 'mtd' });

      expect(workbook.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      const text = workbook.toString('latin1');
      expect(text).toContain('<t xml:space="preserve">Channel</t>');
      // POS gross 5000 minor → 50 major, written as a numeric cell.
      expect(text).toContain('<v>50</v>');
    });
  });
});
