# Dashboard Migration (Part 1 — Secondary KPIs + Recent Members) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge gym-admin's dashboard content list into fit's real dashboard — add the six "stat card" KPIs (Active Members, Revenue This Month, Overdue Payments, Classes Today, Expiring Soon, Renewals Due) and a Recent Members card — computed from real tenant-scoped data, rendered in fit's StyleX/Astryx visual system.

**Architecture:** Additive only. Extend the `GET /dashboard/overview` contract with a `secondaryKpis` object and a `recentMembers` array; compute both with real Prisma aggregations in `DashboardService`; render two new sections in `dashboard-view.tsx`. No existing section, endpoint, or query param changes — the overview endpoint's signature and range control stay exactly as they are.

**Tech Stack:** TypeScript, Zod (`@fit/types`), NestJS + Prisma (`apps/api`), Next.js RSC + StyleX + `@astryxdesign/core` + next-intl (`apps/admin`), Vitest.

## Global Constraints

- **No fabricated numbers.** Every figure is a real aggregation over existing rows; empty/zero is honest and renders an empty state — copied verbatim from the spec.
- **Money is MINOR units** (integer cents/tetri) across the wire; the client formats with `Intl.NumberFormat` against `data.currency`.
- **Merge, not replace:** fit's existing dashboard sections (occupancy, 3 KPIs, revenue chart, plan-mix, schedule, alerts, recent check-ins, pinned) are untouched.
- **i18n:** every user-facing string is a next-intl key present in BOTH `packages/i18n/locales/en.json` and `packages/i18n/locales/ka.json` under `admin.dashboard`.
- **Live subscription set** = `[TRIAL, ACTIVE, PAST_DUE, FROZEN]` (mirrors the service's existing usage).

## Deferred to follow-up plans (out of scope here)

- **Part 2 — Location filter** (`?locationId=`): threading a location filter through the location-bearing aggregations (occupancy, check-ins, revenue, classes) + a location dropdown in the control bar. Deferred because it modifies existing working aggregations (regression risk) and is independently shippable.
- **Part 3 — Date filter reconciliation**: replacing the revenue-card's `7d/30d/12w` control with gym-admin's `Today / This Week / This Month / Custom` top-level control. Deferred because it reworks the revenue windowing/bucketing (regression risk) and its param shape was left open in the spec.

## File Structure

- `packages/types/src/dashboard.ts` — **modify**: add `dashboardSecondaryKpisSchema`, `dashboardRecentMemberSchema`, and two fields on `dashboardOverviewResponseSchema`.
- `packages/types/src/dashboard.spec.ts` — **create**: parse round-trip tests for the extended contract.
- `apps/api/src/dashboard/dashboard.service.ts` — **modify**: add `LIVE_SUBSCRIPTION_STATUSES` + `startOfMonth`, `secondaryKpis()`, `recentMembers()`; wire both into `getOverview`.
- `apps/api/src/dashboard/dashboard.service.spec.ts` — **modify**: add unit tests for the two new methods.
- `apps/admin/app/(dashboard)/dashboard-view.tsx` — **modify**: add `StatKpiCard`, `RecentMembersCard`, a `formatDate` helper, `memberStatusVariant`, new styles, and render the two sections.
- `packages/i18n/locales/en.json` + `packages/i18n/locales/ka.json` — **modify**: new `admin.dashboard.secondaryKpi.*` and `admin.dashboard.recentMembers.*` keys.

---

### Task 1: Extend the dashboard overview contract

**Files:**

- Modify: `packages/types/src/dashboard.ts`
- Test: `packages/types/src/dashboard.spec.ts` (create)

**Interfaces:**

- Produces:
  - `dashboardSecondaryKpisSchema` / `DashboardSecondaryKpis` — `{ activeMembers: number; revenueThisMonth: DashboardKpi; overduePayments: number; classesToday: number; expiringSoon: number; renewalsDue: number }`
  - `dashboardRecentMemberSchema` / `DashboardRecentMember` — `{ id: string; name: string; email: string; planName: string | null; status: string; joinedAt: string; expiresAt: string | null }`
  - `dashboardOverviewResponseSchema` gains `secondaryKpis` and `recentMembers`.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/dashboard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dashboardSecondaryKpisSchema, dashboardRecentMemberSchema } from './dashboard';

describe('dashboardSecondaryKpisSchema', () => {
  it('accepts the six secondary KPI figures', () => {
    const parsed = dashboardSecondaryKpisSchema.parse({
      activeMembers: 120,
      revenueThisMonth: { value: 500000, deltaPct: 25 },
      overduePayments: 7,
      classesToday: 9,
      expiringSoon: 15,
      renewalsDue: 30,
    });
    expect(parsed.revenueThisMonth.deltaPct).toBe(25);
    expect(parsed.activeMembers).toBe(120);
  });

  it('rejects a negative count', () => {
    expect(() =>
      dashboardSecondaryKpisSchema.parse({
        activeMembers: -1,
        revenueThisMonth: { value: 0, deltaPct: null },
        overduePayments: 0,
        classesToday: 0,
        expiringSoon: 0,
        renewalsDue: 0,
      }),
    ).toThrow();
  });
});

describe('dashboardRecentMemberSchema', () => {
  it('accepts a member with no plan and no expiry', () => {
    const parsed = dashboardRecentMemberSchema.parse({
      id: 'gm_1',
      name: 'Sarah Johnson',
      email: 'sarah.j@email.com',
      planName: null,
      status: 'ACTIVE',
      joinedAt: '2026-07-01T10:00:00.000Z',
      expiresAt: null,
    });
    expect(parsed.planName).toBeNull();
    expect(parsed.expiresAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/types && pnpm test dashboard.spec`
Expected: FAIL — `dashboardSecondaryKpisSchema`/`dashboardRecentMemberSchema` are not exported.

- [ ] **Step 3: Add the schemas**

In `packages/types/src/dashboard.ts`, immediately after the `dashboardKpisSchema` / `DashboardKpis` block (around line 134), add:

```ts
/**
 * The six "stat card" figures the gym-admin reference dashboard surfaces alongside
 * the three primary KPIs. `revenueThisMonth` carries a real month-over-month delta;
 * the rest are live counts (no historical baseline exists, so they show a static
 * descriptive hint rather than a fabricated trend).
 */
export const dashboardSecondaryKpisSchema = z.object({
  /** Active `MEMBER`-role members (status ACTIVE). */
  activeMembers: z.number().int().nonnegative(),
  /** Captured revenue this calendar month (MINOR units), delta vs. last month. */
  revenueThisMonth: dashboardKpiSchema,
  /** Subscriptions currently `PAST_DUE` (dunning) — the honest "overdue" figure. */
  overduePayments: z.number().int().nonnegative(),
  /** Class occurrences scheduled today. */
  classesToday: z.number().int().nonnegative(),
  /** Live subscriptions whose current period ends within 7 days. */
  expiringSoon: z.number().int().nonnegative(),
  /** Live subscriptions whose current period ends within this calendar month. */
  renewalsDue: z.number().int().nonnegative(),
});
export type DashboardSecondaryKpis = z.infer<typeof dashboardSecondaryKpisSchema>;

/** One row of the "recent members" table: the latest joiners with plan + status + expiry. */
export const dashboardRecentMemberSchema = z.object({
  /** The `GymMember` id, for row links into the members routes. */
  id: z.string(),
  /** Display name (falls back to email when unnamed). */
  name: z.string(),
  /** The member's email. */
  email: z.string(),
  /** Current live subscription plan name, or `null`. */
  planName: z.string().nullable(),
  /** `GymMemberStatus` (ACTIVE / INVITED / SUSPENDED). */
  status: z.string(),
  /** When they joined, ISO-8601. */
  joinedAt: z.string(),
  /** Current subscription period end (the "expiry"), ISO-8601, or `null`. */
  expiresAt: z.string().nullable(),
});
export type DashboardRecentMember = z.infer<typeof dashboardRecentMemberSchema>;
```

Then add two fields to `dashboardOverviewResponseSchema` — insert after the `kpis: dashboardKpisSchema,` line:

```ts
  /** The six gym-admin "stat card" secondary KPIs. */
  secondaryKpis: dashboardSecondaryKpisSchema,
```

and after the `recentCheckIns: z.array(dashboardCheckInSchema),` line:

```ts
  /** The latest joiners for the "recent members" table (top ~6, newest first). */
  recentMembers: z.array(dashboardRecentMemberSchema),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/types && pnpm test dashboard.spec`
Expected: PASS (both describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/dashboard.ts packages/types/src/dashboard.spec.ts
git commit -m "feat(types): dashboard secondary KPIs + recent members contract"
```

---

### Task 2: Compute the secondary KPIs (backend)

**Files:**

- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`

**Interfaces:**

- Consumes: `DashboardSecondaryKpis` (Task 1); existing `pctDelta`, `startOfToday`, `DAY_MS`.
- Produces: `DashboardService.secondaryKpis(): Promise<DashboardSecondaryKpis>` (private, invoked in `getOverview`); module const `LIVE_SUBSCRIPTION_STATUSES`; helper `startOfMonth(d: Date): Date`.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/dashboard/dashboard.service.spec.ts`, add these imports at the top (extend the existing import lines):

```ts
import { PaymentStatus, SubscriptionStatus } from '@fit/db';
import type { DashboardSecondaryKpis } from '@fit/types';
```

Then append inside the top-level `describe('DashboardService', ...)` block:

```ts
describe('secondaryKpis', () => {
  function setupSecondary() {
    const gymMemberCount = vi.fn().mockResolvedValueOnce(120); // activeMembers
    const paymentAggregate = vi
      .fn()
      .mockResolvedValueOnce({ _sum: { amount: 500000 } }) // this month
      .mockResolvedValueOnce({ _sum: { amount: 400000 } }); // last month
    const subscriptionCount = vi
      .fn()
      .mockResolvedValueOnce(7) // overdue (PAST_DUE)
      .mockResolvedValueOnce(15) // expiring soon
      .mockResolvedValueOnce(30); // renewals due
    const classInstanceCount = vi.fn().mockResolvedValueOnce(9); // classes today

    const client = {
      gymMember: { count: gymMemberCount },
      payment: { aggregate: paymentAggregate },
      subscription: { count: subscriptionCount },
      classInstance: { count: classInstanceCount },
    };
    const prisma = { client } as unknown as TenantPrismaService;
    const tenant = { gymId: 'gym_test' } as TenantContext;
    const service = new DashboardService(prisma, tenant);
    return { service, subscriptionCount, paymentAggregate };
  }

  it('projects the six figures with a real month-over-month revenue delta', async () => {
    const { service } = setupSecondary();
    const result: DashboardSecondaryKpis = await (
      service as unknown as { secondaryKpis(): Promise<DashboardSecondaryKpis> }
    ).secondaryKpis();

    expect(result).toEqual({
      activeMembers: 120,
      revenueThisMonth: { value: 500000, deltaPct: 25 },
      overduePayments: 7,
      classesToday: 9,
      expiringSoon: 15,
      renewalsDue: 30,
    });
  });

  it('counts overdue as PAST_DUE subscriptions', async () => {
    const { service, subscriptionCount } = setupSecondary();
    await (
      service as unknown as { secondaryKpis(): Promise<DashboardSecondaryKpis> }
    ).secondaryKpis();
    expect(subscriptionCount.mock.calls[0]?.[0]).toEqual({
      where: { status: SubscriptionStatus.PAST_DUE },
    });
  });

  it('sums this-month revenue from CAPTURED payments only', async () => {
    const { service, paymentAggregate } = setupSecondary();
    await (
      service as unknown as { secondaryKpis(): Promise<DashboardSecondaryKpis> }
    ).secondaryKpis();
    expect(paymentAggregate.mock.calls[0]?.[0].where.status).toBe(PaymentStatus.CAPTURED);
    expect(paymentAggregate.mock.calls[0]?.[0]._sum).toEqual({ amount: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm test dashboard.service`
Expected: FAIL — `secondaryKpis` is not a function.

- [ ] **Step 3: Implement the method**

In `apps/api/src/dashboard/dashboard.service.ts`:

(a) After the `DAY_MS` const (line ~33), add:

```ts
/** Subscription states that count as a live membership (mirrors the state machine). */
const LIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
] as const;
```

(b) Add the `DashboardSecondaryKpis` type to the `@fit/types` import block:

```ts
  type DashboardSecondaryKpis,
```

(c) Add the private method (place it right after the existing `kpis()` method, before the "Revenue series" section):

```ts
  /**
   * The six secondary "stat card" KPIs the gym-admin reference surfaces. All real,
   * tenant-scoped, issued concurrently:
   *   • activeMembers    — COUNT `MEMBER` with status ACTIVE.
   *   • revenueThisMonth — SUM captured `Payment.amount` this calendar month, delta
   *                        vs. last month.
   *   • overduePayments  — COUNT subscriptions in PAST_DUE (the dunning backlog).
   *   • classesToday     — COUNT today's class occurrences.
   *   • expiringSoon     — COUNT live subscriptions ending within 7 days.
   *   • renewalsDue      — COUNT live subscriptions ending within this calendar month.
   */
  private async secondaryKpis(): Promise<DashboardSecondaryKpis> {
    const db = this.prisma.client;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const nextMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const todayStart = startOfToday();
    const todayEnd = new Date(todayStart.getTime() + DAY_MS);
    const in7Days = new Date(now.getTime() + 7 * DAY_MS);
    const live = [...LIVE_SUBSCRIPTION_STATUSES];

    const [
      activeMembers,
      revenueThisMonthAgg,
      revenueLastMonthAgg,
      overduePayments,
      classesToday,
      expiringSoon,
      renewalsDue,
    ] = await Promise.all([
      db.gymMember.count({ where: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE } }),
      db.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: lastMonthStart, lt: monthStart },
        },
        _sum: { amount: true },
      }),
      db.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
      db.classInstance.count({ where: { startsAt: { gte: todayStart, lt: todayEnd } } }),
      db.subscription.count({
        where: { status: { in: live }, currentPeriodEnd: { gte: now, lte: in7Days } },
      }),
      db.subscription.count({
        where: { status: { in: live }, currentPeriodEnd: { gte: monthStart, lt: nextMonthStart } },
      }),
    ]);

    const revThis = revenueThisMonthAgg._sum.amount ?? 0;
    const revLast = revenueLastMonthAgg._sum.amount ?? 0;

    return {
      activeMembers,
      revenueThisMonth: { value: revThis, deltaPct: pctDelta(revThis, revLast) },
      overduePayments,
      classesToday,
      expiringSoon,
      renewalsDue,
    };
  }
```

(d) Add the `startOfMonth` helper next to `startOfToday` (near line 668):

```ts
/** Start of the current calendar month in the server's zone. */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm test dashboard.service`
Expected: PASS — the new `secondaryKpis` describe block is green; the existing `getStats` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.service.spec.ts
git commit -m "feat(api): dashboard secondary KPI aggregations"
```

---

### Task 3: Compute recent members + wire both into the overview (backend)

**Files:**

- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`

**Interfaces:**

- Consumes: `DashboardRecentMember` (Task 1), `DashboardSecondaryKpis` (Task 2), `LIVE_SUBSCRIPTION_STATUSES`.
- Produces: `DashboardService.recentMembers(): Promise<DashboardRecentMember[]>`; `getOverview` now returns `secondaryKpis` + `recentMembers`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/dashboard/dashboard.service.spec.ts` (extend the `@fit/types` import with `DashboardRecentMember`):

```ts
describe('recentMembers', () => {
  it('maps the latest joiners, falling back to email when unnamed', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([
      {
        id: 'gm_1',
        status: 'ACTIVE',
        joinedAt: new Date('2026-07-01T10:00:00.000Z'),
        user: { name: null, email: 'sarah.j@email.com' },
        subscriptions: [
          {
            currentPeriodEnd: new Date('2026-12-15T00:00:00.000Z'),
            plan: { name: 'Premium Annual' },
          },
        ],
      },
    ]);
    const client = { gymMember: { findMany } };
    const prisma = { client } as unknown as TenantPrismaService;
    const tenant = { gymId: 'gym_test' } as TenantContext;
    const service = new DashboardService(prisma, tenant);

    const result: DashboardRecentMember[] = await (
      service as unknown as { recentMembers(): Promise<DashboardRecentMember[]> }
    ).recentMembers();

    expect(result).toEqual([
      {
        id: 'gm_1',
        name: 'sarah.j@email.com',
        email: 'sarah.j@email.com',
        planName: 'Premium Annual',
        status: 'ACTIVE',
        joinedAt: '2026-07-01T10:00:00.000Z',
        expiresAt: '2026-12-15T00:00:00.000Z',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm test dashboard.service`
Expected: FAIL — `recentMembers` is not a function.

- [ ] **Step 3: Implement the method + wire the overview**

(a) Add `type DashboardRecentMember,` to the `@fit/types` import block.

(b) Add the method after `recentCheckIns()` (before the closing brace of the class):

```ts
  /**
   * The latest joiners for the "recent members" table — top 6 `MEMBER`-role members
   * by `joinedAt`, each with their current live subscription's plan name + period end
   * (the "expiry"). All real, tenant-scoped via the Prisma extension.
   */
  private async recentMembers(): Promise<DashboardRecentMember[]> {
    const rows = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER },
      orderBy: { joinedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        status: true,
        joinedAt: true,
        user: { select: { name: true, email: true } },
        subscriptions: {
          where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 1,
          select: { currentPeriodEnd: true, plan: { select: { name: true } } },
        },
      },
    });

    return rows.map((m) => ({
      id: m.id,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      planName: m.subscriptions[0]?.plan?.name ?? null,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
      expiresAt: m.subscriptions[0]?.currentPeriodEnd?.toISOString() ?? null,
    }));
  }
```

(c) Wire both new methods into `getOverview`. Extend the `Promise.all` destructure and array (after `recentCheckIns`):

```ts
      recentCheckIns,
      secondaryKpis,
      recentMembers,
    ] = await Promise.all([
```

...and add to the promise array (after `this.recentCheckIns()`):

```ts
      this.recentCheckIns(),
      this.secondaryKpis(),
      this.recentMembers(),
    ]);
```

...and add to the returned object (after `recentCheckIns,`):

```ts
      recentCheckIns,
      secondaryKpis,
      recentMembers,
    };
```

- [ ] **Step 4: Run the tests + typecheck**

Run: `cd apps/api && pnpm test dashboard.service && pnpm type-check`
Expected: PASS — all dashboard tests green; `type-check` clean (the overview return type now satisfies the extended `DashboardOverviewResponse`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.service.spec.ts
git commit -m "feat(api): recent members feed + wire secondary KPIs into overview"
```

---

### Task 4: Secondary KPI cards (frontend)

**Files:**

- Modify: `apps/admin/app/(dashboard)/dashboard-view.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `data.secondaryKpis` (Task 3); existing `KpiCard`, `Card`, `Stack`, `HStack`, `Text`, `Icon`, `CountUp`, `styles.iconTile`, `styles.icon`, `styles.deltaMuted`, `styles.kpiCard`.
- Produces: `StatKpiCard` component; `styles.secondaryKpiGrid`.

- [ ] **Step 1: Add the i18n keys**

In `packages/i18n/locales/en.json`, under `admin.dashboard`, add a `secondaryKpi` object (place after the existing `kpi` object):

```json
"secondaryKpi": {
  "activeMembers": "Active members",
  "revenueThisMonth": "Revenue this month",
  "overduePayments": "Overdue payments",
  "classesToday": "Classes today",
  "expiringSoon": "Expiring soon",
  "renewalsDue": "Renewals due",
  "classesTodayHint": "Scheduled today",
  "expiringSoonHint": "Within 7 days",
  "renewalsDueHint": "This month"
},
```

In `packages/i18n/locales/ka.json`, under `admin.dashboard`, add the mirror:

```json
"secondaryKpi": {
  "activeMembers": "აქტიური წევრები",
  "revenueThisMonth": "ამ თვის შემოსავალი",
  "overduePayments": "ვადაგადაცილებული გადახდები",
  "classesToday": "დღევანდელი კლასები",
  "expiringSoon": "მალე იწურება",
  "renewalsDue": "განახლების ვადა",
  "classesTodayHint": "დღეს დაგეგმილი",
  "expiringSoonHint": "7 დღეში",
  "renewalsDueHint": "ამ თვეში"
},
```

- [ ] **Step 2: Add the `StatKpiCard` component**

In `dashboard-view.tsx`, add after the `KpiCard` function (before `DeltaChip`):

```tsx
/**
 * A secondary "stat card" — like {@link KpiCard} but for a live count with no
 * period-over-period baseline: it shows a static descriptive `hint` (a label, not a
 * fabricated trend) where the delta chip would sit, or nothing when `hint` is omitted.
 */
function StatKpiCard({
  label,
  icon,
  value,
  hint,
}: {
  label: string;
  icon: IconName;
  value: number;
  hint?: string;
}) {
  return (
    <Card variant="default" padding={5} xstyle={styles.kpiCard}>
      <Stack height="100%" justify="between" gap={5}>
        <HStack justify="between" align="center">
          <span {...stylex.props(styles.iconTile)}>
            <Icon name={icon} {...stylex.props(styles.icon)} />
          </span>
          {hint ? <span {...stylex.props(styles.deltaMuted)}>{hint}</span> : null}
        </HStack>
        <Stack gap={1}>
          <Text type="display-3" weight="bold" hasTabularNumbers display="block">
            <CountUp to={Math.round(value)} />
          </Text>
          <Text type="supporting" color="secondary" weight="semibold" display="block">
            {label}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 3: Add the grid style**

In the `styles = stylex.create({ ... })` block, add:

```ts
  secondaryKpiGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
```

- [ ] **Step 4: Render the section**

In `DashboardView`'s returned JSX, insert immediately after the closing `</section>` of the "In the gym now + KPIs" block (after line ~592) and before the pinned-widgets line:

```tsx
{
  /* Secondary stat KPIs (gym-admin parity) */
}
<section {...stylex.props(styles.secondaryKpiGrid)}>
  <StatKpiCard
    label={t('secondaryKpi.activeMembers')}
    icon="users"
    value={data.secondaryKpis.activeMembers}
  />
  <KpiCard
    label={t('secondaryKpi.revenueThisMonth')}
    icon="card"
    kpi={data.secondaryKpis.revenueThisMonth}
    format={(v) => money.format(v / 100)}
  />
  <StatKpiCard
    label={t('secondaryKpi.overduePayments')}
    icon="bell"
    value={data.secondaryKpis.overduePayments}
  />
  <StatKpiCard
    label={t('secondaryKpi.classesToday')}
    icon="calendar"
    value={data.secondaryKpis.classesToday}
    hint={t('secondaryKpi.classesTodayHint')}
  />
  <StatKpiCard
    label={t('secondaryKpi.expiringSoon')}
    icon="clock"
    value={data.secondaryKpis.expiringSoon}
    hint={t('secondaryKpi.expiringSoonHint')}
  />
  <StatKpiCard
    label={t('secondaryKpi.renewalsDue')}
    icon="arrow"
    value={data.secondaryKpis.renewalsDue}
    hint={t('secondaryKpi.renewalsDueHint')}
  />
</section>;
```

- [ ] **Step 5: Verify typecheck + build**

Run: `cd apps/admin && pnpm type-check`
Expected: PASS — `data.secondaryKpis.*` resolve; `icon` values (`users`/`card`/`bell`/`calendar`/`clock`/`arrow`) are valid `IconName`s.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/'(dashboard)'/dashboard-view.tsx packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(admin): dashboard secondary KPI cards (gym-admin parity)"
```

---

### Task 5: Recent Members card (frontend)

**Files:**

- Modify: `apps/admin/app/(dashboard)/dashboard-view.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `data.recentMembers` (Task 3); existing `Card`, `Badge`, `EmptyState`, `initials`, `styles.card`, `styles.cardHead`, `styles.sectionLabel`, `styles.checkInGrid`, `styles.checkInRow`, `styles.avatar`, `styles.alertMain`, `styles.alertTitle`, `styles.alertDetail`.
- Produces: `RecentMembersCard` component; `formatDate` helper; `memberStatusVariant` helper.

- [ ] **Step 1: Add the i18n keys**

In `packages/i18n/locales/en.json`, under `admin.dashboard`, add after the `recentCheckIns` object:

```json
"recentMembers": {
  "title": "Recent members",
  "empty": "No members yet.",
  "noPlan": "No plan",
  "expires": "Expires {date}",
  "status": { "active": "Active", "invited": "Invited", "suspended": "Suspended" }
},
```

In `packages/i18n/locales/ka.json`, mirror:

```json
"recentMembers": {
  "title": "ბოლო წევრები",
  "empty": "წევრები ჯერ არ არის.",
  "noPlan": "გეგმის გარეშე",
  "expires": "იწურება {date}",
  "status": { "active": "აქტიური", "invited": "მოწვეული", "suspended": "შეჩერებული" }
},
```

- [ ] **Step 2: Add the helpers + component**

In `dashboard-view.tsx`, add near the other formatters (after `formatTime`, ~line 1078):

```tsx
/** Locale-formatted short date for the recent-members "expires" line. */
function formatDate(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/** Map a `GymMemberStatus` string to an Astryx Badge variant. */
function memberStatusVariant(status: string): 'success' | 'error' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'SUSPENDED':
      return 'error';
    default:
      return 'neutral';
  }
}
```

Add the card component after `RecentCheckInsCard`:

```tsx
/**
 * The "recent members" card (gym-admin parity) — the latest joiners with their plan,
 * status badge, and membership expiry. Mirrors the recent-check-ins row layout; the
 * name links into the member's profile route.
 */
function RecentMembersCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();
  const rows = data.recentMembers;
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('recentMembers.title')}</h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t('recentMembers.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.checkInGrid)}>
          {rows.map((row) => (
            <li key={row.id} {...stylex.props(styles.checkInRow)}>
              <span {...stylex.props(styles.avatar)}>{initials(row.name)}</span>
              <span {...stylex.props(styles.alertMain)}>
                <span {...stylex.props(styles.alertTitle)}>{row.name}</span>
                <span {...stylex.props(styles.alertDetail)}>
                  {row.planName ?? t('recentMembers.noPlan')}
                  {row.expiresAt
                    ? ` · ${t('recentMembers.expires', { date: formatDate(locale, row.expiresAt) })}`
                    : ''}
                </span>
              </span>
              <Badge
                variant={memberStatusVariant(row.status)}
                label={t(`recentMembers.status.${row.status.toLowerCase()}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Render the card**

In `DashboardView`'s JSX, add after the existing `<RecentCheckInsCard data={data} />` line:

```tsx
{
  /* Recent members (gym-admin parity) */
}
<RecentMembersCard data={data} />;
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/admin && pnpm type-check`
Expected: PASS. Note: the status label key is dynamic (`recentMembers.status.${status}`); the three `GymMemberStatus` values (ACTIVE/INVITED/SUSPENDED) all have keys, so no missing-message warning.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/'(dashboard)'/dashboard-view.tsx packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(admin): dashboard recent members card (gym-admin parity)"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the touched packages' tests + typechecks**

```bash
cd packages/types && pnpm test dashboard.spec && pnpm type-check
cd ../../apps/api && pnpm test dashboard.service && pnpm type-check
cd ../admin && pnpm type-check
```

Expected: all green.

- [ ] **Step 2: Build the admin app**

Run: `cd apps/admin && pnpm build`
Expected: build succeeds (dashboard route compiles with the two new sections).

- [ ] **Step 3: Drive the dashboard by hand**

Start the API + admin dev servers (per repo README), sign in as an `OWNER`/`MANAGER` (holds `ReportView`), open the dashboard, and confirm:

- Six new stat cards render between the primary KPIs and the revenue chart: Active Members, Revenue This Month (with a % delta chip), Overdue Payments, Classes Today (+"Scheduled today"), Expiring Soon (+"Within 7 days"), Renewals Due (+"This month").
- A "Recent members" card renders below "Recent check-ins" with name, plan, status badge, and expiry.
- Cross-check two figures against the DB (e.g. `SELECT count(*) FROM gym_members WHERE role='MEMBER' AND status='ACTIVE'` equals Active Members; captured-payments-this-month SUM equals Revenue This Month) to confirm they are real, not fabricated.
- Switch locale to `ka` and confirm all new strings are translated (no raw keys).

- [ ] **Step 4: Commit any fixups**

```bash
git add -A && git commit -m "chore(admin): dashboard migration part 1 verification fixups"
```

## Self-Review notes

- **Spec coverage:** New KPI cards (Active Members, Revenue This Month, Overdue, Classes Today, Expiring, Renewals) → Tasks 2 + 4. Recent Members → Tasks 3 + 5. Location filter + date-filter reconciliation → explicitly deferred to Parts 2 & 3 (documented above). "New Members" overlap with fit's existing `newMembers7d` → intentionally not duplicated.
- **Real data:** every figure is a Prisma aggregation; `overduePayments` maps to `Subscription.PAST_DUE` (no `PaymentStatus.OVERDUE` exists); `expiringSoon`/`renewalsDue` use `Subscription.currentPeriodEnd`.
- **Type consistency:** `secondaryKpis` / `recentMembers` field names match across Task 1 (schema), Task 3 (service return), and Tasks 4–5 (consumers). `DashboardKpi` reused for `revenueThisMonth` so the existing `KpiCard` renders it unchanged.
