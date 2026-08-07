# Dashboard Members Tab — Plan A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Members tab's widget grid with a hand-built view carrying a KPI strip, three trends (active members, signups-vs-churn, retention %), and a members-by-status breakdown.

**Architecture:** Mirrors the Sales tab exactly — one contract module in `@fit/types`, one tenant-scoped Nest service behind one route, and a client view on the Overview's grid. `members` leaves `CONFIGURABLE_DASHBOARD_SEGMENTS` and stays in `DASHBOARD_SEGMENTS`, as `sales` did.

**Tech Stack:** TypeScript, Zod (`@fit/types`), NestJS + Prisma (`apps/api`), Next.js App Router + React + StyleX + Astryx (`apps/admin`), next-intl (`@fit/i18n`), Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-07-dashboard-members-design.md`](../specs/2026-08-07-dashboard-members-design.md)

**Reference implementation:** `apps/admin/app/(dashboard)/sales/` and `apps/api/src/dashboard/dashboard-sales.service.ts`. This tab is deliberately its sibling. Read the Sales equivalent of whatever you are writing before you write it.

**Plan B** (`expiring soon` + `at risk` watch-lists) follows this plan and is not in scope here. Do not build toward it speculatively.

## Global Constraints

- **Money is MINOR units** (cents/tetri) on every wire shape and in the service. Cards divide by 100 at render; the view does not.
- **`deletedAt: null` on every `GymMember` read.** Trashed members are excluded from every figure. The existing `members` drill-down omits this filter — do not copy it.
- **`CheckIn` is NOT in the tenant extension's model set.** Any `checkIn` query must pin `gymId: this.tenant.gymId` explicitly. (Not needed in Plan A; stated because the constraint binds the file.)
- **Import `LIVE_SUBSCRIPTION_STATUSES` and `ENTITLED_SUBSCRIPTION_STATUSES` from `@fit/db`.** Three hand-written copies already exist (`dashboard.service.ts:40`, `members.service.ts:64`, `report-drilldown.service.ts:34`). **Do not create a fourth.**
- **No design-token changes.** Existing `var(--color-*)` / `var(--font-family-*)` only.
- **No Tailwind utilities** in `apps/admin` — compiled StyleX only (`pnpm check:tailwind-guardrail`).
- **No Prisma migrations.** Every figure derives from existing columns.
- **Honesty contract:** a figure is a real aggregation or an explicit empty state. Time series are densely zero-filled; breakdowns are not. Retention emits `null`, never `0`, when its denominator is zero.
- **All UTC.** Window and bucket maths come from `apps/api/src/reports/report-window.util.ts`.
- **Every user-visible string is an i18n key** in **both** `packages/i18n/locales/en.json` and `ka.json`.
- **Prettier + eslint run on commit.** If the hook rejects, run `npx prettier --write <files>` and re-commit.

## File Structure

| File                                                           | Responsibility                    | Task |
| -------------------------------------------------------------- | --------------------------------- | ---- |
| `packages/types/src/dashboard-members.ts`                      | Query + response contract         | 1    |
| `packages/types/src/dashboard-members.spec.ts`                 | Contract tests                    | 1    |
| `packages/types/index.ts`                                      | Re-export                         | 1    |
| `apps/api/src/dashboard/dashboard-members.service.ts`          | The aggregation                   | 2    |
| `apps/api/src/dashboard/dashboard-members.service.spec.ts`     | Aggregation tests                 | 2    |
| `apps/api/src/dashboard/dashboard.controller.ts`               | `GET /dashboard/members`          | 3    |
| `apps/api/src/dashboard/dashboard.controller.spec.ts`          | Route tests                       | 3    |
| `apps/api/src/dashboard/dashboard.module.ts`                   | Provider wiring                   | 3    |
| `apps/admin/app/(dashboard)/charts.tsx`                        | `AreaChart` gap support           | 4    |
| `apps/admin/app/(dashboard)/charts.test.tsx`                   | Gap tests                         | 4    |
| `apps/admin/lib/api.ts`                                        | `fetchDashboardMembers`           | 5    |
| `apps/admin/app/(dashboard)/members/actions.ts`                | `loadMembersAction`               | 5    |
| `packages/i18n/locales/{en,ka}.json`                           | `admin.dashboard.members.*`       | 6    |
| `apps/admin/app/(dashboard)/members/members-kpi-strip.tsx`     | Four tiles                        | 7    |
| `apps/admin/app/(dashboard)/members/active-members-card.tsx`   | Trend + granularity control       | 8    |
| `apps/admin/app/(dashboard)/members/signups-vs-churn-card.tsx` | `DualAreaChart`                   | 8    |
| `apps/admin/app/(dashboard)/members/retention-card.tsx`        | Trend + 30/60/90 control          | 9    |
| `apps/admin/app/(dashboard)/members/status-breakdown-card.tsx` | `BarChart` over six statuses      | 9    |
| `apps/admin/app/(dashboard)/members/members-view.tsx`          | Fetch, cache, controls, layout    | 10   |
| `apps/admin/app/(dashboard)/members/members-view.test.tsx`     | View tests                        | 10   |
| `packages/types/src/dashboard-segments.ts`                     | Drop `members` from configurables | 11   |
| `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`  | Render `MembersView`              | 11   |
| `apps/admin/app/(dashboard)/dashboard-header.tsx`              | No `?range=` on `members`         | 11   |

Tasks 1–10 are additive: the Members tab keeps showing the old widget grid throughout. Task 11 is the only breaking change and carries all its test fallout.

---

### Task 1: The `@fit/types` contract

**Files:**

- Create: `packages/types/src/dashboard-members.ts`
- Create: `packages/types/src/dashboard-members.spec.ts`
- Modify: `packages/types/index.ts` (one export line beside the `dashboard-sales` one)

**Interfaces:**

- Consumes: `reportSeriesPointSchema` from `./reports-drilldown`; `salesGranularitySchema` from `./dashboard-sales`. (`SALES_GRANULARITY_RANGE` is consumed by Task 2's service, not here.)
- Produces: `membersGranularitySchema`, `retentionWindowSchema`, `expiringWindowSchema`, `dashboardMembersQuerySchema`, `dashboardMembersResponseSchema`, `MEMBERSHIP_STATUSES`, and the types `MembersGranularity`, `RetentionWindow`, `ExpiringWindow`, `MembershipStatus`, `MembersKpis`, `SignupsChurnPoint`, `RetentionPoint`, `MembershipStatusSlice`, `DashboardMembersQuery`, `DashboardMembersResponse`.

**Note on `expiringWindow`:** it is declared here and echoed by the API, but nothing in Plan A reads it. Plan B's expiring-soon card is its consumer. It is in the contract now so the query shape does not change under Plan B — a shipped contract that gains a required-ish field later forces a second round of client changes.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/dashboard-members.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRING_WINDOW,
  DEFAULT_MEMBERS_GRANULARITY,
  DEFAULT_RETENTION_WINDOW,
  MEMBERSHIP_STATUSES,
  dashboardMembersQuerySchema,
  dashboardMembersResponseSchema,
} from './dashboard-members';

describe('dashboardMembersQuerySchema', () => {
  it('defaults an absent query', () => {
    expect(dashboardMembersQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_MEMBERS_GRANULARITY,
      retentionWindow: DEFAULT_RETENTION_WINDOW,
      expiringWindow: DEFAULT_EXPIRING_WINDOW,
    });
  });

  // A hand-edited URL must land on the defaults, not a 400 — the rule every
  // dashboard query in this repo follows.
  it('falls back to the defaults on unknown values', () => {
    expect(
      dashboardMembersQuerySchema.parse({
        granularity: 'hourly',
        retentionWindow: '45',
        expiringWindow: '99',
      }),
    ).toEqual({ granularity: 'daily', retentionWindow: '30', expiringWindow: '7' });
  });

  it('keeps valid values', () => {
    expect(
      dashboardMembersQuerySchema.parse({
        granularity: 'monthly',
        retentionWindow: '90',
        expiringWindow: '30',
      }),
    ).toEqual({ granularity: 'monthly', retentionWindow: '90', expiringWindow: '30' });
  });
});

describe('MEMBERSHIP_STATUSES', () => {
  // The spec shows all six, not the four the request named: PAST_DUE is a
  // problem staff must react to, and CANCELED is not the same as EXPIRED.
  it('carries all six subscription states, in lifecycle order', () => {
    expect(MEMBERSHIP_STATUSES).toEqual([
      'trial',
      'active',
      'past-due',
      'frozen',
      'canceled',
      'expired',
    ]);
  });
});

describe('dashboardMembersResponseSchema', () => {
  it('accepts a fully populated response', () => {
    const parsed = dashboardMembersResponseSchema.parse({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
      currency: 'GEL',
      kpis: { activeMembers: 42, newSignups: 5, churned: 2, avgLtv: 18_000 },
      activeOverTime: [{ label: '2026-08-01', value: 42 }],
      signupsVsChurn: [{ label: '2026-08-01', signups: 5, churned: 2 }],
      retention: [{ label: '2026-08-01', value: 91.5 }],
      byStatus: [{ status: 'active', count: 30 }],
    });
    expect(parsed.kpis.avgLtv).toBe(18_000);
    expect(parsed.retention[0]?.value).toBe(91.5);
  });

  // A bucket with no denominator is not 0% retention — it is no retention. The
  // chart has to be able to tell them apart, so `null` has to survive the wire.
  it('accepts a null retention value', () => {
    const parsed = dashboardMembersResponseSchema.parse({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
      currency: 'GEL',
      kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
      activeOverTime: [],
      signupsVsChurn: [],
      retention: [{ label: '2026-08-01', value: null }],
      byStatus: [],
    });
    expect(parsed.retention[0]?.value).toBeNull();
  });

  it('rejects a status slice naming a state the enum does not define', () => {
    const result = dashboardMembersResponseSchema.safeParse({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
      currency: 'GEL',
      kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
      activeOverTime: [],
      signupsVsChurn: [],
      retention: [],
      byStatus: [{ status: 'lapsed', count: 1 }],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/types test -- dashboard-members`
Expected: FAIL — `Failed to resolve import "./dashboard-members"`.

- [ ] **Step 3: Write the contract**

Create `packages/types/src/dashboard-members.ts`:

```ts
// @fit/types — the hand-built Members dashboard tab's contract (Zod schemas).
//
// Sibling of `./dashboard-sales`. Where that tab answers "what did we take?",
// this one answers "who is still here, and for how much longer?" — the standing
// membership numbers plus the retention rate that frames them.
//
// Money is an integer in the currency's MINOR units (cents/tetri) throughout.
// Display labels for statuses and windows are NOT on the wire: they are i18n keys
// resolved client-side, so the API stays locale-free like every sibling contract.
//
// Every figure is a REAL aggregation over rows that exist today. Time series are
// densely zero-filled — a bucket with no signups is a real zero. Retention is the
// one exception in the other direction: a bucket whose denominator is zero emits
// `null`, never `0`, because a gym with no members to retain had no retention
// rate, and 0% is a different and alarming claim.

import { z } from 'zod';
import { salesGranularitySchema } from './dashboard-sales';
import { reportSeriesPointSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How the tab's trends are bucketed. Deliberately the SAME vocabulary and the
 * same window mapping as Sales (`SALES_GRANULARITY_RANGE`), so a user who learns
 * one tab's time control has learned the other's.
 */
export const membersGranularitySchema = salesGranularitySchema;
export type MembersGranularity = z.infer<typeof membersGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_MEMBERS_GRANULARITY: MembersGranularity = 'daily';

/**
 * How far back the rolling retention window reaches, in days. A string enum
 * rather than a number so it round-trips through a URL query and a
 * `SegmentedControl` value without coercion at either end.
 */
export const retentionWindowSchema = z.enum(['30', '60', '90']);
export type RetentionWindow = z.infer<typeof retentionWindowSchema>;

/** The retention window a query without one lands on. */
export const DEFAULT_RETENTION_WINDOW: RetentionWindow = '30';

/**
 * How far ahead the expiring-soon list looks, in days. Declared here and echoed
 * by the API, but **nothing in Plan A reads it** — Plan B's expiring-soon card is
 * its consumer. It is in the contract from the start so the query shape does not
 * change under that plan.
 */
export const expiringWindowSchema = z.enum(['7', '14', '30']);
export type ExpiringWindow = z.infer<typeof expiringWindowSchema>;

/** The expiring window a query without one lands on. */
export const DEFAULT_EXPIRING_WINDOW: ExpiringWindow = '7';

/**
 * `GET /dashboard/members?granularity=&retentionWindow=&expiringWindow=` query.
 * `.catch` (not `.default`) so a hand-edited URL lands on the default rather than
 * a 400 — the same forgiving rule the overview and sales queries apply.
 */
export const dashboardMembersQuerySchema = z.object({
  granularity: membersGranularitySchema.catch(DEFAULT_MEMBERS_GRANULARITY),
  retentionWindow: retentionWindowSchema.catch(DEFAULT_RETENTION_WINDOW),
  expiringWindow: expiringWindowSchema.catch(DEFAULT_EXPIRING_WINDOW),
});
export type DashboardMembersQuery = z.infer<typeof dashboardMembersQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The billing states a membership can be in, in lifecycle order — the wire form
 * of `SubscriptionStatus`.
 *
 * Named for the MEMBERSHIP, not the member: `./members` already exports a
 * `MemberStatus`, and it means something else entirely — `GymMemberStatus`, the
 * ACCOUNT's own state (active / invited / suspended). This one is the billing
 * truth. Two different questions, so two different names.
 *
 * All six, not the four a membership dashboard obviously needs: `past-due` is a
 * failed charge staff must react to before it becomes a cancellation, and
 * `canceled` (the member left) is a different fact from `expired` (the billing
 * ran out), which a retention surface must not merge.
 */
export const MEMBERSHIP_STATUSES = [
  'trial',
  'active',
  'past-due',
  'frozen',
  'canceled',
  'expired',
] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

/** One bucket of the signups-against-churn trend. */
export const signupsChurnPointSchema = z.object({
  /** Bucket start, `YYYY-MM-DD`. */
  label: z.string(),
  signups: z.number(),
  churned: z.number(),
});
export type SignupsChurnPoint = z.infer<typeof signupsChurnPointSchema>;

/**
 * One bucket of the retention trend. `value` is a percentage 0–100, or `null`
 * when the bucket had no members to retain — see this module's header.
 */
export const retentionPointSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
});
export type RetentionPoint = z.infer<typeof retentionPointSchema>;

/** One bar of the members-by-status breakdown. */
export const membershipStatusSliceSchema = z.object({
  status: membershipStatusSchema,
  count: z.number(),
});
export type MembershipStatusSlice = z.infer<typeof membershipStatusSliceSchema>;

/** The tab's four headline figures. `avgLtv` is MINOR units; the rest are counts. */
export const membersKpisSchema = z.object({
  activeMembers: z.number(),
  newSignups: z.number(),
  churned: z.number(),
  avgLtv: z.number(),
});
export type MembersKpis = z.infer<typeof membersKpisSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/members` response — the whole tab in one round trip, so its
 * controls never leave one card describing a different window from its neighbour.
 * Echoes the resolved query so the client can confirm what it is looking at.
 */
export const dashboardMembersResponseSchema = z.object({
  granularity: membersGranularitySchema,
  retentionWindow: retentionWindowSchema,
  expiringWindow: expiringWindowSchema,
  /** ISO-4217 currency `avgLtv` is denominated in. */
  currency: z.string(),
  kpis: membersKpisSchema,
  /** Members holding a live subscription at each bucket's start — dense. */
  activeOverTime: z.array(reportSeriesPointSchema),
  /** New joins against churned subscriptions per bucket — dense. */
  signupsVsChurn: z.array(signupsChurnPointSchema),
  /** Rolling retention per bucket — dense, with `null` where undefined. */
  retention: z.array(retentionPointSchema),
  /** Only states with a non-zero count, in lifecycle order. */
  byStatus: z.array(membershipStatusSliceSchema),
});
export type DashboardMembersResponse = z.infer<typeof dashboardMembersResponseSchema>;
```

- [ ] **Step 4: Export it**

In `packages/types/index.ts`, add beside the existing `dashboard-sales` export:

```ts
export * from './src/dashboard-members';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @fit/types test -- dashboard-members`
Expected: PASS — 7 tests.

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @fit/types type-check`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/dashboard-members.ts packages/types/src/dashboard-members.spec.ts packages/types/index.ts
git commit -m "feat(types): add the dashboard Members tab contract"
```

---

### Task 2: The aggregation service

**Files:**

- Create: `apps/api/src/dashboard/dashboard-members.service.ts`
- Create: `apps/api/src/dashboard/dashboard-members.service.spec.ts`

**Interfaces:**

- Consumes: Task 1's contract; `resolveWindow`, `bucketKey`, `emptyBuckets`, `DAY_MS`, `DEFAULT_CURRENCY` from `../reports/report-window.util`; `SALES_GRANULARITY_RANGE` from `@fit/types`; `LIVE_SUBSCRIPTION_STATUSES` from `@fit/db`; `TenantPrismaService`.
- Produces: `class DashboardMembersService` with `constructor(prisma: TenantPrismaService)` and one method `get(query: DashboardMembersQuery): Promise<DashboardMembersResponse>`.

**Background the implementer needs:**

`TenantPrismaService.client` is already constrained to the caller's gym — never pass or filter `gymId` yourself. `GymMember.deletedAt` is a soft-delete trash flag that the tenant extension does **not** apply; every read here must filter `deletedAt: null`, and `Subscription` reads must filter `member: { deletedAt: null }`. `LIVE_SUBSCRIPTION_STATUSES` from `@fit/db` is `[TRIAL, ACTIVE, PAST_DUE, FROZEN]`. `churnMoment`/`isTerminalBefore` logic (a subscription's terminal instant) is reproduced here as local helpers rather than imported, because `report-drilldown.service.ts` keeps them file-private; do not export them from there.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/dashboard-members.service.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvoiceStatus, PaymentStatus, Role, SubscriptionStatus } from '@fit/db';
import type { DashboardMembersQuery } from '@fit/types';
import { DashboardMembersService } from './dashboard-members.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

const DAY = 24 * 60 * 60 * 1000;

/** An instant `days` before now. `daily` spans 30 days, so ≤ 29 stays inside it. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

function member(over: { joinedAt?: Date; deletedAt?: Date | null } = {}) {
  return { joinedAt: over.joinedAt ?? daysAgo(10), deletedAt: over.deletedAt ?? null };
}

function subscription(over: {
  status?: SubscriptionStatus;
  createdAt?: Date;
  canceledAt?: Date | null;
  updatedAt?: Date;
  memberId?: string;
}) {
  return {
    memberId: over.memberId ?? 'mem-1',
    status: over.status ?? SubscriptionStatus.ACTIVE,
    createdAt: over.createdAt ?? daysAgo(200),
    canceledAt: over.canceledAt ?? null,
    updatedAt: over.updatedAt ?? daysAgo(200),
  };
}

function setup(
  rows: {
    members?: unknown[];
    subscriptions?: unknown[];
    payments?: unknown[];
    invoices?: unknown[];
    memberCount?: number;
  } = {},
) {
  const memberFindMany = vi.fn().mockResolvedValue(rows.members ?? []);
  const memberCount = vi.fn().mockResolvedValue(rows.memberCount ?? 0);
  const subscriptionFindMany = vi.fn().mockResolvedValue(rows.subscriptions ?? []);
  const paymentFindMany = vi.fn().mockResolvedValue(rows.payments ?? []);
  const invoiceFindMany = vi.fn().mockResolvedValue(rows.invoices ?? []);
  const prisma = {
    client: {
      gymMember: { findMany: memberFindMany, count: memberCount },
      subscription: { findMany: subscriptionFindMany },
      payment: { findMany: paymentFindMany },
      invoice: { findMany: invoiceFindMany },
    },
  } as unknown as TenantPrismaService;

  return {
    service: new DashboardMembersService(prisma),
    memberFindMany,
    memberCount,
    subscriptionFindMany,
    paymentFindMany,
    invoiceFindMany,
  };
}

const QUERY: DashboardMembersQuery = {
  granularity: 'daily',
  retentionWindow: '30',
  expiringWindow: '7',
};

describe('DashboardMembersService.get — trash', () => {
  afterEach(() => vi.clearAllMocks());

  // The bug the existing `members` drill-down has. Trashed members are hidden
  // from the roster and every live count; they must not inflate this tab either.
  it('excludes trashed members at the query level, on every read', async () => {
    const { service, memberFindMany, subscriptionFindMany } = setup();
    await service.get(QUERY);

    const memberArgs = memberFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(memberArgs.where).toMatchObject({ deletedAt: null });

    const subArgs = subscriptionFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(subArgs.where).toMatchObject({ member: { deletedAt: null } });
  });

  // The LTV denominator is a separate `count` call and would be just as easy to
  // leave unfiltered — a gym that trashed half its roster would see its average
  // halve for no reason.
  it('excludes trashed members from the LTV denominator too', async () => {
    const { service, memberCount } = setup();
    await service.get(QUERY);

    const args = memberCount.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ role: Role.MEMBER, deletedAt: null });
  });
});

describe('DashboardMembersService.get — active members', () => {
  afterEach(() => vi.clearAllMocks());

  // FROZEN is in LIVE_SUBSCRIPTION_STATUSES: a paused membership still occupies
  // the slot and still resumes. CANCELED is terminal.
  it('counts a frozen subscription as active and a canceled one as not', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ status: SubscriptionStatus.FROZEN, memberId: 'a' }),
        subscription({ status: SubscriptionStatus.ACTIVE, memberId: 'b' }),
        subscription({
          status: SubscriptionStatus.CANCELED,
          memberId: 'c',
          canceledAt: daysAgo(100),
          updatedAt: daysAgo(100),
        }),
      ],
    });

    const result = await service.get(QUERY);

    expect(result.kpis.activeMembers).toBe(2);
    expect(result.activeOverTime[result.activeOverTime.length - 1]?.value).toBe(2);
  });

  it('emits a dense series across the window', async () => {
    const { service } = setup();
    const result = await service.get(QUERY);
    expect(result.activeOverTime.length).toBeGreaterThanOrEqual(30);
    expect(result.retention).toHaveLength(result.activeOverTime.length);
    expect(result.signupsVsChurn).toHaveLength(result.activeOverTime.length);
  });
});

describe('DashboardMembersService.get — retention', () => {
  afterEach(() => vi.clearAllMocks());

  // The honesty case. A gym with nobody to retain had no retention rate; 0%
  // would claim everyone left.
  it('emits null, not zero, for a bucket with no denominator', async () => {
    const { service } = setup();
    const result = await service.get(QUERY);
    expect(result.retention.every((point) => point.value === null)).toBe(true);
  });

  it('reports 100 when every member from the lookback is still live', async () => {
    const { service } = setup({
      subscriptions: [subscription({ status: SubscriptionStatus.ACTIVE, memberId: 'a' })],
    });
    const result = await service.get(QUERY);
    expect(result.retention[result.retention.length - 1]?.value).toBe(100);
  });

  it('reports 0 — not null — when the lookback had members and all of them left', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.CANCELED,
          memberId: 'a',
          createdAt: daysAgo(200),
          canceledAt: daysAgo(5),
          updatedAt: daysAgo(5),
        }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.retention[result.retention.length - 1]?.value).toBe(0);
  });
});

describe('DashboardMembersService.get — LTV', () => {
  afterEach(() => vi.clearAllMocks());

  it('sums member payments and subscription invoices over the member count', async () => {
    const { service } = setup({
      memberCount: 2,
      payments: [{ amount: 10_000, refundedAmount: 1_000, currency: 'GEL' }],
      invoices: [{ amount: 5_000, currency: 'GEL' }],
    });

    const result = await service.get(QUERY);

    // (10_000 - 1_000) + 5_000 = 14_000 over 2 members.
    expect(result.kpis.avgLtv).toBe(7_000);
  });

  // An admin-raised invoice may name an order that ALSO has a captured payment.
  // Counting both would count that money twice, so the invoice read filters
  // `orderId: null` — assert the filter, since the double-count is invisible in
  // a total that happens to look plausible.
  it('reads only invoices with no linked order', async () => {
    const { service, invoiceFindMany } = setup();
    await service.get(QUERY);

    const args = invoiceFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ orderId: null, status: InvoiceStatus.PAID });
  });

  // Guest and walk-in revenue belongs to no member's lifetime.
  it('reads only payments attributable to a member', async () => {
    const { service, paymentFindMany } = setup();
    await service.get(QUERY);

    const args = paymentFindMany.mock.calls[0]?.[0] as {
      where: { status: PaymentStatus; order: Record<string, unknown> };
    };
    expect(args.where.status).toBe(PaymentStatus.CAPTURED);
    expect(args.where.order).toMatchObject({ memberId: { not: null } });
  });

  it('reports zero LTV rather than dividing by zero when the gym has no members', async () => {
    const { service } = setup({ memberCount: 0, payments: [{ amount: 500, refundedAmount: 0 }] });
    expect((await service.get(QUERY)).kpis.avgLtv).toBe(0);
  });
});

describe('DashboardMembersService.get — status breakdown', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps every subscription state onto its wire form, in lifecycle order', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ status: SubscriptionStatus.EXPIRED, memberId: 'a', updatedAt: daysAgo(1) }),
        subscription({ status: SubscriptionStatus.TRIAL, memberId: 'b' }),
        subscription({ status: SubscriptionStatus.PAST_DUE, memberId: 'c' }),
        subscription({ status: SubscriptionStatus.PAST_DUE, memberId: 'd' }),
      ],
    });

    const result = await service.get(QUERY);

    expect(result.byStatus).toEqual([
      { status: 'trial', count: 1 },
      { status: 'past-due', count: 2 },
      { status: 'expired', count: 1 },
    ]);
  });

  it('omits states with no subscriptions rather than padding them with zeroes', async () => {
    const { service } = setup({
      subscriptions: [subscription({ status: SubscriptionStatus.ACTIVE })],
    });
    expect((await service.get(QUERY)).byStatus).toEqual([{ status: 'active', count: 1 }]);
  });
});

describe('DashboardMembersService.get — signups and churn', () => {
  afterEach(() => vi.clearAllMocks());

  it('buckets a join by joinedAt and a cancellation by its terminal instant', async () => {
    const joined = daysAgo(3);
    const canceled = daysAgo(1);
    const { service } = setup({
      members: [member({ joinedAt: joined })],
      subscriptions: [
        subscription({
          status: SubscriptionStatus.CANCELED,
          memberId: 'a',
          canceledAt: canceled,
          updatedAt: canceled,
        }),
      ],
    });

    const result = await service.get(QUERY);
    const joinKey = joined.toISOString().slice(0, 10);
    const cancelKey = canceled.toISOString().slice(0, 10);

    expect(result.signupsVsChurn.find((p) => p.label === joinKey)?.signups).toBe(1);
    expect(result.signupsVsChurn.find((p) => p.label === cancelKey)?.churned).toBe(1);
    expect(result.kpis.newSignups).toBe(1);
    expect(result.kpis.churned).toBe(1);
  });

  it('reports zeroes for an empty window without throwing', async () => {
    const { service } = setup();
    const result = await service.get(QUERY);
    expect(result.kpis).toEqual({ activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 });
    expect(result.byStatus).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/api test -- dashboard-members.service`
Expected: FAIL — cannot resolve `./dashboard-members.service`.

- [ ] **Step 3: Write the service**

Create `apps/api/src/dashboard/dashboard-members.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  LIVE_SUBSCRIPTION_STATUSES,
  PaymentStatus,
  Role,
  SubscriptionStatus,
} from '@fit/db';
import {
  MEMBERSHIP_STATUSES,
  SALES_GRANULARITY_RANGE,
  type DashboardMembersQuery,
  type DashboardMembersResponse,
  type MembershipStatus,
  type MembershipStatusSlice,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import {
  bucketKey,
  DAY_MS,
  DEFAULT_CURRENCY,
  emptyBuckets,
  resolveWindow,
} from '../reports/report-window.util';

/** Days each retention window looks back. */
const RETENTION_DAYS = { '30': 30, '60': 60, '90': 90 } as const;

/** The wire form of each subscription state, keyed by the DB enum. */
const STATUS_KEYS: Record<SubscriptionStatus, MembershipStatus> = {
  [SubscriptionStatus.TRIAL]: 'trial',
  [SubscriptionStatus.ACTIVE]: 'active',
  [SubscriptionStatus.PAST_DUE]: 'past-due',
  [SubscriptionStatus.FROZEN]: 'frozen',
  [SubscriptionStatus.CANCELED]: 'canceled',
  [SubscriptionStatus.EXPIRED]: 'expired',
};

/** The subscription fields every trend here reconstructs state from. */
interface SubscriptionRow {
  memberId: string;
  status: SubscriptionStatus;
  createdAt: Date;
  canceledAt: Date | null;
  updatedAt: Date;
}

/**
 * Read side of the hand-built Members dashboard tab.
 *
 * Produces the whole tab in one round trip: four KPIs, the active-members trend,
 * signups against churn, the rolling retention rate, and the billing-state split.
 * Every figure is a REAL aggregation over rows that exist today (same honesty
 * contract as {@link ReportDrilldownService}); time series are densely zero-filled
 * because a quiet bucket is a real zero, while the status breakdown omits states
 * nobody is in rather than padding them.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`. **Trash is not** — `GymMember.deletedAt` is filtered explicitly on
 * every read, which the older `members` drill-down does not do and is why its
 * figures include trashed members.
 *
 * `LIVE_SUBSCRIPTION_STATUSES` is imported from `@fit/db`, the state machine that
 * owns the definition. Three hand-written copies of that list already exist in
 * this repo; this is deliberately not a fourth.
 */
@Injectable()
export class DashboardMembersService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Build the whole Members tab for one control combination. */
  async get(query: DashboardMembersQuery): Promise<DashboardMembersResponse> {
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity]);
    const lookbackMs = RETENTION_DAYS[query.retentionWindow] * DAY_MS;

    const [members, subscriptions, memberCount, payments, invoices] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where: { role: Role.MEMBER, deletedAt: null, joinedAt: { lt: win.end } },
        select: { joinedAt: true },
      }),
      // Every subscription, not just the window's: the active-members trend and
      // retention both need state at instants BEFORE the window opens.
      this.prisma.client.subscription.findMany({
        where: { member: { deletedAt: null } },
        select: {
          memberId: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.gymMember.count({ where: { role: Role.MEMBER, deletedAt: null } }),
      // Guest and walk-in orders belong to no member's lifetime.
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, order: { memberId: { not: null } } },
        select: { amount: true, refundedAmount: true, currency: true },
      }),
      // `orderId: null` is what stops an admin-raised invoice against an order
      // being counted alongside that order's captured payment.
      this.prisma.client.invoice.findMany({
        where: { status: InvoiceStatus.PAID, orderId: null },
        select: { amount: true, currency: true },
      }),
    ]);

    /* -- Trends ---------------------------------------------------------- */

    const activeBuckets = emptyBuckets(win);
    const signupBuckets = emptyBuckets(win);
    const churnBuckets = emptyBuckets(win);
    const retention: { label: string; value: number | null }[] = [];

    for (const [key] of activeBuckets) {
      const at = new Date(`${key}T00:00:00.000Z`);
      activeBuckets.set(key, liveCountAt(subscriptions, at));

      const before = new Date(at.getTime() - lookbackMs);
      const cohort = liveMembersAt(subscriptions, before);
      const stillLive = liveMembersAt(subscriptions, at);
      const kept = [...cohort].filter((id) => stillLive.has(id)).length;
      retention.push({
        label: key,
        // No cohort is not 0% retention — it is no retention rate at all.
        value: cohort.size === 0 ? null : Math.round((kept / cohort.size) * 1000) / 10,
      });
    }

    for (const member of members) {
      const key = bucketKey(member.joinedAt, win.bucket);
      if (signupBuckets.has(key)) {
        signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1);
      }
    }

    for (const sub of subscriptions) {
      const churnedAt = churnMoment(sub);
      if (churnedAt === null) continue;
      const key = bucketKey(churnedAt, win.bucket);
      if (churnBuckets.has(key)) {
        churnBuckets.set(key, (churnBuckets.get(key) ?? 0) + 1);
      }
    }

    /* -- Snapshots ------------------------------------------------------- */

    const statusCounts = new Map<MembershipStatus, number>();
    for (const sub of subscriptions) {
      const key = STATUS_KEYS[sub.status];
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
    }

    const grossFromMembers = payments.reduce(
      (sum, payment) => sum + payment.amount - payment.refundedAmount,
      0,
    );
    const fromSubscriptions = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const lifetime = grossFromMembers + fromSubscriptions;

    const newSignups = [...signupBuckets.values()].reduce((sum, value) => sum + value, 0);
    const churned = [...churnBuckets.values()].reduce((sum, value) => sum + value, 0);

    return {
      granularity: query.granularity,
      retentionWindow: query.retentionWindow,
      expiringWindow: query.expiringWindow,
      currency:
        payments[payments.length - 1]?.currency ?? invoices[0]?.currency ?? DEFAULT_CURRENCY,
      kpis: {
        activeMembers: liveMembersAt(subscriptions, win.end).size,
        newSignups,
        churned,
        avgLtv: memberCount === 0 ? 0 : Math.round(lifetime / memberCount),
      },
      activeOverTime: [...activeBuckets.entries()].map(([label, value]) => ({ label, value })),
      signupsVsChurn: [...signupBuckets.entries()].map(([label, signups]) => ({
        label,
        signups,
        churned: churnBuckets.get(label) ?? 0,
      })),
      retention,
      // Lifecycle order, from the contract's own list, so the chart's bars read
      // as a progression rather than in whatever order the Map filled.
      byStatus: MEMBERSHIP_STATUSES.map(
        (status): MembershipStatusSlice => ({ status, count: statusCounts.get(status) ?? 0 }),
      ).filter((slice) => slice.count > 0),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A subscription's terminal instant, or `null` while it is still live. Mirrors
 * the private helper in `report-drilldown.service.ts`; reproduced rather than
 * exported from there, so this service does not reach into another's internals.
 */
function churnMoment(sub: SubscriptionRow): Date | null {
  if (sub.status === SubscriptionStatus.CANCELED) return sub.canceledAt ?? sub.updatedAt;
  if (sub.status === SubscriptionStatus.EXPIRED) return sub.updatedAt;
  return null;
}

/** Whether a subscription existed and had not yet ended at `at`. */
function wasLiveAt(sub: SubscriptionRow, at: Date): boolean {
  if (sub.createdAt >= at) return false;
  const churnedAt = churnMoment(sub);
  if (churnedAt !== null && churnedAt < at) return false;
  // A live-status row that has not churned was live; a terminal row that churned
  // after `at` was live then too.
  return churnedAt !== null || LIVE_SUBSCRIPTION_STATUSES.includes(sub.status);
}

/** The distinct members holding at least one live subscription at `at`. */
function liveMembersAt(subs: SubscriptionRow[], at: Date): Set<string> {
  const ids = new Set<string>();
  for (const sub of subs) {
    if (wasLiveAt(sub, at)) ids.add(sub.memberId);
  }
  return ids;
}

/** How many distinct members held a live subscription at `at`. */
function liveCountAt(subs: SubscriptionRow[], at: Date): number {
  return liveMembersAt(subs, at).size;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/api test -- dashboard-members.service`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard/dashboard-members.service.ts apps/api/src/dashboard/dashboard-members.service.spec.ts
git commit -m "feat(api): aggregate the Members dashboard tab"
```

---

### Task 3: The route

**Files:**

- Modify: `apps/api/src/dashboard/dashboard.controller.ts` (add a handler after `sales`)
- Modify: `apps/api/src/dashboard/dashboard.module.ts` (one provider)
- Modify: `apps/api/src/dashboard/dashboard.controller.spec.ts` (add a describe block)

**Interfaces:**

- Consumes: `DashboardMembersService.get()` (Task 2), `dashboardMembersQuerySchema` (Task 1).
- Produces: `GET /dashboard/members?granularity=&retentionWindow=&expiringWindow=`, which Task 5's `fetchDashboardMembers` calls.

**Naming note:** the controller already holds `private readonly salesTab: DashboardSalesService` because a property and a method cannot share the name `sales`. Follow the same shape: the property is `membersTab`, the handler is `members`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/dashboard/dashboard.controller.spec.ts`. Extend the existing `setup()` so it also stubs the members service, and add:

```ts
describe('DashboardController.members', () => {
  it('passes a valid query straight through', async () => {
    const { controller, membersGet } = setup();

    await controller.members({
      granularity: 'weekly',
      retentionWindow: '90',
      expiringWindow: '14',
    });

    expect(membersGet).toHaveBeenCalledWith({
      granularity: 'weekly',
      retentionWindow: '90',
      expiringWindow: '14',
    });
  });

  it('defaults an absent query', async () => {
    const { controller, membersGet } = setup();
    await controller.members({});
    expect(membersGet).toHaveBeenCalledWith({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
    });
  });

  it('falls back to the defaults on unknown values rather than throwing', async () => {
    const { controller, membersGet } = setup();
    await controller.members({ granularity: 'hourly', retentionWindow: '45', expiringWindow: 'x' });
    expect(membersGet).toHaveBeenCalledWith({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
    });
  });
});
```

The `setup()` helper becomes:

```ts
function setup() {
  const get = vi.fn().mockResolvedValue(EMPTY);
  const membersGet = vi.fn().mockResolvedValue(EMPTY_MEMBERS);
  const dashboard = {} as unknown as DashboardService;
  const sales = { get } as unknown as DashboardSalesService;
  const members = { get: membersGet } as unknown as DashboardMembersService;
  return { controller: new DashboardController(dashboard, sales, members), get, membersGet };
}
```

with, beside the existing `EMPTY`:

```ts
const EMPTY_MEMBERS: DashboardMembersResponse = {
  granularity: 'daily',
  retentionWindow: '30',
  expiringWindow: '7',
  currency: 'GEL',
  kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
  activeOverTime: [],
  signupsVsChurn: [],
  retention: [],
  byStatus: [],
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/api test -- dashboard.controller`
Expected: FAIL — `DashboardController` takes two constructor arguments / `controller.members is not a function`.

- [ ] **Step 3: Add the route**

In `apps/api/src/dashboard/dashboard.controller.ts`, extend the `@fit/types` import with `dashboardMembersQuerySchema` and `type DashboardMembersResponse`, import the service, extend the constructor:

```ts
  constructor(
    private readonly dashboard: DashboardService,
    // NOT `sales` / `members` — each handler below already owns that name, and a
    // class cannot carry a property and a method under the same one.
    private readonly salesTab: DashboardSalesService,
    private readonly membersTab: DashboardMembersService,
  ) {}
```

and add after `sales`:

```ts
  /**
   * `GET /dashboard/members?granularity=&retentionWindow=&expiringWindow=` — the
   * hand-built Members tab in one payload: four KPIs, the active-members trend,
   * signups against churn, the rolling retention rate and the billing-state split.
   *
   * All three params scope the WHOLE response, which is why the tab is one round
   * trip: a partial refresh could leave two cards describing different windows.
   * `expiringWindow` is echoed but unused until the watch-lists land; it is in the
   * query now so its shape does not change under them. The Zod schema `.catch`es
   * unknown values to the defaults rather than raising a 400.
   */
  @Get('members')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async members(@Query() query: unknown): Promise<DashboardMembersResponse> {
    return this.membersTab.get(dashboardMembersQuerySchema.parse(query));
  }
```

- [ ] **Step 4: Register the provider**

In `dashboard.module.ts`, import `DashboardMembersService` and add it to `providers`:

```ts
  providers: [
    DashboardService,
    DashboardSegmentsService,
    DashboardSalesService,
    DashboardMembersService,
  ],
```

Extend the module's doc comment to name the new route beside `/dashboard/sales`.

- [ ] **Step 5: Run tests and the guardrail**

Run: `pnpm --filter @fit/api test -- dashboard && pnpm check:controller-guards && pnpm --filter @fit/api type-check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dashboard/
git commit -m "feat(api): expose GET /dashboard/members"
```

---

### Task 4: `AreaChart` gap support

**Files:**

- Modify: `apps/admin/app/(dashboard)/charts.tsx` (`AreaPoint`, `AreaChart`)
- Modify: `apps/admin/app/(dashboard)/charts.test.tsx` (add a describe block)

**Interfaces:**

- Consumes: the existing `AccentAreaGradient` / `SeriesPath` helpers in `charts.tsx`.
- Produces: `AreaPoint.value` widened to `number | null`; `AreaChart` renders a gap where a value is `null`. Task 9's retention card is the consumer.

**Why this is needed:** retention emits `null` for a bucket with no denominator, and the spec commits to the chart breaking its line there rather than drawing 0%. `AreaChart` currently types `value: number` and would plot a null as a `NaN` coordinate.

**Behaviour-preserving requirement:** every existing caller passes numbers. Their rendered output must not change — Step 4's full-suite run is the check.

- [ ] **Step 1: Write the failing test**

Append to `apps/admin/app/(dashboard)/charts.test.tsx`:

```tsx
describe('AreaChart gaps', () => {
  it('draws one continuous path when every value is present', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 10 },
          { label: 'b', value: 20 },
          { label: 'c', value: 30 },
        ]}
      />,
    );
    // One area fill + one stroke.
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelectorAll('path')[1]?.getAttribute('d')).not.toContain('NaN');
  });

  // A null is "no value here", not zero. Bridging the gap would draw a line
  // through a figure that was never measured.
  it('breaks the stroke into separate segments around a null', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 10 },
          { label: 'b', value: null },
          { label: 'c', value: 30 },
        ]}
      />,
    );
    const stroke = container.querySelectorAll('path')[1]?.getAttribute('d') ?? '';
    expect(stroke).not.toContain('NaN');
    // Two moves: one opening each side of the gap.
    expect(stroke.match(/M/g)).toHaveLength(2);
  });

  it('renders an empty frame when every value is null', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: null },
          { label: 'b', value: null },
        ]}
      />,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  // The max must come from the real values only — a null coerced to 0 would be
  // harmless here, but a null coerced via Math.max would poison the scale.
  it('scales to the maximum of the present values', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 100 },
          { label: 'b', value: null },
        ]}
        height={100}
      />,
    );
    const stroke = container.querySelectorAll('path')[1]?.getAttribute('d') ?? '';
    // 100 is the max, so it sits at the top: y = height - pad = 8.
    expect(stroke).toContain('8.0');
  });
});
```

Add `AreaChart` to the file's import from `./charts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- charts`
Expected: FAIL — a type error on `value: null`, or `NaN` in the path data.

- [ ] **Step 3: Widen the type and segment the path**

In `charts.tsx`, change `AreaPoint` and `AreaChart`'s geometry:

```tsx
/** One plotted point of an {@link AreaChart}: an x-axis label and its value. */
export interface AreaPoint {
  label: string;
  /**
   * The plotted value, or `null` for a bucket the series has no figure for. A
   * null is NOT zero: the chart leaves a gap rather than drawing a line through a
   * number that was never measured. Retention uses this for a window with no
   * cohort to retain.
   */
  value: number | null;
}
```

Inside `AreaChart`, replace the `max` and geometry with:

```tsx
const width = 640;
const pad = 8;
const present = data.filter((d): d is AreaPoint & { value: number } => d.value !== null);
const max = Math.max(1, ...present.map((d) => d.value));
const n = data.length;

// x across the full width; y inverted (SVG origin is top-left), padded so the
// stroke never clips at the extremes. A null point keeps its x slot — the gap
// has to sit where the missing bucket actually is.
const xy = data.map((d, i) => {
  const x = n <= 1 ? width / 2 : (i / (n - 1)) * (width - pad * 2) + pad;
  return d.value === null ? null : { x, y: height - pad - (d.value / max) * (height - pad * 2) };
});

// One `M…L…` run per unbroken stretch, so the stroke restarts after each gap
// instead of bridging it.
const line = xy
  .map((p, i) =>
    p === null ? '' : `${xy[i - 1] == null ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
  )
  .join(' ')
  .trim();

// The gradient fills under the FIRST unbroken run only. Closing a fill across a
// gap would shade a region the data does not cover.
const runPoints: { x: number; y: number }[] = [];
for (const point of xy) {
  if (point === null) {
    // The run has ended. Stop at the first gap rather than resuming after it.
    if (runPoints.length > 0) break;
    continue;
  }
  runPoints.push(point);
}

const first = runPoints[0];
const last = runPoints[runPoints.length - 1];
const runLine = runPoints
  .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  .join(' ');
const area =
  first && last
    ? `${runLine} L${last.x.toFixed(1)},${height - pad} L${first.x.toFixed(1)},${height - pad} Z`
    : '';
```

The JSX below is unchanged — it already renders `{area && …}` and
`<SeriesPath d={line} ink={styles.accentInk} />`, both of which handle an empty
string by rendering nothing.

- [ ] **Step 4: Run the full admin suite**

Run: `pnpm --filter @fit/admin test`
Expected: PASS. **No existing test may change.** If one breaks, the widening
altered behaviour for a caller that passes numbers — fix the geometry, not the test.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @fit/admin type-check && pnpm check:tailwind-guardrail`

```bash
git add "apps/admin/app/(dashboard)/charts.tsx" "apps/admin/app/(dashboard)/charts.test.tsx"
git commit -m "feat(admin): let AreaChart break its line at a null value"
```

---

### Task 5: The admin data layer

**Files:**

- Modify: `apps/admin/lib/api.ts` (add after `fetchDashboardSales`)
- Create: `apps/admin/app/(dashboard)/members/actions.ts`

**Interfaces:**

- Consumes: `DashboardMembersQuery`, `DashboardMembersResponse`, `dashboardMembersQuerySchema` (Task 1); the existing `apiBaseUrl()`, `authHeaders()`, `unwrap()`, `ApiError` in `api.ts`.
- Produces: `fetchDashboardMembers(query)` and `loadMembersAction(query): Promise<ActionResult<DashboardMembersResponse>>` where `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`.

- [ ] **Step 1: Add the fetch helper**

In `apps/admin/lib/api.ts`, add the two types to the `@fit/types` import block and append after `fetchDashboardSales`:

```ts
/**
 * `GET /dashboard/members` — the hand-built Members tab in one payload. All three
 * params scope the whole response, so the tab never shows two cards describing
 * different windows; the API `.catch`es unknown values to its own defaults.
 */
export async function fetchDashboardMembers(
  query: DashboardMembersQuery,
): Promise<DashboardMembersResponse> {
  const qs = new URLSearchParams({
    granularity: query.granularity,
    retentionWindow: query.retentionWindow,
    expiringWindow: query.expiringWindow,
  });
  const res = await fetch(`${apiBaseUrl()}/dashboard/members?${qs.toString()}`, {
    headers: await authHeaders(),
    // Membership figures reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardMembersResponse>(res);
}
```

- [ ] **Step 2: Add the server action**

Create `apps/admin/app/(dashboard)/members/actions.ts`:

```ts
'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  dashboardMembersQuerySchema,
  type DashboardMembersQuery,
  type DashboardMembersResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardMembers } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Load the whole Members tab. Re-asserts the reporting capability first: the
 * middleware gates the route, but a Server Action is a POST endpoint in its own
 * right — defence in depth ahead of the API's own guard. Errors come back as a
 * message so a failed load stays local to the tab.
 */
export async function loadMembersAction(
  query: DashboardMembersQuery,
): Promise<ActionResult<DashboardMembersResponse>> {
  const t = await getTranslations('admin.dashboard.members');
  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.ReportView)) {
    return { ok: false, error: t('loadError') };
  }
  try {
    // Re-parsed rather than trusted: the argument crosses a network boundary like
    // any other request body, so it is validated here as well as API-side.
    return {
      ok: true,
      data: await fetchDashboardMembers(dashboardMembersQuerySchema.parse(query)),
    };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}
```

- [ ] **Step 3: Type-check and commit**

Run: `pnpm --filter @fit/admin type-check`

```bash
git add apps/admin/lib/api.ts "apps/admin/app/(dashboard)/members/actions.ts"
git commit -m "feat(admin): add the Members tab data layer"
```

---

### Task 6: Copy

**Files:**

- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/ka.json`

**Interfaces:**

- Produces: the `admin.dashboard.members` namespace every component in Tasks 7–10 reads.

**Naming collision to avoid:** `admin.dashboard` already has a `members` key? It does not — check before inserting. It has `segments`, `widgets`, `sales`. Insert `members` after `sales`.

- [ ] **Step 1: Add the English copy**

Inside `admin.dashboard`, after `"sales"`:

```json
"members": {
  "granularityLabel": "Granularity",
  "granularity": { "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly" },
  "window": {
    "daily": "Last 30 days",
    "weekly": "Last 12 weeks",
    "monthly": "Last 12 months"
  },
  "kpi": {
    "activeMembers": "Active members",
    "newSignups": "New signups",
    "churned": "Churned",
    "avgLtv": "Avg LTV"
  },
  "kpiCaption": "{window} · LTV is lifetime value to date, not a forecast",
  "active": {
    "title": "Total active members",
    "caption": "{window} · {total} now",
    "chartAria": "Active members per period",
    "empty": "No members in this window."
  },
  "signupsVsChurn": {
    "title": "Signups vs cancellations",
    "caption": "Joins against memberships that ended",
    "chartAria": "Signups against cancellations per period",
    "signups": "Signups",
    "churned": "Cancellations",
    "empty": "No joins or cancellations in this window."
  },
  "retention": {
    "title": "Retention rate",
    "windowLabel": "Retention window",
    "window": { "30": "30d", "60": "60d", "90": "90d" },
    "caption": "Members still here {days} days on",
    "chartAria": "Retention rate per period",
    "gapNote": "Gaps are periods with nobody to retain — not 0%.",
    "empty": "Not enough history to measure retention yet."
  },
  "status": {
    "title": "Members by status",
    "name": {
      "trial": "Trial",
      "active": "Active",
      "past-due": "Past due",
      "frozen": "Frozen",
      "canceled": "Cancelled",
      "expired": "Expired"
    },
    "empty": "No memberships on record."
  },
  "loadError": "Couldn't load members.",
  "retry": "Retry"
}
```

- [ ] **Step 2: Add the Georgian copy**

```json
"members": {
  "granularityLabel": "დეტალურობა",
  "granularity": { "daily": "დღიური", "weekly": "კვირეული", "monthly": "თვიური" },
  "window": {
    "daily": "ბოლო 30 დღე",
    "weekly": "ბოლო 12 კვირა",
    "monthly": "ბოლო 12 თვე"
  },
  "kpi": {
    "activeMembers": "აქტიური წევრები",
    "newSignups": "ახალი წევრები",
    "churned": "წავიდნენ",
    "avgLtv": "საშუალო LTV"
  },
  "kpiCaption": "{window} · LTV არის დღემდე მიღებული ღირებულება, არა პროგნოზი",
  "active": {
    "title": "აქტიური წევრები სულ",
    "caption": "{window} · ახლა {total}",
    "chartAria": "აქტიური წევრები პერიოდების მიხედვით",
    "empty": "ამ პერიოდში წევრები არ დაფიქსირებულა."
  },
  "signupsVsChurn": {
    "title": "ახალი წევრები და გასვლები",
    "caption": "მიერთებები დასრულებული აბონემენტების ფონზე",
    "chartAria": "ახალი წევრები გასვლების ფონზე, პერიოდების მიხედვით",
    "signups": "ახალი",
    "churned": "გასვლები",
    "empty": "ამ პერიოდში არც მიერთება და არც გასვლა არ დაფიქსირებულა."
  },
  "retention": {
    "title": "შენარჩუნების მაჩვენებელი",
    "windowLabel": "შენარჩუნების ფანჯარა",
    "window": { "30": "30დღ", "60": "60დღ", "90": "90დღ" },
    "caption": "{days} დღის შემდეგაც დარჩენილი წევრები",
    "chartAria": "შენარჩუნების მაჩვენებელი პერიოდების მიხედვით",
    "gapNote": "ხარვეზები ნიშნავს, რომ შესანარჩუნებელი არავინ იყო — არა 0%-ს.",
    "empty": "შენარჩუნების გასაზომად ისტორია ჯერ არ ჰყოფნის."
  },
  "status": {
    "title": "წევრები სტატუსით",
    "name": {
      "trial": "საცდელი",
      "active": "აქტიური",
      "past-due": "ვადაგადაცილებული",
      "frozen": "გაყინული",
      "canceled": "გაუქმებული",
      "expired": "ამოწურული"
    },
    "empty": "აბონემენტები არ ფიქსირდება."
  },
  "loadError": "წევრების ჩატვირთვა ვერ მოხერხდა.",
  "retry": "ხელახლა"
}
```

- [ ] **Step 3: Verify parity**

```bash
node -e "
const en = require('./packages/i18n/locales/en.json').admin.dashboard.members;
const ka = require('./packages/i18n/locales/ka.json').admin.dashboard.members;
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  typeof v === 'object' && v !== null ? flat(v, p + k + '.') : [p + k]);
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

Expected: `OK <n> keys in both locales`. The count is whatever it is — what matters is that it prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(i18n): add the Members dashboard tab copy"
```

---

### Task 7: The KPI strip

**Files:**

- Create: `apps/admin/app/(dashboard)/members/members-kpi-strip.tsx`

**Interfaces:**

- Consumes: `MembersKpis`, `MembersGranularity` (Task 1); the `admin.dashboard.members` namespace (Task 6).
- Produces: `MembersKpiStrip({ kpis, granularity, money }: { kpis: MembersKpis; granularity: MembersGranularity; money: Intl.NumberFormat })`.

**Read first:** `apps/admin/app/(dashboard)/sales/sales-kpi-strip.tsx`. This is its sibling: same bordered container, same 1px-grid-gap hairlines, same caption treatment. Copy its `styles` block verbatim — the two strips must be visually identical — and change only the tiles and the caption.

**The one structural difference:** three of these tiles are COUNTS and one is MONEY. `avgLtv` divides by 100; the other three do not. Getting that wrong is the highest-consequence bug available here.

- [ ] **Step 1: Write the component**

Create `apps/admin/app/(dashboard)/members/members-kpi-strip.tsx`:

```tsx
'use client';

// The Members tab's four numbers, in one container — `sales/sales-kpi-strip.tsx`'s
// treatment, and deliberately identical to it so the two tabs read as one
// dashboard.
//
// Three tiles are counts and one is money, which is the only thing to get right
// here: `avgLtv` arrives in MINOR units and divides by 100; the counts do not.
//
// The caption carries the qualifier LTV needs. "Avg LTV" beside three live counts
// reads as a forward-looking number; it is not — it is the money actually taken
// per member so far, and the caption says so.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { MembersGranularity, MembersKpis } from '@fit/types';

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
  label: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' },
  value: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  caption: {
    margin: 0,
    paddingInline: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The tiles, in reading order. `money` marks the one carried in MINOR units. */
const TILES = [
  { key: 'activeMembers', money: false },
  { key: 'newSignups', money: false },
  { key: 'churned', money: false },
  { key: 'avgLtv', money: true },
] as const satisfies readonly { key: keyof MembersKpis; money: boolean }[];

export function MembersKpiStrip({
  kpis,
  granularity,
  money,
}: {
  kpis: MembersKpis;
  granularity: MembersGranularity;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.members');

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((tile) => (
            <div key={tile.key} {...stylex.props(styles.cell)}>
              <span {...stylex.props(styles.label)}>{t(`kpi.${tile.key}`)}</span>
              <span {...stylex.props(styles.value)}>
                {tile.money
                  ? // Money is carried in MINOR units; the strip shows major units.
                    money.format(kpis[tile.key] / 100)
                  : kpis[tile.key].toLocaleString()}
              </span>
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

- [ ] **Step 2: Verify and commit**

Run: `pnpm --filter @fit/admin type-check && pnpm check:tailwind-guardrail && pnpm --filter @fit/admin test`

```bash
git add "apps/admin/app/(dashboard)/members/members-kpi-strip.tsx"
git commit -m "feat(admin): add the Members KPI strip"
```

---

### Task 8: The active-members and signups-vs-churn cards

**Files:**

- Create: `apps/admin/app/(dashboard)/members/active-members-card.tsx`
- Create: `apps/admin/app/(dashboard)/members/signups-vs-churn-card.tsx`

**Interfaces:**

- Consumes: `AreaChart` / `AreaPoint`, `DualAreaChart` / `DualPoint` from `../charts`; `EmptyState` from `../overview/format`; `formatBucket` from `../format` (moved there by this task's Step 1); `SALES_GRANULARITIES`, `ReportSeriesPoint`, `SignupsChurnPoint`, `MembersGranularity` from `@fit/types`.
- Produces:
  - `ActiveMembersCard({ points, granularity, current, onSelectGranularity, disabled })` — `points: ReportSeriesPoint[]`, `current: number`, `onSelectGranularity: (next: MembersGranularity) => void`, `disabled: boolean`.
  - `SignupsVsChurnCard({ points }: { points: SignupsChurnPoint[] })`.

**Read first:** `apps/admin/app/(dashboard)/sales/sales-trend-card.tsx` and `sales-vs-refunds-card.tsx`. These are their siblings — same `Card variant="default" padding={0}` shell, same head/title/caption/`SegmentedControl` arrangement, same `axisRow`, same legend treatment.

**Move `formatBucket` up a level FIRST, then use it.** It currently lives at `apps/admin/app/(dashboard)/sales/format.ts`. A second tab needing it makes that the wrong home: `members/*` importing from `sales/*` couples two sibling features through a filename that advertises neither, and deleting or restructuring the Sales tab would break Members in a way no grep on feature names would surface.

Step 1 of this task moves it to `apps/admin/app/(dashboard)/format.ts` — one level up, beside `charts.tsx`, which is where this directory already keeps things both tabs share. `sales/format.ts` is deleted and its two importers re-pointed. The function itself is copied verbatim, **including both UTC guards** (`timeZone: 'UTC'` in the `Intl.DateTimeFormat` options and the `T00:00:00.000Z` suffix when constructing the `Date`) — dropping either shifts a bucket by a day for users west of UTC.

This is a pure move: no behaviour changes, and `pnpm --filter @fit/admin test` must stay green with no test edited.

**`flexShrink` warning:** the Sales trend card carries an explicit comment about NOT setting `flexShrink: 0` on the controls row, because an unshrinkable flex item is sized from its single-line max-content and `Card` clips the overflow, making trailing segments unclickable. This card has one control rather than two so the risk is lower, but do not add `flexShrink: 0`.

- [ ] **Step 1: Move `formatBucket` out of the Sales directory**

Create `apps/admin/app/(dashboard)/format.ts`:

```ts
// Formatting helpers shared by the dashboard's hand-built tabs.
//
// Lives beside `charts.tsx` rather than inside any one tab's directory: two tabs
// render the same `YYYY-MM-DD` bucket labels on their axes, and a formatter owned
// by whichever tab happened to need it first couples the others to that tab's
// filename.

/**
 * A `YYYY-MM-DD` bucket start as a locale short date. UTC in, UTC out.
 *
 * Both UTC guards are load-bearing: the `T00:00:00.000Z` suffix pins the instant
 * and `timeZone: 'UTC'` pins the rendering. Dropping either shifts every bucket by
 * a day for viewers west of UTC.
 */
export function formatBucket(locale: string, bucket: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${bucket}T00:00:00.000Z`));
}
```

Delete `apps/admin/app/(dashboard)/sales/format.ts`, and re-point its two importers — `sales/sales-trend-card.tsx` and `sales/sales-vs-refunds-card.tsx` — from `'./format'` to `'../format'`.

- [ ] **Step 2: Confirm the move changed nothing**

Run: `pnpm --filter @fit/admin test && pnpm --filter @fit/admin type-check`
Expected: PASS, with **no test file edited**. A pure move cannot need one.

- [ ] **Step 3: Write the active-members card**

Create `apps/admin/app/(dashboard)/members/active-members-card.tsx`:

```tsx
'use client';

// Total active members over time, and the tab's granularity control.
//
// The control lives here but its state is lifted to `MembersView`: it scopes the
// whole tab. Scoping it to this card alone would leave the KPI strip describing
// one window and this chart another.
//
// "Active" means a subscription in `LIVE_SUBSCRIPTION_STATUSES`, which INCLUDES
// frozen: a paused membership is still a membership and still resumes. That is a
// different set from the one the at-risk list uses, and the difference is
// deliberate — see the service.
//
// The x-axis shows the first and last bucket only. Thirty `YYYY-MM-DD` labels in a
// 640-unit viewBox is an unreadable smear.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type MembersGranularity, type ReportSeriesPoint } from '@fit/types';
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
});

export function ActiveMembersCard({
  points,
  granularity,
  current,
  onSelectGranularity,
  disabled,
}: {
  points: ReportSeriesPoint[];
  granularity: MembersGranularity;
  /** The live member count right now, for the caption. */
  current: number;
  onSelectGranularity: (next: MembersGranularity) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  const hasData = data.some((point) => point.value !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('active.title')}</h2>
          <p {...stylex.props(styles.caption)}>
            {t('active.caption', {
              window: t(`window.${granularity}`),
              total: current.toLocaleString(),
            })}
          </p>
        </div>
        <SegmentedControl
          value={granularity}
          onChange={(next) => onSelectGranularity(next as MembersGranularity)}
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
          <AreaChart data={data} ariaLabel={t('active.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
        </>
      ) : (
        <EmptyState>{t('active.empty')}</EmptyState>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Write the signups-vs-churn card**

Create `apps/admin/app/(dashboard)/members/signups-vs-churn-card.tsx`:

```tsx
'use client';

// Joins against memberships that ended, over the tab's window.
//
// `DualAreaChart` scales both series to a SHARED maximum, which is the whole
// point here: a month with 40 joins and 3 cancellations must LOOK like that. Two
// independently-scaled series would draw them the same height.
//
// Churn is dated by a subscription's terminal instant — `canceledAt` for a
// cancellation, `updatedAt` for an expiry — not by when its period would have run
// out.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { SignupsChurnPoint } from '@fit/types';
import { DualAreaChart, type DualPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';

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
  swatchSignups: { backgroundColor: 'var(--color-accent)' },
  swatchChurned: { backgroundColor: 'var(--color-error)' },
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
});

export function SignupsVsChurnCard({ points }: { points: SignupsChurnPoint[] }) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  const data: DualPoint[] = points.map((point) => ({
    label: point.label,
    primary: point.signups,
    secondary: point.churned,
  }));
  const hasData = data.some((point) => point.primary !== 0 || point.secondary !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('signupsVsChurn.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('signupsVsChurn.caption')}</p>
      </div>

      {hasData ? (
        <>
          <DualAreaChart data={data} ariaLabel={t('signupsVsChurn.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchSignups)} aria-hidden="true" />
              {t('signupsVsChurn.signups')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchChurned)} aria-hidden="true" />
              {t('signupsVsChurn.churned')}
            </span>
          </div>
        </>
      ) : (
        <EmptyState>{t('signupsVsChurn.empty')}</EmptyState>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @fit/admin type-check && pnpm check:tailwind-guardrail && pnpm --filter @fit/admin test`

```bash
git add "apps/admin/app/(dashboard)/format.ts" "apps/admin/app/(dashboard)/sales/" "apps/admin/app/(dashboard)/members/active-members-card.tsx" "apps/admin/app/(dashboard)/members/signups-vs-churn-card.tsx"
git commit -m "feat(admin): add the Members growth cards"
```

---

### Task 9: The retention and status cards

**Files:**

- Create: `apps/admin/app/(dashboard)/members/retention-card.tsx`
- Create: `apps/admin/app/(dashboard)/members/status-breakdown-card.tsx`

**Interfaces:**

- Consumes: `AreaChart` with null support (Task 4); `BarChart` / `BarDatum` from `../charts`; `EmptyState`; `formatBucket` from `../format` (Task 8 moved it there); `RetentionPoint`, `RetentionWindow`, `MembershipStatusSlice` from `@fit/types`.
- Produces:
  - `RetentionCard({ points, window, onSelectWindow, disabled })` — `points: RetentionPoint[]`, `window: RetentionWindow`, `onSelectWindow: (next: RetentionWindow) => void`.
  - `StatusBreakdownCard({ slices }: { slices: MembershipStatusSlice[] })`.

**The retention card's whole reason for existing carefully:** `value` is `number | null`, and a `null` must reach `AreaChart` as `null`. Mapping it to `0` would draw a catastrophic-looking dip where the truth is "there was nobody to retain". The card also renders a one-line note under the chart saying what a gap means, because a broken line with no explanation reads as a rendering bug.

- [ ] **Step 1: Write the retention card**

Create `apps/admin/app/(dashboard)/members/retention-card.tsx`:

```tsx
'use client';

// The rolling retention rate, with its own 30 / 60 / 90-day control.
//
// This control is CARD-LOCAL, unlike the tab-wide granularity: it changes what
// this one line means and nothing else on the tab reads it. The caption names the
// active window so the number is never ambiguous.
//
// A `null` bucket must reach `AreaChart` as `null`. Mapping it to 0 would draw a
// collapse to zero retention where the truth is that there was nobody to retain —
// a gym's first weeks would look like a catastrophe. The note under the chart
// says what a gap means, because an unexplained break reads as a rendering bug.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { RetentionPoint, RetentionWindow } from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';

/** The windows the control offers, ascending. */
const WINDOWS = ['30', '60', '90'] as const satisfies readonly RetentionWindow[];

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
  note: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-disabled)',
  },
});

export function RetentionCard({
  points,
  window,
  onSelectWindow,
  disabled,
}: {
  points: RetentionPoint[];
  window: RetentionWindow;
  onSelectWindow: (next: RetentionWindow) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  // `null` passes straight through — see this file's header.
  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  const measured = points.filter((point) => point.value !== null);
  const hasData = measured.length > 0;
  const hasGap = measured.length !== points.length;
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('retention.title')}</h2>
          <p {...stylex.props(styles.caption)}>{t('retention.caption', { days: window })}</p>
        </div>
        <SegmentedControl
          value={window}
          onChange={(next) => onSelectWindow(next as RetentionWindow)}
          label={t('retention.windowLabel')}
          size="sm"
          isDisabled={disabled}
        >
          {WINDOWS.map((value) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={t(`retention.window.${value}`)}
            />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('retention.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          {hasGap ? <p {...stylex.props(styles.note)}>{t('retention.gapNote')}</p> : null}
        </>
      ) : (
        <EmptyState>{t('retention.empty')}</EmptyState>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Write the status breakdown card**

Create `apps/admin/app/(dashboard)/members/status-breakdown-card.tsx`:

```tsx
'use client';

// The membership base split by billing state.
//
// All six states, not the four a dashboard obviously needs: `past-due` is a
// failed charge staff can still act on before it becomes a cancellation, and
// `canceled` (they left) is a different fact from `expired` (the billing ran out).
// A retention surface that merged those two would hide the distinction it exists
// to show.
//
// The service already emits the slices in lifecycle order and drops states nobody
// is in, so this card neither sorts nor pads.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { MembershipStatusSlice } from '@fit/types';
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
});

export function StatusBreakdownCard({ slices }: { slices: MembershipStatusSlice[] }) {
  const t = useTranslations('admin.dashboard.members');

  const data: BarDatum[] = slices.map((slice) => ({
    label: t(`status.name.${slice.status}`),
    value: slice.count,
  }));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{t('status.title')}</h2>
      <BarChart
        data={data}
        formatValue={(value) => value.toLocaleString()}
        emptyLabel={t('status.empty')}
      />
    </Card>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @fit/admin type-check && pnpm check:tailwind-guardrail && pnpm --filter @fit/admin test`

```bash
git add "apps/admin/app/(dashboard)/members/retention-card.tsx" "apps/admin/app/(dashboard)/members/status-breakdown-card.tsx"
git commit -m "feat(admin): add the Members retention and status cards"
```

---

### Task 10: `MembersView`

**Files:**

- Create: `apps/admin/app/(dashboard)/members/members-view.tsx`
- Create: `apps/admin/app/(dashboard)/members/members-view.test.tsx`

**Interfaces:**

- Consumes: everything from Tasks 5, 7, 8, 9.
- Produces: `export function MembersView()` — no props. Task 11 renders it.

**Read first and copy from:** `apps/admin/app/(dashboard)/sales/sales-view.tsx`. It is the reference implementation for a hand-built tab, with its review findings already folded in. Take from it, verbatim: the `styles` block (page / workArea / column / rail / status / skeleton / banner / pending), the `motion` block and `STAGGER_MS`, the `settled` state and its `requestAnimationFrame` effect, the cache-by-composite-key effect **including its `.catch()`**, `retry`, and the error-as-banner-when-data-exists split.

**Three differences from Sales:**

1. The composite cache key has three parts: `${granularity}:${retentionWindow}:${expiringWindow}`.
2. `expiringWindow` is fixed at its default in Plan A — no control changes it. Keep it in the key anyway so Plan B's control needs no cache change.
3. The rail holds one card in Plan A (status breakdown). Plan B adds two more beneath it.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dashboard)/members/members-view.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardMembersResponse } from '@fit/types';

const loadMembersAction = vi.fn();
vi.mock('./actions', () => ({
  loadMembersAction: (...args: unknown[]): unknown => loadMembersAction(...args) as unknown,
}));

const { MembersView } = await import('./members-view');

const messages = {
  admin: {
    dashboard: {
      members: {
        granularityLabel: 'Granularity',
        granularity: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' },
        window: { daily: 'Last 30 days', weekly: 'Last 12 weeks', monthly: 'Last 12 months' },
        kpi: {
          activeMembers: 'Active members',
          newSignups: 'New signups',
          churned: 'Churned',
          avgLtv: 'Avg LTV',
        },
        kpiCaption: '{window}',
        active: {
          title: 'Total active members',
          caption: '{window} · {total} now',
          chartAria: 'Active members per period',
          empty: 'No members in this window.',
        },
        signupsVsChurn: {
          title: 'Signups vs cancellations',
          caption: 'Joins against memberships that ended',
          chartAria: 'Signups against cancellations per period',
          signups: 'Signups',
          churned: 'Cancellations',
          empty: 'No joins or cancellations in this window.',
        },
        retention: {
          title: 'Retention rate',
          windowLabel: 'Retention window',
          window: { '30': '30d', '60': '60d', '90': '90d' },
          caption: 'Members still here {days} days on',
          chartAria: 'Retention rate per period',
          gapNote: 'Gaps are periods with nobody to retain — not 0%.',
          empty: 'Not enough history to measure retention yet.',
        },
        status: {
          title: 'Members by status',
          name: {
            trial: 'Trial',
            active: 'Active',
            'past-due': 'Past due',
            frozen: 'Frozen',
            canceled: 'Cancelled',
            expired: 'Expired',
          },
          empty: 'No memberships on record.',
        },
        loadError: "Couldn't load members.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardMembersResponse> = {}): DashboardMembersResponse {
  return {
    granularity: 'daily',
    retentionWindow: '30',
    expiringWindow: '7',
    currency: 'GEL',
    kpis: { activeMembers: 42, newSignups: 5, churned: 2, avgLtv: 18_000 },
    activeOverTime: [
      { label: '2026-08-01', value: 40 },
      { label: '2026-08-02', value: 42 },
    ],
    signupsVsChurn: [
      { label: '2026-08-01', signups: 3, churned: 1 },
      { label: '2026-08-02', signups: 2, churned: 1 },
    ],
    retention: [
      { label: '2026-08-01', value: 90 },
      { label: '2026-08-02', value: 91.5 },
    ],
    byStatus: [
      { status: 'active', count: 30 },
      { status: 'frozen', count: 12 },
    ],
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MembersView />
    </NextIntlClientProvider>,
  );
}

describe('MembersView', () => {
  beforeEach(() => {
    loadMembersAction.mockReset();
    loadMembersAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('fetches with the defaults and renders every card', async () => {
    renderView();

    expect(await screen.findByText('Total active members')).toBeInTheDocument();
    expect(screen.getByText('Signups vs cancellations')).toBeInTheDocument();
    expect(screen.getByText('Retention rate')).toBeInTheDocument();
    expect(screen.getByText('Members by status')).toBeInTheDocument();
    expect(screen.getByText('Active members')).toBeInTheDocument();
    expect(loadMembersAction).toHaveBeenCalledWith({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
    });
  });

  // Three tiles are counts and one is money. Nothing else in this suite asserts a
  // formatted figure, so a stray `/ 100` on a count — or a missing one on the LTV
  // — would leave the whole admin suite green.
  it('renders counts as counts and the LTV as money', async () => {
    renderView();
    await screen.findByText('Total active members');

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('GEL 180')).toBeInTheDocument();
  });

  it('refetches when the granularity changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Total active members');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));

    await waitFor(() =>
      expect(loadMembersAction).toHaveBeenCalledWith({
        granularity: 'monthly',
        retentionWindow: '30',
        expiringWindow: '7',
      }),
    );
  });

  it('refetches when the retention window changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Retention rate');

    await user.click(screen.getByRole('radio', { name: '90d' }));

    await waitFor(() =>
      expect(loadMembersAction).toHaveBeenCalledWith({
        granularity: 'daily',
        retentionWindow: '90',
        expiringWindow: '7',
      }),
    );
  });

  it('serves a revisited combination from cache without a second call', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Total active members');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));
    await waitFor(() => expect(loadMembersAction).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('radio', { name: 'Daily' }));
    await waitFor(() => expect(screen.getByText('Total active members')).toBeInTheDocument());
    expect(loadMembersAction).toHaveBeenCalledTimes(2);
  });

  it('shows a full-page alert with a working retry when the first load fails', async () => {
    const user = userEvent.setup();
    loadMembersAction.mockResolvedValueOnce({ ok: false, error: "Couldn't load members." });
    renderView();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load members.");

    loadMembersAction.mockResolvedValue({ ok: true, data: response() });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Total active members')).toBeInTheDocument();
  });

  // Losing the controls on a failure would strand the user on the combination
  // that just failed — the Sales tab's review found exactly this.
  it('keeps the controls mounted when a later load fails', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Total active members');

    loadMembersAction.mockResolvedValue({ ok: false, error: "Couldn't load members." });
    await user.click(screen.getByRole('radio', { name: 'Monthly' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load members.");
    expect(screen.getByRole('radio', { name: 'Daily' })).toBeInTheDocument();
    expect(screen.getByText('Total active members')).toBeInTheDocument();
  });

  // A gap is "nobody to retain", not 0%. The note is what stops a broken line
  // reading as a rendering bug.
  it('explains a retention gap rather than drawing it as zero', async () => {
    loadMembersAction.mockResolvedValue({
      ok: true,
      data: response({
        retention: [
          { label: '2026-08-01', value: null },
          { label: '2026-08-02', value: 91.5 },
        ],
      }),
    });
    renderView();

    expect(
      await screen.findByText('Gaps are periods with nobody to retain — not 0%.'),
    ).toBeInTheDocument();
  });

  it('shows each card its own empty state', async () => {
    loadMembersAction.mockResolvedValue({
      ok: true,
      data: response({
        kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
        activeOverTime: [{ label: '2026-08-01', value: 0 }],
        signupsVsChurn: [{ label: '2026-08-01', signups: 0, churned: 0 }],
        retention: [{ label: '2026-08-01', value: null }],
        byStatus: [],
      }),
    });
    renderView();

    expect(await screen.findByText('No members in this window.')).toBeInTheDocument();
    expect(screen.getByText('No joins or cancellations in this window.')).toBeInTheDocument();
    expect(screen.getByText('Not enough history to measure retention yet.')).toBeInTheDocument();
    expect(screen.getByText('No memberships on record.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- members-view`
Expected: FAIL — cannot resolve `./members-view`.

- [ ] **Step 3: Write the view**

Create `apps/admin/app/(dashboard)/members/members-view.tsx`. Copy `sales/sales-view.tsx` and change only what the interfaces above require. The parts that must survive the copy unchanged:

- the whole `styles` block, so the two tabs share a layout exactly;
- the `motion` block, `STAGGER_MS`, `settled` state and its `requestAnimationFrame` effect;
- the `.catch()` on the action call;
- `retry` deleting only its own cache entry;
- the error-as-banner path when `data !== null`, and the full-page alert only when `data === null`.

The component body:

```tsx
export function MembersView() {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  const [granularity, setGranularity] = useState<MembersGranularity>(DEFAULT_MEMBERS_GRANULARITY);
  const [retentionWindow, setRetentionWindow] = useState<RetentionWindow>(DEFAULT_RETENTION_WINDOW);
  // No control changes this in Plan A; it is in the key so the watch-lists' own
  // control needs no cache change when they land.
  const expiringWindow = DEFAULT_EXPIRING_WINDOW;

  const cache = useRef(new Map<string, DashboardMembersResponse>());
  const [data, setData] = useState<DashboardMembersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = `${granularity}:${retentionWindow}:${expiringWindow}`;

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
    void loadMembersAction({ granularity, retentionWindow, expiringWindow })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          cache.current.set(key, result.data);
          setData(result.data);
        } else {
          setError(result.error);
        }
        setPending(false);
      })
      // `loadMembersAction` resolves its OWN failures into `{ ok: false }`, so this
      // only catches the call itself failing — a dropped connection to the Server
      // Action endpoint. Without it that rejection goes unhandled AND leaves
      // `pending` stuck true with `data` null: a permanent skeleton with no retry.
      .catch(() => {
        if (cancelled) return;
        setError(t('loadError'));
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
    // `attempt` is in the deps purely to force a re-run on retry; the cache bypass
    // itself comes from `retry` deleting this key first.
  }, [key, granularity, retentionWindow, expiringWindow, attempt, t]);

  const shownKey =
    data === null ? '' : `${data.granularity}:${data.retentionWindow}:${data.expiringWindow}`;

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [shownKey]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data?.currency ?? 'USD',
        maximumFractionDigits: 0,
      }),
    [data?.currency, locale],
  );

  const retry = useCallback(() => {
    cache.current.delete(key);
    setAttempt((n) => n + 1);
  }, [key]);

  if (error !== null && data === null) {
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

  const step = (n: number) => (settled ? motion.settled(n) : motion.offset);

  return (
    <div {...stylex.props(styles.page, pending && styles.pending)}>
      {error !== null ? (
        <div role="alert" {...stylex.props(styles.banner)}>
          <span>{error}</span>
          <Button variant="secondary" size="sm" label={t('retry')} onClick={retry} />
        </div>
      ) : null}

      <div {...stylex.props(step(0))}>
        <MembersKpiStrip kpis={data.kpis} granularity={data.granularity} money={money} />
      </div>

      <div {...stylex.props(styles.workArea)}>
        <div {...stylex.props(styles.column)}>
          <div {...stylex.props(step(1))}>
            <ActiveMembersCard
              points={data.activeOverTime}
              granularity={granularity}
              current={data.kpis.activeMembers}
              onSelectGranularity={setGranularity}
              disabled={pending}
            />
          </div>
          <div {...stylex.props(step(2))}>
            <SignupsVsChurnCard points={data.signupsVsChurn} />
          </div>
          <div {...stylex.props(step(3))}>
            <RetentionCard
              points={data.retention}
              window={retentionWindow}
              onSelectWindow={setRetentionWindow}
              disabled={pending}
            />
          </div>
        </div>

        {/*
          The rail is the standing snapshot — where the membership base sits right
          now. It sticks on wide screens so scrolling the trends never scrolls the
          split off the page. Plan B adds the two watch-lists beneath it.
        */}
        <div {...stylex.props(styles.rail)}>
          <div {...stylex.props(step(2))}>
            <StatusBreakdownCard slices={data.byStatus} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/admin test -- members-view`
Expected: PASS — 9 tests.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @fit/admin type-check && pnpm check:tailwind-guardrail`

```bash
git add "apps/admin/app/(dashboard)/members/members-view.tsx" "apps/admin/app/(dashboard)/members/members-view.test.tsx"
git commit -m "feat(admin): assemble the Members tab view"
```

---

### Task 11: Flip the tab over

**Files:**

- Modify: `packages/types/src/dashboard-segments.ts`
- Modify: `packages/types/src/dashboard-segments.spec.ts`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segment-panel.test.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx`
- Modify: `apps/admin/app/(dashboard)/dashboard-header.tsx`
- Modify: `apps/admin/app/(dashboard)/dashboard-header.test.tsx`
- Modify: `apps/api/src/dashboard/dashboard-segments.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`

**Interfaces:**

- Consumes: `MembersView` (Task 10).
- Produces: a `members` tab that renders `MembersView`; `CONFIGURABLE_DASHBOARD_SEGMENTS` reduced to `['revenue', 'classes', 'staff']`.

**This is the only breaking change in the plan, and it lands in ONE commit** — the suite is red between the catalogue change and the spec updates.

**Three subtleties:**

1. **`DASHBOARD_SEGMENTS` must gain `members` explicitly.** It is currently `['overview', 'sales', ...CONFIGURABLE_DASHBOARD_SEGMENTS]`. Removing `members` from the configurable list would silently delete the tab from the bar. It becomes `['overview', 'sales', 'members', ...CONFIGURABLE_DASHBOARD_SEGMENTS]`.
2. **`configurableSegment()` in `segmented-dashboard.tsx` learns a third hand-built tab.** It currently returns `null` for `'overview' | 'sales'`; add `'members'`. Do not reach for an `as` cast to silence narrowing.
3. **`DashboardHeader` must show `members` no `?range=` control.** Its branch is currently `active === 'overview' ? … : active === 'sales' ? null : <range control>`. **With a third hand-built tab, replace the chain with a shared predicate** rather than adding another ternary arm — a fourth would be unreadable. Export `HAND_BUILT_SEGMENTS` from `packages/types/src/dashboard-segments.ts` as `['overview', 'sales', 'members'] as const`, and have both `dashboard-header.tsx` and `segmented-dashboard.tsx`'s `configurableSegment()` read it. The spec records that a fourth hand-built tab should turn the shell into a registry; this is the cheap half of that, done now because it removes a defect risk rather than to be tidy.

**Why the spec churn:** four spec files use `'members'` as their example configurable segment. They move to `'revenue'`. Note that `revenue` has two widgets (`revenue.over-time`, `revenue.by-location`) resolving to **one** metric (`revenue`), while the dedup tests need specific fixtures — see below.

- [ ] **Step 1: Update the catalogue**

In `packages/types/src/dashboard-segments.ts`:

```ts
/**
 * The segments whose widget set a gym can choose. Extend this list to add a
 * segment — no migration, because the stored rows carry the segment as a plain
 * string.
 *
 * `sales` and `members` are absent: both are hand-built views with their own
 * controls, like `overview`, so there is nothing for the picker to configure.
 * Stored `DashboardWidget` rows naming their retired keys are harmless —
 * `findDashboardWidget` already returns `undefined` for a key the catalogue no
 * longer defines.
 */
export const CONFIGURABLE_DASHBOARD_SEGMENTS = ['revenue', 'classes', 'staff'] as const;

/**
 * The tabs that are hand-built views rather than widget grids. The single source
 * of truth for "does this tab read the shell's `?range=` and offer the widget
 * picker?" — read by `segmented-dashboard.tsx` and `dashboard-header.tsx` alike,
 * so the two can never disagree about a tab.
 */
export const HAND_BUILT_SEGMENTS = ['overview', 'sales', 'members'] as const;

/**
 * Every dashboard tab, in display order — the hand-built views first, then the
 * configurable ones, so adding a segment there still adds its tab.
 */
export const DASHBOARD_SEGMENTS = [
  ...HAND_BUILT_SEGMENTS,
  ...CONFIGURABLE_DASHBOARD_SEGMENTS,
] as const;
```

Then delete the two `members.*` catalogue entries, so `DASHBOARD_WIDGET_CATALOG` begins at `// Revenue`.

- [ ] **Step 2: Update the contract spec**

In `packages/types/src/dashboard-segments.spec.ts`, replace the `widgetsForSegment('members')` assertion with:

```ts
expect(widgetsForSegment('revenue').map((widget) => widget.key)).toEqual([
  'revenue.over-time',
  'revenue.by-location',
]);
```

and extend the sales-exclusion test to cover both hand-built tabs:

```ts
it('keeps the hand-built tabs out of the configurable segments but in the tab bar', () => {
  for (const segment of HAND_BUILT_SEGMENTS) {
    expect(CONFIGURABLE_DASHBOARD_SEGMENTS).not.toContain(segment);
    expect(DASHBOARD_SEGMENTS).toContain(segment);
  }
  expect(DASHBOARD_SEGMENTS.slice(0, 3)).toEqual(['overview', 'sales', 'members']);
});

it('no longer defines any members widget', () => {
  expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('members.'))).toBe(false);
  expect(findDashboardWidget('members.churn')).toBeUndefined();
});
```

Add `HAND_BUILT_SEGMENTS` to the file's imports.

- [ ] **Step 3: Update the API specs**

In `apps/api/src/dashboard/dashboard-segments.service.spec.ts`:

- Replace every `'members'` segment argument with `'revenue'`, and every `members.*` widget key with its revenue equivalent (`members.new-signups` → `revenue.over-time`, `members.churn` → `revenue.by-location`).
- The `SECTIONS` fixture map must supply `revenue: ['revenue-over-time', 'revenue-by-location', 'revenue-by-plan']` — the third is used by another test in the file.
- **The two dedup tests need care.** `'computes each distinct metric exactly once'` is already pointed at `classes` (two widgets, metrics `classes` + `attendance`) — leave it alone. `'computes a shared metric once for all the widgets that use it'` is pointed at `members`; re-point it at **`revenue`**, whose two widgets both resolve to the `revenue` metric. Keep its assertion that the response still carries BOTH widget keys, which is what stops it passing while the service silently drops one.

In `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`, replace `'members'` with `'revenue'` and `members.churn` with `revenue.by-location`, and add:

```ts
it('rejects the hand-built members segment', async () => {
  const { controller } = setup();
  await expect(controller.get('members', '7d')).rejects.toThrow(/members/);
});
```

- [ ] **Step 4: Wire the shell**

In `segmented-dashboard.tsx`, import `MembersView` and `HAND_BUILT_SEGMENTS`, and rewrite the helper:

```ts
/**
 * The configurable segment a tab maps to, or `null` for the hand-built views.
 * Reads `HAND_BUILT_SEGMENTS` rather than listing the tabs again, so this and
 * `DashboardHeader` can never disagree about which tabs have no catalogue.
 */
function configurableSegment(segment: DashboardSegment): ConfigurableDashboardSegment | null {
  return (HAND_BUILT_SEGMENTS as readonly string[]).includes(segment)
    ? null
    : (segment as ConfigurableDashboardSegment);
}
```

and add the branch beside the other two:

```tsx
{
  active === 'members' ? <MembersView /> : null;
}
```

- [ ] **Step 5: Wire the header**

In `dashboard-header.tsx`, import `HAND_BUILT_SEGMENTS`, and replace the ternary chain's second arm:

```tsx
        ) : (HAND_BUILT_SEGMENTS as readonly string[]).includes(active) ? null : (
```

Update the file's header comment: the `- Sales → NEITHER` bullet becomes `- Sales, Members → NEITHER. Both are hand-built views that read no URL param…`.

- [ ] **Step 6: Update the admin specs**

- `segmented-dashboard.test.tsx`: mock `../members/members-view` to render `Members view`; change the `selectedKeys` fixture's `members` key to `revenue`; re-point every `renderShell('members')` at `'revenue'`; add a test that `?segment=members` renders `Members view` and no `data-testid="panel"`; extend the "hides the widget picker" test to cover `members`.
- `segment-panel.test.tsx`: change the segment union from `'members' | 'revenue'` to `'revenue' | 'classes'`, default `'revenue'`, and the fixture's `segment` / `key` to `'revenue'` / `'revenue.over-time'`.
- `add-widget-dialog.test.tsx`: replace the `members` selection fixtures with `revenue` ones (`ALL_REVENUE = ['revenue.over-time', 'revenue.by-location']`), `initialSegment="revenue"`, label fixtures `revenueOverTime` / `revenueByLocation`, and the save assertion targeting `('revenue', [...])`.
- `dashboard-header.test.tsx`: change `renderHeader`'s union to `'overview' | 'sales' | 'members' | 'revenue'`, re-point the `'members'` calls at `'revenue'`, and extend the hand-built test to assert `members` shows neither filter too.

- [ ] **Step 7: Run everything**

Run: `pnpm test && pnpm type-check && pnpm lint && pnpm check:tailwind-guardrail`
Expected: all green across `@fit/types`, `@fit/api`, `@fit/admin`.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/dashboard-segments.ts packages/types/src/dashboard-segments.spec.ts \
  "apps/admin/app/(dashboard)/segments/" "apps/admin/app/(dashboard)/dashboard-header.tsx" \
  "apps/admin/app/(dashboard)/dashboard-header.test.tsx" apps/api/src/dashboard/
git commit -m "feat(dashboard): replace the Members widget grid with the hand-built view

The members segment leaves CONFIGURABLE_DASHBOARD_SEGMENTS so the widget
picker no longer offers it, and stays in DASHBOARD_SEGMENTS so the tab
bar is unchanged.

With a third hand-built tab, the shell and the header stop listing them
separately: HAND_BUILT_SEGMENTS is now the single source of truth for
which tabs have no catalogue and read no ?range=, so the two files can
no longer disagree about a tab.

Every segment spec that used 'members' as its example moves to
'revenue'."
```

---

## Verification

- [ ] `pnpm test && pnpm type-check && pnpm lint && pnpm check:tailwind-guardrail` — all green.
- [ ] Start the stack (`pnpm dev`), sign in as OWNER or MANAGER, open `/?segment=members`.
- [ ] Confirm: four KPI tiles with three counts and one currency figure; the active-members trend with the granularity control; signups-vs-cancellations with its legend; retention with the 30/60/90 control; the status breakdown listing every state the gym actually has.
- [ ] Flip granularity to Monthly — every card's numbers change together and the KPI caption reads "Last 12 months".
- [ ] Flip retention to 90d — only the retention card's line and caption change.
- [ ] Flip back to Daily / 30d — instant, no network request (the cache).
- [ ] **Narrow the window to ~1000px.** The active-members card's control row must stay fully visible and clickable — the Sales tab shipped a clipped control at this width and no automated check caught it.
- [ ] Confirm the page header shows **no** `?range=` control on Members, and still shows one on Revenue.
- [ ] Open Revenue — the widget grid and the "Add widget" button are both still there; the picker's tab bar no longer lists Sales or Members.
- [ ] Sign in as a role without `ReportView` — the dashboard still degrades to the plain welcome.
