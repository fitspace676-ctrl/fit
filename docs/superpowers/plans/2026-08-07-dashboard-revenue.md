# Dashboard Revenue Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Revenue tab's two-widget grid with a hand-built view answering six questions: what came in (split recurring vs one-off), what the recurring base is worth, what each member is worth, what is owed, what is coming, and where it came from.

**Architecture:** The third hand-built tab, built exactly like Sales and Members — one `GET /dashboard/revenue` returning the whole tab, controls owned by the view, cache keyed on the control combination, error-as-banner once data is on screen. The API adds one service; the subscription-liveness helpers move out of the Members service into a shared util so both read the same definition of "live".

**Tech Stack:** NestJS + Prisma (tenant-scoped client), Zod contracts in `@fit/types`, Next.js App Router + StyleX + Astryx components in `apps/admin`, Vitest everywhere.

**Spec:** [`docs/superpowers/specs/2026-08-07-dashboard-revenue-design.md`](../specs/2026-08-07-dashboard-revenue-design.md)

## Global Constraints

- Money is an integer in the currency's MINOR units end to end. Only the UI divides by 100.
- No schema migrations. Every figure derives from existing columns.
- No new design tokens. Existing `var(--color-*)` / `var(--font-family-*)` only.
- Every API read goes through `TenantPrismaService`; no query passes or trusts a `gymId`.
- Time series are densely zero-filled. A quiet bucket is a real zero.
- Query schemas use `.catch(default)`, never `.default()` — a hand-edited URL lands on the default rather than a 400.
- i18n keys are added to **both** `packages/i18n/locales/en.json` and `ka.json`. The API stays locale-free.
- `pnpm lint` runs with `--max-warnings 0`; `prettier --check` gates the commit hook. Run `pnpm exec prettier --write <files>` before committing.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File                                                                   | Responsibility                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/types/src/dashboard-revenue.ts` (new)                        | The wire contract: query, response, and the projection-window → days map         |
| `packages/types/src/dashboard-revenue.spec.ts` (new)                   | Contract tests                                                                   |
| `packages/types/index.ts` (modify)                                     | Barrel export                                                                    |
| `apps/api/src/dashboard/subscription-timeline.util.ts` (new)           | `churnMoment` / `wasLiveAt` / `liveMembersAt`, lifted out of the Members service |
| `apps/api/src/dashboard/subscription-timeline.util.spec.ts` (new)      | Unit tests for the lifted helpers                                                |
| `apps/api/src/dashboard/dashboard-members.service.ts` (modify)         | Imports the helpers instead of owning them                                       |
| `apps/api/src/dashboard/dashboard-revenue.service.ts` (new)            | The whole tab's aggregation                                                      |
| `apps/api/src/dashboard/dashboard-revenue.service.spec.ts` (new)       | Aggregation tests                                                                |
| `apps/api/src/dashboard/dashboard.controller.ts` (modify)              | `GET /dashboard/revenue`                                                         |
| `apps/api/src/dashboard/dashboard.module.ts` (modify)                  | Provider registration                                                            |
| `apps/admin/lib/api.ts` (modify)                                       | `fetchDashboardRevenue`                                                          |
| `apps/admin/app/(dashboard)/revenue-insights/actions.ts` (new)         | `loadRevenueAction` server action                                                |
| `apps/admin/app/(dashboard)/revenue-insights/revenue-view.tsx` (new)   | The tab: controls, cache, retry, motion                                          |
| `.../revenue-kpi-strip.tsx` (new)                                      | Four tiles                                                                       |
| `.../revenue-trend-card.tsx` (new)                                     | Two-stream trend + granularity control                                           |
| `.../recurring-revenue-card.tsx` (new)                                 | MRR trend                                                                        |
| `.../projected-revenue-card.tsx` (new)                                 | Projection + at-risk line + window control                                       |
| `.../outstanding-invoices-card.tsx` (new)                              | Rail snapshot                                                                    |
| `.../revenue-by-location-card.tsx` (new)                               | Rail breakdown                                                                   |
| `.../revenue-view.test.tsx` (new)                                      | The tab's behaviour                                                              |
| `packages/i18n/locales/{en,ka}.json` (modify)                          | `admin.dashboard.revenue.*`; remove the two retired widget labels                |
| `packages/types/src/dashboard-segments.ts` (modify)                    | `revenue` → hand-built; catalogue entries removed                                |
| `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx` (modify) | Mount `RevenueView`                                                              |

---

### Task 1: The wire contract

**Files:**

- Create: `packages/types/src/dashboard-revenue.ts`
- Test: `packages/types/src/dashboard-revenue.spec.ts`
- Modify: `packages/types/index.ts`

**Interfaces:**

- Consumes: `salesGranularitySchema`, `SALES_GRANULARITY_RANGE` from `./dashboard-sales`; `reportSeriesPointSchema` from `./reports-drilldown`.
- Produces: `dashboardRevenueQuerySchema`, `DashboardRevenueQuery`, `dashboardRevenueResponseSchema`, `DashboardRevenueResponse`, `RevenueGranularity`, `ProjectionWindow`, `PROJECTION_WINDOW_DAYS`, `DEFAULT_REVENUE_GRANULARITY`, `DEFAULT_PROJECTION_WINDOW`, `RevenueStreamPoint`, `RevenueKpis`, `OutstandingInvoices`, `ProjectedRevenue`, `RevenueLocationSlice`.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/dashboard-revenue.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dashboardRevenueQuerySchema,
  dashboardRevenueResponseSchema,
  DEFAULT_PROJECTION_WINDOW,
  DEFAULT_REVENUE_GRANULARITY,
  PROJECTION_WINDOW_DAYS,
} from './dashboard-revenue';

/** A complete response, reused by the cases below. */
function response() {
  return {
    granularity: 'daily',
    projectionWindow: '7',
    currency: 'GEL',
    kpis: { totalRevenue: 120_00, mrr: 80_00, revenuePerMember: 40_00, outstandingTotal: 15_00 },
    revenueOverTime: [{ label: '2026-08-01', recurring: 80_00, oneOff: 40_00 }],
    mrrOverTime: [{ label: '2026-08-01', value: 80_00 }],
    projected: {
      total: 60_00,
      points: [{ label: '2026-08-07', value: 60_00 }],
      atRiskCount: 1,
      atRiskTotal: 20_00,
    },
    outstanding: {
      count: 2,
      total: 15_00,
      overdueCount: 1,
      overdueTotal: 5_00,
      failedCount: 1,
      failedTotal: 10_00,
    },
    byLocation: [{ location: 'Vake', value: 40_00 }],
  };
}

describe('dashboard revenue contract', () => {
  // A hand-edited URL must land on the tab's defaults, not a 400 — the same
  // forgiving rule the sales and members queries apply.
  it('falls back to the defaults on an unknown query value', () => {
    const parsed = dashboardRevenueQuerySchema.parse({
      granularity: 'hourly',
      projectionWindow: '365',
    });
    expect(parsed.granularity).toBe(DEFAULT_REVENUE_GRANULARITY);
    expect(parsed.projectionWindow).toBe(DEFAULT_PROJECTION_WINDOW);
  });

  it('accepts an omitted query entirely', () => {
    expect(dashboardRevenueQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_REVENUE_GRANULARITY,
      projectionWindow: DEFAULT_PROJECTION_WINDOW,
    });
  });

  it('maps every projection window to a day count', () => {
    expect(PROJECTION_WINDOW_DAYS).toEqual({ '7': 7, '30': 30 });
  });

  it('round-trips a full response', () => {
    expect(dashboardRevenueResponseSchema.parse(response())).toEqual(response());
  });

  // `null` is "single-location gym, question not applicable"; `[]` is "multi-location
  // with no revenue". The card is dropped for the first and rendered empty for the
  // second, so the two must stay distinguishable on the wire.
  it('keeps a null location breakdown distinct from an empty one', () => {
    expect(
      dashboardRevenueResponseSchema.parse({ ...response(), byLocation: null }).byLocation,
    ).toBe(null);
    expect(
      dashboardRevenueResponseSchema.parse({ ...response(), byLocation: [] }).byLocation,
    ).toEqual([]);
  });

  it('refuses a response missing a KPI', () => {
    const broken = response();
    // @ts-expect-error deleting a required key is the point of the case
    delete broken.kpis.mrr;
    expect(dashboardRevenueResponseSchema.safeParse(broken).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/types test -- dashboard-revenue`
Expected: FAIL — `Failed to resolve import "./dashboard-revenue"`.

- [ ] **Step 3: Write the contract**

Create `packages/types/src/dashboard-revenue.ts`:

```ts
// @fit/types — the hand-built Revenue dashboard tab's contract (Zod schemas).
//
// Sibling of `./dashboard-sales` and `./dashboard-members`. Where Sales answers
// "what did we sell?" and Members "who is still here?", this one answers the three
// money questions a subscription business runs on: what came in, what is owed, and
// what is coming.
//
// Money is an integer in the currency's MINOR units (tetri) throughout. Display
// labels are NOT on the wire: they are i18n keys resolved client-side, so the API
// stays locale-free like every sibling contract.
//
// Every figure is a REAL aggregation over rows that exist today. Time series are
// densely zero-filled — a day with no takings is a real zero. The one nullable
// figure is `byLocation`, and it is nullable for a reason no empty array could
// express: see its own comment.

import { z } from 'zod';
import { salesGranularitySchema } from './dashboard-sales';
import { reportSeriesPointSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How the tab's trends are bucketed. Deliberately the SAME vocabulary and window
 * mapping as Sales and Members (`SALES_GRANULARITY_RANGE`), so a user who learns
 * one tab's time control has learned all three.
 */
export const revenueGranularitySchema = salesGranularitySchema;
export type RevenueGranularity = z.infer<typeof revenueGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_REVENUE_GRANULARITY: RevenueGranularity = 'daily';

/**
 * How far AHEAD the projection reaches, in days. A string enum rather than a
 * number so it round-trips through a URL query and a `SegmentedControl` value
 * without coercion at either end — the same shape as the Members tab's windows.
 */
export const projectionWindowSchema = z.enum(['7', '30']);
export type ProjectionWindow = z.infer<typeof projectionWindowSchema>;

/** The projection window a query without one lands on. */
export const DEFAULT_PROJECTION_WINDOW: ProjectionWindow = '7';

/**
 * Days each projection window covers. Exported so the API and the caption read the
 * same number rather than each parsing the enum's string.
 */
export const PROJECTION_WINDOW_DAYS: Record<ProjectionWindow, number> = { '7': 7, '30': 30 };

/**
 * `GET /dashboard/revenue?granularity=&projectionWindow=` query. `.catch` (not
 * `.default`) so a hand-edited URL lands on the default rather than a 400.
 */
export const dashboardRevenueQuerySchema = z.object({
  granularity: revenueGranularitySchema.catch(DEFAULT_REVENUE_GRANULARITY),
  projectionWindow: projectionWindowSchema.catch(DEFAULT_PROJECTION_WINDOW),
});
export type DashboardRevenueQuery = z.infer<typeof dashboardRevenueQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One bucket of the revenue trend, split by stream.
 *
 * The two are disjoint by construction: `recurring` counts subscription invoices
 * (`orderId: null`) and `oneOff` counts captured order payments, so no money
 * movement lands in both. Kept as two numbers rather than one total because they
 * move for different reasons and are fixed by different actions.
 */
export const revenueStreamPointSchema = z.object({
  /** Bucket start, `YYYY-MM-DD`. */
  label: z.string(),
  /** Subscription charges settled in this bucket. */
  recurring: z.number(),
  /** Till, shop and session-pack takings, net of refunds. */
  oneOff: z.number(),
});
export type RevenueStreamPoint = z.infer<typeof revenueStreamPointSchema>;

/**
 * The tab's four headline figures, all in MINOR units.
 *
 * Two are windowed and two are not, which the strip's caption states rather than
 * leaving to be inferred: `totalRevenue` and `revenuePerMember` describe the
 * selected window, while `mrr` and `outstandingTotal` describe right now. A debt
 * does not stop being owed because the chart is showing last week.
 */
export const revenueKpisSchema = z.object({
  totalRevenue: z.number(),
  mrr: z.number(),
  revenuePerMember: z.number(),
  outstandingTotal: z.number(),
});
export type RevenueKpis = z.infer<typeof revenueKpisSchema>;

/**
 * Unsettled invoices, gym-wide. `overdue*` is the subset past its stated
 * `dueDate`; `failed*` is the subset whose charge was declined. They OVERLAP — a
 * failed charge can also be overdue — and are broken out because they need
 * different responses: one is chased, the other retried.
 */
export const outstandingInvoicesSchema = z.object({
  count: z.number(),
  total: z.number(),
  overdueCount: z.number(),
  overdueTotal: z.number(),
  failedCount: z.number(),
  failedTotal: z.number(),
});
export type OutstandingInvoices = z.infer<typeof outstandingInvoicesSchema>;

/**
 * Charges already scheduled by an existing subscription's own billing date. Not a
 * forecast: no growth model, no churn adjustment. `atRisk*` is the `PAST_DUE`
 * population — deliberately NOT part of `total`, because that money is late rather
 * than upcoming, and reported beside it because "what is coming in" is only honest
 * next to what is being chased.
 */
export const projectedRevenueSchema = z.object({
  total: z.number(),
  /** One point per day of the window — dense. */
  points: z.array(reportSeriesPointSchema),
  atRiskCount: z.number(),
  atRiskTotal: z.number(),
});
export type ProjectedRevenue = z.infer<typeof projectedRevenueSchema>;

/** One row of the location breakdown. */
export const revenueLocationSliceSchema = z.object({
  location: z.string(),
  value: z.number(),
});
export type RevenueLocationSlice = z.infer<typeof revenueLocationSliceSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/revenue` response — the whole tab in one round trip, so its two
 * controls never leave one card describing a different window from its neighbour.
 * Echoes the resolved query so the client can confirm what it is looking at.
 */
export const dashboardRevenueResponseSchema = z.object({
  granularity: revenueGranularitySchema,
  projectionWindow: projectionWindowSchema,
  /** ISO-4217 currency every money figure here is denominated in. */
  currency: z.string(),
  kpis: revenueKpisSchema,
  /** Net takings per bucket, split by stream — dense. */
  revenueOverTime: z.array(revenueStreamPointSchema),
  /** Monthly value of the paid base at each bucket's start — dense. */
  mrrOverTime: z.array(reportSeriesPointSchema),
  projected: projectedRevenueSchema,
  outstanding: outstandingInvoicesSchema,
  /**
   * `null` means the gym has fewer than two active locations — the question does
   * not apply, and the client drops the card rather than rendering an empty one.
   * An empty ARRAY is the different fact "multi-location, no revenue in window".
   */
  byLocation: z.array(revenueLocationSliceSchema).nullable(),
});
export type DashboardRevenueResponse = z.infer<typeof dashboardRevenueResponseSchema>;
```

- [ ] **Step 4: Export from the barrel**

In `packages/types/index.ts`, add beside the other dashboard exports (alphabetical order — after `./src/dashboard-members`):

```ts
export * from './src/dashboard-revenue';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @fit/types test -- dashboard-revenue`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write packages/types/src/dashboard-revenue.ts packages/types/src/dashboard-revenue.spec.ts packages/types/index.ts
git add packages/types/
git commit -m "feat(types): add the Revenue dashboard tab contract"
```

---

### Task 2: Lift the subscription-timeline helpers out of the Members service

**Files:**

- Create: `apps/api/src/dashboard/subscription-timeline.util.ts`
- Test: `apps/api/src/dashboard/subscription-timeline.util.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard-members.service.ts:193-231` (delete the private helpers, import them instead)

**Interfaces:**

- Produces: `SubscriptionTimelineRow` (interface), `churnMoment(sub): Date | null`, `wasLiveAt(sub, at): boolean`, `liveMembersAt(subs, at): Set<string>`, `liveCountAt(subs, at): number`.

Both the Members service and the Revenue service need "was this subscription live at instant X". The Members spec already refused to add a third hand-written copy of that logic; this makes it one shared unit before the second consumer arrives.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/subscription-timeline.util.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '@fit/db';
import {
  churnMoment,
  liveCountAt,
  liveMembersAt,
  wasLiveAt,
  type SubscriptionTimelineRow,
} from './subscription-timeline.util';

const JAN = new Date('2026-01-01T00:00:00.000Z');
const FEB = new Date('2026-02-01T00:00:00.000Z');
const MAR = new Date('2026-03-01T00:00:00.000Z');

function sub(over: Partial<SubscriptionTimelineRow> = {}): SubscriptionTimelineRow {
  return {
    memberId: 'm1',
    status: SubscriptionStatus.ACTIVE,
    createdAt: JAN,
    canceledAt: null,
    updatedAt: JAN,
    ...over,
  };
}

describe('subscription timeline', () => {
  it('dates a cancellation by canceledAt, falling back to updatedAt', () => {
    expect(
      churnMoment(sub({ status: SubscriptionStatus.CANCELED, canceledAt: FEB, updatedAt: MAR })),
    ).toEqual(FEB);
    expect(
      churnMoment(sub({ status: SubscriptionStatus.CANCELED, canceledAt: null, updatedAt: MAR })),
    ).toEqual(MAR);
  });

  it('dates an expiry by updatedAt and leaves a live one open', () => {
    expect(churnMoment(sub({ status: SubscriptionStatus.EXPIRED, updatedAt: FEB }))).toEqual(FEB);
    expect(churnMoment(sub())).toBeNull();
  });

  it('is not live before it existed', () => {
    expect(wasLiveAt(sub({ createdAt: FEB }), JAN)).toBe(false);
  });

  it('is live after a churn that has not happened yet at that instant', () => {
    const canceled = sub({ status: SubscriptionStatus.CANCELED, canceledAt: MAR });
    expect(wasLiveAt(canceled, FEB)).toBe(true);
    expect(wasLiveAt(canceled, MAR)).toBe(false);
  });

  // Frozen is a LIVE state: a paused membership is still a membership.
  it('counts a frozen subscription as live', () => {
    expect(wasLiveAt(sub({ status: SubscriptionStatus.FROZEN }), FEB)).toBe(true);
  });

  it('counts each member once however many subscriptions they hold', () => {
    const subs = [sub(), sub(), sub({ memberId: 'm2' })];
    expect(liveMembersAt(subs, FEB)).toEqual(new Set(['m1', 'm2']));
    expect(liveCountAt(subs, FEB)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- subscription-timeline`
Expected: FAIL — cannot resolve `./subscription-timeline.util`.

- [ ] **Step 3: Create the util**

Create `apps/api/src/dashboard/subscription-timeline.util.ts`:

```ts
// Reconstructing a subscription's history from the row it left behind.
//
// There is no per-status event log, so "was this live at instant X" is derived
// from `createdAt`, `status`, `canceledAt` and `updatedAt`. That is exact for the
// current state and for a clean cancel/expire, and approximate for a subscription
// that moved between live states in the past (`ACTIVE → FROZEN → ACTIVE`) —
// `updatedAt` remembers only the most recent move.
//
// Shared by the Members tab (active-member trend, retention) and the Revenue tab
// (MRR trend, revenue per member) so the two can never answer "how many members
// are active" differently. Lifted out of `dashboard-members.service.ts`, which
// owned it privately first.

import { isLiveStatus, SubscriptionStatus } from '@fit/db';

/** The subscription fields every reconstruction here reads. */
export interface SubscriptionTimelineRow {
  memberId: string;
  status: SubscriptionStatus;
  createdAt: Date;
  canceledAt: Date | null;
  updatedAt: Date;
}

/** A subscription's terminal instant, or `null` while it is still live. */
export function churnMoment(sub: SubscriptionTimelineRow): Date | null {
  if (sub.status === SubscriptionStatus.CANCELED) return sub.canceledAt ?? sub.updatedAt;
  if (sub.status === SubscriptionStatus.EXPIRED) return sub.updatedAt;
  return null;
}

/** Whether a subscription existed and had not yet ended at `at`. */
export function wasLiveAt(sub: SubscriptionTimelineRow, at: Date): boolean {
  if (sub.createdAt >= at) return false;
  const churnedAt = churnMoment(sub);
  if (churnedAt !== null && churnedAt < at) return false;
  // A live-status row that has not churned was live; a terminal row that churned
  // after `at` was live then too. The isLiveStatus predicate from @fit/db handles
  // type widening correctly; the tuple LIVE_SUBSCRIPTION_STATUSES would not.
  return churnedAt !== null || isLiveStatus(sub.status);
}

/** The distinct members holding at least one live subscription at `at`. */
export function liveMembersAt(subs: SubscriptionTimelineRow[], at: Date): Set<string> {
  const ids = new Set<string>();
  for (const sub of subs) {
    if (wasLiveAt(sub, at)) ids.add(sub.memberId);
  }
  return ids;
}

/** How many distinct members held a live subscription at `at`. */
export function liveCountAt(subs: SubscriptionTimelineRow[], at: Date): number {
  return liveMembersAt(subs, at).size;
}
```

- [ ] **Step 4: Point the Members service at it**

In `apps/api/src/dashboard/dashboard-members.service.ts`:

1. Delete the whole `/* Pure helpers */` section at the bottom (the four functions `churnMoment`, `wasLiveAt`, `liveMembersAt`, `liveCountAt`) and the local `SubscriptionRow` interface near the top.
2. Add to the imports:

```ts
import {
  churnMoment,
  liveCountAt,
  liveMembersAt,
  type SubscriptionTimelineRow,
} from './subscription-timeline.util';
```

3. Replace the remaining `SubscriptionRow` reference in the file with `SubscriptionTimelineRow`.
4. Trim the class doc-comment's last paragraph (the one about `LIVE_SUBSCRIPTION_STATUSES` being imported from `@fit/db`) to point at the util instead:

```ts
 * The subscription-liveness reconstruction lives in `./subscription-timeline.util`,
 * shared with the Revenue tab so the two can never disagree about how many members
 * are active.
```

- [ ] **Step 5: Run the tests to verify nothing regressed**

Run: `pnpm --filter api test -- dashboard && pnpm --filter api exec tsc --noEmit`
Expected: PASS — the util's 6 new tests plus the Members service's existing 17, unchanged.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write apps/api/src/dashboard/
git add apps/api/src/dashboard/
git commit -m "refactor(api): share the subscription-timeline helpers"
```

---

### Task 3: The Revenue aggregation service

**Files:**

- Create: `apps/api/src/dashboard/dashboard-revenue.service.ts`
- Test: `apps/api/src/dashboard/dashboard-revenue.service.spec.ts`

**Interfaces:**

- Consumes: `SubscriptionTimelineRow`, `wasLiveAt`, `liveMembersAt` (Task 2); `dashboardRevenueQuerySchema` types (Task 1); `resolveWindow`, `emptyBuckets`, `bucketKey`, `isoDate`, `DAY_MS`, `DEFAULT_CURRENCY` from `../reports/report-window.util`.
- Produces: `class DashboardRevenueService { constructor(prisma: TenantPrismaService); get(query: DashboardRevenueQuery): Promise<DashboardRevenueResponse> }`.

**The MRR reconstruction rule, stated once here because it is the only non-obvious
line in the file.** A subscription contributes its monthly value to a bucket when
it was live at that instant AND was on a paid plan then. "On a paid plan then" is
decided by `updatedAt`, which is the boundary of what the row actually knows:

- At or after `updatedAt`, today's `status` is exact — count it only if `ACTIVE`.
- Before `updatedAt`, the row has changed since, so today's status says nothing
  about then; count it unless it is a `TRIAL` that never converted.

A currently-frozen subscription therefore contributes up to the day it froze and
not after; a currently-past-due one up to the day it lapsed; a since-cancelled one
up to its churn. Without the `updatedAt` boundary, a gym that churned half its base
would draw a flat, low MRR line for its whole history.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/dashboard-revenue.service.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvoiceStatus,
  LocationStatus,
  PaymentStatus,
  SubscriptionInterval,
  SubscriptionStatus,
} from '@fit/db';
import { DashboardRevenueService } from './dashboard-revenue.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** Frozen "now", so every window and projection boundary in this file is exact. */
const NOW = new Date('2026-08-07T12:00:00.000Z');
const TODAY = new Date('2026-08-07T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** A day offset from today's UTC start, as a Date. */
function day(offset: number): Date {
  return new Date(TODAY.getTime() + offset * DAY);
}

function setup(rows: {
  payments?: unknown[];
  paidInvoices?: unknown[];
  unsettled?: unknown[];
  subscriptions?: unknown[];
  locations?: number;
}) {
  const paymentFindMany = vi.fn().mockResolvedValue(rows.payments ?? []);
  // The two invoice reads are distinguished by their `where.status` shape: the
  // paid read names one status, the unsettled read names an `in` list.
  const invoiceFindMany = vi.fn((args: { where: { status: unknown } }) =>
    Promise.resolve(
      args.where.status === InvoiceStatus.PAID ? (rows.paidInvoices ?? []) : (rows.unsettled ?? []),
    ),
  );
  const subscriptionFindMany = vi.fn().mockResolvedValue(rows.subscriptions ?? []);
  const locationCount = vi.fn().mockResolvedValue(rows.locations ?? 1);

  const client = {
    payment: { findMany: paymentFindMany },
    invoice: { findMany: invoiceFindMany },
    subscription: { findMany: subscriptionFindMany },
    location: { count: locationCount },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  return {
    service: new DashboardRevenueService(prisma),
    paymentFindMany,
    invoiceFindMany,
    subscriptionFindMany,
    locationCount,
  };
}

function payment(over: Record<string, unknown> = {}) {
  return {
    amount: 100_00,
    refundedAmount: 0,
    currency: 'GEL',
    createdAt: day(-1),
    order: { location: { name: 'Vake' } },
    ...over,
  };
}

function invoice(over: Record<string, unknown> = {}) {
  return { amount: 50_00, currency: 'GEL', issuedAt: day(-1), ...over };
}

function subscription(over: Record<string, unknown> = {}) {
  return {
    memberId: 'm1',
    status: SubscriptionStatus.ACTIVE,
    createdAt: day(-90),
    canceledAt: null,
    updatedAt: day(-90),
    priceAmount: 60_00,
    interval: SubscriptionInterval.MONTH,
    currentPeriodEnd: day(3),
    cancelAtPeriodEnd: false,
    ...over,
  };
}

const QUERY = { granularity: 'daily', projectionWindow: '7' } as const;

describe('DashboardRevenueService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /* -- Streams --------------------------------------------------------- */

  // The whole double-count guard: a POS order mints a Payment AND may mint an
  // Invoice carrying its orderId. Only `orderId: null` invoices are recurring.
  it('reads subscription revenue with orderId null, so order invoices cannot double-count', async () => {
    const { service, invoiceFindMany } = setup({});
    await service.get(QUERY);
    const paidRead = invoiceFindMany.mock.calls.find(
      ([args]) => (args as { where: { status: unknown } }).where.status === InvoiceStatus.PAID,
    );
    expect(paidRead?.[0]).toMatchObject({ where: { orderId: null } });
  });

  it('splits the trend into recurring and one-off, net of refunds', async () => {
    const { service } = setup({
      payments: [payment({ amount: 100_00, refundedAmount: 20_00, createdAt: day(-1) })],
      paidInvoices: [invoice({ amount: 50_00, issuedAt: day(-1) })],
    });
    const result = await service.get(QUERY);
    const bucket = result.revenueOverTime.find((point) => point.label === '2026-08-06');
    expect(bucket).toEqual({ label: '2026-08-06', recurring: 50_00, oneOff: 80_00 });
    expect(result.kpis.totalRevenue).toBe(130_00);
  });

  // 31, not 30: `resolveWindow('30d')` opens 30×24h before a mid-day "now", and
  // `emptyBuckets` anchors the first bucket to that instant's own UTC day — so the
  // part-day at each end is a bucket of its own.
  it('zero-fills every bucket of a window with no revenue', async () => {
    const { service } = setup({});
    const result = await service.get(QUERY);
    expect(result.revenueOverTime).toHaveLength(31);
    expect(result.revenueOverTime[0]?.label).toBe('2026-07-08');
    expect(result.revenueOverTime[30]?.label).toBe('2026-08-07');
    expect(result.revenueOverTime.every((p) => p.recurring === 0 && p.oneOff === 0)).toBe(true);
    expect(result.mrrOverTime).toHaveLength(31);
  });

  /* -- MRR ------------------------------------------------------------- */

  it('normalises a yearly plan to a month', async () => {
    const { service } = setup({
      subscriptions: [subscription({ interval: SubscriptionInterval.YEAR, priceAmount: 1200_00 })],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.mrr).toBe(100_00);
  });

  it('excludes a trial, a past-due and a frozen plan from current MRR', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ status: SubscriptionStatus.TRIAL, updatedAt: day(-2) }),
        subscription({ memberId: 'm2', status: SubscriptionStatus.PAST_DUE, updatedAt: day(-2) }),
        subscription({ memberId: 'm3', status: SubscriptionStatus.FROZEN, updatedAt: day(-2) }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.mrr).toBe(0);
  });

  // Without the updatedAt boundary a gym that churned half its base would draw a
  // flat, low line for its whole history.
  it('counts a since-cancelled plan in the buckets before it churned', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.CANCELED,
          canceledAt: day(-5),
          updatedAt: day(-5),
        }),
      ],
    });
    const result = await service.get(QUERY);
    const before = result.mrrOverTime.find((p) => p.label === '2026-08-01');
    const after = result.mrrOverTime.find((p) => p.label === '2026-08-06');
    expect(before?.value).toBe(60_00);
    expect(after?.value).toBe(0);
    expect(result.kpis.mrr).toBe(0);
  });

  /* -- Revenue per member ---------------------------------------------- */

  it('divides window revenue by the members live at the window end', async () => {
    const { service } = setup({
      payments: [payment({ amount: 100_00 })],
      subscriptions: [subscription(), subscription({ memberId: 'm2' })],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.revenuePerMember).toBe(50_00);
  });

  it('reports zero rather than dividing by no members', async () => {
    const { service } = setup({ payments: [payment({ amount: 100_00 })] });
    const result = await service.get(QUERY);
    expect(result.kpis.revenuePerMember).toBe(0);
  });

  /* -- Outstanding ------------------------------------------------------ */

  it('counts pending and failed invoices, with overdue and failed as subsets', async () => {
    const { service } = setup({
      unsettled: [
        { amount: 10_00, status: InvoiceStatus.PENDING, dueDate: day(-1) },
        { amount: 20_00, status: InvoiceStatus.PENDING, dueDate: day(3) },
        { amount: 30_00, status: InvoiceStatus.FAILED, dueDate: null },
      ],
    });
    const result = await service.get(QUERY);
    expect(result.outstanding).toEqual({
      count: 3,
      total: 60_00,
      overdueCount: 1,
      overdueTotal: 10_00,
      failedCount: 1,
      failedTotal: 30_00,
    });
    expect(result.kpis.outstandingTotal).toBe(60_00);
  });

  // The boundary: due at today's UTC start is due TODAY, not late.
  it('treats a due date at today start as not yet overdue', async () => {
    const { service } = setup({
      unsettled: [
        { amount: 10_00, status: InvoiceStatus.PENDING, dueDate: TODAY },
        { amount: 20_00, status: InvoiceStatus.PENDING, dueDate: new Date(TODAY.getTime() - 1) },
      ],
    });
    const result = await service.get(QUERY);
    expect(result.outstanding.overdueCount).toBe(1);
    expect(result.outstanding.overdueTotal).toBe(20_00);
  });

  it('never calls an invoice with no due date overdue', async () => {
    const { service } = setup({
      unsettled: [{ amount: 10_00, status: InvoiceStatus.PENDING, dueDate: null }],
    });
    const result = await service.get(QUERY);
    expect(result.outstanding.count).toBe(1);
    expect(result.outstanding.overdueCount).toBe(0);
  });

  /* -- Projection ------------------------------------------------------- */

  it('buckets an upcoming charge on the day it falls due', async () => {
    const { service } = setup({ subscriptions: [subscription({ currentPeriodEnd: day(3) })] });
    const result = await service.get(QUERY);
    expect(result.projected.points).toHaveLength(7);
    expect(result.projected.points.find((p) => p.label === '2026-08-10')?.value).toBe(60_00);
    expect(result.projected.total).toBe(60_00);
  });

  it('excludes a charge beyond the window and one already scheduled to end', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ currentPeriodEnd: day(9) }),
        subscription({ memberId: 'm2', currentPeriodEnd: day(2), cancelAtPeriodEnd: true }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.projected.total).toBe(0);
  });

  it('includes a trial converting inside the window and excludes a frozen plan', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.TRIAL,
          priceAmount: 40_00,
          currentPeriodEnd: day(2),
        }),
        subscription({
          memberId: 'm2',
          status: SubscriptionStatus.FROZEN,
          priceAmount: 90_00,
          currentPeriodEnd: day(2),
        }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.projected.total).toBe(40_00);
  });

  it('reports past-due plans beside the projection, never inside it', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.PAST_DUE,
          priceAmount: 25_00,
          currentPeriodEnd: day(1),
        }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.projected.total).toBe(0);
    expect(result.projected.atRiskCount).toBe(1);
    expect(result.projected.atRiskTotal).toBe(25_00);
  });

  it('covers thirty days when the wider window is asked for', async () => {
    const { service } = setup({ subscriptions: [subscription({ currentPeriodEnd: day(20) })] });
    const result = await service.get({ granularity: 'daily', projectionWindow: '30' });
    expect(result.projected.points).toHaveLength(30);
    expect(result.projected.total).toBe(60_00);
  });

  /* -- Locations -------------------------------------------------------- */

  it('reports no location breakdown at all for a single-location gym', async () => {
    const { service, locationCount } = setup({ payments: [payment()], locations: 1 });
    const result = await service.get(QUERY);
    expect(result.byLocation).toBeNull();
    expect(locationCount).toHaveBeenCalledWith({ where: { status: LocationStatus.ACTIVE } });
  });

  it('ranks locations by net takings for a multi-location gym', async () => {
    const { service } = setup({
      locations: 2,
      payments: [
        payment({ amount: 40_00, order: { location: { name: 'Vake' } } }),
        payment({ amount: 90_00, order: { location: { name: 'Saburtalo' } } }),
        payment({ amount: 10_00, order: { location: null } }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.byLocation).toEqual([
      { location: 'Saburtalo', value: 90_00 },
      { location: 'Vake', value: 40_00 },
      { location: 'No location', value: 10_00 },
    ]);
  });

  /* -- Envelope --------------------------------------------------------- */

  it('echoes the query and takes the currency from the latest money row', async () => {
    const { service } = setup({ payments: [payment({ currency: 'EUR' })] });
    const result = await service.get(QUERY);
    expect(result.granularity).toBe('daily');
    expect(result.projectionWindow).toBe('7');
    expect(result.currency).toBe('EUR');
  });

  it('falls back to the default currency with no money at all', async () => {
    const { service } = setup({});
    expect((await service.get(QUERY)).currency).toBe('USD');
  });

  it('scopes the money reads to the window and the CAPTURED status', async () => {
    const { service, paymentFindMany } = setup({});
    await service.get(QUERY);
    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: PaymentStatus.CAPTURED }),
      }),
    );
  });

  // Trashed members are not billing; their subscriptions must not inflate MRR,
  // the projection, or the per-member denominator.
  it('excludes trashed members from the subscription read', async () => {
    const { service, subscriptionFindMany } = setup({});
    await service.get(QUERY);
    expect(subscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { member: { deletedAt: null } } }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- dashboard-revenue`
Expected: FAIL — cannot resolve `./dashboard-revenue.service`.

- [ ] **Step 3: Write the service**

Create `apps/api/src/dashboard/dashboard-revenue.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  LocationStatus,
  PaymentStatus,
  SubscriptionInterval,
  SubscriptionStatus,
} from '@fit/db';
import {
  PROJECTION_WINDOW_DAYS,
  SALES_GRANULARITY_RANGE,
  type DashboardRevenueQuery,
  type DashboardRevenueResponse,
  type RevenueLocationSlice,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import {
  bucketKey,
  DAY_MS,
  DEFAULT_CURRENCY,
  emptyBuckets,
  isoDate,
  resolveWindow,
} from '../reports/report-window.util';
import {
  liveMembersAt,
  wasLiveAt,
  type SubscriptionTimelineRow,
} from './subscription-timeline.util';

/** Label for takings on an order that names no location. */
const NO_LOCATION_LABEL = 'No location';

/** Everything the projection and the MRR reconstruction read off a subscription. */
interface RevenueSubscriptionRow extends SubscriptionTimelineRow {
  priceAmount: number;
  interval: SubscriptionInterval;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/**
 * Read side of the hand-built Revenue dashboard tab.
 *
 * Produces the whole tab in one round trip: four KPIs, the two-stream revenue
 * trend, the MRR trend, the projection, the outstanding-invoice snapshot, and the
 * location breakdown. Money is in MINOR units throughout.
 *
 * Two rules decide every figure here and are worth stating once:
 *
 * **Nothing is counted twice.** A subscription charge mints an `Invoice`; an order
 * mints a `Payment` and possibly an `Invoice` carrying that `orderId`. Summing
 * `Payment{CAPTURED}` with `Invoice{PAID, orderId: null}` therefore sees every
 * money movement exactly once, and `orderId: null` is the whole guard.
 *
 * **Trashed members are filtered from the head-count reads, not from the money.**
 * A soft-deleted member is not billing, so their subscriptions leave MRR, the
 * projection and the per-member denominator. Cash already taken stays: a payment
 * that settled is revenue whether or not the member was later moved to trash, and
 * `Invoice`/`Order` deliberately survive a purge (`SetNull`) for that reason.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`.
 */
@Injectable()
export class DashboardRevenueService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Build the whole Revenue tab for one control combination. */
  async get(query: DashboardRevenueQuery): Promise<DashboardRevenueResponse> {
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity]);
    const days = PROJECTION_WINDOW_DAYS[query.projectionWindow];
    const now = new Date();
    // Calendar day, not instant: a charge due later today belongs in today's
    // bucket, and an invoice due today is not yet late.
    const todayStart = new Date(`${isoDate(now)}T00:00:00.000Z`);
    const horizon = new Date(todayStart.getTime() + days * DAY_MS);

    const [payments, paidInvoices, unsettled, subscriptions, locationCount] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          refundedAmount: true,
          currency: true,
          createdAt: true,
          order: { select: { location: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // `orderId: null` is the double-count guard — see the class comment.
      this.prisma.client.invoice.findMany({
        where: {
          status: InvoiceStatus.PAID,
          orderId: null,
          issuedAt: { gte: win.start, lt: win.end },
        },
        select: { amount: true, currency: true, issuedAt: true },
        orderBy: { issuedAt: 'asc' },
      }),
      // Gym-wide and NOT window-scoped: a debt does not stop being owed because
      // the chart is showing last week.
      this.prisma.client.invoice.findMany({
        where: { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] } },
        select: { amount: true, status: true, dueDate: true },
      }),
      // Every subscription, not just the window's: the MRR trend needs state at
      // instants BEFORE the window opens.
      this.prisma.client.subscription.findMany({
        where: { member: { deletedAt: null } },
        select: {
          memberId: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
          priceAmount: true,
          interval: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
      this.prisma.client.location.count({ where: { status: LocationStatus.ACTIVE } }),
    ]);

    /* -- The two revenue streams ----------------------------------------- */

    const recurringBuckets = emptyBuckets(win);
    const oneOffBuckets = emptyBuckets(win);
    const byLocation = new Map<string, number>();

    for (const payment of payments) {
      const net = payment.amount - payment.refundedAmount;
      const key = bucketKey(payment.createdAt, win.bucket);
      if (oneOffBuckets.has(key)) {
        oneOffBuckets.set(key, (oneOffBuckets.get(key) ?? 0) + net);
      }
      const label = payment.order.location?.name ?? NO_LOCATION_LABEL;
      byLocation.set(label, (byLocation.get(label) ?? 0) + net);
    }

    for (const invoice of paidInvoices) {
      const key = bucketKey(invoice.issuedAt, win.bucket);
      if (recurringBuckets.has(key)) {
        recurringBuckets.set(key, (recurringBuckets.get(key) ?? 0) + invoice.amount);
      }
    }

    const totalRecurring = sum([...recurringBuckets.values()]);
    const totalOneOff = sum([...oneOffBuckets.values()]);

    /* -- MRR -------------------------------------------------------------- */

    const mrrOverTime = [...recurringBuckets.keys()].map((label) => ({
      label,
      value: mrrAt(subscriptions, new Date(`${label}T00:00:00.000Z`)),
    }));

    /* -- Snapshots -------------------------------------------------------- */

    const activeMembers = liveMembersAt(subscriptions, win.end).size;
    const windowRevenue = totalRecurring + totalOneOff;

    let count = 0;
    let total = 0;
    let overdueCount = 0;
    let overdueTotal = 0;
    let failedCount = 0;
    let failedTotal = 0;
    for (const invoice of unsettled) {
      count += 1;
      total += invoice.amount;
      // An invoice with no stated deadline is outstanding but never overdue.
      if (invoice.dueDate !== null && invoice.dueDate < todayStart) {
        overdueCount += 1;
        overdueTotal += invoice.amount;
      }
      if (invoice.status === InvoiceStatus.FAILED) {
        failedCount += 1;
        failedTotal += invoice.amount;
      }
    }

    /* -- Projection -------------------------------------------------------- */

    const projectedBuckets = new Map<string, number>();
    for (let offset = 0; offset < days; offset += 1) {
      projectedBuckets.set(isoDate(new Date(todayStart.getTime() + offset * DAY_MS)), 0);
    }

    let atRiskCount = 0;
    let atRiskTotal = 0;
    for (const sub of subscriptions) {
      if (sub.status === SubscriptionStatus.PAST_DUE) {
        atRiskCount += 1;
        atRiskTotal += sub.priceAmount;
        continue;
      }
      // FROZEN is excluded because its period end moves when it resumes, so the
      // date on the row is not a charge date. `cancelAtPeriodEnd` is scheduled to
      // end, not to renew.
      if (sub.status !== SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.TRIAL) {
        continue;
      }
      if (sub.cancelAtPeriodEnd) continue;
      if (sub.currentPeriodEnd < todayStart || sub.currentPeriodEnd >= horizon) continue;
      const key = isoDate(sub.currentPeriodEnd);
      projectedBuckets.set(key, (projectedBuckets.get(key) ?? 0) + sub.priceAmount);
    }

    const locations: RevenueLocationSlice[] = [...byLocation.entries()]
      .map(([location, value]) => ({ location, value }))
      .sort((a, b) => b.value - a.value);

    return {
      granularity: query.granularity,
      projectionWindow: query.projectionWindow,
      currency:
        payments[payments.length - 1]?.currency ??
        paidInvoices[paidInvoices.length - 1]?.currency ??
        DEFAULT_CURRENCY,
      kpis: {
        totalRevenue: windowRevenue,
        mrr: mrrAt(subscriptions, win.end),
        revenuePerMember: activeMembers === 0 ? 0 : Math.round(windowRevenue / activeMembers),
        outstandingTotal: total,
      },
      revenueOverTime: [...recurringBuckets.entries()].map(([label, recurring]) => ({
        label,
        recurring,
        oneOff: oneOffBuckets.get(label) ?? 0,
      })),
      mrrOverTime,
      projected: {
        total: sum([...projectedBuckets.values()]),
        points: [...projectedBuckets.entries()].map(([label, value]) => ({ label, value })),
        atRiskCount,
        atRiskTotal,
      },
      outstanding: { count, total, overdueCount, overdueTotal, failedCount, failedTotal },
      // Fewer than two active locations is not an empty breakdown — it is a
      // question that does not apply, and the client drops the card entirely.
      byLocation: locationCount < 2 ? null : locations,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

function sum(values: number[]): number {
  return values.reduce((running, value) => running + value, 0);
}

/** One subscription's price normalised to a month, in MINOR units. */
function monthlyValue(sub: RevenueSubscriptionRow): number {
  return sub.interval === SubscriptionInterval.YEAR
    ? Math.round(sub.priceAmount / 12)
    : sub.priceAmount;
}

/**
 * Whether a subscription was on a PAID plan at `at`.
 *
 * `updatedAt` is the boundary of what the row knows. At or after it, today's
 * status is exact, so only `ACTIVE` counts — a trial has not been charged, a
 * past-due charge was not collected, a frozen plan is paused. Before it, the row
 * has changed since and today's status says nothing about then; count it unless it
 * is a trial that never converted at all.
 *
 * Without that boundary a gym that churned half its base would draw a flat, low
 * MRR line for its whole history.
 */
function wasBillingAt(sub: RevenueSubscriptionRow, at: Date): boolean {
  if (!wasLiveAt(sub, at)) return false;
  if (sub.status === SubscriptionStatus.TRIAL) return false;
  if (at >= sub.updatedAt) return sub.status === SubscriptionStatus.ACTIVE;
  return true;
}

/** The monthly value of the paid subscription base at `at`. */
function mrrAt(subs: RevenueSubscriptionRow[], at: Date): number {
  let total = 0;
  for (const sub of subs) {
    if (wasBillingAt(sub, at)) total += monthlyValue(sub);
  }
  return total;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test -- dashboard-revenue`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write apps/api/src/dashboard/
git add apps/api/src/dashboard/
git commit -m "feat(api): aggregate the Revenue dashboard tab"
```

---

### Task 4: Expose it on the dashboard controller

**Files:**

- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.module.ts`
- Test: `apps/api/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**

- Consumes: `DashboardRevenueService.get` (Task 3), `dashboardRevenueQuerySchema` (Task 1).
- Produces: `GET /dashboard/revenue`, gated on `Permission.ReportView`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/dashboard/dashboard.controller.spec.ts`, following the existing `sales` / `members` cases in that file (read them first — the `setup()` helper there is what supplies the stubbed services, and it needs a `revenueTab` added the same way `membersTab` was):

```ts
it('reads the revenue tab through the parsed query', async () => {
  const { controller, revenueGet } = setup();
  await controller.revenue({ granularity: 'weekly', projectionWindow: '30' });
  expect(revenueGet).toHaveBeenCalledWith({ granularity: 'weekly', projectionWindow: '30' });
});

// A hand-edited URL must land on the defaults rather than 400 the whole tab.
it('falls back to the defaults on an unknown revenue query', async () => {
  const { controller, revenueGet } = setup();
  await controller.revenue({ granularity: 'hourly', projectionWindow: '999' });
  expect(revenueGet).toHaveBeenCalledWith({ granularity: 'daily', projectionWindow: '7' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- dashboard.controller`
Expected: FAIL — `controller.revenue is not a function`.

- [ ] **Step 3: Add the route**

In `apps/api/src/dashboard/dashboard.controller.ts`:

1. Extend the imports from `@fit/types` with `dashboardRevenueQuerySchema` and `type DashboardRevenueResponse`, and add `import { DashboardRevenueService } from './dashboard-revenue.service';`
2. Add a constructor parameter beside `membersTab`:

```ts
    private readonly revenueTab: DashboardRevenueService,
```

3. Add the handler after `members()`:

```ts
  /**
   * `GET /dashboard/revenue?granularity=&projectionWindow=` — the hand-built
   * Revenue tab in one payload: four KPIs, the two-stream revenue trend, the MRR
   * trend, the projection, the outstanding-invoice snapshot and the location
   * breakdown.
   *
   * Both params scope the WHOLE response, which is why the tab is one round trip:
   * a partial refresh could leave two cards describing different windows. The Zod
   * schema `.catch`es unknown values to the defaults rather than raising a 400.
   */
  @Get('revenue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async revenue(@Query() query: unknown): Promise<DashboardRevenueResponse> {
    return this.revenueTab.get(dashboardRevenueQuerySchema.parse(query));
  }
```

4. In `dashboard.module.ts`, import `DashboardRevenueService` and add it to `providers` beside `DashboardMembersService`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test -- dashboard && pnpm --filter api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write apps/api/src/dashboard/
git add apps/api/src/dashboard/
git commit -m "feat(api): serve GET /dashboard/revenue"
```

---

### Task 5: The admin data layer

**Files:**

- Modify: `apps/admin/lib/api.ts`
- Create: `apps/admin/app/(dashboard)/revenue-insights/actions.ts`

**Interfaces:**

- Produces: `fetchDashboardRevenue(query: DashboardRevenueQuery): Promise<DashboardRevenueResponse>`; `loadRevenueAction(query: DashboardRevenueQuery): Promise<ActionResult<DashboardRevenueResponse>>` where `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`.

- [ ] **Step 1: Add the fetcher**

In `apps/admin/lib/api.ts`, extend the `@fit/types` import with `type DashboardRevenueQuery` and `type DashboardRevenueResponse`, then add directly after `fetchDashboardMembers`:

```ts
/**
 * `GET /dashboard/revenue` — the hand-built Revenue tab in one payload. Both
 * params scope the whole response, so the tab never shows two cards describing
 * different windows; the API `.catch`es unknown values to its own defaults.
 */
export async function fetchDashboardRevenue(
  query: DashboardRevenueQuery,
): Promise<DashboardRevenueResponse> {
  const qs = new URLSearchParams({
    granularity: query.granularity,
    projectionWindow: query.projectionWindow,
  });
  const res = await fetch(`${apiBaseUrl()}/dashboard/revenue?${qs.toString()}`, {
    headers: await authHeaders(),
    // Revenue reflects live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardRevenueResponse>(res);
}
```

- [ ] **Step 2: Add the server action**

Create `apps/admin/app/(dashboard)/revenue-insights/actions.ts`:

```ts
'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  dashboardRevenueQuerySchema,
  type DashboardRevenueQuery,
  type DashboardRevenueResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardRevenue } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Load the whole Revenue tab. Re-asserts the reporting capability first: the
 * middleware gates the route, but a Server Action is a POST endpoint in its own
 * right — defence in depth ahead of the API's own guard. Errors come back as a
 * message so a failed load stays local to the tab.
 */
export async function loadRevenueAction(
  query: DashboardRevenueQuery,
): Promise<ActionResult<DashboardRevenueResponse>> {
  const t = await getTranslations('admin.dashboard.revenue');
  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.ReportView)) {
    return { ok: false, error: t('loadError') };
  }
  try {
    // Re-parsed rather than trusted: the argument crosses a network boundary like
    // any other request body, so it is validated here as well as API-side.
    return {
      ok: true,
      data: await fetchDashboardRevenue(dashboardRevenueQuerySchema.parse(query)),
    };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @fit/admin exec tsc --noEmit`
Expected: PASS (the i18n key it reads lands in Task 6; `getTranslations` is not type-checked against the catalogue).

- [ ] **Step 4: Commit**

```bash
pnpm exec prettier --write apps/admin/lib/api.ts "apps/admin/app/(dashboard)/revenue-insights/actions.ts"
git add apps/admin/lib/api.ts "apps/admin/app/(dashboard)/revenue-insights/"
git commit -m "feat(admin): fetch the Revenue dashboard tab"
```

---

### Task 6: The tab's copy, in both locales

**Files:**

- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/ka.json`

- [ ] **Step 1: Add the English block**

In `packages/i18n/locales/en.json`, inside `admin.dashboard`, directly after the `members` block:

```json
      "revenue": {
        "granularityLabel": "Granularity",
        "granularity": { "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly" },
        "window": {
          "daily": "Last 30 days",
          "weekly": "Last 12 weeks",
          "monthly": "Last 12 months"
        },
        "kpi": {
          "totalRevenue": "Total revenue",
          "mrr": "Recurring / mo",
          "revenuePerMember": "Per member",
          "outstandingTotal": "Outstanding"
        },
        "kpiCaption": "{window} · recurring and outstanding are current, not windowed",
        "trend": {
          "title": "Revenue over time",
          "caption": "Memberships against sales & POS",
          "chartAria": "Revenue per period, memberships against sales",
          "recurring": "Memberships",
          "oneOff": "Sales & POS",
          "empty": "No revenue in this window."
        },
        "mrr": {
          "title": "Recurring revenue",
          "caption": "Monthly value of active plans · {total} now",
          "chartAria": "Monthly recurring revenue per period",
          "note": "Earlier periods are reconstructed from today's plans.",
          "empty": "No active plans to bill yet."
        },
        "projected": {
          "title": "Coming in",
          "windowLabel": "Projection window",
          "window": { "7": "7d", "30": "30d" },
          "caption": "{total} due in the next {days} days",
          "chartAria": "Scheduled charges per day",
          "atRisk": "{count} past due · {total} at risk",
          "empty": "No charges scheduled in this window."
        },
        "outstanding": {
          "title": "Outstanding invoices",
          "caption": "Gym-wide, whatever the chart is showing",
          "count": "{count} unsettled",
          "overdue": "{count} overdue · {total}",
          "failed": "{count} failed charges · {total}",
          "empty": "Nothing unsettled."
        },
        "byLocation": {
          "title": "Revenue by location",
          "caption": "Sales & POS only — a subscription names no location.",
          "empty": "No located revenue in this window."
        },
        "loadError": "Couldn't load revenue.",
        "retry": "Retry"
      },
```

- [ ] **Step 2: Add the Georgian block**

In `packages/i18n/locales/ka.json`, in the same position:

```json
      "revenue": {
        "granularityLabel": "დეტალურობა",
        "granularity": { "daily": "დღიური", "weekly": "კვირეული", "monthly": "თვიური" },
        "window": {
          "daily": "ბოლო 30 დღე",
          "weekly": "ბოლო 12 კვირა",
          "monthly": "ბოლო 12 თვე"
        },
        "kpi": {
          "totalRevenue": "ჯამური შემოსავალი",
          "mrr": "განმეორებადი / თვე",
          "revenuePerMember": "წევრზე",
          "outstandingTotal": "დაუფარავი"
        },
        "kpiCaption": "{window} · განმეორებადი და დაუფარავი მიმდინარეა, არა ფანჯარაზე",
        "trend": {
          "title": "შემოსავალი დროში",
          "caption": "აბონემენტები გაყიდვებისა და POS-ის წინააღმდეგ",
          "chartAria": "შემოსავალი პერიოდებში, აბონემენტები და გაყიდვები",
          "recurring": "აბონემენტები",
          "oneOff": "გაყიდვები და POS",
          "empty": "ამ პერიოდში შემოსავალი არ არის."
        },
        "mrr": {
          "title": "განმეორებადი შემოსავალი",
          "caption": "აქტიური გეგმების თვიური ღირებულება · ახლა {total}",
          "chartAria": "თვიური განმეორებადი შემოსავალი პერიოდებში",
          "note": "წინა პერიოდები დღევანდელი გეგმებიდან არის აღდგენილი.",
          "empty": "ჯერ არ არის აქტიური გეგმა."
        },
        "projected": {
          "title": "მოსალოდნელი",
          "windowLabel": "პროგნოზის ფანჯარა",
          "window": { "7": "7დღ", "30": "30დღ" },
          "caption": "მომდევნო {days} დღეში {total}",
          "chartAria": "დაგეგმილი ჩამოჭრები დღეების მიხედვით",
          "atRisk": "{count} ვადაგადაცილებული · {total} რისკის ქვეშ",
          "empty": "ამ ფანჯარაში ჩამოჭრა დაგეგმილი არ არის."
        },
        "outstanding": {
          "title": "დაუფარავი ინვოისები",
          "caption": "მთელ ჯიმზე, გრაფიკის ფანჯრისგან დამოუკიდებლად",
          "count": "{count} დაუფარავი",
          "overdue": "{count} ვადაგადაცილებული · {total}",
          "failed": "{count} ჩაშლილი ჩამოჭრა · {total}",
          "empty": "დაუფარავი არაფერია."
        },
        "byLocation": {
          "title": "შემოსავალი ფილიალებით",
          "caption": "მხოლოდ გაყიდვები და POS — აბონემენტს ფილიალი არ აქვს მითითებული.",
          "empty": "ამ პერიოდში ფილიალზე მიბმული შემოსავალი არ არის."
        },
        "loadError": "შემოსავლის ჩატვირთვა ვერ მოხერხდა.",
        "retry": "ხელახლა"
      },
```

- [ ] **Step 3: Verify both locales still parse and stay in step**

Run: `pnpm --filter @fit/i18n test`
Expected: PASS — including whatever key-parity check the package already runs.

- [ ] **Step 4: Commit**

```bash
pnpm exec prettier --write packages/i18n/locales/
git add packages/i18n/locales/
git commit -m "feat(i18n): add the Revenue dashboard tab copy"
```

---

### Task 7: The KPI strip and the two revenue trends

**Files:**

- Create: `apps/admin/app/(dashboard)/revenue-insights/revenue-kpi-strip.tsx`
- Create: `apps/admin/app/(dashboard)/revenue-insights/revenue-trend-card.tsx`
- Create: `apps/admin/app/(dashboard)/revenue-insights/recurring-revenue-card.tsx`

**Interfaces:**

- Produces: `<RevenueKpiStrip kpis granularity money />`, `<RevenueTrendCard points granularity onSelectGranularity disabled />`, `<RecurringRevenueCard points current money />`.
- Consumes: `AreaChart`/`AreaPoint`, `DualAreaChart`/`DualPoint` from `../charts`; `EmptyState` from `../overview/format`; `formatBucket` from `../format`; `Card`, `SegmentedControl`, `SegmentedControlItem` from Astryx.

All three are the Members tab's card treatment with different data. Open
`app/(dashboard)/member-retention/members-kpi-strip.tsx`,
`active-members-card.tsx` and `signups-vs-churn-card.tsx` alongside — the StyleX
blocks are copied verbatim from them and only the marked parts differ.

- [ ] **Step 1: The KPI strip**

Copy `member-retention/members-kpi-strip.tsx` to
`revenue-insights/revenue-kpi-strip.tsx` and change exactly four things:

1. The header comment:

```tsx
// The Revenue tab's four numbers, in one container — the Members tab's treatment,
// and deliberately identical to it so the three tabs read as one dashboard.
//
// ALL FOUR are money, so all four divide by 100 on the way out. What differs is
// the period they describe, and the caption is where that is stated: total revenue
// and per-member are windowed, while recurring and outstanding are current. A
// strip that let those be read as one window would be quietly wrong twice.
```

2. The type import: `import type { RevenueGranularity, RevenueKpis } from '@fit/types';`
3. The tile list:

```tsx
/** The tiles, in reading order. Every one is money, in MINOR units. */
const TILES = [
  'totalRevenue',
  'mrr',
  'revenuePerMember',
  'outstandingTotal',
] as const satisfies readonly (keyof RevenueKpis)[];
```

4. The component — the signature keeps `money: Intl.NumberFormat`, the namespace
   becomes `admin.dashboard.revenue`, and the cell body loses the count branch:

```tsx
export function RevenueKpiStrip({
  kpis,
  granularity,
  money,
}: {
  kpis: RevenueKpis;
  granularity: RevenueGranularity;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.revenue');

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((key) => (
            <div key={key} {...stylex.props(styles.cell)}>
              <span {...stylex.props(styles.label)}>{t(`kpi.${key}`)}</span>
              {/* Money is carried in MINOR units; the strip shows major units. */}
              <span {...stylex.props(styles.value)}>{money.format(kpis[key] / 100)}</span>
            </div>
          ))}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', { window: t(`window.${granularity}`) })}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: The two-stream trend card**

Copy `member-retention/signups-vs-churn-card.tsx` to
`revenue-insights/revenue-trend-card.tsx`, keep every StyleX block, and add the
`head` layout from `active-members-card.tsx` (the one with
`justifyContent: 'space-between'`) so the granularity control has a place to sit.
The component:

Its imports:

```tsx
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type RevenueGranularity, type RevenueStreamPoint } from '@fit/types';
import { DualAreaChart, type DualPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';
```

```tsx
export function RevenueTrendCard({
  points,
  granularity,
  onSelectGranularity,
  disabled,
}: {
  points: RevenueStreamPoint[];
  granularity: RevenueGranularity;
  onSelectGranularity: (next: RevenueGranularity) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const locale = useLocale();

  const data: DualPoint[] = points.map((point) => ({
    label: point.label,
    primary: point.recurring,
    secondary: point.oneOff,
  }));
  const hasData = data.some((point) => point.primary !== 0 || point.secondary !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('trend.title')}</h2>
          <p {...stylex.props(styles.caption)}>{t('trend.caption')}</p>
        </div>
        <SegmentedControl
          value={granularity}
          onChange={(next) => onSelectGranularity(next as RevenueGranularity)}
          label={t('granularityLabel')}
          size="sm"
          isDisabled={disabled}
        >
          {SALES_GRANULARITIES.map((value) => (
            <SegmentedControlItem key={value} value={value} label={t(`granularity.${value}`)} />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <DualAreaChart data={data} ariaLabel={t('trend.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchRecurring)} aria-hidden="true" />
              {t('trend.recurring')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchOneOff)} aria-hidden="true" />
              {t('trend.oneOff')}
            </span>
          </div>
        </>
      ) : (
        <EmptyState>{t('trend.empty')}</EmptyState>
      )}
    </Card>
  );
}
```

Rename the two swatch styles to `swatchRecurring` (`backgroundColor: 'var(--color-accent)'`) and `swatchOneOff` (`backgroundColor: 'var(--color-brand)'`). This card takes **no** `money` prop: it renders no formatted figure of its own — the totals are the KPI strip's job and the axis carries dates. Adding an unused prop for symmetry would trip `--max-warnings 0`.

Header comment:

```tsx
// Revenue over the tab's window, split into the two streams it actually arrives in.
//
// `DualAreaChart` scales both series to a SHARED maximum, which is the point: a
// month where memberships dwarf the till must LOOK like that. Two independently
// scaled series would draw them the same height.
//
// The two are disjoint by construction — subscription invoices carry no `orderId`,
// order payments are counted from the payment — so reading them stacked in the eye
// is reading the real total.
```

- [ ] **Step 3: The MRR card**

Copy `member-retention/active-members-card.tsx` to
`revenue-insights/recurring-revenue-card.tsx`, drop the `SegmentedControl` (this
card owns no control — the trend card owns the granularity), and render the
reconstruction note under the chart using the existing `caption` style:

```tsx
export function RecurringRevenueCard({
  points,
  current,
  money,
}: {
  points: ReportSeriesPoint[];
  /** MRR right now, for the caption. */
  current: number;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const locale = useLocale();

  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  const hasData = data.some((point) => point.value !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('mrr.title')}</h2>
          <p {...stylex.props(styles.caption)}>
            {t('mrr.caption', { total: money.format(current / 100) })}
          </p>
        </div>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('mrr.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <p {...stylex.props(styles.caption)}>{t('mrr.note')}</p>
        </>
      ) : (
        <EmptyState>{t('mrr.empty')}</EmptyState>
      )}
    </Card>
  );
}
```

Header comment:

```tsx
// The monthly value of the paid subscription base, over the tab's window.
//
// "Paid" excludes trials (not yet charged), past-due (charged, not collected) and
// frozen (paused) plans. A yearly plan is divided by twelve so one line can carry
// both intervals.
//
// The note under the chart is not decoration: there is no status history in the
// schema, so earlier buckets are reconstructed from today's rows. Stating that on
// the card is cheaper than an owner discovering it from a number that will not
// reconcile with their books.
```

- [ ] **Step 4: Verify they compile**

Run: `pnpm --filter @fit/admin exec tsc --noEmit && pnpm --filter @fit/admin lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write "apps/admin/app/(dashboard)/revenue-insights/"
git add "apps/admin/app/(dashboard)/revenue-insights/"
git commit -m "feat(admin): add the Revenue KPI strip and revenue trends"
```

---

### Task 8: The projection card and the two rail snapshots

**Files:**

- Create: `apps/admin/app/(dashboard)/revenue-insights/projected-revenue-card.tsx`
- Create: `apps/admin/app/(dashboard)/revenue-insights/outstanding-invoices-card.tsx`
- Create: `apps/admin/app/(dashboard)/revenue-insights/revenue-by-location-card.tsx`

**Interfaces:**

- Produces: `<ProjectedRevenueCard projected window money onSelectWindow disabled />`, `<OutstandingInvoicesCard outstanding money />`, `<RevenueByLocationCard slices money />`.

- [ ] **Step 1: The projection card**

Create `revenue-insights/projected-revenue-card.tsx`, reusing `active-members-card.tsx`'s StyleX block plus one extra style:

```tsx
'use client';

// What is scheduled to arrive, day by day, and what is already late.
//
// Not a forecast: every bar is a charge an existing subscription's own billing date
// has already set. Nothing here models growth or churn — a number that guessed
// would be worth less than the one that does not.
//
// The at-risk line beneath is deliberately OUTSIDE the total. Past-due money is
// late, not upcoming, and folding it in would let a collection problem read as a
// healthy week. It is shown here rather than hidden because "what is coming in" is
// only honest next to what is being chased.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { PROJECTION_WINDOW_DAYS, type ProjectedRevenue, type ProjectionWindow } from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';

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
  // The late money, in the error tone so it never reads as part of the total above.
  atRisk: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
});

const WINDOW_VALUES = ['7', '30'] as const satisfies readonly ProjectionWindow[];

export function ProjectedRevenueCard({
  projected,
  window,
  money,
  onSelectWindow,
  disabled,
}: {
  projected: ProjectedRevenue;
  window: ProjectionWindow;
  money: Intl.NumberFormat;
  onSelectWindow: (next: ProjectionWindow) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const locale = useLocale();

  const data: AreaPoint[] = projected.points.map((point) => ({
    label: point.label,
    value: point.value,
  }));
  const hasData = data.some((point) => point.value !== 0);
  const first = projected.points[0]?.label;
  const last = projected.points[projected.points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('projected.title')}</h2>
          <p {...stylex.props(styles.caption)}>
            {t('projected.caption', {
              total: money.format(projected.total / 100),
              days: PROJECTION_WINDOW_DAYS[window],
            })}
          </p>
        </div>
        <SegmentedControl
          value={window}
          onChange={(next) => onSelectWindow(next as ProjectionWindow)}
          label={t('projected.windowLabel')}
          size="sm"
          isDisabled={disabled}
        >
          {WINDOW_VALUES.map((value) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={t(`projected.window.${value}`)}
            />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('projected.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
        </>
      ) : (
        <EmptyState>{t('projected.empty')}</EmptyState>
      )}

      {projected.atRiskCount > 0 ? (
        <p {...stylex.props(styles.atRisk)}>
          {t('projected.atRisk', {
            count: projected.atRiskCount,
            total: money.format(projected.atRiskTotal / 100),
          })}
        </p>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 2: The outstanding-invoices card**

Create `revenue-insights/outstanding-invoices-card.tsx`:

```tsx
'use client';

// What is owed, gym-wide.
//
// NOT scoped to the tab's window, and the caption says so: a debt does not stop
// being owed because the chart is showing last week. This is the one card here
// whose numbers do not move when the granularity does.
//
// Overdue and failed are reported separately because they need different
// responses — an overdue invoice is chased, a failed charge is retried — and they
// deliberately OVERLAP: a failed charge can also be past its due date. Neither
// line claims to partition the total.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { OutstandingInvoices } from '@fit/types';
import { EmptyState } from '../overview/format';

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
  total: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  count: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  lines: { display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.75rem' },
  overdue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
  failed: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function OutstandingInvoicesCard({
  outstanding,
  money,
}: {
  outstanding: OutstandingInvoices;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.revenue');

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('outstanding.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('outstanding.caption')}</p>
      </div>

      {outstanding.count === 0 ? (
        <EmptyState>{t('outstanding.empty')}</EmptyState>
      ) : (
        <>
          <span {...stylex.props(styles.total)}>{money.format(outstanding.total / 100)}</span>
          <span {...stylex.props(styles.count)}>
            {t('outstanding.count', { count: outstanding.count })}
          </span>
          <div {...stylex.props(styles.lines)}>
            {outstanding.overdueCount > 0 ? (
              <span {...stylex.props(styles.overdue)}>
                {t('outstanding.overdue', {
                  count: outstanding.overdueCount,
                  total: money.format(outstanding.overdueTotal / 100),
                })}
              </span>
            ) : null}
            {outstanding.failedCount > 0 ? (
              <span {...stylex.props(styles.failed)}>
                {t('outstanding.failed', {
                  count: outstanding.failedCount,
                  total: money.format(outstanding.failedTotal / 100),
                })}
              </span>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: The location breakdown**

Create `revenue-insights/revenue-by-location-card.tsx`, following
`member-retention/status-breakdown-card.tsx`'s use of `BarChart` (open it first —
the card/head/title/caption StyleX block is copied from there):

```tsx
'use client';

// Where the takings came from, for a gym that has more than one branch.
//
// The view renders this only when the API sends an ARRAY. A single-location gym
// gets `null` — not an empty list — because the question does not apply to it, and
// an empty chart would be a different, wrong answer.
//
// Only the till/shop stream is attributable: a subscription invoice names no
// location, and inventing one would be a fabricated figure. The caption says that
// rather than letting these bars silently fail to add up to the KPI tile.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { RevenueLocationSlice } from '@fit/types';
import { BarChart, type BarDatum } from '../charts';

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
});

export function RevenueByLocationCard({
  slices,
  money,
}: {
  slices: RevenueLocationSlice[];
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const data: BarDatum[] = slices.map((slice) => ({
    label: slice.location,
    value: slice.value,
  }));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('byLocation.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('byLocation.caption')}</p>
      </div>
      <BarChart
        data={data}
        formatValue={(value) => money.format(value / 100)}
        emptyLabel={t('byLocation.empty')}
      />
    </Card>
  );
}
```

- [ ] **Step 4: Verify they compile**

Run: `pnpm --filter @fit/admin exec tsc --noEmit && pnpm --filter @fit/admin lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write "apps/admin/app/(dashboard)/revenue-insights/"
git add "apps/admin/app/(dashboard)/revenue-insights/"
git commit -m "feat(admin): add the Revenue projection and rail cards"
```

---

### Task 9: Assemble the tab

**Files:**

- Create: `apps/admin/app/(dashboard)/revenue-insights/revenue-view.tsx`
- Test: `apps/admin/app/(dashboard)/revenue-insights/revenue-view.test.tsx`

**Interfaces:**

- Consumes: every card from Tasks 7–8 and `loadRevenueAction` from Task 5.
- Produces: `<RevenueView />` — no props; the tab owns its own controls and fetch.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dashboard)/revenue-insights/revenue-view.test.tsx`. Read
`member-retention/members-view.test.tsx` first: the mock shape, the
`NextIntlClientProvider` fixture and the `flushPromises` helper come from there
unchanged.

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardRevenueResponse } from '@fit/types';

const loadRevenueAction = vi.fn();
vi.mock('./actions', () => ({
  loadRevenueAction: (...args: unknown[]): unknown => loadRevenueAction(...args) as unknown,
}));

const { RevenueView } = await import('./revenue-view');

const messages = {
  admin: {
    dashboard: {
      revenue: {
        granularityLabel: 'Granularity',
        granularity: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' },
        window: { daily: 'Last 30 days', weekly: 'Last 12 weeks', monthly: 'Last 12 months' },
        kpi: {
          totalRevenue: 'Total revenue',
          mrr: 'Recurring / mo',
          revenuePerMember: 'Per member',
          outstandingTotal: 'Outstanding',
        },
        kpiCaption: '{window}',
        trend: {
          title: 'Revenue over time',
          caption: 'Memberships against sales & POS',
          chartAria: 'Revenue per period',
          recurring: 'Memberships',
          oneOff: 'Sales & POS',
          empty: 'No revenue in this window.',
        },
        mrr: {
          title: 'Recurring revenue',
          caption: '{total} now',
          chartAria: 'MRR per period',
          note: "Earlier periods are reconstructed from today's plans.",
          empty: 'No active plans to bill yet.',
        },
        projected: {
          title: 'Coming in',
          windowLabel: 'Projection window',
          window: { '7': '7d', '30': '30d' },
          caption: '{total} due in the next {days} days',
          chartAria: 'Scheduled charges per day',
          atRisk: '{count} past due · {total} at risk',
          empty: 'No charges scheduled in this window.',
        },
        outstanding: {
          title: 'Outstanding invoices',
          caption: 'Gym-wide',
          count: '{count} unsettled',
          overdue: '{count} overdue · {total}',
          failed: '{count} failed charges · {total}',
          empty: 'Nothing unsettled.',
        },
        byLocation: {
          title: 'Revenue by location',
          caption: 'Sales & POS only',
          empty: 'No located revenue in this window.',
        },
        loadError: "Couldn't load revenue.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardRevenueResponse> = {}): DashboardRevenueResponse {
  return {
    granularity: 'daily',
    projectionWindow: '7',
    currency: 'GEL',
    kpis: { totalRevenue: 120_00, mrr: 80_00, revenuePerMember: 40_00, outstandingTotal: 15_00 },
    revenueOverTime: [{ label: '2026-08-01', recurring: 80_00, oneOff: 40_00 }],
    mrrOverTime: [{ label: '2026-08-01', value: 80_00 }],
    projected: {
      total: 60_00,
      points: [{ label: '2026-08-07', value: 60_00 }],
      atRiskCount: 0,
      atRiskTotal: 0,
    },
    outstanding: {
      count: 1,
      total: 15_00,
      overdueCount: 0,
      overdueTotal: 0,
      failedCount: 0,
      failedTotal: 0,
    },
    byLocation: null,
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RevenueView />
    </NextIntlClientProvider>,
  );
}

describe('RevenueView', () => {
  beforeEach(() => {
    loadRevenueAction.mockReset();
    loadRevenueAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('loads the tab and renders its cards', async () => {
    renderView();
    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
    expect(screen.getByText('Recurring revenue')).toBeInTheDocument();
    expect(screen.getByText('Coming in')).toBeInTheDocument();
    expect(screen.getByText('Outstanding invoices')).toBeInTheDocument();
    expect(loadRevenueAction).toHaveBeenCalledWith({
      granularity: 'daily',
      projectionWindow: '7',
    });
  });

  // A single-location gym is sent `null`, which is not "no revenue" — the card
  // has no question to answer and must not appear at all.
  it('drops the location card when the API sends null', async () => {
    renderView();
    await screen.findByText('Revenue over time');
    expect(screen.queryByText('Revenue by location')).not.toBeInTheDocument();
  });

  it('renders the location card for a multi-location gym', async () => {
    loadRevenueAction.mockResolvedValue({
      ok: true,
      data: response({ byLocation: [{ location: 'Vake', value: 40_00 }] }),
    });
    renderView();
    expect(await screen.findByText('Revenue by location')).toBeInTheDocument();
    expect(screen.getByText('Vake')).toBeInTheDocument();
  });

  it('refetches on a granularity change and serves a revisited combination from cache', async () => {
    renderView();
    await screen.findByText('Revenue over time');

    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    await screen.findByText('Revenue over time');
    expect(loadRevenueAction).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('radio', { name: 'Daily' }));
    await screen.findByText('Revenue over time');
    expect(loadRevenueAction).toHaveBeenCalledTimes(2);
  });

  it('refetches on a projection-window change', async () => {
    renderView();
    await screen.findByText('Revenue over time');
    await userEvent.click(screen.getByRole('radio', { name: '30d' }));
    await screen.findByText('Revenue over time');
    expect(loadRevenueAction).toHaveBeenLastCalledWith({
      granularity: 'daily',
      projectionWindow: '30',
    });
  });

  // A first load that fails has nothing to show around the alert, so the alert
  // IS the tab.
  it('makes a failed first load the whole tab, with a retry', async () => {
    loadRevenueAction.mockResolvedValue({ ok: false, error: "Couldn't load revenue." });
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load revenue.");
    expect(screen.queryByText('Revenue over time')).not.toBeInTheDocument();

    loadRevenueAction.mockResolvedValue({ ok: true, data: response() });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
  });

  // Once figures are on screen a failure becomes a banner: the controls live
  // inside the cards, so replacing the tab would strand the user on the
  // combination that just failed.
  it('keeps the previous figures on screen when a later load fails', async () => {
    renderView();
    await screen.findByText('Revenue over time');

    loadRevenueAction.mockResolvedValue({ ok: false, error: "Couldn't load revenue." });
    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load revenue.");
    expect(screen.getByText('Revenue over time')).toBeInTheDocument();
  });

  // `loadRevenueAction` resolves its OWN failures, so a rejection here is the
  // call itself failing. Without the catch it leaves a permanent skeleton.
  it('recovers from the action call itself rejecting', async () => {
    loadRevenueAction.mockRejectedValue(new Error('network'));
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load revenue.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- revenue-view`
Expected: FAIL — cannot resolve `./revenue-view`.

- [ ] **Step 3: Write the view**

Create `apps/admin/app/(dashboard)/revenue-insights/revenue-view.tsx` as a copy of
`member-retention/members-view.tsx` — the whole header comment block, every StyleX
block, the `motion` block, the `STAGGER_MS` constant, the cache/`attempt`/`settled`
machinery and the two error branches transfer unchanged. Only these differ:

1. The header comment's opening line becomes `// The Revenue tab.` and its
   "Both controls" paragraph becomes:

```tsx
// Both controls are owned HERE, not by the cards that display them: granularity
// scopes every trend on the tab and the projection window scopes the forecast, and
// one round trip recomputes both. A per-card fetch could leave the KPI strip
// describing one window while the chart beneath it described another.
```

2. The imports and state:

```tsx
import {
  DEFAULT_PROJECTION_WINDOW,
  DEFAULT_REVENUE_GRANULARITY,
  type DashboardRevenueResponse,
  type ProjectionWindow,
  type RevenueGranularity,
} from '@fit/types';
import { loadRevenueAction } from './actions';
import { RevenueKpiStrip } from './revenue-kpi-strip';
import { RevenueTrendCard } from './revenue-trend-card';
import { RecurringRevenueCard } from './recurring-revenue-card';
import { ProjectedRevenueCard } from './projected-revenue-card';
import { OutstandingInvoicesCard } from './outstanding-invoices-card';
import { RevenueByLocationCard } from './revenue-by-location-card';
```

```tsx
const t = useTranslations('admin.dashboard.revenue');
const locale = useLocale();

const [granularity, setGranularity] = useState<RevenueGranularity>(DEFAULT_REVENUE_GRANULARITY);
const [projectionWindow, setProjectionWindow] =
  useState<ProjectionWindow>(DEFAULT_PROJECTION_WINDOW);

const cache = useRef(new Map<string, DashboardRevenueResponse>());
const [data, setData] = useState<DashboardRevenueResponse | null>(null);
const [error, setError] = useState<string | null>(null);
const [pending, setPending] = useState(false);
const [attempt, setAttempt] = useState(0);

const key = `${granularity}:${projectionWindow}`;
```

3. The effect body calls `loadRevenueAction({ granularity, projectionWindow })`
   and its dependency array is `[key, granularity, projectionWindow, attempt, t]`.

4. `shownKey` becomes:

```tsx
const shownKey = data === null ? '' : `${data.granularity}:${data.projectionWindow}`;
```

5. The rendered body:

```tsx
      <div {...stylex.props(step(0))}>
        <RevenueKpiStrip kpis={data.kpis} granularity={data.granularity} money={money} />
      </div>

      <div {...stylex.props(styles.workArea)}>
        <div {...stylex.props(styles.column)}>
          <div {...stylex.props(step(1))}>
            <RevenueTrendCard
              points={data.revenueOverTime}
              granularity={granularity}
              onSelectGranularity={setGranularity}
              disabled={pending}
            />
          </div>
          <div {...stylex.props(step(2))}>
            <RecurringRevenueCard points={data.mrrOverTime} current={data.kpis.mrr} money={money} />
          </div>
          <div {...stylex.props(step(3))}>
            <ProjectedRevenueCard
              projected={data.projected}
              window={projectionWindow}
              money={money}
              onSelectWindow={setProjectionWindow}
              disabled={pending}
            />
          </div>
        </div>

        {/*
          The rail is what is owed and where it came from — the two facts that do
          not move with the trends above. `byLocation === null` is a single-location
          gym: the card is absent rather than empty, because the question does not
          apply to it.
        */}
        <div {...stylex.props(styles.rail)}>
          <div {...stylex.props(step(2))}>
            <OutstandingInvoicesCard outstanding={data.outstanding} money={money} />
          </div>
          {data.byLocation !== null ? (
            <div {...stylex.props(step(3))}>
              <RevenueByLocationCard slices={data.byLocation} money={money} />
            </div>
          ) : null}
        </div>
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @fit/admin test -- revenue-view`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write "apps/admin/app/(dashboard)/revenue-insights/"
git add "apps/admin/app/(dashboard)/revenue-insights/"
git commit -m "feat(admin): assemble the Revenue tab view"
```

---

### Task 10: Promote the tab in the shell

**Files:**

- Modify: `packages/types/src/dashboard-segments.ts`
- Modify: `packages/types/src/dashboard-segments.spec.ts`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segment-panel.test.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx`
- Modify: `apps/admin/app/(dashboard)/dashboard-header.test.tsx`
- Modify: `apps/api/src/dashboard/dashboard-segments.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`
- Modify: `packages/i18n/locales/{en,ka}.json`

**Interfaces:**

- Consumes: `RevenueView` (Task 9), `isHandBuiltSegment` (already shipped).
- Produces: `HAND_BUILT_SEGMENTS = ['overview', 'sales', 'members', 'revenue']`, `CONFIGURABLE_DASHBOARD_SEGMENTS = ['classes', 'staff']`.

- [ ] **Step 1: Write the failing tests**

In `packages/types/src/dashboard-segments.spec.ts`, replace the `revenue`-based
catalogue cases with `classes` and add the removal case:

```ts
it('returns a segment its widgets in catalogue order', () => {
  expect(widgetsForSegment('classes').map((widget) => widget.key)).toEqual([
    'classes.most-booked',
    'classes.peak-hours',
  ]);
});

it('finds a widget by key and misses on an unknown one', () => {
  expect(findDashboardWidget('classes.most-booked')?.segment).toBe('classes');
  expect(findDashboardWidget('classes.nope')).toBeUndefined();
});

it('no longer defines any revenue widget', () => {
  expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('revenue.'))).toBe(false);
  expect(findDashboardWidget('revenue.over-time')).toBeUndefined();
});
```

and update the tab-order assertion:

```ts
expect(DASHBOARD_SEGMENTS.slice(0, 4)).toEqual(['overview', 'sales', 'members', 'revenue']);
```

In `apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx`, add the
mock beside the other two view mocks and the mounting case:

```tsx
vi.mock('../revenue-insights/revenue-view', () => ({
  RevenueView: () => <div>Revenue view</div>,
}));
```

```tsx
it('renders the hand-built revenue view, not the widget panel', () => {
  navigationMock.setSearch('segment=revenue');
  renderShell('revenue');
  expect(screen.getByText('Revenue view')).toBeInTheDocument();
  expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
});
```

and extend the hand-built loop to `['sales', 'members', 'revenue']`.

In `dashboard-header.test.tsx`, extend the `it.each` list to
`['sales', 'members', 'revenue']` and move the two remaining `renderHeader('revenue')`
cases (the title case and the range-filter case) to `'classes'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @fit/types test -- dashboard-segments && pnpm --filter @fit/admin test -- "app/(dashboard)"`
Expected: FAIL — `revenue` is still configurable and still routed to the panel.

- [ ] **Step 3: Make the change**

In `packages/types/src/dashboard-segments.ts`:

```ts
export const CONFIGURABLE_DASHBOARD_SEGMENTS = ['classes', 'staff'] as const;

export const HAND_BUILT_SEGMENTS = ['overview', 'sales', 'members', 'revenue'] as const;
```

Delete the two `revenue.*` entries from `DASHBOARD_WIDGET_CATALOG`, and extend the
`CONFIGURABLE_DASHBOARD_SEGMENTS` doc comment's hand-built list to name `revenue`
alongside `sales` and `members`.

In `segmented-dashboard.tsx`, import `RevenueView` from
`'../revenue-insights/revenue-view'` and add its mount beside the other two:

```tsx
{
  active === 'revenue' ? <RevenueView /> : null;
}
```

Remove `revenueOverTime` and `revenueByLocation` from `admin.dashboard.widgets` in
both locales.

- [ ] **Step 4: Migrate the remaining test fixtures**

`segment-panel.test.tsx`, `add-widget-dialog.test.tsx` and the two API segment
specs all use `revenue` as their configurable exemplar. Move each to `classes`
(widgets `classes.most-booked` / `classes.peak-hours`, metrics `classes` and
`attendance`) and use `staff` wherever a _second_ configurable segment is needed.
In `dashboard-segments.service.spec.ts`, the "computes a shared metric once" case
needs a segment whose two widgets share ONE metric — no such segment remains, so
**delete that case** and leave a comment in its place:

```ts
// The shared-metric branch of the dedup has no fixture left: every segment in
// the catalogue now resolves to one metric per widget. The `classes` case above
// still covers the cross-metric branch. Restore a case here if a segment ever
// gains two widgets on one metric again.
```

- [ ] **Step 5: Run the whole suite**

Run: `pnpm type-check && pnpm test && pnpm lint`
Expected: PASS everywhere.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write packages/ apps/
git add -A
git commit -m "feat(admin): route the Revenue tab to its hand-built view"
```

---

## Verification

Run before calling the feature done:

```bash
pnpm type-check
pnpm test
pnpm lint
pnpm format:check
rm -rf apps/admin/.next && pnpm --filter @fit/admin build
```

The `.next` removal is not superstition: a stale cache makes `next build` fail on
unrelated routes with `PageNotFoundError`.
