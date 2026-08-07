# Dashboard Sales Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Sales tab's generic widget grid with a hand-built analytics view — a KPI strip, a revenue trend, a sales-vs-refunds trend, a payment-method breakdown and a ranked top-sellers list — all recomputed by two tab-wide controls (granularity, product type).

**Architecture:** One new contract module in `@fit/types`, one new tenant-scoped Nest service behind one new route on the existing `DashboardController`, and a new `SalesView` in the admin app laid out on the Overview's own grid. The `sales` segment leaves `CONFIGURABLE_DASHBOARD_SEGMENTS` so the widget picker no longer offers it, while staying in `DASHBOARD_SEGMENTS` so the tab bar is unchanged.

**Tech Stack:** TypeScript, Zod (`@fit/types`), NestJS + Prisma (`apps/api`), Next.js App Router + React + StyleX + Astryx (`apps/admin`), next-intl (`@fit/i18n`), Vitest everywhere.

**Spec:** [`docs/superpowers/specs/2026-08-07-dashboard-sales-design.md`](../specs/2026-08-07-dashboard-sales-design.md)

## Global Constraints

- **Money is MINOR units** (cents/tetri) on every wire shape and in every service figure. Charts divide by 100 at render time only.
- **No design-token changes.** Use existing `var(--color-*)` / `var(--font-family-*)` values only. `@fit/astryx-theme` is not touched.
- **No Prisma migrations.** Every figure derives from existing columns.
- **No Tailwind utilities** in `apps/admin` — compiled StyleX only (a repo guardrail script enforces this: `pnpm check:tailwind-guardrail`).
- **Honesty contract:** a figure is a real aggregation or an explicit empty state. Never fabricate a zero to fill a card. Dense zero-filled _time buckets_ are fine and required — a quiet Tuesday is a real zero.
- **All UTC.** Window and bucket math comes from `apps/api/src/reports/report-window.util.ts`; do not write new date math.
- **Every user-visible string is an i18n key** added to **both** `packages/i18n/locales/en.json` and `packages/i18n/locales/ka.json`.
- **Commit after every task.** Pre-commit runs `prettier --check` + eslint on staged files; run `pnpm format` if it rejects.

## File Structure

| File                                                          | Responsibility                                   | Task |
| ------------------------------------------------------------- | ------------------------------------------------ | ---- |
| `packages/types/src/dashboard-sales.ts`                       | Query + response contract, granularity→range map | 1    |
| `packages/types/src/dashboard-sales.spec.ts`                  | Contract tests                                   | 1    |
| `packages/types/index.ts`                                     | Re-export                                        | 1    |
| `apps/api/src/dashboard/dashboard-sales.service.ts`           | The aggregation                                  | 2    |
| `apps/api/src/dashboard/dashboard-sales.service.spec.ts`      | Aggregation tests                                | 2    |
| `apps/api/src/dashboard/dashboard.controller.ts`              | `GET /dashboard/sales`                           | 3    |
| `apps/api/src/dashboard/dashboard.controller.spec.ts`         | Route tests                                      | 3    |
| `apps/api/src/dashboard/dashboard.module.ts`                  | Provider wiring                                  | 3    |
| `apps/admin/app/(dashboard)/charts.tsx`                       | `DualAreaChart`                                  | 4    |
| `apps/admin/app/(dashboard)/charts.test.tsx`                  | `DualAreaChart` tests                            | 4    |
| `apps/admin/lib/api.ts`                                       | `fetchDashboardSales`                            | 5    |
| `apps/admin/app/(dashboard)/sales/actions.ts`                 | `loadSalesAction`                                | 5    |
| `packages/i18n/locales/{en,ka}.json`                          | `admin.dashboard.sales.*`                        | 6    |
| `apps/admin/app/(dashboard)/sales/sales-kpi-strip.tsx`        | Four KPI tiles                                   | 7    |
| `apps/admin/app/(dashboard)/sales/sales-trend-card.tsx`       | Revenue trend + both controls                    | 8    |
| `apps/admin/app/(dashboard)/sales/sales-vs-refunds-card.tsx`  | Comparison trend                                 | 8    |
| `apps/admin/app/(dashboard)/sales/payment-method-card.tsx`    | Channel × method bars                            | 9    |
| `apps/admin/app/(dashboard)/sales/top-sellers-card.tsx`       | Ranked list                                      | 9    |
| `apps/admin/app/(dashboard)/sales/sales-view.tsx`             | Fetch, cache, controls, layout                   | 10   |
| `apps/admin/app/(dashboard)/sales/sales-view.test.tsx`        | View tests                                       | 10   |
| `packages/types/src/dashboard-segments.ts`                    | Drop `sales` from configurables                  | 11   |
| `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx` | Render `SalesView`                               | 11   |

Tasks 1–10 are additive: the app keeps working (Sales still shows the old widget grid) until Task 11 flips it over. Task 11 is the only breaking change and carries all its test fallout.

---

### Task 1: The `@fit/types` contract

**Files:**

- Create: `packages/types/src/dashboard-sales.ts`
- Create: `packages/types/src/dashboard-sales.spec.ts`
- Modify: `packages/types/index.ts` (add one export line after line 17)

**Interfaces:**

- Consumes: `reportSeriesPointSchema` from `./reports-drilldown`.
- Produces: `salesGranularitySchema`, `salesProductTypeSchema`, `salesChannelSchema`, `salesPaymentMethodSchema`, `SALES_GRANULARITY_RANGE`, `SALES_TOP_SELLERS_LIMIT`, `dashboardSalesQuerySchema`, `dashboardSalesResponseSchema`, and the types `SalesGranularity`, `SalesProductType`, `SalesChannel`, `SalesPaymentMethod`, `SalesMethodSlice`, `SalesTopSeller`, `SalesComparisonPoint`, `DashboardSalesQuery`, `DashboardSalesResponse`. Every later task imports these from `@fit/types`.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/dashboard-sales.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SALES_GRANULARITY,
  DEFAULT_SALES_PRODUCT_TYPE,
  SALES_GRANULARITY_RANGE,
  SALES_TOP_SELLERS_LIMIT,
  dashboardSalesQuerySchema,
  dashboardSalesResponseSchema,
} from './dashboard-sales';

describe('dashboardSalesQuerySchema', () => {
  it('defaults an absent query to daily / all', () => {
    expect(dashboardSalesQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_SALES_GRANULARITY,
      productType: DEFAULT_SALES_PRODUCT_TYPE,
    });
  });

  // A hand-edited URL must land on the default, not a 400 — the same forgiving
  // rule `dashboardOverviewQuerySchema` applies to its own params.
  it('falls back to the defaults on unknown values', () => {
    expect(dashboardSalesQuerySchema.parse({ granularity: 'hourly', productType: 'nope' })).toEqual(
      { granularity: 'daily', productType: 'all' },
    );
  });

  it('keeps valid values', () => {
    expect(
      dashboardSalesQuerySchema.parse({ granularity: 'monthly', productType: 'session-packs' }),
    ).toEqual({ granularity: 'monthly', productType: 'session-packs' });
  });
});

describe('SALES_GRANULARITY_RANGE', () => {
  // The whole point of the indirection: no new window or bucket math exists,
  // each granularity is an existing report range.
  it('maps every granularity onto an existing report range', () => {
    expect(SALES_GRANULARITY_RANGE).toEqual({ daily: '30d', weekly: '12w', monthly: '12m' });
  });
});

describe('dashboardSalesResponseSchema', () => {
  it('accepts a fully populated response', () => {
    const parsed = dashboardSalesResponseSchema.parse({
      granularity: 'daily',
      productType: 'all',
      currency: 'GEL',
      kpis: { grossSales: 10_000, netSales: 9_000, refunded: 1_000, avgSale: 4_500 },
      revenueOverTime: [{ label: '2026-08-01', value: 9_000 }],
      salesVsRefunds: [{ label: '2026-08-01', sales: 10_000, refunds: 1_000 }],
      byPaymentMethod: [{ channel: 'pos', method: 'cash', value: 9_000 }],
      topSellers: [{ label: 'Premium', orders: 2, value: 9_000 }],
    });
    expect(parsed.kpis.netSales).toBe(9_000);
    expect(parsed.byPaymentMethod[0]?.channel).toBe('pos');
  });

  // Display labels are i18n keys resolved client-side; the wire stays locale-free.
  it('rejects a payment slice carrying an unknown channel', () => {
    const result = dashboardSalesResponseSchema.safeParse({
      granularity: 'daily',
      productType: 'all',
      currency: 'GEL',
      kpis: { grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 },
      revenueOverTime: [],
      salesVsRefunds: [],
      byPaymentMethod: [{ channel: 'terminal', method: 'cash', value: 0 }],
      topSellers: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('SALES_TOP_SELLERS_LIMIT', () => {
  it('caps the ranked list at eight rows', () => {
    expect(SALES_TOP_SELLERS_LIMIT).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/types test -- dashboard-sales`
Expected: FAIL — `Failed to resolve import "./dashboard-sales"`.

- [ ] **Step 3: Write the contract**

Create `packages/types/src/dashboard-sales.ts`:

```ts
// @fit/types — the hand-built Sales dashboard tab's contract (Zod schemas).
//
// The Sales tab is not a widget grid: it is a purpose-built view with two
// controls that recompute every card on it. This module is the whole wire
// surface for `GET /dashboard/sales`.
//
// Money is an integer in the currency's MINOR units (cents/tetri) throughout,
// like every other admin contract. Display labels for channels, methods and
// product types are deliberately NOT on the wire — they are i18n keys resolved
// client-side, so the API stays locale-free like the segment contracts.
//
// Every figure the response carries is a REAL aggregation over rows that exist
// today (same honesty contract as `./analytics` and `./reports-drilldown`); an
// empty breakdown is an honest "nothing happened in this window", never a
// fabricated zero. Time SERIES are the exception and are densely zero-filled:
// a bucket with no sales is a real zero, and omitting it would misdraw the
// trend.

import { z } from 'zod';
import { reportSeriesPointSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How the tab's trends are bucketed. Deliberately ONE value rather than a
 * separate window and bucket: the two can never be set to a nonsensical pair
 * (monthly buckets over seven days) because the pairing lives in
 * {@link SALES_GRANULARITY_RANGE}.
 */
export const SALES_GRANULARITIES = ['daily', 'weekly', 'monthly'] as const;
export const salesGranularitySchema = z.enum(SALES_GRANULARITIES);
export type SalesGranularity = z.infer<typeof salesGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_SALES_GRANULARITY: SalesGranularity = 'daily';

/**
 * The existing report range each granularity resolves to, so the API writes no
 * new window or bucket math — `resolveWindow` remains the single source of truth
 * for where a bucket starts.
 */
export const SALES_GRANULARITY_RANGE: Record<SalesGranularity, '30d' | '12w' | '12m'> = {
  daily: '30d',
  weekly: '12w',
  monthly: '12m',
};

/**
 * What kind of sale the tab is narrowed to. Derived at read time from the
 * order's shape — no stored column, no backfill:
 *   • `memberships`   — the order names a `PackagePlan` and minted no credit pack.
 *   • `session-packs` — the order minted a `CreditPack` (a class / PT session pass).
 *   • `retail`        — everything else: the POS till and the online shop.
 *
 * Classes and PT sessions are NOT separable: both are sold as the same credit
 * pack, `PackagePlan` carries no kind discriminator, and a `PtSession` has no
 * price or order of its own. `session-packs` is labelled to say so rather than
 * offering a filter the data cannot answer.
 */
export const SALES_PRODUCT_TYPES = ['all', 'memberships', 'session-packs', 'retail'] as const;
export const salesProductTypeSchema = z.enum(SALES_PRODUCT_TYPES);
export type SalesProductType = z.infer<typeof salesProductTypeSchema>;

/** The filter a query without one lands on. */
export const DEFAULT_SALES_PRODUCT_TYPE: SalesProductType = 'all';

/**
 * `GET /dashboard/sales?granularity=&productType=` query. `.catch` (not
 * `.default`) so a hand-edited URL lands on the default rather than a 400 — the
 * same forgiving rule the overview query already applies.
 */
export const dashboardSalesQuerySchema = z.object({
  granularity: salesGranularitySchema.catch(DEFAULT_SALES_GRANULARITY),
  productType: salesProductTypeSchema.catch(DEFAULT_SALES_PRODUCT_TYPE),
});
export type DashboardSalesQuery = z.infer<typeof dashboardSalesQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The channel a sale was settled through, from `Payment.provider`: the POS till
 * stamps `"pos"`, the online wizard and shop stamp `"stub"` (a real gateway key
 * once T8.8 lands). The same rule the admin order roster already keys off.
 */
export const salesChannelSchema = z.enum(['pos', 'online']);
export type SalesChannel = z.infer<typeof salesChannelSchema>;

/** How a sale was settled — the wire form of the `PaymentMethod` enum. */
export const salesPaymentMethodSchema = z.enum(['cash', 'card', 'member-account']);
export type SalesPaymentMethod = z.infer<typeof salesPaymentMethodSchema>;

/**
 * One bucket of the sales-vs-refunds trend. `sales` is gross taken in the bucket;
 * `refunds` is money returned in the bucket, dated by the refund's OWN timestamp
 * rather than the sale's — see the service for why the two can legitimately
 * disagree with the refunded KPI.
 */
export const salesComparisonPointSchema = z.object({
  /** Bucket start, `YYYY-MM-DD`. */
  label: z.string(),
  sales: z.number(),
  refunds: z.number(),
});
export type SalesComparisonPoint = z.infer<typeof salesComparisonPointSchema>;

/** One bar of the payment breakdown — a channel × method combination that occurred. */
export const salesMethodSliceSchema = z.object({
  channel: salesChannelSchema,
  method: salesPaymentMethodSchema,
  /** Net takings on this combination, MINOR units. */
  value: z.number(),
});
export type SalesMethodSlice = z.infer<typeof salesMethodSliceSchema>;

/** One row of the ranked top-sellers list. */
export const salesTopSellerSchema = z.object({
  /** The order line's label, snapshotted at sale time. */
  label: z.string(),
  /** Distinct orders this line appeared on. */
  orders: z.number(),
  /** Summed line value, MINOR units. */
  value: z.number(),
});
export type SalesTopSeller = z.infer<typeof salesTopSellerSchema>;

/** How many rows the ranked top-sellers list carries. */
export const SALES_TOP_SELLERS_LIMIT = 8;

/** The tab's four headline figures. All MINOR units. */
export const salesKpisSchema = z.object({
  grossSales: z.number(),
  netSales: z.number(),
  refunded: z.number(),
  avgSale: z.number(),
});
export type SalesKpis = z.infer<typeof salesKpisSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/sales` response — the whole tab in one round trip, so the two
 * controls never leave one card showing a different window from its neighbour.
 * Echoes the resolved query so the client can confirm what it is looking at.
 */
export const dashboardSalesResponseSchema = z.object({
  granularity: salesGranularitySchema,
  productType: salesProductTypeSchema,
  /** ISO-4217 currency the money figures are denominated in. */
  currency: z.string(),
  kpis: salesKpisSchema,
  /** Net revenue per bucket — dense across the window. */
  revenueOverTime: z.array(reportSeriesPointSchema),
  /** Gross sales against refunds per bucket — dense across the window. */
  salesVsRefunds: z.array(salesComparisonPointSchema),
  /** Only combinations that actually occurred, descending by value. */
  byPaymentMethod: z.array(salesMethodSliceSchema),
  /** Descending by value, capped at {@link SALES_TOP_SELLERS_LIMIT}. */
  topSellers: z.array(salesTopSellerSchema),
});
export type DashboardSalesResponse = z.infer<typeof dashboardSalesResponseSchema>;
```

- [ ] **Step 4: Export it**

In `packages/types/index.ts`, add after the `./src/dashboard-segments` line (line 17):

```ts
export * from './src/dashboard-sales';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @fit/types test -- dashboard-sales`
Expected: PASS — 6 tests.

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @fit/types type-check`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/dashboard-sales.ts packages/types/src/dashboard-sales.spec.ts packages/types/index.ts
git commit -m "feat(types): add the dashboard Sales tab contract"
```

---

### Task 2: The aggregation service

**Files:**

- Create: `apps/api/src/dashboard/dashboard-sales.service.ts`
- Create: `apps/api/src/dashboard/dashboard-sales.service.spec.ts`

**Interfaces:**

- Consumes: everything Task 1 produced; `resolveWindow`, `bucketKey`, `emptyBuckets` from `../reports/report-window.util`; `ReportDrilldownService.currency()` from `../reports/report-drilldown.service` (already public, already provided by `ReportsModule`, which `DashboardModule` already imports); `TenantPrismaService`, `TenantContext`.
- Produces: `class DashboardSalesService` with `constructor(prisma: TenantPrismaService, drilldown: ReportDrilldownService)` and one method `get(query: DashboardSalesQuery): Promise<DashboardSalesResponse>`.

**Background the implementer needs:**

`TenantPrismaService.client` is a Prisma client already constrained to the caller's gym by an extension — never pass or filter on `gymId` yourself. Money on `Payment` is `amount` (charged) and `refundedAmount` (running total already returned, mutated in place, **no timestamp of its own**). `Refund` rows carry their own `createdAt` and their own `order` relation. `Order.creditPack` is a nullable one-to-one; `Order.packageId` a nullable FK. Negative `OrderItem.amount` rows are promo/discount lines and must never enter a "top seller" ranking.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/dashboard-sales.service.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentMethod } from '@fit/db';
import type { DashboardSalesQuery } from '@fit/types';
import { DashboardSalesService } from './dashboard-sales.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { ReportDrilldownService } from '../reports/report-drilldown.service';

/** The shape the service selects from an order, on both the payment and refund reads. */
interface OrderStub {
  packageId: string | null;
  creditPack: { id: string } | null;
  items?: { label: string; amount: number }[];
}

/** A membership order: names a plan, minted no credit pack. */
const MEMBERSHIP: OrderStub = { packageId: 'plan-1', creditPack: null, items: [] };
/** A session-pass order: minted a credit pack. */
const SESSION_PACK: OrderStub = { packageId: 'plan-2', creditPack: { id: 'pack-1' }, items: [] };
/** A retail order: neither. */
const RETAIL: OrderStub = { packageId: null, creditPack: null, items: [] };

function payment(over: {
  amount: number;
  refundedAmount?: number;
  createdAt: string;
  method?: PaymentMethod;
  provider?: string;
  order?: OrderStub;
}) {
  return {
    amount: over.amount,
    refundedAmount: over.refundedAmount ?? 0,
    currency: 'GEL',
    method: over.method ?? PaymentMethod.CARD,
    provider: over.provider ?? 'stub',
    createdAt: new Date(over.createdAt),
    order: over.order ?? RETAIL,
  };
}

function refund(over: { amount: number; createdAt: string; order?: OrderStub }) {
  return {
    amount: over.amount,
    createdAt: new Date(over.createdAt),
    order: over.order ?? RETAIL,
  };
}

function setup(rows: { payments?: unknown[]; refunds?: unknown[] } = {}) {
  const paymentFindMany = vi.fn().mockResolvedValue(rows.payments ?? []);
  const refundFindMany = vi.fn().mockResolvedValue(rows.refunds ?? []);
  const prisma = {
    client: {
      payment: { findMany: paymentFindMany },
      refund: { findMany: refundFindMany },
    },
  } as unknown as TenantPrismaService;
  const currency = vi.fn().mockResolvedValue('GEL');
  const drilldown = { currency } as unknown as ReportDrilldownService;

  return {
    service: new DashboardSalesService(prisma, drilldown),
    paymentFindMany,
    refundFindMany,
    currency,
  };
}

const ALL: DashboardSalesQuery = { granularity: 'daily', productType: 'all' };

/** `daily` is a 30-day window ending now, so "today" is always inside it. */
function today(): string {
  return new Date().toISOString();
}

describe('DashboardSalesService.get — KPIs', () => {
  afterEach(() => vi.clearAllMocks());

  it('sums gross, net, refunded and the average sale', async () => {
    const { service } = setup({
      payments: [
        payment({ amount: 10_000, refundedAmount: 2_000, createdAt: today() }),
        payment({ amount: 6_000, createdAt: today() }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.kpis).toEqual({
      grossSales: 16_000,
      netSales: 14_000,
      refunded: 2_000,
      avgSale: 7_000,
    });
  });

  it('reports zeroes — not a division by zero — for an empty window', async () => {
    const { service } = setup();

    const result = await service.get(ALL);

    expect(result.kpis).toEqual({ grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 });
    expect(result.byPaymentMethod).toEqual([]);
    expect(result.topSellers).toEqual([]);
    // The series stay dense: a window with no sales is 30 real zeroes, not [].
    expect(result.revenueOverTime.length).toBeGreaterThan(0);
    expect(result.revenueOverTime.every((point) => point.value === 0)).toBe(true);
  });

  it('falls back to the gym currency when no payment landed in the window', async () => {
    const { service, currency } = setup();

    const result = await service.get(ALL);

    expect(currency).toHaveBeenCalled();
    expect(result.currency).toBe('GEL');
  });
});

describe('DashboardSalesService.get — product type', () => {
  afterEach(() => vi.clearAllMocks());

  const MIXED = [
    payment({ amount: 10_000, createdAt: today(), order: MEMBERSHIP }),
    payment({ amount: 3_000, createdAt: today(), order: SESSION_PACK }),
    payment({ amount: 500, createdAt: today(), order: RETAIL }),
  ];

  it('classifies an order that minted a credit pack as a session pack', async () => {
    const { service } = setup({ payments: MIXED });
    expect((await service.get({ ...ALL, productType: 'session-packs' })).kpis.grossSales).toBe(
      3_000,
    );
  });

  it('classifies a plan order with no credit pack as a membership', async () => {
    const { service } = setup({ payments: MIXED });
    expect((await service.get({ ...ALL, productType: 'memberships' })).kpis.grossSales).toBe(
      10_000,
    );
  });

  it('classifies everything else as retail', async () => {
    const { service } = setup({ payments: MIXED });
    expect((await service.get({ ...ALL, productType: 'retail' })).kpis.grossSales).toBe(500);
  });

  // The filter is tab-wide: it must narrow every output, not just the trend.
  it('narrows the payment breakdown and the trend, not only the KPIs', async () => {
    const { service } = setup({
      payments: [
        payment({ amount: 10_000, createdAt: today(), order: MEMBERSHIP, provider: 'stub' }),
        payment({
          amount: 500,
          createdAt: today(),
          order: RETAIL,
          provider: 'pos',
          method: PaymentMethod.CASH,
        }),
      ],
    });

    const result = await service.get({ ...ALL, productType: 'memberships' });

    expect(result.byPaymentMethod).toEqual([{ channel: 'online', method: 'card', value: 10_000 }]);
    expect(result.revenueOverTime.reduce((sum, point) => sum + point.value, 0)).toBe(10_000);
  });

  // A memberships view showing retail refunds against membership sales would be
  // a straightforwardly wrong chart.
  it('applies the filter to refunds too', async () => {
    const { service } = setup({
      payments: [payment({ amount: 10_000, createdAt: today(), order: MEMBERSHIP })],
      refunds: [
        refund({ amount: 400, createdAt: today(), order: RETAIL }),
        refund({ amount: 1_000, createdAt: today(), order: MEMBERSHIP }),
      ],
    });

    const result = await service.get({ ...ALL, productType: 'memberships' });

    expect(result.salesVsRefunds.reduce((sum, point) => sum + point.refunds, 0)).toBe(1_000);
  });
});

describe('DashboardSalesService.get — bucketing', () => {
  afterEach(() => vi.clearAllMocks());

  it('emits a dense daily series across the 30-day window', async () => {
    const { service } = setup();
    const result = await service.get({ ...ALL, granularity: 'daily' });
    // 30 days, inclusive of the partial bucket the window ends in.
    expect(result.revenueOverTime.length).toBeGreaterThanOrEqual(30);
    expect(result.salesVsRefunds).toHaveLength(result.revenueOverTime.length);
  });

  it('emits far fewer buckets monthly than daily', async () => {
    const { service } = setup();
    const daily = await service.get({ ...ALL, granularity: 'daily' });
    const monthly = await service.get({ ...ALL, granularity: 'monthly' });
    expect(monthly.revenueOverTime.length).toBeLessThan(daily.revenueOverTime.length);
    expect(monthly.revenueOverTime.length).toBeGreaterThanOrEqual(12);
  });

  it('windows the reads and orders payments oldest-first', async () => {
    const { service, paymentFindMany, refundFindMany } = setup();

    await service.get(ALL);

    const paymentArgs = paymentFindMany.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date; lt: Date } };
      orderBy: unknown;
    };
    expect(paymentArgs.where.createdAt.gte).toBeInstanceOf(Date);
    expect(paymentArgs.orderBy).toEqual({ createdAt: 'asc' });
    expect(refundFindMany).toHaveBeenCalledTimes(1);
  });

  // THE bug this design exists to prevent. `Payment.refundedAmount` is a running
  // total with no date, so bucketing a refund by it would file the refund in the
  // SALE's bucket. Refunds are dated by `Refund.createdAt`.
  it('dates a refund by its own timestamp, not the sale it reverses', async () => {
    const saleDay = new Date();
    saleDay.setUTCDate(saleDay.getUTCDate() - 10);
    const refundDay = new Date();
    refundDay.setUTCDate(refundDay.getUTCDate() - 2);

    const { service } = setup({
      payments: [
        payment({ amount: 10_000, refundedAmount: 10_000, createdAt: saleDay.toISOString() }),
      ],
      refunds: [refund({ amount: 10_000, createdAt: refundDay.toISOString() })],
    });

    const result = await service.get(ALL);
    const refundKey = refundDay.toISOString().slice(0, 10);
    const saleKey = saleDay.toISOString().slice(0, 10);

    expect(result.salesVsRefunds.find((point) => point.label === refundKey)?.refunds).toBe(10_000);
    expect(result.salesVsRefunds.find((point) => point.label === saleKey)?.refunds).toBe(0);
    expect(result.salesVsRefunds.find((point) => point.label === saleKey)?.sales).toBe(10_000);
  });
});

describe('DashboardSalesService.get — payment breakdown', () => {
  afterEach(() => vi.clearAllMocks());

  it('splits POS from online on the provider and groups by method, descending', async () => {
    const { service } = setup({
      payments: [
        payment({
          amount: 1_000,
          createdAt: today(),
          provider: 'pos',
          method: PaymentMethod.CASH,
        }),
        payment({
          amount: 5_000,
          createdAt: today(),
          provider: 'pos',
          method: PaymentMethod.CARD,
        }),
        payment({
          amount: 9_000,
          createdAt: today(),
          provider: 'stub',
          method: PaymentMethod.CARD,
        }),
        payment({
          amount: 200,
          createdAt: today(),
          provider: 'pos',
          method: PaymentMethod.MEMBER_ACCOUNT,
        }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.byPaymentMethod).toEqual([
      { channel: 'online', method: 'card', value: 9_000 },
      { channel: 'pos', method: 'card', value: 5_000 },
      { channel: 'pos', method: 'cash', value: 1_000 },
      { channel: 'pos', method: 'member-account', value: 200 },
    ]);
  });
});

describe('DashboardSalesService.get — top sellers', () => {
  afterEach(() => vi.clearAllMocks());

  it('ranks by value, counts distinct orders, and ignores discount lines', async () => {
    const { service } = setup({
      payments: [
        payment({
          amount: 6_000,
          createdAt: today(),
          order: {
            packageId: null,
            creditPack: null,
            items: [
              { label: 'Protein bar', amount: 1_000 },
              { label: 'Premium', amount: 5_500 },
              { label: 'Promo SUMMER', amount: -500 },
            ],
          },
        }),
        payment({
          amount: 1_000,
          createdAt: today(),
          order: {
            packageId: null,
            creditPack: null,
            items: [{ label: 'Protein bar', amount: 1_000 }],
          },
        }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.topSellers).toEqual([
      { label: 'Premium', orders: 1, value: 5_500 },
      { label: 'Protein bar', orders: 2, value: 2_000 },
    ]);
  });

  it('caps the list at eight rows', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      label: `Item ${i}`,
      amount: (i + 1) * 100,
    }));
    const { service } = setup({
      payments: [
        payment({
          amount: 7_800,
          createdAt: today(),
          order: { packageId: null, creditPack: null, items },
        }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.topSellers).toHaveLength(8);
    expect(result.topSellers[0]?.label).toBe('Item 11');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/api test -- dashboard-sales.service`
Expected: FAIL — cannot resolve `./dashboard-sales.service`.

- [ ] **Step 3: Write the service**

Create `apps/api/src/dashboard/dashboard-sales.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@fit/db';
import {
  SALES_GRANULARITY_RANGE,
  SALES_TOP_SELLERS_LIMIT,
  type DashboardSalesQuery,
  type DashboardSalesResponse,
  type SalesChannel,
  type SalesMethodSlice,
  type SalesPaymentMethod,
  type SalesProductType,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { ReportDrilldownService } from '../reports/report-drilldown.service';
import { bucketKey, emptyBuckets, resolveWindow } from '../reports/report-window.util';

/** `Payment.provider` for a till sale; anything else settled through a gateway. */
const POS_PROVIDER = 'pos';

/** The wire form of each settlement method. */
const METHOD_KEYS: Record<PaymentMethod, SalesPaymentMethod> = {
  [PaymentMethod.CASH]: 'cash',
  [PaymentMethod.CARD]: 'card',
  [PaymentMethod.MEMBER_ACCOUNT]: 'member-account',
};

/** The order fields both reads select, and the only ones classification needs. */
interface ClassifiableOrder {
  packageId: string | null;
  creditPack: { id: string } | null;
}

/** A running per-label tally for the ranked top-sellers list. */
interface SellerTally {
  orders: number;
  value: number;
}

/**
 * Read side of the hand-built Sales dashboard tab.
 *
 * Produces the whole tab in one round trip — four KPIs, two trends, a payment
 * breakdown and a ranked top-sellers list — so its two controls (granularity and
 * product type) can never leave one card showing a different window from its
 * neighbour. Everything is a REAL aggregation over captured {@link Payment} and
 * {@link Refund} rows (same honesty contract as {@link ReportDrilldownService});
 * only the time series are densely zero-filled, because a bucket with no sales is
 * a real zero and omitting it would misdraw the trend.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`. Window and bucket math is delegated entirely to
 * `report-window.util.ts` via {@link SALES_GRANULARITY_RANGE} — this service
 * contains no date arithmetic of its own.
 *
 * **Why two reads.** `Payment.refundedAmount` is a running total mutated in place
 * with no timestamp, so bucketing a refund by it would file the refund in the
 * SALE's bucket. The refunds series therefore reads {@link Refund} rows, which
 * carry their own `createdAt`. The `refunded` KPI still sums `refundedAmount`
 * over the window's payments, matching the existing drill-downs — so the two can
 * legitimately differ (a sale refunded after the window counts in the KPI but not
 * the trend, and vice versa). They answer different questions and the UI captions
 * each accordingly; collapsing them to one number would mean either wrong buckets
 * or a moving historical figure.
 */
@Injectable()
export class DashboardSalesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly drilldown: ReportDrilldownService,
  ) {}

  /** Build the whole Sales tab for one granularity + product-type combination. */
  async get(query: DashboardSalesQuery): Promise<DashboardSalesResponse> {
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity]);

    const [payments, refunds] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          refundedAmount: true,
          currency: true,
          method: true,
          provider: true,
          createdAt: true,
          order: {
            select: {
              packageId: true,
              creditPack: { select: { id: true } },
              items: { select: { label: true, amount: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          createdAt: true,
          order: { select: { packageId: true, creditPack: { select: { id: true } } } },
        },
      }),
    ]);

    const kept = payments.filter((payment) => matches(payment.order, query.productType));

    const netByBucket = emptyBuckets(win);
    const salesByBucket = emptyBuckets(win);
    const refundsByBucket = emptyBuckets(win);
    const byMethod = new Map<string, number>();
    const bySeller = new Map<string, SellerTally>();
    let gross = 0;
    let refunded = 0;

    for (const payment of kept) {
      const net = payment.amount - payment.refundedAmount;
      gross += payment.amount;
      refunded += payment.refundedAmount;

      const key = bucketKey(payment.createdAt, win.bucket);
      if (netByBucket.has(key)) {
        netByBucket.set(key, (netByBucket.get(key) ?? 0) + net);
        salesByBucket.set(key, (salesByBucket.get(key) ?? 0) + payment.amount);
      }

      const methodKey = `${channelOf(payment.provider)}|${METHOD_KEYS[payment.method]}`;
      byMethod.set(methodKey, (byMethod.get(methodKey) ?? 0) + net);

      // One order counts ONCE per label even if it carries two lines with the
      // same label, so `orders` stays a distinct-order count.
      const counted = new Set<string>();
      for (const item of payment.order.items) {
        // Negative lines are promo / discount adjustments — never a "top seller".
        if (item.amount <= 0) continue;
        const tally = bySeller.get(item.label) ?? { orders: 0, value: 0 };
        if (!counted.has(item.label)) {
          tally.orders += 1;
          counted.add(item.label);
        }
        tally.value += item.amount;
        bySeller.set(item.label, tally);
      }
    }

    for (const refund of refunds) {
      if (!matches(refund.order, query.productType)) continue;
      const key = bucketKey(refund.createdAt, win.bucket);
      if (refundsByBucket.has(key)) {
        refundsByBucket.set(key, (refundsByBucket.get(key) ?? 0) + refund.amount);
      }
    }

    const transactions = kept.length;
    const net = gross - refunded;

    return {
      granularity: query.granularity,
      productType: query.productType,
      // Payments are ordered oldest-first, so the last one is the most recent
      // charge — the same currency rule the drill-downs apply.
      currency: kept[kept.length - 1]?.currency ?? (await this.drilldown.currency()),
      kpis: {
        grossSales: gross,
        netSales: net,
        refunded,
        avgSale: transactions === 0 ? 0 : Math.round(net / transactions),
      },
      revenueOverTime: [...netByBucket.entries()].map(([label, value]) => ({ label, value })),
      salesVsRefunds: [...salesByBucket.entries()].map(([label, sales]) => ({
        label,
        sales,
        refunds: refundsByBucket.get(label) ?? 0,
      })),
      byPaymentMethod: [...byMethod.entries()]
        .map(([key, value]): SalesMethodSlice => {
          const [channel, method] = key.split('|') as [SalesChannel, SalesPaymentMethod];
          return { channel, method, value };
        })
        .sort((a, b) => b.value - a.value),
      topSellers: [...bySeller.entries()]
        .map(([label, tally]) => ({ label, orders: tally.orders, value: tally.value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, SALES_TOP_SELLERS_LIMIT),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What kind of sale an order is, from its shape alone. A credit pack is checked
 * FIRST because a session-pass order also names a `PackagePlan` — testing
 * `packageId` first would classify every pass as a membership.
 */
function classify(order: ClassifiableOrder): Exclude<SalesProductType, 'all'> {
  if (order.creditPack !== null) return 'session-packs';
  if (order.packageId !== null) return 'memberships';
  return 'retail';
}

/** Whether an order survives the tab's product-type filter. */
function matches(order: ClassifiableOrder, filter: SalesProductType): boolean {
  return filter === 'all' || classify(order) === filter;
}

/** The sales channel a payment settled through — the admin order roster's rule. */
function channelOf(provider: string): SalesChannel {
  return provider === POS_PROVIDER ? 'pos' : 'online';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/api test -- dashboard-sales.service`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard/dashboard-sales.service.ts apps/api/src/dashboard/dashboard-sales.service.spec.ts
git commit -m "feat(api): aggregate the Sales dashboard tab"
```

---

### Task 3: The route

**Files:**

- Modify: `apps/api/src/dashboard/dashboard.controller.ts` (add one method after `overview`)
- Modify: `apps/api/src/dashboard/dashboard.module.ts` (add one provider)
- Create: `apps/api/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**

- Consumes: `DashboardSalesService.get()` from Task 2, `dashboardSalesQuerySchema` from Task 1.
- Produces: `GET /dashboard/sales?granularity=&productType=`, which Task 5's `fetchDashboardSales` calls.

A repo guardrail (`pnpm check:controller-guards`) requires every controller to declare its guards and permissions; `DashboardController` already carries `@UseGuards(TenantGuard, PermissionsGuard)`, so the new method only needs `@RequirePermissions(Permission.ReportView)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/dashboard.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { DashboardSalesResponse } from '@fit/types';
import { DashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';
import type { DashboardSalesService } from './dashboard-sales.service';

const EMPTY: DashboardSalesResponse = {
  granularity: 'daily',
  productType: 'all',
  currency: 'GEL',
  kpis: { grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 },
  revenueOverTime: [],
  salesVsRefunds: [],
  byPaymentMethod: [],
  topSellers: [],
};

function setup() {
  const get = vi.fn().mockResolvedValue(EMPTY);
  const dashboard = {} as unknown as DashboardService;
  const sales = { get } as unknown as DashboardSalesService;
  return { controller: new DashboardController(dashboard, sales), get };
}

describe('DashboardController.sales', () => {
  it('passes a valid query straight through', async () => {
    const { controller, get } = setup();

    await controller.sales({ granularity: 'monthly', productType: 'retail' });

    expect(get).toHaveBeenCalledWith({ granularity: 'monthly', productType: 'retail' });
  });

  it('defaults an absent query', async () => {
    const { controller, get } = setup();

    await controller.sales({});

    expect(get).toHaveBeenCalledWith({ granularity: 'daily', productType: 'all' });
  });

  // A hand-edited URL should land on the default window, not a 400 — the same
  // forgiving rule `dashboard-segments.controller.ts` applies to `?range=`.
  it('falls back to the defaults on unknown values rather than throwing', async () => {
    const { controller, get } = setup();

    await controller.sales({ granularity: 'hourly', productType: 'gift-cards' });

    expect(get).toHaveBeenCalledWith({ granularity: 'daily', productType: 'all' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/api test -- dashboard.controller`
Expected: FAIL — `DashboardController` takes one constructor argument / `controller.sales is not a function`.

- [ ] **Step 3: Add the route**

In `apps/api/src/dashboard/dashboard.controller.ts`, extend the imports:

```ts
import {
  Permission,
  dashboardOverviewQuerySchema,
  dashboardSalesQuerySchema,
  type DashboardOverviewResponse,
  type DashboardSalesResponse,
  type DashboardStatsResponse,
} from '@fit/types';
import { DashboardSalesService } from './dashboard-sales.service';
```

Change the constructor:

```ts
  constructor(
    private readonly dashboard: DashboardService,
    // NOT `sales` — the handler below is already called `sales`, and a class
    // cannot carry a property and a method under the same name.
    private readonly salesTab: DashboardSalesService,
  ) {}
```

And add this method after `overview`:

```ts
  /**
   * `GET /dashboard/sales?granularity=&productType=` — the hand-built Sales tab in
   * one payload: four KPIs, the revenue trend, the sales-vs-refunds trend, the
   * payment-method breakdown and the ranked top sellers.
   *
   * Both params scope the WHOLE response, which is why the tab is one round trip
   * rather than one per card: a partial refresh could leave two cards describing
   * different windows. `granularity` (`daily` default / `weekly` / `monthly`)
   * picks the window and its bucket as one value; `productType` (`all` default /
   * `memberships` / `session-packs` / `retail`) narrows every figure. The Zod
   * schema `.catch`es unknown values to the defaults rather than raising a 400.
   */
  @Get('sales')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async sales(@Query() query: unknown): Promise<DashboardSalesResponse> {
    return this.salesTab.get(dashboardSalesQuerySchema.parse(query));
  }
```

- [ ] **Step 4: Register the provider**

In `apps/api/src/dashboard/dashboard.module.ts`, import the service and add it to `providers`:

```ts
import { DashboardSalesService } from './dashboard-sales.service';
```

```ts
  providers: [DashboardService, DashboardSegmentsService, DashboardSalesService],
```

Then extend the module's doc comment's first paragraph to mention the new route:

```
 * {@link DashboardController} (`/dashboard`) serves the overview segment's live
 * snapshot and the hand-built Sales tab (`/dashboard/sales`, see
 * {@link DashboardSalesService}); {@link DashboardSegmentsController}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @fit/api test -- dashboard`
Expected: PASS — the new controller spec plus the existing dashboard specs.

- [ ] **Step 6: Verify the guardrails and types**

Run: `pnpm check:controller-guards && pnpm --filter @fit/api type-check`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/dashboard/
git commit -m "feat(api): expose GET /dashboard/sales"
```

---

### Task 4: `DualAreaChart`

**Files:**

- Modify: `apps/admin/app/(dashboard)/charts.tsx` (append after `AreaChart`, before the Donut section divider)
- Create: `apps/admin/app/(dashboard)/charts.test.tsx`

**Interfaces:**

- Consumes: the existing `styles.areaSvg` / `styles.accentInk` in `charts.tsx`, and `useId` (already imported there).
- Produces: `export interface DualPoint { label: string; primary: number; secondary: number }` and `export function DualAreaChart({ data, height?, ariaLabel? })`. Task 8 renders it. Also produces two **file-private** helpers, `AccentAreaGradient` and `SeriesPath`, which `AreaChart` is refitted onto in the same task.

Both series scale to the **shared** max — two independently-scaled series would make a small refund column look as tall as a large sales one, which is a lying chart. The primary series keeps `AreaChart`'s accent gradient; the secondary is a stroke-only overlay in `var(--color-error)`.

**Extraction first, then the new chart.** `DualAreaChart` needs `AreaChart`'s gradient and draws two strokes differing only in colour. Copying either would leave three near-identical blocks in one file, so Step 4 extracts both pieces and refits `AreaChart` onto them before Step 6 adds the new chart. The extraction is a pure refactor: `AreaChart`'s rendered output must not change, which is what Step 5 checks.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dashboard)/charts.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DualAreaChart } from './charts';

describe('DualAreaChart', () => {
  it('labels itself for assistive technology', () => {
    render(
      <DualAreaChart
        data={[
          { label: '2026-08-01', primary: 10, secondary: 2 },
          { label: '2026-08-02', primary: 20, secondary: 0 },
        ]}
        ariaLabel="Sales and refunds"
      />,
    );
    expect(screen.getByRole('img', { name: 'Sales and refunds' })).toBeInTheDocument();
  });

  it('draws one path per series', () => {
    const { container } = render(
      <DualAreaChart
        data={[
          { label: 'a', primary: 10, secondary: 2 },
          { label: 'b', primary: 20, secondary: 4 },
        ]}
      />,
    );
    // Area fill + primary stroke + secondary stroke.
    expect(container.querySelectorAll('path')).toHaveLength(3);
  });

  // Two independently-scaled series would draw a 2 as tall as a 20.
  it('scales both series to the shared maximum', () => {
    const { container } = render(
      <DualAreaChart
        data={[
          { label: 'a', primary: 100, secondary: 0 },
          { label: 'b', primary: 100, secondary: 100 },
        ]}
        height={100}
      />,
    );
    const paths = [...container.querySelectorAll('path')];
    const primary = paths[1]?.getAttribute('d') ?? '';
    const secondary = paths[2]?.getAttribute('d') ?? '';
    // The point where both series hit 100 must sit at the same y.
    const primaryTopY = primary.split(/[ML]/).pop()?.split(',')[1];
    const secondaryTopY = secondary.split(/[ML]/).pop()?.split(',')[1];
    expect(primaryTopY).toBe(secondaryTopY);
  });

  it('renders an empty frame rather than crashing on no data', () => {
    const { container } = render(<DualAreaChart data={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- charts`
Expected: FAIL — `DualAreaChart is not exported`.

- [ ] **Step 3: Add the negative ink style**

In `charts.tsx`, inside the existing top-level `stylex.create({ … })`, add next to `accentInk`:

```ts
  // The comparison chart's second series. Semantic, not decorative: it is always
  // the money going back out.
  negativeInk: {
    color: 'var(--color-error)',
  },
```

- [ ] **Step 4: Extract the two shared SVG pieces**

`DualAreaChart` needs `AreaChart`'s gradient and draws two strokes that differ
only in colour. Copying either would be three near-identical blocks in one file,
so extract them **first** and refit `AreaChart` onto them — this step must leave
`AreaChart` rendering byte-identical output.

In `charts.tsx`, insert immediately **before** `AreaChart`:

```tsx
/**
 * The accent gradient both area charts fill under: opaque-ish at the top, clear
 * at the baseline. Rendered inside its own `<defs>` so a caller only has to place
 * it and reference `id`. The colour resolves through `currentColor` off a StyleX
 * `color`, so `light-dark()` tracks the active theme automatically.
 */
function AccentAreaGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop
          offset="0%"
          {...stylex.props(styles.accentInk)}
          stopColor="currentColor"
          stopOpacity={0.32}
        />
        <stop
          offset="100%"
          {...stylex.props(styles.accentInk)}
          stopColor="currentColor"
          stopOpacity={0}
        />
      </linearGradient>
    </defs>
  );
}

/**
 * One plotted series stroke. `ink` is a StyleX style supplying the `color` the
 * stroke reads through `currentColor` — `styles.accentInk` for a primary series,
 * `styles.negativeInk` for a comparison overlay. Renders nothing for an empty
 * path, so callers can pass an unguarded `''`.
 */
function SeriesPath({ d, ink }: { d: string; ink: stylex.StyleXStyles }) {
  if (!d) return null;
  return (
    <path
      d={d}
      fill="none"
      {...stylex.props(ink)}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}
```

Then, inside `AreaChart`'s returned `<svg>`, replace the whole `<defs>…</defs>`
block with `<AccentAreaGradient id={gradientId} />`, and replace the
`{line && (<path d={line} … />)}` block with
`<SeriesPath d={line} ink={styles.accentInk} />`. Leave everything else in
`AreaChart` — including `gradientId` and the area `<path>` — untouched.

- [ ] **Step 5: Verify `AreaChart` still renders identically**

Run: `pnpm --filter @fit/admin test`
Expected: PASS. No existing test may change. If one breaks, the extraction
changed behaviour — fix the extraction, not the test.

- [ ] **Step 6: Add the component**

In `charts.tsx`, insert after `AreaChart`'s closing brace and before the `/* Donut */` divider:

```tsx
/* -------------------------------------------------------------------------- */
/*  DualAreaChart                                                               */
/* -------------------------------------------------------------------------- */

/** One plotted bucket of a {@link DualAreaChart} — two values sharing an x. */
export interface DualPoint {
  label: string;
  primary: number;
  secondary: number;
}

/**
 * Two series over one x-axis, for comparisons where the pair only means anything
 * read together (sales against refunds). The primary series keeps
 * {@link AreaChart}'s gradient-filled accent treatment; the secondary is a
 * stroke-only overlay in the error tone, so it reads as a line laid over the
 * first rather than a second competing area.
 *
 * Both series scale to the SHARED maximum. Scaling each to its own max would draw
 * a trivial refund column exactly as tall as a large sales one — the comparison
 * the chart exists to make would be the one thing it got wrong.
 */
export function DualAreaChart({
  data,
  height = 180,
  ariaLabel = 'Comparison chart',
}: {
  data: DualPoint[];
  height?: number;
  ariaLabel?: string;
}) {
  const width = 640;
  const pad = 8;
  const max = Math.max(1, ...data.flatMap((d) => [d.primary, d.secondary]));
  const n = data.length;

  const project = (value: number, i: number) => ({
    x: n <= 1 ? width / 2 : (i / (n - 1)) * (width - pad * 2) + pad,
    y: height - pad - (value / max) * (height - pad * 2),
  });

  const path = (pick: (d: DualPoint) => number) =>
    data
      .map((d, i) => {
        const p = project(pick(d), i);
        return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');

  const primaryLine = path((d) => d.primary);
  const secondaryLine = path((d) => d.secondary);
  const firstX = data.length > 0 ? project(0, 0).x : 0;
  const lastX = data.length > 0 ? project(0, data.length - 1).x : 0;
  const primaryArea =
    data.length > 0
      ? `${primaryLine} L${lastX.toFixed(1)},${height - pad} L${firstX.toFixed(1)},${height - pad} Z`
      : '';

  // `useId()` yields a document-unique, SSR-safe id; strip the framework's `:`
  // delimiters so it is a valid `url(#…)` fragment reference.
  const gradientId = `dual-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      {...stylex.props(styles.areaSvg)}
      style={{ height }}
    >
      <AccentAreaGradient id={gradientId} />
      {primaryArea && <path d={primaryArea} fill={`url(#${gradientId})`} stroke="none" />}
      <SeriesPath d={primaryLine} ink={styles.accentInk} />
      <SeriesPath d={secondaryLine} ink={styles.negativeInk} />
    </svg>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @fit/admin test -- charts`
Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
git add "apps/admin/app/(dashboard)/charts.tsx" "apps/admin/app/(dashboard)/charts.test.tsx"
git commit -m "feat(admin): add DualAreaChart for the sales-vs-refunds trend"
```

---

### Task 5: The admin data layer

**Files:**

- Modify: `apps/admin/lib/api.ts` (add after `fetchDashboardSegment`, around line 1680)
- Create: `apps/admin/app/(dashboard)/sales/actions.ts`

**Interfaces:**

- Consumes: `DashboardSalesQuery`, `DashboardSalesResponse` (Task 1); the existing `apiBaseUrl()`, `authHeaders()`, `unwrap()`, `ApiError` helpers in `api.ts`; `getServerSession`, `Permission`, `roleHasPermission`.
- Produces: `fetchDashboardSales(query: DashboardSalesQuery): Promise<DashboardSalesResponse>` and `loadSalesAction(query: DashboardSalesQuery): Promise<ActionResult<DashboardSalesResponse>>` where `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`. Task 10 calls `loadSalesAction`.

- [ ] **Step 1: Add the fetch helper**

In `apps/admin/lib/api.ts`, add `DashboardSalesQuery` and `DashboardSalesResponse` to the existing `@fit/types` type import block, then append after `fetchDashboardSegment`:

```ts
/**
 * `GET /dashboard/sales` — the hand-built Sales tab in one payload. Both params
 * scope the whole response, so the tab never shows two cards describing different
 * windows; the API `.catch`es unknown values to its own defaults.
 */
export async function fetchDashboardSales(
  query: DashboardSalesQuery,
): Promise<DashboardSalesResponse> {
  const qs = new URLSearchParams({
    granularity: query.granularity,
    productType: query.productType,
  });
  const res = await fetch(`${apiBaseUrl()}/dashboard/sales?${qs.toString()}`, {
    headers: await authHeaders(),
    // Sales figures reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardSalesResponse>(res);
}
```

- [ ] **Step 2: Add the server action**

Create `apps/admin/app/(dashboard)/sales/actions.ts`:

```ts
'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  dashboardSalesQuerySchema,
  type DashboardSalesQuery,
  type DashboardSalesResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardSales } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Load the whole Sales tab. Re-asserts the reporting capability first: the
 * middleware gates the route, but a Server Action is a POST endpoint in its own
 * right — defence in depth ahead of the API's own guard. Errors come back as a
 * message so a failed load stays local to the tab.
 */
export async function loadSalesAction(
  query: DashboardSalesQuery,
): Promise<ActionResult<DashboardSalesResponse>> {
  const t = await getTranslations('admin.dashboard.sales');
  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.ReportView)) {
    return { ok: false, error: t('loadError') };
  }
  try {
    // Re-parsed rather than trusted: the argument crosses a network boundary
    // like any other request body, so it is validated here as well as API-side.
    return { ok: true, data: await fetchDashboardSales(dashboardSalesQuerySchema.parse(query)) };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @fit/admin type-check`
Expected: exit 0. (`t('loadError')` resolves once Task 6 adds the key; next-intl types are not compile-checked here, so this passes.)

- [ ] **Step 4: Commit**

```bash
git add apps/admin/lib/api.ts "apps/admin/app/(dashboard)/sales/actions.ts"
git commit -m "feat(admin): add the Sales tab data layer"
```

---

### Task 6: Copy

**Files:**

- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/ka.json`

**Interfaces:**

- Produces: the `admin.dashboard.sales.*` namespace every component in Tasks 7–10 reads via `useTranslations('admin.dashboard.sales')`.

- [ ] **Step 1: Add the English copy**

In `packages/i18n/locales/en.json`, inside `admin.dashboard`, add a `"sales"` key after `"segments"`:

```json
"sales": {
  "granularityLabel": "Granularity",
  "granularity": { "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly" },
  "window": {
    "daily": "Last 30 days",
    "weekly": "Last 12 weeks",
    "monthly": "Last 12 months"
  },
  "productTypeLabel": "Product type",
  "productType": {
    "all": "All sales",
    "memberships": "Memberships",
    "session-packs": "Class & PT packs",
    "retail": "Retail & POS"
  },
  "kpi": {
    "grossSales": "Gross sales",
    "netSales": "Net sales",
    "refunded": "Refunded",
    "avgSale": "Avg sale"
  },
  "kpiCaption": "{window} · {productType} · captured payments only — subscription renewals bill separately.",
  "refundedHint": "Against sales in this window",
  "trend": {
    "title": "Revenue over time",
    "caption": "{window} · {productType} · {total} net",
    "chartAria": "Net revenue per period",
    "empty": "No revenue in this window."
  },
  "vsRefunds": {
    "title": "New sales vs refunds",
    "caption": "Each dated by when it was taken",
    "chartAria": "Sales against refunds per period",
    "sales": "Sales",
    "refunds": "Refunds",
    "empty": "No sales or refunds in this window."
  },
  "method": {
    "title": "Sales by payment method",
    "share": "POS {pos}% · Online {online}%",
    "channel": { "pos": "POS", "online": "Online" },
    "name": { "cash": "Cash", "card": "Card", "member-account": "Member account" },
    "row": "{channel} · {name}",
    "empty": "No payments in this window."
  },
  "topSellers": {
    "title": "Top sellers",
    "orders": "{count, plural, one {# order} other {# orders}}",
    "empty": "Nothing sold in this window."
  },
  "loadError": "Couldn't load sales.",
  "retry": "Retry"
}
```

- [ ] **Step 2: Add the Georgian copy**

In `packages/i18n/locales/ka.json`, inside `admin.dashboard`, add the matching `"sales"` key after `"segments"`:

```json
"sales": {
  "granularityLabel": "დეტალურობა",
  "granularity": { "daily": "დღიური", "weekly": "კვირეული", "monthly": "თვიური" },
  "window": {
    "daily": "ბოლო 30 დღე",
    "weekly": "ბოლო 12 კვირა",
    "monthly": "ბოლო 12 თვე"
  },
  "productTypeLabel": "პროდუქტის ტიპი",
  "productType": {
    "all": "ყველა გაყიდვა",
    "memberships": "აბონემენტები",
    "session-packs": "ჯგუფური და PT პაკეტები",
    "retail": "მაღაზია და სალარო"
  },
  "kpi": {
    "grossSales": "მთლიანი გაყიდვები",
    "netSales": "წმინდა გაყიდვები",
    "refunded": "დაბრუნებული",
    "avgSale": "საშუალო ჩეკი"
  },
  "kpiCaption": "{window} · {productType} · მხოლოდ ჩარიცხული გადახდები — აბონემენტის განახლებები ცალკე ბილინგდება.",
  "refundedHint": "ამ პერიოდის გაყიდვებიდან",
  "trend": {
    "title": "შემოსავალი დროში",
    "caption": "{window} · {productType} · წმინდა {total}",
    "chartAria": "წმინდა შემოსავალი პერიოდების მიხედვით",
    "empty": "ამ პერიოდში შემოსავალი არ დაფიქსირებულა."
  },
  "vsRefunds": {
    "title": "ახალი გაყიდვები და დაბრუნებები",
    "caption": "თითოეული თავისი თარიღით",
    "chartAria": "გაყიდვები დაბრუნებების ფონზე, პერიოდების მიხედვით",
    "sales": "გაყიდვები",
    "refunds": "დაბრუნებები",
    "empty": "ამ პერიოდში არც გაყიდვა და არც დაბრუნება არ დაფიქსირებულა."
  },
  "method": {
    "title": "გაყიდვები გადახდის მეთოდით",
    "share": "სალარო {pos}% · ონლაინ {online}%",
    "channel": { "pos": "სალარო", "online": "ონლაინ" },
    "name": { "cash": "ნაღდი", "card": "ბარათი", "member-account": "წევრის ანგარიში" },
    "row": "{channel} · {name}",
    "empty": "ამ პერიოდში გადახდა არ დაფიქსირებულა."
  },
  "topSellers": {
    "title": "ლიდერი პოზიციები",
    "orders": "{count, plural, one {# შეკვეთა} other {# შეკვეთა}}",
    "empty": "ამ პერიოდში არაფერი გაყიდულა."
  },
  "loadError": "გაყიდვების ჩატვირთვა ვერ მოხერხდა.",
  "retry": "ხელახლა"
}
```

- [ ] **Step 3: Verify both catalogues parse and match**

Run:

```bash
node -e "
const en = require('./packages/i18n/locales/en.json').admin.dashboard.sales;
const ka = require('./packages/i18n/locales/ka.json').admin.dashboard.sales;
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  typeof v === 'object' ? flat(v, p + k + '.') : [p + k]);
const a = flat(en).sort(), b = flat(ka).sort();
if (JSON.stringify(a) !== JSON.stringify(b)) {
  console.error('KEY MISMATCH');
  console.error('en only:', a.filter(k => !b.includes(k)));
  console.error('ka only:', b.filter(k => !a.includes(k)));
  process.exit(1);
}
console.log('OK', a.length, 'keys in both locales');
"
```

Expected: `OK 34 keys in both locales`.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(i18n): add the Sales dashboard tab copy"
```

---

### Task 7: The KPI strip

**Files:**

- Create: `apps/admin/app/(dashboard)/sales/sales-kpi-strip.tsx`

**Interfaces:**

- Consumes: `SalesKpis`, `SalesGranularity`, `SalesProductType` (Task 1); the `admin.dashboard.sales` i18n namespace (Task 6).
- Produces: `export function SalesKpiStrip({ kpis, granularity, productType, money }: { kpis: SalesKpis; granularity: SalesGranularity; productType: SalesProductType; money: Intl.NumberFormat })`. Task 10 renders it.

The visual treatment is `overview/metric-strip.tsx`'s: one bordered container, a 1px grid gap showing the container's border through, each cell repainting the surface. Do not reach for four separate `Card`s.

- [ ] **Step 1: Write the component**

Create `apps/admin/app/(dashboard)/sales/sales-kpi-strip.tsx`:

```tsx
'use client';

// The Sales tab's four numbers, in one container — `overview/metric-strip.tsx`'s
// treatment, at four cells instead of nine.
//
// The hairlines are the 1px grid gap showing the container's border colour
// through, with each cell painting over it with the surface colour. That is
// correct at every column count, unlike per-cell borders reset on `:first-child`.
//
// The caption is load-bearing, not decoration: it states the window, the filter,
// and that these are captured payments only. Without it "Net sales" reads as the
// gym's total revenue, which it is not — subscription renewals bill through
// `Invoice` and never raise a payment.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { SalesGranularity, SalesKpis, SalesProductType } from '@fit/types';

const styles = stylex.create({
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  strip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-outer)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-surface)',
  },
  grid: {
    display: 'grid',
    gap: '1px',
    backgroundColor: 'var(--color-border)',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem 1rem',
    backgroundColor: 'var(--color-surface)',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  value: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  hint: {
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  caption: {
    margin: 0,
    paddingInline: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The tiles, in reading order. `hint` marks the one that needs a qualifier. */
const TILES = [
  { key: 'grossSales', hint: false },
  { key: 'netSales', hint: false },
  { key: 'refunded', hint: true },
  { key: 'avgSale', hint: false },
] as const satisfies readonly { key: keyof SalesKpis; hint: boolean }[];

export function SalesKpiStrip({
  kpis,
  granularity,
  productType,
  money,
}: {
  kpis: SalesKpis;
  granularity: SalesGranularity;
  productType: SalesProductType;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.sales');

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((tile) => (
            <div key={tile.key} {...stylex.props(styles.cell)}>
              <span {...stylex.props(styles.label)}>{t(`kpi.${tile.key}`)}</span>
              {/* Money is carried in MINOR units; the strip shows major units. */}
              <span {...stylex.props(styles.value)}>{money.format(kpis[tile.key] / 100)}</span>
              {tile.hint ? <span {...stylex.props(styles.hint)}>{t('refundedHint')}</span> : null}
            </div>
          ))}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', {
          window: t(`window.${granularity}`),
          productType: t(`productType.${productType}`),
        })}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @fit/admin type-check`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/(dashboard)/sales/sales-kpi-strip.tsx"
git commit -m "feat(admin): add the Sales KPI strip"
```

---

### Task 8: The two trend cards

**Files:**

- Create: `apps/admin/app/(dashboard)/sales/sales-trend-card.tsx`
- Create: `apps/admin/app/(dashboard)/sales/sales-vs-refunds-card.tsx`

**Interfaces:**

- Consumes: `AreaChart` / `AreaPoint` and `DualAreaChart` / `DualPoint` from `../charts` (Task 4); `EmptyState` from `../overview/format`; `SALES_GRANULARITIES`, `SALES_PRODUCT_TYPES` and the response types (Task 1); `Card` from `@astryxdesign/core/Card`, `SegmentedControl` / `SegmentedControlItem` from `@astryxdesign/core/SegmentedControl`.
- Produces:
  - `SalesTrendCard({ points, granularity, productType, total, money, onSelectGranularity, onSelectProductType, disabled })` where `points: ReportSeriesPoint[]`, `total: number` (minor units), the two `onSelect*` are `(next: SalesGranularity) => void` / `(next: SalesProductType) => void`.
  - `SalesVsRefundsCard({ points, money })` where `points: SalesComparisonPoint[]`.

Both controls live in the trend card's header but are **lifted** to `SalesView` (Task 10) — they scope the whole tab.

The x-axis labels are `YYYY-MM-DD` bucket starts. Rendering all thirty would be unreadable, so the axis row shows the first and last only; the chart itself carries the shape.

- [ ] **Step 1: Write the trend card**

Create `apps/admin/app/(dashboard)/sales/sales-trend-card.tsx`:

```tsx
'use client';

// Revenue over time — and the tab's two controls.
//
// The controls live here (this is the card they most obviously belong to) but
// their state is lifted to `SalesView`: both scope the WHOLE tab. Scoping them to
// this card alone would leave the KPI strip describing one window and this chart
// another, and the two sets of numbers would not reconcile.
//
// The x-axis shows the first and last bucket only. Thirty `YYYY-MM-DD` labels in
// a 640-unit viewBox is an unreadable smear; the chart carries the shape and the
// caption carries the total.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import {
  SALES_GRANULARITIES,
  SALES_PRODUCT_TYPES,
  type ReportSeriesPoint,
  type SalesGranularity,
  type SalesProductType,
} from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
});

export function SalesTrendCard({
  points,
  granularity,
  productType,
  total,
  money,
  onSelectGranularity,
  onSelectProductType,
  disabled,
}: {
  points: ReportSeriesPoint[];
  granularity: SalesGranularity;
  productType: SalesProductType;
  /** Net revenue across the window, MINOR units. */
  total: number;
  money: Intl.NumberFormat;
  onSelectGranularity: (next: SalesGranularity) => void;
  onSelectProductType: (next: SalesProductType) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units.
  const data: AreaPoint[] = points.map((point) => ({
    label: point.label,
    value: point.value / 100,
  }));
  const hasData = data.some((point) => point.value !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('trend.title')}</h2>
          <p {...stylex.props(styles.caption)}>
            {t('trend.caption', {
              window: t(`window.${granularity}`),
              productType: t(`productType.${productType}`),
              total: money.format(total / 100),
            })}
          </p>
        </div>
        <div {...stylex.props(styles.controls)}>
          <SegmentedControl
            value={granularity}
            onChange={(next) => onSelectGranularity(next as SalesGranularity)}
            label={t('granularityLabel')}
            size="sm"
            isDisabled={disabled}
          >
            {SALES_GRANULARITIES.map((value) => (
              <SegmentedControlItem key={value} value={value} label={t(`granularity.${value}`)} />
            ))}
          </SegmentedControl>
          <SegmentedControl
            value={productType}
            onChange={(next) => onSelectProductType(next as SalesProductType)}
            label={t('productTypeLabel')}
            size="sm"
            isDisabled={disabled}
          >
            {SALES_PRODUCT_TYPES.map((value) => (
              <SegmentedControlItem key={value} value={value} label={t(`productType.${value}`)} />
            ))}
          </SegmentedControl>
        </div>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('trend.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
        </>
      ) : (
        <EmptyState>{t('trend.empty')}</EmptyState>
      )}
    </Card>
  );
}

/** A `YYYY-MM-DD` bucket start as a locale short date. UTC in, UTC out. */
export function formatBucket(locale: string, bucket: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${bucket}T00:00:00.000Z`));
}
```

- [ ] **Step 2: Write the comparison card**

Create `apps/admin/app/(dashboard)/sales/sales-vs-refunds-card.tsx`:

```tsx
'use client';

// New sales against refunds, over the tab's window.
//
// Both series are dated by when the money actually moved: sales by the payment's
// `createdAt`, refunds by the refund's own. That is deliberately NOT how the
// "Refunded" KPI is computed (it sums this window's payments' running refunded
// totals), so the two can legitimately differ. The caption says which this is.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { SalesComparisonPoint } from '@fit/types';
import { DualAreaChart, type DualPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from './sales-trend-card';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: { marginBottom: '1rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  legend: {
    display: 'flex',
    gap: '1rem',
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '0.375rem' },
  swatch: { width: '0.75rem', height: '0.1875rem', borderRadius: 'var(--radius-full)' },
  swatchSales: { backgroundColor: 'var(--color-accent)' },
  swatchRefunds: { backgroundColor: 'var(--color-error)' },
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
});

export function SalesVsRefundsCard({ points }: { points: SalesComparisonPoint[] }) {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units.
  const data: DualPoint[] = points.map((point) => ({
    label: point.label,
    primary: point.sales / 100,
    secondary: point.refunds / 100,
  }));
  const hasData = data.some((point) => point.primary !== 0 || point.secondary !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('vsRefunds.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('vsRefunds.caption')}</p>
      </div>

      {hasData ? (
        <>
          <DualAreaChart data={data} ariaLabel={t('vsRefunds.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchSales)} aria-hidden="true" />
              {t('vsRefunds.sales')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchRefunds)} aria-hidden="true" />
              {t('vsRefunds.refunds')}
            </span>
          </div>
        </>
      ) : (
        <EmptyState>{t('vsRefunds.empty')}</EmptyState>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @fit/admin type-check`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(dashboard)/sales/sales-trend-card.tsx" "apps/admin/app/(dashboard)/sales/sales-vs-refunds-card.tsx"
git commit -m "feat(admin): add the Sales trend cards"
```

---

### Task 9: The two rail cards

**Files:**

- Create: `apps/admin/app/(dashboard)/sales/payment-method-card.tsx`
- Create: `apps/admin/app/(dashboard)/sales/top-sellers-card.tsx`

**Interfaces:**

- Consumes: `BarChart` / `BarDatum` from `../charts`; `SalesMethodSlice`, `SalesTopSeller` (Task 1).
- Produces: `PaymentMethodCard({ slices, money })` and `TopSellersCard({ rows, money })`.

- [ ] **Step 1: Write the payment-method card**

Create `apps/admin/app/(dashboard)/sales/payment-method-card.tsx`:

```tsx
'use client';

// Takings by channel × method.
//
// Channel comes from `Payment.provider` — the till stamps `"pos"`, the online
// wizard and shop stamp a gateway key — so "POS vs online" is a real distinction
// here, not an inference from the settlement method. `CARD` occurs in both
// channels, which is exactly why the two axes are shown together rather than
// collapsed into one.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { SalesMethodSlice } from '@fit/types';
import { BarChart, type BarDatum } from '../charts';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  share: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function PaymentMethodCard({
  slices,
  money,
}: {
  slices: SalesMethodSlice[];
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.sales');

  const data: BarDatum[] = slices.map((slice) => ({
    label: t('method.row', {
      channel: t(`method.channel.${slice.channel}`),
      name: t(`method.name.${slice.method}`),
    }),
    // Money is carried in MINOR units; the bars plot major units.
    value: slice.value / 100,
  }));

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const pos = slices
    .filter((slice) => slice.channel === 'pos')
    .reduce((sum, slice) => sum + slice.value, 0);
  // An all-zero window would divide by zero; the share line is simply omitted,
  // because "POS 0% · Online 0%" states a split that does not exist.
  const posShare = total === 0 ? null : Math.round((pos / total) * 100);

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{t('method.title')}</h2>
      {posShare !== null ? (
        <p {...stylex.props(styles.share)}>
          {t('method.share', { pos: posShare, online: 100 - posShare })}
        </p>
      ) : null}
      <BarChart
        data={data}
        formatValue={(value) => money.format(value)}
        emptyLabel={t('method.empty')}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Write the top-sellers card**

Create `apps/admin/app/(dashboard)/sales/top-sellers-card.tsx`:

```tsx
'use client';

// The window's best-selling lines, ranked.
//
// Rows are `OrderItem.label`s snapshotted at sale time, so a renamed plan does
// not rewrite past sales — the label is what was actually rung up. Discount and
// promo lines (negative amounts) never appear: they are adjustments, not products.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { SalesTopSeller } from '@fit/types';
import { EmptyState } from '../overview/format';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '0.625rem', margin: 0, padding: 0 },
  row: {
    display: 'grid',
    gridTemplateColumns: '1.25rem minmax(0, 1fr) auto',
    alignItems: 'baseline',
    gap: '0.625rem',
  },
  rank: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-disabled)',
  },
  name: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  orders: {
    display: 'block',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  value: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
});

export function TopSellersCard({
  rows,
  money,
}: {
  rows: SalesTopSeller[];
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.sales');

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{t('topSellers.title')}</h2>
      {rows.length === 0 ? (
        <EmptyState>{t('topSellers.empty')}</EmptyState>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {rows.map((row, index) => (
            <li key={row.label} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rank)}>{index + 1}</span>
              <span>
                <span {...stylex.props(styles.name)} title={row.label}>
                  {row.label}
                </span>
                <span {...stylex.props(styles.orders)}>
                  {t('topSellers.orders', { count: row.orders })}
                </span>
              </span>
              {/* Money is carried in MINOR units; the list shows major units. */}
              <span {...stylex.props(styles.value)}>{money.format(row.value / 100)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @fit/admin type-check`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(dashboard)/sales/payment-method-card.tsx" "apps/admin/app/(dashboard)/sales/top-sellers-card.tsx"
git commit -m "feat(admin): add the Sales rail cards"
```

---

### Task 10: `SalesView`

**Files:**

- Create: `apps/admin/app/(dashboard)/sales/sales-view.tsx`
- Create: `apps/admin/app/(dashboard)/sales/sales-view.test.tsx`

**Interfaces:**

- Consumes: everything from Tasks 5, 7, 8, 9.
- Produces: `export function SalesView()` — takes no props; it owns its own controls and fetch. Task 11 renders it.

The layout is `overview/overview-view.tsx`'s work-area grid, verbatim: main column + rail that sticks above 1280px. The fetch/cache/retry shape is `segments/segment-panel.tsx`'s: a `useRef` `Map` cache keyed on the composite of both controls, a skeleton on first load, an inline `role="alert"` + Retry on failure, and a Retry that deletes only its own cache entry.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dashboard)/sales/sales-view.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardSalesResponse } from '@fit/types';

const loadSalesAction = vi.fn();
vi.mock('./actions', () => ({
  loadSalesAction: (...args: unknown[]): unknown => loadSalesAction(...args) as unknown,
}));

const { SalesView } = await import('./sales-view');

const messages = {
  admin: {
    dashboard: {
      sales: {
        granularityLabel: 'Granularity',
        granularity: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' },
        window: { daily: 'Last 30 days', weekly: 'Last 12 weeks', monthly: 'Last 12 months' },
        productTypeLabel: 'Product type',
        productType: {
          all: 'All sales',
          memberships: 'Memberships',
          'session-packs': 'Class & PT packs',
          retail: 'Retail & POS',
        },
        kpi: {
          grossSales: 'Gross sales',
          netSales: 'Net sales',
          refunded: 'Refunded',
          avgSale: 'Avg sale',
        },
        kpiCaption: '{window} · {productType}',
        refundedHint: 'Against sales in this window',
        trend: {
          title: 'Revenue over time',
          caption: '{window} · {productType} · {total} net',
          chartAria: 'Net revenue per period',
          empty: 'No revenue in this window.',
        },
        vsRefunds: {
          title: 'New sales vs refunds',
          caption: 'Each dated by when it was taken',
          chartAria: 'Sales against refunds per period',
          sales: 'Sales',
          refunds: 'Refunds',
          empty: 'No sales or refunds in this window.',
        },
        method: {
          title: 'Sales by payment method',
          share: 'POS {pos}% · Online {online}%',
          channel: { pos: 'POS', online: 'Online' },
          name: { cash: 'Cash', card: 'Card', 'member-account': 'Member account' },
          row: '{channel} · {name}',
          empty: 'No payments in this window.',
        },
        topSellers: {
          title: 'Top sellers',
          orders: '{count, plural, one {# order} other {# orders}}',
          empty: 'Nothing sold in this window.',
        },
        loadError: "Couldn't load sales.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardSalesResponse> = {}): DashboardSalesResponse {
  return {
    granularity: 'daily',
    productType: 'all',
    currency: 'GEL',
    kpis: { grossSales: 16_000, netSales: 14_000, refunded: 2_000, avgSale: 7_000 },
    revenueOverTime: [
      { label: '2026-08-01', value: 9_000 },
      { label: '2026-08-02', value: 5_000 },
    ],
    salesVsRefunds: [
      { label: '2026-08-01', sales: 10_000, refunds: 0 },
      { label: '2026-08-02', sales: 6_000, refunds: 2_000 },
    ],
    byPaymentMethod: [{ channel: 'pos', method: 'cash', value: 14_000 }],
    topSellers: [{ label: 'Premium', orders: 2, value: 14_000 }],
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SalesView />
    </NextIntlClientProvider>,
  );
}

describe('SalesView', () => {
  beforeEach(() => {
    loadSalesAction.mockReset();
    loadSalesAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('fetches with the defaults and renders every card', async () => {
    renderView();

    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
    expect(screen.getByText('New sales vs refunds')).toBeInTheDocument();
    expect(screen.getByText('Sales by payment method')).toBeInTheDocument();
    expect(screen.getByText('Top sellers')).toBeInTheDocument();
    expect(screen.getByText('Gross sales')).toBeInTheDocument();
    expect(loadSalesAction).toHaveBeenCalledWith({ granularity: 'daily', productType: 'all' });
  });

  it('refetches when the granularity changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Revenue over time');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));

    await waitFor(() =>
      expect(loadSalesAction).toHaveBeenCalledWith({
        granularity: 'monthly',
        productType: 'all',
      }),
    );
  });

  it('refetches when the product type changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Revenue over time');

    await user.click(screen.getByRole('radio', { name: 'Memberships' }));

    await waitFor(() =>
      expect(loadSalesAction).toHaveBeenCalledWith({
        granularity: 'daily',
        productType: 'memberships',
      }),
    );
  });

  // The cache is what makes flipping between two combinations feel instant.
  it('serves a revisited combination from cache without a second call', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Revenue over time');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));
    await waitFor(() => expect(loadSalesAction).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('radio', { name: 'Daily' }));
    await waitFor(() => expect(screen.getByText('Revenue over time')).toBeInTheDocument());
    expect(loadSalesAction).toHaveBeenCalledTimes(2);
  });

  it('shows an alert and a working retry when the load fails', async () => {
    const user = userEvent.setup();
    loadSalesAction.mockResolvedValueOnce({ ok: false, error: "Couldn't load sales." });
    renderView();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load sales.");

    loadSalesAction.mockResolvedValue({ ok: true, data: response() });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
  });

  it('shows each card its own empty state', async () => {
    loadSalesAction.mockResolvedValue({
      ok: true,
      data: response({
        kpis: { grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 },
        revenueOverTime: [{ label: '2026-08-01', value: 0 }],
        salesVsRefunds: [{ label: '2026-08-01', sales: 0, refunds: 0 }],
        byPaymentMethod: [],
        topSellers: [],
      }),
    });
    renderView();

    expect(await screen.findByText('No revenue in this window.')).toBeInTheDocument();
    expect(screen.getByText('No sales or refunds in this window.')).toBeInTheDocument();
    expect(screen.getByText('No payments in this window.')).toBeInTheDocument();
    expect(screen.getByText('Nothing sold in this window.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- sales-view`
Expected: FAIL — cannot resolve `./sales-view`.

- [ ] **Step 3: Write the view**

Create `apps/admin/app/(dashboard)/sales/sales-view.tsx`:

```tsx
'use client';

// The Sales tab.
//
// Laid out on the Overview's own work-area grid — a main column carrying the two
// trends and a rail that sticks on wide screens carrying the snapshots — so the
// two tabs read as one dashboard rather than two designs.
//
// Both controls are owned HERE, not by the card that displays them: they scope
// the whole tab, and one round trip recomputes everything. A per-card fetch could
// leave the KPI strip describing one window while the chart beneath it described
// another, and the numbers would not reconcile.
//
// Fetch/cache/retry follows `segments/segment-panel.tsx`: responses are cached by
// the composite of both controls for the page's life, so flipping back to a
// visited combination is instant; a failure is an inline alert scoped to the tab,
// and Retry drops only its own cache entry.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import {
  DEFAULT_SALES_GRANULARITY,
  DEFAULT_SALES_PRODUCT_TYPE,
  type DashboardSalesResponse,
  type SalesGranularity,
  type SalesProductType,
} from '@fit/types';
import { loadSalesAction } from './actions';
import { SalesKpiStrip } from './sales-kpi-strip';
import { SalesTrendCard } from './sales-trend-card';
import { SalesVsRefundsCard } from './sales-vs-refunds-card';
import { PaymentMethodCard } from './payment-method-card';
import { TopSellersCard } from './top-sellers-card';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  workArea: {
    display: 'grid',
    gap: '1.5rem',
    alignItems: 'start',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'minmax(0, 2.2fr) minmax(280px, 1fr)',
    },
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    // `minWidth: 0` stops a wide chart from forcing the grid track wider than its
    // share — the standard grid-blowout guard.
    minWidth: 0,
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minWidth: 0,
    position: {
      default: 'static',
      '@media (min-width: 1280px)': 'sticky',
    },
    // Clears the console's fixed chrome, then a little breathing room.
    top: '5rem',
    maxHeight: {
      default: 'none',
      '@media (min-width: 1280px)': 'calc(100dvh - 6rem)',
    },
    overflowY: {
      default: 'visible',
      '@media (min-width: 1280px)': 'auto',
    },
  },
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '3rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  skeleton: {
    height: '24rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-surface-muted)',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
});

export function SalesView() {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  const [granularity, setGranularity] = useState<SalesGranularity>(DEFAULT_SALES_GRANULARITY);
  const [productType, setProductType] = useState<SalesProductType>(DEFAULT_SALES_PRODUCT_TYPE);

  // Cached responses survive re-renders and control changes for the page's life.
  const cache = useRef(new Map<string, DashboardSalesResponse>());
  const [data, setData] = useState<DashboardSalesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = `${granularity}:${productType}`;

  useEffect(() => {
    const cached = cache.current.get(key);
    if (cached) {
      setData(cached);
      setError(null);
      setPending(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setPending(true);
    void loadSalesAction({ granularity, productType }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        cache.current.set(key, result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
    // `attempt` is in the deps purely to force a re-run on retry; the cache
    // bypass itself comes from `retry` deleting this key first.
  }, [key, granularity, productType, attempt]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data?.currency ?? 'USD',
        maximumFractionDigits: 0,
      }),
    [data?.currency, locale],
  );

  /**
   * Retry the combination currently on screen. Deleting its own cache entry
   * scopes the bypass to THIS combination — every other cached response stays.
   */
  const retry = useCallback(() => {
    cache.current.delete(key);
    setAttempt((n) => n + 1);
  }, [key]);

  if (error !== null) {
    return (
      <div role="alert" {...stylex.props(styles.status)}>
        <span>{error}</span>
        <Button variant="secondary" size="sm" label={t('retry')} onClick={retry} />
      </div>
    );
  }

  if (data === null) {
    return <div {...stylex.props(styles.skeleton)} aria-hidden="true" />;
  }

  const netTotal = data.revenueOverTime.reduce((sum, point) => sum + point.value, 0);

  return (
    <div {...stylex.props(styles.page, pending && styles.pending)}>
      <SalesKpiStrip
        kpis={data.kpis}
        granularity={data.granularity}
        productType={data.productType}
        money={money}
      />

      <div {...stylex.props(styles.workArea)}>
        <div {...stylex.props(styles.column)}>
          <SalesTrendCard
            points={data.revenueOverTime}
            granularity={granularity}
            productType={productType}
            total={netTotal}
            money={money}
            onSelectGranularity={setGranularity}
            onSelectProductType={setProductType}
            disabled={pending}
          />
          <SalesVsRefundsCard points={data.salesVsRefunds} />
        </div>

        {/*
          The rail is the snapshots — how the money arrived and what sold. It
          sticks on wide screens so scrolling the trends never scrolls the
          breakdown off the page.
        */}
        <div {...stylex.props(styles.rail)}>
          <PaymentMethodCard slices={data.byPaymentMethod} money={money} />
          <TopSellersCard rows={data.topSellers} money={money} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/admin test -- sales-view`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(dashboard)/sales/sales-view.tsx" "apps/admin/app/(dashboard)/sales/sales-view.test.tsx"
git commit -m "feat(admin): assemble the Sales tab view"
```

---

### Task 11: Flip the tab over

**Files:**

- Modify: `packages/types/src/dashboard-segments.ts` (lines 28–46 and the Sales catalogue entries, lines 74–95)
- Modify: `packages/types/src/dashboard-segments.spec.ts`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segment-panel.test.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx`
- Modify: `apps/api/src/dashboard/dashboard-segments.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`

**Interfaces:**

- Consumes: `SalesView` (Task 10).
- Produces: a `sales` tab that renders `SalesView`; `CONFIGURABLE_DASHBOARD_SEGMENTS` reduced to four entries.

**Why the test churn.** Every one of those specs uses `'sales'` as its example segment, purely because it was first in the list. They must move to `'members'` (two widgets: `members.new-signups`, `members.churn`). This is mechanical but must be done in the same commit as the catalogue change, or the suite is red between commits.

**Why `sales` must stay in `DASHBOARD_SEGMENTS`.** That constant is currently `['overview', ...CONFIGURABLE_DASHBOARD_SEGMENTS]`. Removing `sales` from the configurable list would silently remove the tab from the bar, so the constant becomes explicit.

- [ ] **Step 1: Update the catalogue**

In `packages/types/src/dashboard-segments.ts`, change the segment constants:

```ts
/**
 * The segments whose widget set a gym can choose. Extend this list to add a
 * segment (e.g. `leads` once CRM ships) — no migration, because the stored rows
 * carry the segment as a plain string.
 *
 * `sales` is deliberately absent: it is a hand-built view
 * (`admin/app/(dashboard)/sales/sales-view.tsx`) with its own controls, like
 * `overview`, so there is nothing for the picker to configure. Stored
 * `DashboardWidget` rows naming the retired `sales.*` keys are harmless — the
 * keys are plain strings and `findDashboardWidget` already returns `undefined`
 * for a key the catalogue no longer defines.
 */
export const CONFIGURABLE_DASHBOARD_SEGMENTS = ['members', 'revenue', 'classes', 'staff'] as const;

export const configurableDashboardSegmentSchema = z.enum(CONFIGURABLE_DASHBOARD_SEGMENTS);
export type ConfigurableDashboardSegment = z.infer<typeof configurableDashboardSegmentSchema>;

/**
 * Every dashboard tab, in display order. `overview` and `sales` are the two
 * hand-built views and are listed explicitly; the rest come from the configurable
 * list, so adding a segment there still adds its tab.
 */
export const DASHBOARD_SEGMENTS = [
  'overview',
  'sales',
  ...CONFIGURABLE_DASHBOARD_SEGMENTS,
] as const;
```

Then delete the three Sales catalogue entries (the `// Sales` comment through the `sales.top-plans` object), so `DASHBOARD_WIDGET_CATALOG` now begins at `// Members`.

- [ ] **Step 2: Update the contract spec**

In `packages/types/src/dashboard-segments.spec.ts`, replace the `widgetsForSegment('sales')` assertion (around line 48) with:

```ts
expect(widgetsForSegment('members').map((widget) => widget.key)).toEqual([
  'members.new-signups',
  'members.churn',
]);
```

Then add, in the same `describe`:

```ts
// `sales` is a hand-built view now, so the picker must not offer it — while the
// tab bar must still show it.
it('keeps sales out of the configurable segments but in the tab bar', () => {
  expect(CONFIGURABLE_DASHBOARD_SEGMENTS).not.toContain('sales');
  expect(DASHBOARD_SEGMENTS).toContain('sales');
  expect(DASHBOARD_SEGMENTS[1]).toBe('sales');
});

it('no longer defines any sales widget', () => {
  expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('sales.'))).toBe(false);
  expect(findDashboardWidget('sales.top-plans')).toBeUndefined();
});
```

Add `CONFIGURABLE_DASHBOARD_SEGMENTS`, `DASHBOARD_SEGMENTS`, `DASHBOARD_WIDGET_CATALOG` and `findDashboardWidget` to the file's import list if they are not already there.

- [ ] **Step 3: Run the contract tests**

Run: `pnpm --filter @fit/types test`
Expected: PASS.

- [ ] **Step 4: Update the API specs**

In `apps/api/src/dashboard/dashboard-segments.service.spec.ts`, replace every `'sales'` segment argument with `'members'` and every `sales.*` widget key with its members equivalent:

- `service.get('sales', '7d')` → `service.get('members', '7d')`
- the default-selection assertion `['sales.payment-method', 'sales.top-products', 'sales.top-plans']` → `['members.new-signups', 'members.churn']`
- stored-selection rows `{ widgetKey: 'sales.top-plans' }, { widgetKey: 'sales.payment-method' }` → `{ widgetKey: 'members.churn' }, { widgetKey: 'members.new-signups' }` (and the matching assertion order)
- the metric-fetch comment and assertion at line 110 → `members.new-signups` and `members.churn` are BOTH `members`, so the service fetches one metric, not two
- `'sales.retired-widget'` → `'members.retired-widget'`
- `setWidgets('sales', [...])` and its `segment: 'sales'` assertions → `'members'`
- the cross-segment rejection `setWidgets('sales', ['revenue.over-time'])` → `setWidgets('members', ['revenue.over-time'])`
- `'sales.nope'` → `'members.nope'`

In `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`, replace `'sales'` with `'members'` and `'sales.top-plans'` with `'members.churn'` throughout, including the fixture's `segment: 'sales'`.

Then add one test to the controller spec:

```ts
// `sales` is a hand-built view with no catalogue, so asking the segments API
// for it is a client bug worth surfacing — exactly like `overview`.
it('rejects the hand-built sales segment', async () => {
  const { controller } = setup();
  await expect(controller.get('sales', '7d')).rejects.toThrow(/sales/);
});
```

- [ ] **Step 5: Run the API specs**

Run: `pnpm --filter @fit/api test -- dashboard`
Expected: PASS.

- [ ] **Step 6: Wire the shell**

In `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`:

Add the import:

```ts
import { SalesView } from '../sales/sales-view';
```

Add this helper just above the component:

```ts
/**
 * The configurable segment a tab maps to, or `null` for the two hand-built views.
 * `overview` and `sales` have no catalogue, so neither the lazily-fetched panel
 * nor the "Add widget" picker applies to them.
 */
function configurableSegment(segment: DashboardSegment): ConfigurableDashboardSegment | null {
  return segment === 'overview' || segment === 'sales' ? null : segment;
}
```

Replace the `lastSegment` block with:

```ts
const activeConfigurable = configurableSegment(active);

// The last configurable segment the user opened. The panel stays MOUNTED at
// this segment while a hand-built view is on screen, so its fetch cache (a ref,
// and so only as long-lived as the mount) survives a trip through Overview or
// Sales and the return trip is instant. `null` until a configurable segment is
// opened, so a dashboard that never leaves those two costs no segment request.
const [lastSegment, setLastSegment] = useState<ConfigurableDashboardSegment | null>(
  configurableSegment(initialSegment),
);
if (activeConfigurable !== null && activeConfigurable !== lastSegment) {
  // Render-phase set on the CURRENT component (React re-renders immediately,
  // before committing) — the alternative is an effect, which would paint one
  // frame of the old segment first.
  setLastSegment(activeConfigurable);
}
```

Replace the picker condition:

```tsx
{
  activeConfigurable !== null ? (
    <AddWidgetDialog
      initialSegment={activeConfigurable}
      selectedKeys={selections}
      onSaved={onSaved}
    />
  ) : null;
}
```

And the panel body:

```tsx
<div id="dashboard-tabpanel" role="tabpanel" aria-labelledby={`dashboard-tab-${active}`}>
  {active === 'overview' ? <OverviewView data={overview} /> : null}
  {active === 'sales' ? <SalesView /> : null}

  {lastSegment !== null ? (
    <div
      key={savedAt}
      hidden={activeConfigurable === null}
      {...stylex.props(activeConfigurable === null && styles.hidden)}
    >
      <SegmentPanel segment={lastSegment} range={range} onLoaded={noteSelection} />
    </div>
  ) : null}
</div>
```

Finally, update the file's header comment: `` `overview` renders the server-fetched control room unchanged `` becomes `` `overview` renders the server-fetched control room and `sales` the hand-built sales view; every other tab hands off to the lazily-fetched panel. ``

- [ ] **Step 7: Update the admin specs**

In `apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx`:

- Change the `selectedKeys` fixture `sales: ['sales.top-plans']` to `members: ['members.churn']` (drop the `sales` key entirely).
- Replace every `setSearch('segment=sales')` / `renderShell('sales')` with `'segment=members'` / `renderShell('members')`, and the `'/?range=30d&segment=revenue'` assertion's starting segment accordingly.
- Add `vi.mock('../sales/sales-view', () => ({ SalesView: () => <div>Sales view</div> }))` beside the existing mocks, then add:

```tsx
it('renders the hand-built sales view, not the widget panel', () => {
  navigationMock.setSearch('segment=sales');
  renderShell('sales');
  expect(screen.getByText('Sales view')).toBeInTheDocument();
});

// The picker configures a catalogue; the two hand-built views have none.
it('hides the widget picker on both hand-built tabs', () => {
  navigationMock.setSearch('segment=sales');
  const { unmount } = renderShell('sales');
  expect(screen.queryByRole('button', { name: /add widget/i })).not.toBeInTheDocument();
  unmount();

  navigationMock.setSearch('');
  renderShell('overview');
  expect(screen.queryByRole('button', { name: /add widget/i })).not.toBeInTheDocument();
});
```

In `apps/admin/app/(dashboard)/segments/segment-panel.test.tsx`, change the `panel()` / `renderPanel()` signatures from `'sales' | 'members'` to `'members' | 'revenue'`, default to `'members'`, and change the fixture's `segment: 'sales'` / `key: 'sales.top-plans'` to `segment: 'members'` / `key: 'members.churn'`. Update the `toHaveBeenCalledWith('sales', '7d')` assertion to `'members'`.

In `apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx`, replace the `sales` selection fixtures with `members` ones: `ALL_SALES` becomes `const ALL_MEMBERS = ['members.new-signups', 'members.churn'];`, `initialSegment="sales"` becomes `initialSegment="members"`, the label fixtures `salesPaymentMethod` / `salesTopProducts` / `salesTopPlans` become `membersNewSignups` / `membersChurn`, and the save assertion targets `('members', [...])`. Remove the `sales: 'Sales'` segment label from the message fixture.

- [ ] **Step 8: Run the whole suite**

Run: `pnpm test`
Expected: PASS across `@fit/types`, `@fit/api`, `@fit/admin`.

- [ ] **Step 9: Type-check and lint everything**

Run: `pnpm type-check && pnpm lint && pnpm check:tailwind-guardrail`
Expected: all exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/types/src/dashboard-segments.ts packages/types/src/dashboard-segments.spec.ts \
  "apps/admin/app/(dashboard)/segments/" apps/api/src/dashboard/
git commit -m "feat(dashboard): replace the Sales widget grid with the hand-built view

The sales segment leaves CONFIGURABLE_DASHBOARD_SEGMENTS so the widget
picker no longer offers it, and stays in DASHBOARD_SEGMENTS so the tab
bar is unchanged. Stored sales.* widget rows are left in place — the
catalogue simply no longer resolves them, which is the documented
omitted-rather-than-broken path.

Every segment spec that used 'sales' as its example moves to 'members'."
```

---

## Verification

After Task 11, confirm the feature end-to-end rather than trusting the suite alone:

- [ ] Run `pnpm test && pnpm type-check && pnpm lint`. All green.
- [ ] Start the stack (`pnpm dev`), sign in as an OWNER or MANAGER, open `/?segment=sales`.
- [ ] Confirm: four KPI tiles with the caption naming the window and filter; the revenue trend with both control groups; the sales-vs-refunds chart with its legend; the payment breakdown with the POS/Online share line; the ranked top-sellers list.
- [ ] Flip granularity to Monthly — every card's numbers change together, and the KPI caption reads "Last 12 months".
- [ ] Flip product type to Memberships — the top-sellers list narrows to plan names, and the payment breakdown drops POS cash rows if the gym sells no memberships at the till.
- [ ] Flip back to Daily / All — instant, no network request (the cache).
- [ ] Open the Members tab — the widget grid and the "Add widget" button are both still there; the picker's tab bar no longer lists Sales.
- [ ] Sign in as a role without `ReportView` — the dashboard still degrades to the plain welcome.
