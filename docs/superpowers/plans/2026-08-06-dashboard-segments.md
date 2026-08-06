# Segmented Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise the admin dashboard into business segments (Sales, Members, Revenue, Classes, Staff) that switch with an animated tab, each showing a gym-wide, staff-chosen set of widgets.

**Architecture:** A widget is not new code — it is a catalogue entry in `@fit/types` naming an existing report drill-down section, so the aggregation (`ReportDrilldownService`) and the renderer (`ReportSectionCard`) already exist. A gym-scoped `DashboardWidget` table records which widgets each segment shows, replacing the per-user `DashboardPin`. The client fetches each segment lazily on first activation and caches it, so re-selecting a visited segment animates instead of spinning.

**Tech Stack:** TypeScript, Zod, NestJS, Prisma (PostgreSQL), Next.js App Router (React Server Components + Server Actions), StyleX, Astryx design system, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-06-dashboard-segments-design.md`

## Global Constraints

- **No Tailwind.** Every file under `apps/admin/app/(dashboard)/` is on the `check-tailwind-guardrail.ts` migrated manifest. Style with StyleX only. Do not import `Tabs` from `@fit/ui-web` — it is Tailwind-classed.
- **Money is MINOR units** (integer cents/tetri) everywhere in report contracts; format against the response `currency`.
- **Never fabricate data.** An empty section means "no rows in this window" and renders the existing empty state — never a synthesised zero.
- **Tenant scoping is explicit.** `DashboardWidget` is _not_ in `TENANT_SCOPED_MODELS`, so every query must pin `gymId` from `TenantContext` by hand, exactly as `DashboardPinsService` does today.
- **Both permissions read and write on `Permission.ReportView`** (OWNER + MANAGER). Not `GymManage`.
- **Every user-facing string is an i18n key**, added to both `packages/i18n/locales/en.json` and `packages/i18n/locales/ka.json`.
- **Prettier runs in a pre-commit hook.** Run `npx prettier --write <files>` before `git commit` or the commit is rejected.
- Test commands: `pnpm --filter @fit/types test`, `pnpm --filter @fit/api test`, `pnpm --filter @fit/admin test`.

---

## File Structure

**Created**

| File                                                                              | Responsibility                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/types/src/dashboard-segments.ts`                                        | Segment enum, widget catalogue, wire schemas                                    |
| `packages/types/src/dashboard-segments.spec.ts`                                   | Catalogue invariants                                                            |
| `apps/api/src/dashboard/dashboard-segments.service.ts`                            | Resolve a segment's widgets; persist a segment's selection                      |
| `apps/api/src/dashboard/dashboard-segments.service.spec.ts`                       | Service unit tests                                                              |
| `apps/api/src/dashboard/dashboard-segments.controller.ts`                         | `GET`/`PUT /admin/dashboard/segments/:segment`                                  |
| `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`                    | Routing + validation tests                                                      |
| `apps/admin/app/(dashboard)/segments/segment-tabs.tsx`                            | ARIA tab bar                                                                    |
| `apps/admin/app/(dashboard)/segments/segment-tabs.test.tsx`                       | Keyboard + selection tests                                                      |
| `apps/admin/app/(dashboard)/segments/segment-panel.tsx`                           | Fetch, cache, staged enter/exit animation                                       |
| `apps/admin/app/(dashboard)/segments/segment-panel.test.tsx`                      | Cache + error-state tests                                                       |
| `apps/admin/app/(dashboard)/segments/widget-grid.tsx`                             | Size → grid span; renders `ReportSectionCard`                                   |
| `apps/admin/app/(dashboard)/segments/add-widget-dialog.tsx`                       | Picker; segments are its tabs                                                   |
| `apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx`                  | Apply payload + last-widget guard                                               |
| `apps/admin/app/(dashboard)/segments/actions.ts`                                  | `saveSegmentWidgetsAction`, `loadSegmentAction`                                 |
| `apps/admin/app/(dashboard)/overview/overview-view.tsx`                           | Today's `DashboardView` body, behaviour unchanged                               |
| `apps/admin/app/(dashboard)/overview/in-gym-now.tsx`                              | Extracted card                                                                  |
| `apps/admin/app/(dashboard)/overview/kpi-cards.tsx`                               | Extracted `KpiCard`, `StatKpiCard`, `DeltaChip`                                 |
| `apps/admin/app/(dashboard)/overview/revenue-card.tsx`                            | Extracted card                                                                  |
| `apps/admin/app/(dashboard)/overview/plan-mix-card.tsx`                           | Extracted card                                                                  |
| `apps/admin/app/(dashboard)/overview/schedule-card.tsx`                           | Extracted card                                                                  |
| `apps/admin/app/(dashboard)/overview/alerts-card.tsx`                             | Extracted card                                                                  |
| `apps/admin/app/(dashboard)/overview/recent-cards.tsx`                            | Extracted `RecentCheckInsCard`, `RecentMembersCard`                             |
| `apps/admin/app/(dashboard)/overview/format.ts`                                   | Shared `formatTime`, `formatDate`, `initials`, `timeAgo`, `memberStatusVariant` |
| `packages/db/prisma/migrations/<ts>_dashboard_widgets_replace_pins/migration.sql` | Create table, backfill, drop pins                                               |

**Modified**

| File                                                             | Change                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/types/index.ts`                                        | Export `./src/dashboard-segments`; drop `./src/dashboard-pins`    |
| `packages/db/prisma/schema.prisma`                               | Add `DashboardWidget`; remove `DashboardPin` + its back-relations |
| `apps/api/src/reports/report-drilldown.service.ts`               | Make currency resolution public as `currency()`                   |
| `apps/api/src/dashboard/dashboard.module.ts`                     | Register segments controller/service; drop pins                   |
| `apps/admin/lib/api.ts`                                          | Add segment fetch/save; remove the four pin helpers               |
| `apps/admin/app/(dashboard)/page.tsx`                            | Parse `?segment=`; render tabs + panel                            |
| `apps/admin/app/(dashboard)/dashboard-view.tsx`                  | Reduced to re-export; body moves to `overview/`                   |
| `apps/admin/app/(dashboard)/reports/actions.ts`                  | Delete pin actions                                                |
| `apps/admin/app/(dashboard)/reports/[metric]/page.tsx`           | Stop fetching pins                                                |
| `apps/admin/app/(dashboard)/reports/[metric]/drilldown-view.tsx` | Remove pin toggles                                                |
| `packages/i18n/locales/en.json`, `ka.json`                       | Segment + widget copy; drop `admin.dashboard.pinned`              |

**Deleted**

`packages/types/src/dashboard-pins.ts`, `apps/api/src/dashboard/dashboard-pins.controller.ts`, `apps/api/src/dashboard/dashboard-pins.service.ts`, `apps/api/src/dashboard/dashboard-pins.service.spec.ts`.

---

### Task 1: Segment and widget catalogue

**Files:**

- Create: `packages/types/src/dashboard-segments.ts`
- Test: `packages/types/src/dashboard-segments.spec.ts`
- Modify: `packages/types/index.ts`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `REPORT_METRIC_DEFINITIONS`, `reportSectionSchema`, `ReportMetric` from `./reports-drilldown`; `dashboardRangeSchema`, `DashboardRange` from `./dashboard`.
- Produces: `DASHBOARD_SEGMENTS`, `CONFIGURABLE_DASHBOARD_SEGMENTS`, `dashboardSegmentSchema`, `configurableDashboardSegmentSchema`, `DashboardSegment`, `ConfigurableDashboardSegment`, `dashboardWidgetSizeSchema`, `DashboardWidgetSize`, `DashboardWidgetDefinition`, `DASHBOARD_WIDGET_CATALOG`, `widgetsForSegment(segment)`, `findDashboardWidget(key)`, `resolvedDashboardWidgetSchema`, `ResolvedDashboardWidget`, `dashboardSegmentResponseSchema`, `DashboardSegmentResponse`, `setDashboardWidgetsSchema`, `SetDashboardWidgetsInput`.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/dashboard-segments.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REPORT_METRIC_DEFINITIONS } from './reports-drilldown';
import {
  CONFIGURABLE_DASHBOARD_SEGMENTS,
  DASHBOARD_SEGMENTS,
  DASHBOARD_WIDGET_CATALOG,
  findDashboardWidget,
  setDashboardWidgetsSchema,
  widgetsForSegment,
} from './dashboard-segments';

describe('dashboard segment catalogue', () => {
  it('leads with the non-configurable overview segment', () => {
    expect(DASHBOARD_SEGMENTS[0]).toBe('overview');
    expect(CONFIGURABLE_DASHBOARD_SEGMENTS).not.toContain('overview');
  });

  it('gives every widget a unique key', () => {
    const keys = DASHBOARD_WIDGET_CATALOG.map((widget) => widget.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('prefixes every widget key with its own segment', () => {
    for (const widget of DASHBOARD_WIDGET_CATALOG) {
      expect(widget.key.startsWith(`${widget.segment}.`)).toBe(true);
    }
  });

  // The invariant that matters: a section renamed in the reports layer must break
  // the build here rather than silently blank a widget on the dashboard.
  it('points every widget at a section its metric actually emits', () => {
    for (const widget of DASHBOARD_WIDGET_CATALOG) {
      const definition = REPORT_METRIC_DEFINITIONS[widget.source.metric];
      expect(definition, `unknown metric for ${widget.key}`).toBeDefined();
      expect(definition.sections, `unknown section for ${widget.key}`).toContain(
        widget.source.section,
      );
    }
  });

  it('gives every configurable segment at least one widget', () => {
    for (const segment of CONFIGURABLE_DASHBOARD_SEGMENTS) {
      expect(widgetsForSegment(segment).length).toBeGreaterThan(0);
    }
  });

  it('returns a segment its widgets in catalogue order', () => {
    expect(widgetsForSegment('sales').map((widget) => widget.key)).toEqual([
      'sales.payment-method',
      'sales.top-products',
      'sales.top-plans',
    ]);
  });

  it('finds a widget by key and misses on an unknown one', () => {
    expect(findDashboardWidget('revenue.over-time')?.segment).toBe('revenue');
    expect(findDashboardWidget('revenue.nope')).toBeUndefined();
  });

  // "No stored rows" is read as "use the catalogue default", so an empty
  // selection cannot also mean "the owner removed everything".
  it('refuses an empty widget selection', () => {
    expect(setDashboardWidgetsSchema.safeParse({ widgetKeys: [] }).success).toBe(false);
    expect(setDashboardWidgetsSchema.safeParse({ widgetKeys: ['revenue.over-time'] }).success).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/types test -- dashboard-segments`
Expected: FAIL — `Failed to resolve import "./dashboard-segments"`.

- [ ] **Step 3: Write the catalogue**

Create `packages/types/src/dashboard-segments.ts`:

```ts
// @fit/types — segmented admin dashboard contracts (Zod schemas + catalogue).
//
// The dashboard is organised into business SEGMENTS, each showing a set of
// WIDGETS. A widget is deliberately not a new kind of thing: it is a named
// reference to a section of an existing drill-down report
// ({@link REPORT_METRIC_DEFINITIONS}), so the aggregation that fills it and the
// renderer that draws it both already exist. Adding a widget later means adding
// a section to a drill-down report and one entry here; adding a segment means
// one entry in {@link CONFIGURABLE_DASHBOARD_SEGMENTS}. Neither restructures the
// dashboard, which is the whole point of the indirection.
//
// `overview` is the exception: it is the hand-built control-room landing (live
// occupancy, KPI tiles, alerts, recent activity) and carries no catalogue.

import { z } from 'zod';
import { dashboardRangeSchema } from './dashboard';
import {
  REPORT_METRIC_DEFINITIONS,
  reportSectionSchema,
  type ReportMetric,
} from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Segments                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The segments whose widget set a gym can choose. Extend this list to add a
 * segment (e.g. `leads` once CRM ships) — no migration, because the stored rows
 * carry the segment as a plain string.
 */
export const CONFIGURABLE_DASHBOARD_SEGMENTS = [
  'sales',
  'members',
  'revenue',
  'classes',
  'staff',
] as const;

export const configurableDashboardSegmentSchema = z.enum(CONFIGURABLE_DASHBOARD_SEGMENTS);
export type ConfigurableDashboardSegment = z.infer<typeof configurableDashboardSegmentSchema>;

/** Every dashboard tab, in display order — `overview` first, then the configurable ones. */
export const DASHBOARD_SEGMENTS = ['overview', ...CONFIGURABLE_DASHBOARD_SEGMENTS] as const;

export const dashboardSegmentSchema = z.enum(DASHBOARD_SEGMENTS);
export type DashboardSegment = z.infer<typeof dashboardSegmentSchema>;

/** The tab shown when `?segment=` is absent or unrecognised. */
export const DEFAULT_DASHBOARD_SEGMENT: DashboardSegment = 'overview';

/* -------------------------------------------------------------------------- */
/*  Widget catalogue                                                            */
/* -------------------------------------------------------------------------- */

/** How wide a widget renders: `sm` one column, `md` two, `lg` the full row. */
export const dashboardWidgetSizeSchema = z.enum(['sm', 'md', 'lg']);
export type DashboardWidgetSize = z.infer<typeof dashboardWidgetSizeSchema>;

/** One catalogue entry — the static definition of a widget the picker can offer. */
export interface DashboardWidgetDefinition {
  /** Stable slug, `<segment>.<name>`. Persisted in `DashboardWidget.widgetKey`; never renamed in place. */
  key: string;
  segment: ConfigurableDashboardSegment;
  /** The drill-down section this widget renders. */
  source: { metric: ReportMetric; section: string };
  size: DashboardWidgetSize;
  /** Flat i18n key under `admin.dashboard.widgets`. */
  labelKey: string;
}

/**
 * The widget catalogue. Every entry names a section that exists today and
 * returns real rows; widgets needing new aggregations arrive in the per-segment
 * follow-up specs, each as one new section plus one entry here.
 */
export const DASHBOARD_WIDGET_CATALOG: readonly DashboardWidgetDefinition[] = [
  // Sales
  {
    key: 'sales.payment-method',
    segment: 'sales',
    source: { metric: 'pos', section: 'sales-by-method' },
    size: 'md',
    labelKey: 'salesPaymentMethod',
  },
  {
    key: 'sales.top-products',
    segment: 'sales',
    source: { metric: 'pos', section: 'product-sales' },
    size: 'md',
    labelKey: 'salesTopProducts',
  },
  {
    key: 'sales.top-plans',
    segment: 'sales',
    source: { metric: 'revenue', section: 'revenue-by-plan' },
    size: 'md',
    labelKey: 'salesTopPlans',
  },
  // Members
  {
    key: 'members.new-signups',
    segment: 'members',
    source: { metric: 'members', section: 'new-members-over-time' },
    size: 'lg',
    labelKey: 'membersNewSignups',
  },
  {
    key: 'members.churn',
    segment: 'members',
    source: { metric: 'members', section: 'churn-rate-trend' },
    size: 'lg',
    labelKey: 'membersChurn',
  },
  // Revenue
  {
    key: 'revenue.over-time',
    segment: 'revenue',
    source: { metric: 'revenue', section: 'revenue-over-time' },
    size: 'lg',
    labelKey: 'revenueOverTime',
  },
  {
    key: 'revenue.by-location',
    segment: 'revenue',
    source: { metric: 'revenue', section: 'revenue-by-location' },
    size: 'md',
    labelKey: 'revenueByLocation',
  },
  // Classes & training
  {
    key: 'classes.most-booked',
    segment: 'classes',
    source: { metric: 'classes', section: 'most-popular-classes' },
    size: 'md',
    labelKey: 'classesMostBooked',
  },
  {
    key: 'classes.peak-hours',
    segment: 'classes',
    source: { metric: 'attendance', section: 'peak-hours' },
    size: 'lg',
    labelKey: 'classesPeakHours',
  },
  // Trainers & staff
  {
    key: 'staff.sessions-per-trainer',
    segment: 'staff',
    source: { metric: 'staff', section: 'sessions-booked-per-trainer' },
    size: 'md',
    labelKey: 'staffSessionsPerTrainer',
  },
];

/** The catalogue entries for one segment, in catalogue order — also the default selection. */
export function widgetsForSegment(
  segment: ConfigurableDashboardSegment,
): DashboardWidgetDefinition[] {
  return DASHBOARD_WIDGET_CATALOG.filter((widget) => widget.segment === segment);
}

/** Look a widget up by its stored key. `undefined` for a key the catalogue no longer defines. */
export function findDashboardWidget(key: string): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGET_CATALOG.find((widget) => widget.key === key);
}

/* -------------------------------------------------------------------------- */
/*  Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

/** One widget resolved to its live section data. */
export const resolvedDashboardWidgetSchema = z.object({
  key: z.string(),
  size: dashboardWidgetSizeSchema,
  section: reportSectionSchema,
});
export type ResolvedDashboardWidget = z.infer<typeof resolvedDashboardWidgetSchema>;

/**
 * `GET /admin/dashboard/segments/:segment?range=` response. A widget whose
 * section no longer resolves is omitted rather than returned broken, so the list
 * can be shorter than the gym's stored selection.
 */
export const dashboardSegmentResponseSchema = z.object({
  segment: configurableDashboardSegmentSchema,
  range: dashboardRangeSchema,
  /** ISO-4217 currency the money figures are denominated in. */
  currency: z.string(),
  widgets: z.array(resolvedDashboardWidgetSchema),
});
export type DashboardSegmentResponse = z.infer<typeof dashboardSegmentResponseSchema>;

/**
 * `PUT /admin/dashboard/segments/:segment/widgets` body — the full desired set in
 * display order. Whole-slice replacement makes the picker's apply idempotent and
 * removes any reorder race. At least one key: an empty stored selection is
 * indistinguishable from "never configured", which reads as the catalogue default.
 */
export const setDashboardWidgetsSchema = z.object({
  widgetKeys: z.array(z.string().min(1)).min(1),
});
export type SetDashboardWidgetsInput = z.infer<typeof setDashboardWidgetsSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/types test -- dashboard-segments`
Expected: PASS, 8 tests.

- [ ] **Step 5: Export from the package index**

In `packages/types/index.ts`, replace the `dashboard-pins` export (line 17) with:

```ts
export * from './src/dashboard-segments';
```

Delete `packages/types/src/dashboard-pins.ts`. Type-checking the API will now fail — Task 5 removes those consumers.

- [ ] **Step 6: Add the i18n copy**

In `packages/i18n/locales/en.json`, under `admin.dashboard`, **remove** the `pinned` block and add:

```json
"segments": {
  "aria": "Dashboard segments",
  "overview": "Overview",
  "sales": "Sales",
  "members": "Members",
  "revenue": "Revenue",
  "classes": "Classes",
  "staff": "Staff",
  "retry": "Retry",
  "loadError": "Couldn't load this segment.",
  "empty": "No widgets in this segment yet."
},
"widgets": {
  "salesPaymentMethod": "Sales by payment method",
  "salesTopProducts": "Top-selling products",
  "salesTopPlans": "Top-selling plans",
  "membersNewSignups": "New member signups",
  "membersChurn": "Member churn",
  "revenueOverTime": "Revenue over time",
  "revenueByLocation": "Revenue by location",
  "classesMostBooked": "Most booked classes",
  "classesPeakHours": "Peak hours",
  "staffSessionsPerTrainer": "Sessions per trainer"
},
"picker": {
  "open": "Add widget",
  "title": "Add widget",
  "shared": "This layout is shared with everyone at your gym.",
  "lastWidget": "Each segment keeps at least one widget.",
  "apply": "Save",
  "cancel": "Cancel",
  "saveError": "Couldn't save your widgets."
}
```

In `packages/i18n/locales/ka.json`, same structure with:

```json
"segments": {
  "aria": "დაფის სეგმენტები",
  "overview": "მიმოხილვა",
  "sales": "გაყიდვები",
  "members": "წევრები",
  "revenue": "შემოსავალი",
  "classes": "ჯგუფურები",
  "staff": "პერსონალი",
  "retry": "ხელახლა",
  "loadError": "სეგმენტი ვერ ჩაიტვირთა.",
  "empty": "ამ სეგმენტში ჯერ ვიჯეტები არაა."
},
"widgets": {
  "salesPaymentMethod": "გაყიდვები გადახდის მეთოდით",
  "salesTopProducts": "ყველაზე გაყიდვადი პროდუქტები",
  "salesTopPlans": "ყველაზე გაყიდვადი პაკეტები",
  "membersNewSignups": "ახალი წევრები",
  "membersChurn": "წევრების გადინება",
  "revenueOverTime": "შემოსავალი დროში",
  "revenueByLocation": "შემოსავალი ფილიალებით",
  "classesMostBooked": "ყველაზე დაჯავშნადი ჯგუფურები",
  "classesPeakHours": "პიკის საათები",
  "staffSessionsPerTrainer": "სესიები ტრენერზე"
},
"picker": {
  "open": "ვიჯეტის დამატება",
  "title": "ვიჯეტის დამატება",
  "shared": "ეს განლაგება დარბაზის ყველა თანამშრომელს ერთნაირად უჩანს.",
  "lastWidget": "თითო სეგმენტს მინიმუმ ერთი ვიჯეტი უნდა დარჩეს.",
  "apply": "შენახვა",
  "cancel": "გაუქმება",
  "saveError": "ვიჯეტები ვერ შეინახა."
}
```

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/types/src/dashboard-segments.ts packages/types/src/dashboard-segments.spec.ts packages/types/index.ts packages/i18n/locales/en.json packages/i18n/locales/ka.json
git add packages/types packages/i18n
git commit -m "feat(dashboard): name the segments and the widgets they hold"
```

---

### Task 2: Gym-scoped widget rows replace per-user pins

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (add `DashboardWidget`; delete `DashboardPin` at 2646-2663; delete the `dashboardPins` back-relations at lines 443 and 493)
- Create: `packages/db/prisma/migrations/<timestamp>_dashboard_widgets_replace_pins/migration.sql`

**Interfaces:**

- Produces: Prisma model `DashboardWidget` — client accessor `prisma.dashboardWidget`, fields `id`, `gymId`, `segment`, `widgetKey`, `position`, `createdAt`.

- [ ] **Step 1: Add the model to the schema**

In `packages/db/prisma/schema.prisma`, replace the whole `model DashboardPin { … }` block (lines 2646-2663) with:

```prisma
/// One widget a gym has chosen to show in one dashboard segment. Gym-scoped and
/// SHARED: unlike the per-user `DashboardPin` it replaces, every staff member at
/// the gym sees the same dashboard, so a manager arranging it arranges it for the
/// team.
///
/// `segment` and `widgetKey` are plain strings, not Prisma enums: the catalogue in
/// `@fit/types` (`DASHBOARD_WIDGET_CATALOG`) is the source of truth, and a row
/// naming a key the catalogue no longer defines is dropped at read time rather
/// than migrated. That keeps adding a segment or a widget a code-only change.
///
/// No rows for a `(gym, segment)` means "never configured", which reads as the
/// catalogue default — so the API refuses to store an empty selection, otherwise
/// "the owner removed everything" would be indistinguishable from it.
model DashboardWidget {
  id        String   @id @default(cuid())
  gymId     String
  /// The dashboard segment this widget sits in; validated against
  /// `configurableDashboardSegmentSchema` in `@fit/types`.
  segment   String
  /// Catalogue key, `<segment>.<name>` (e.g. `revenue.over-time`).
  widgetKey String
  /// Display order within the segment, 0-based and dense.
  position  Int
  createdAt DateTime @default(now())

  gym Gym @relation(fields: [gymId], references: [id], onDelete: Cascade)

  @@unique([gymId, segment, widgetKey])
  @@index([gymId, segment, position])
  @@map("dashboard_widgets")
}
```

At schema lines 443 and 493, replace each `dashboardPins           DashboardPin[]` with:

```prisma
  dashboardWidgets        DashboardWidget[]
```

Line 493 is on the `User` model — a user no longer owns widgets, so **delete that line entirely** rather than renaming it. Line 443 is on `Gym` — rename it as above.

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @fit/db exec prisma migrate dev --name dashboard_widgets_replace_pins --create-only`
Expected: a new folder under `packages/db/prisma/migrations/` containing a `migration.sql` that creates `dashboard_widgets` and drops `dashboard_pins`.

- [ ] **Step 3: Add the backfill between create and drop**

Open the generated `migration.sql`. It will create the new table and then `DROP TABLE "dashboard_pins"`. Insert this **between** those two statements, so pins are carried across before their table goes:

```sql
-- Carry each gym's existing pins across to the shared layout. A pin is per-user;
-- the same section pinned by three colleagues becomes ONE gym-level widget, dated
-- from the earliest pin. Pins whose (metric, section) has no catalogue entry are
-- dropped -- they have nowhere to live in the new model.
INSERT INTO "dashboard_widgets" ("id", "gymId", "segment", "widgetKey", "position", "createdAt")
SELECT
  gen_random_uuid()::text,
  agg."gymId",
  agg."segment",
  agg."widgetKey",
  (ROW_NUMBER() OVER (PARTITION BY agg."gymId", agg."segment" ORDER BY agg."pinnedAt"))::int - 1,
  agg."pinnedAt"
FROM (
  SELECT
    p."gymId"      AS "gymId",
    m.segment      AS "segment",
    m.widget_key   AS "widgetKey",
    MIN(p."createdAt") AS "pinnedAt"
  FROM "dashboard_pins" p
  JOIN (VALUES
    ('pos',        'sales-by-method',            'sales',   'sales.payment-method'),
    ('pos',        'product-sales',              'sales',   'sales.top-products'),
    ('revenue',    'revenue-by-plan',            'sales',   'sales.top-plans'),
    ('members',    'new-members-over-time',      'members', 'members.new-signups'),
    ('members',    'churn-rate-trend',           'members', 'members.churn'),
    ('revenue',    'revenue-over-time',          'revenue', 'revenue.over-time'),
    ('revenue',    'revenue-by-location',        'revenue', 'revenue.by-location'),
    ('classes',    'most-popular-classes',       'classes', 'classes.most-booked'),
    ('attendance', 'peak-hours',                 'classes', 'classes.peak-hours'),
    ('staff',      'sessions-booked-per-trainer', 'staff',  'staff.sessions-per-trainer')
  ) AS m(metric, section, segment, widget_key)
    ON m.metric = p."metric" AND m.section = p."section"
  GROUP BY p."gymId", m.segment, m.widget_key
) AS agg;
```

- [ ] **Step 4: Apply the migration and verify the backfill**

Run: `pnpm --filter @fit/db exec prisma migrate dev`
Then confirm the table exists, is empty-or-backfilled, and the old one is gone:

```bash
pnpm --filter @fit/db exec prisma db execute --stdin <<'SQL'
SELECT "segment", "widgetKey", "position" FROM "dashboard_widgets" ORDER BY "segment", "position";
SQL
```

Expected: the command succeeds (rows only if the dev database had pins). Then:

```bash
pnpm --filter @fit/db exec prisma db execute --stdin <<'SQL'
SELECT to_regclass('public.dashboard_pins') IS NULL AS pins_dropped;
SQL
```

Expected: `pins_dropped = true`.

- [ ] **Step 5: Regenerate the Prisma client**

Run: `pnpm --filter @fit/db exec prisma generate`
Expected: succeeds; `prisma.dashboardWidget` is now typed and `prisma.dashboardPin` is gone.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/db/prisma/schema.prisma
git add packages/db
git commit -m "feat(dashboard): give the whole gym one shared widget layout"
```

---

### Task 3: Resolving a segment's widgets

**Files:**

- Create: `apps/api/src/dashboard/dashboard-segments.service.ts`
- Test: `apps/api/src/dashboard/dashboard-segments.service.spec.ts`
- Modify: `apps/api/src/reports/report-drilldown.service.ts` (expose currency)

**Interfaces:**

- Consumes: `TenantPrismaService`, `TenantContext`, `ReportDrilldownService` (`run(metric, { range })`), and from Task 1 `widgetsForSegment`, `findDashboardWidget`, `ConfigurableDashboardSegment`, `DashboardSegmentResponse`, `ResolvedDashboardWidget`.
- Produces: `DashboardSegmentsService` with `get(segment: ConfigurableDashboardSegment, range: DashboardRange): Promise<DashboardSegmentResponse>`; `ReportDrilldownService.currency(): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/dashboard-segments.service.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportDrilldown, ReportMetric } from '@fit/types';
import { DashboardSegmentsService } from './dashboard-segments.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { ReportDrilldownService } from '../reports/report-drilldown.service';

function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({ dashboardWidget: { deleteMany, createMany } }),
  );

  const client = { dashboardWidget: { findMany, deleteMany, createMany }, $transaction };
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'user-1' } as unknown as TenantContext;
  const run = vi.fn(async (metric: ReportMetric) => drilldownFor(metric));
  const currency = vi.fn().mockResolvedValue('GEL');
  const drilldown = { run, currency } as unknown as ReportDrilldownService;

  return {
    service: new DashboardSegmentsService(prisma, tenant, drilldown),
    findMany,
    deleteMany,
    createMany,
    run,
  };
}

/** Every section id the Spec-1 catalogue references, per metric. */
const SECTIONS: Partial<Record<ReportMetric, string[]>> = {
  pos: ['sales-by-method', 'product-sales'],
  revenue: ['revenue-by-plan', 'revenue-over-time', 'revenue-by-location'],
  members: ['new-members-over-time', 'churn-rate-trend'],
  classes: ['most-popular-classes'],
  attendance: ['peak-hours'],
  staff: ['sessions-booked-per-trainer'],
};

function drilldownFor(metric: ReportMetric): ReportDrilldown {
  return {
    metric,
    name: metric,
    description: '',
    range: '7d',
    currency: 'GEL',
    kpis: [],
    sections: (SECTIONS[metric] ?? []).map((id) => ({
      kind: 'series' as const,
      id,
      title: id,
      unit: 'count' as const,
      points: [],
    })),
  };
}

describe('DashboardSegmentsService.get', () => {
  afterEach(() => vi.clearAllMocks());

  it('falls back to the catalogue default when the gym has stored nothing', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'sales.payment-method',
      'sales.top-products',
      'sales.top-plans',
    ]);
  });

  it('honours the gym stored selection and its order', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'sales.top-plans' },
      { widgetKey: 'sales.payment-method' },
    ]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'sales.top-plans',
      'sales.payment-method',
    ]);
  });

  // The reason this is worth a test: three widgets spanning two reports must not
  // recompute a report per widget.
  it('computes each distinct metric exactly once', async () => {
    const { service, run } = setup();

    await service.get('sales', '7d');

    // sales.payment-method + sales.top-products are `pos`; sales.top-plans is `revenue`.
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((call) => call[0]).sort()).toEqual(['pos', 'revenue']);
  });

  it('passes the requested range through to the drill-down', async () => {
    const { service, run } = setup();
    await service.get('revenue', '12w');
    expect(run).toHaveBeenCalledWith('revenue', { range: '12w' });
  });

  it('omits a widget whose section the report no longer emits', async () => {
    const { service, run } = setup();
    run.mockImplementation(async (metric: ReportMetric) => ({
      ...drilldownFor(metric),
      sections: [],
    }));

    const result = await service.get('sales', '7d');

    expect(result.widgets).toEqual([]);
  });

  it('drops a stored key the catalogue no longer defines', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'sales.retired-widget' },
      { widgetKey: 'sales.top-plans' },
    ]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['sales.top-plans']);
  });

  it('drops a stored key belonging to another segment', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'revenue.over-time' },
      { widgetKey: 'sales.top-plans' },
    ]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['sales.top-plans']);
  });

  it('scopes the read to the caller gym and the asked-for segment', async () => {
    const { service, findMany } = setup();
    await service.get('members', '30d');
    expect(findMany).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', segment: 'members' },
      orderBy: { position: 'asc' },
      select: { widgetKey: true },
    });
  });

  it('echoes the segment, the range and the currency', async () => {
    const { service } = setup();
    const result = await service.get('members', '30d');
    expect(result.segment).toBe('members');
    expect(result.range).toBe('30d');
    expect(result.currency).toBe('GEL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/api test -- dashboard-segments.service`
Expected: FAIL — cannot resolve `./dashboard-segments.service`.

- [ ] **Step 3: Expose currency from the drill-down service**

In `apps/api/src/reports/report-drilldown.service.ts`, rename the private `resolveCurrency` (line 1156) to a public method and update its two-or-more internal call sites (find them with `grep -n resolveCurrency`):

```ts
  /**
   * The gym's ISO-4217 currency. Public because a dashboard segment holding no
   * resolvable widget still has to report the currency its (absent) money figures
   * would be in, without computing a whole report to learn it.
   */
  async currency(): Promise<string> {
```

Replace every `this.resolveCurrency()` with `this.currency()`.

- [ ] **Step 4: Write the service**

Create `apps/api/src/dashboard/dashboard-segments.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  findDashboardWidget,
  widgetsForSegment,
  type ConfigurableDashboardSegment,
  type DashboardRange,
  type DashboardSegmentResponse,
  type DashboardWidgetDefinition,
  type ReportDrilldown,
  type ReportMetric,
  type ResolvedDashboardWidget,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { ReportDrilldownService } from '../reports/report-drilldown.service';

/**
 * The segmented dashboard's widget layer.
 *
 * A segment's widgets are the gym's stored selection, or — when it has stored
 * none — the catalogue default, so a fresh gym gets a useful dashboard without a
 * seeding step. Each selected widget names a section of a drill-down report;
 * this service computes each DISTINCT referenced report once and picks the
 * sections out of the results, so a segment spanning two reports costs two
 * computations rather than one per widget.
 *
 * {@link DashboardWidget} is deliberately *not* in the tenant Prisma extension's
 * scoped-model set, so every query here pins `gymId` from {@link TenantContext}
 * by hand.
 */
@Injectable()
export class DashboardSegmentsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly drilldown: ReportDrilldownService,
  ) {}

  /** One segment's widgets, resolved to their live sections over `range`. */
  async get(
    segment: ConfigurableDashboardSegment,
    range: DashboardRange,
  ): Promise<DashboardSegmentResponse> {
    const definitions = await this.selection(segment);
    if (definitions.length === 0) {
      return { segment, range, currency: await this.drilldown.currency(), widgets: [] };
    }

    // Compute each referenced report once, then pick sections out of the results.
    const metrics = [...new Set(definitions.map((definition) => definition.source.metric))];
    const reports = new Map<ReportMetric, ReportDrilldown>();
    await Promise.all(
      metrics.map(async (metric) => {
        reports.set(metric, await this.drilldown.run(metric, { range }));
      }),
    );

    const widgets: ResolvedDashboardWidget[] = [];
    for (const definition of definitions) {
      const report = reports.get(definition.source.metric);
      if (!report) {
        continue;
      }
      const section = report.sections.find(
        (candidate) => candidate.id === definition.source.section,
      );
      // A section the report no longer emits is dropped, not rendered broken.
      if (!section) {
        continue;
      }
      widgets.push({ key: definition.key, size: definition.size, section });
    }

    const currency = reports.values().next().value?.currency ?? (await this.drilldown.currency());
    return { segment, range, currency, widgets };
  }

  /**
   * The gym's chosen widgets for a segment, in stored order. No rows means "never
   * configured", which resolves to the catalogue default. Stored keys the
   * catalogue no longer defines — or that belong to another segment — are dropped.
   */
  private async selection(
    segment: ConfigurableDashboardSegment,
  ): Promise<DashboardWidgetDefinition[]> {
    const rows = await this.prisma.client.dashboardWidget.findMany({
      where: { gymId: this.tenant.gymId, segment },
      orderBy: { position: 'asc' },
      select: { widgetKey: true },
    });
    if (rows.length === 0) {
      return widgetsForSegment(segment);
    }
    return rows
      .map((row) => findDashboardWidget(row.widgetKey))
      .filter(
        (definition): definition is DashboardWidgetDefinition =>
          definition !== undefined && definition.segment === segment,
      );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @fit/api test -- dashboard-segments.service`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/dashboard/dashboard-segments.service.ts apps/api/src/dashboard/dashboard-segments.service.spec.ts apps/api/src/reports/report-drilldown.service.ts
git add apps/api/src/dashboard apps/api/src/reports
git commit -m "feat(dashboard): resolve a segment's widgets in one pass per report"
```

---

### Task 4: Persisting a segment's widget selection

**Files:**

- Modify: `apps/api/src/dashboard/dashboard-segments.service.ts`
- Test: `apps/api/src/dashboard/dashboard-segments.service.spec.ts`

**Interfaces:**

- Produces: `DashboardSegmentsService.setWidgets(segment: ConfigurableDashboardSegment, widgetKeys: string[]): Promise<void>` — throws `BadRequestException` on an unknown key, a cross-segment key, or a duplicate.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/dashboard/dashboard-segments.service.spec.ts` (the `setup()` helper already stubs `$transaction`, `deleteMany` and `createMany`):

```ts
describe('DashboardSegmentsService.setWidgets', () => {
  afterEach(() => vi.clearAllMocks());

  it('replaces the segment slice in one transaction, numbering positions densely', async () => {
    const { service, deleteMany, createMany } = setup();

    await service.setWidgets('sales', ['sales.top-plans', 'sales.payment-method']);

    expect(deleteMany).toHaveBeenCalledWith({ where: { gymId: 'gym-1', segment: 'sales' } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { gymId: 'gym-1', segment: 'sales', widgetKey: 'sales.top-plans', position: 0 },
        { gymId: 'gym-1', segment: 'sales', widgetKey: 'sales.payment-method', position: 1 },
      ],
    });
  });

  it('refuses a key the catalogue does not define', async () => {
    const { service, deleteMany } = setup();
    await expect(service.setWidgets('sales', ['sales.nope'])).rejects.toThrow(/sales\.nope/);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a key belonging to another segment', async () => {
    const { service, deleteMany } = setup();
    await expect(service.setWidgets('sales', ['revenue.over-time'])).rejects.toThrow(
      /revenue\.over-time/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  // A duplicate would trip the (gym, segment, widgetKey) unique index mid-write;
  // rejecting up front turns a 500 into a 400.
  it('refuses a duplicated key', async () => {
    const { service, deleteMany } = setup();
    await expect(
      service.setWidgets('sales', ['sales.top-plans', 'sales.top-plans']),
    ).rejects.toThrow(/sales\.top-plans/);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('validates every key before writing anything', async () => {
    const { service, deleteMany, createMany } = setup();
    await expect(service.setWidgets('sales', ['sales.top-plans', 'sales.nope'])).rejects.toThrow();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/api test -- dashboard-segments.service`
Expected: FAIL — `service.setWidgets is not a function`.

- [ ] **Step 3: Implement `setWidgets`**

Add `BadRequestException` to the `@nestjs/common` import, then add this method to `DashboardSegmentsService`:

```ts
  /**
   * Replace a segment's widget selection wholesale, in display order. Whole-slice
   * replacement (rather than add/remove deltas) makes the picker's apply
   * idempotent and removes any reorder race.
   *
   * Every key is validated against the catalogue BEFORE anything is written, so a
   * bad payload can never leave a half-applied layout. Duplicates are rejected
   * here rather than left to trip the unique index as a 500.
   */
  async setWidgets(
    segment: ConfigurableDashboardSegment,
    widgetKeys: string[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (const key of widgetKeys) {
      const definition = findDashboardWidget(key);
      if (!definition || definition.segment !== segment) {
        throw new BadRequestException(`Not a ${segment} widget: ${key}`);
      }
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicated widget: ${key}`);
      }
      seen.add(key);
    }

    const gymId = this.tenant.gymId;
    await this.prisma.client.$transaction(async (tx) => {
      await tx.dashboardWidget.deleteMany({ where: { gymId, segment } });
      await tx.dashboardWidget.createMany({
        data: widgetKeys.map((widgetKey, position) => ({
          gymId,
          segment,
          widgetKey,
          position,
        })),
      });
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/api test -- dashboard-segments.service`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/dashboard/dashboard-segments.service.ts apps/api/src/dashboard/dashboard-segments.service.spec.ts
git add apps/api/src/dashboard
git commit -m "feat(dashboard): save a segment's widgets as one whole slice"
```

---

### Task 5: The segments API, and retiring the pins API

**Files:**

- Create: `apps/api/src/dashboard/dashboard-segments.controller.ts`
- Test: `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.module.ts`
- Delete: `apps/api/src/dashboard/dashboard-pins.controller.ts`, `dashboard-pins.service.ts`, `dashboard-pins.service.spec.ts`

**Interfaces:**

- Consumes: `DashboardSegmentsService` from Tasks 3-4; `configurableDashboardSegmentSchema`, `setDashboardWidgetsSchema`, `dashboardRangeSchema`, `DEFAULT_DASHBOARD_RANGE` from `@fit/types`.
- Produces: `GET /admin/dashboard/segments/:segment?range=` → `DashboardSegmentResponse`; `PUT /admin/dashboard/segments/:segment/widgets` → `204`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/dashboard-segments.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Permission } from '@fit/types';
import { DashboardSegmentsController } from './dashboard-segments.controller';
import type { DashboardSegmentsService } from './dashboard-segments.service';

function setup() {
  const get = vi.fn().mockResolvedValue({
    segment: 'sales',
    range: '7d',
    currency: 'GEL',
    widgets: [],
  });
  const setWidgets = vi.fn().mockResolvedValue(undefined);
  const service = { get, setWidgets } as unknown as DashboardSegmentsService;
  return { controller: new DashboardSegmentsController(service), get, setWidgets };
}

describe('DashboardSegmentsController', () => {
  it('reads a segment at the requested range', async () => {
    const { controller, get } = setup();
    await controller.get('sales', '12w');
    expect(get).toHaveBeenCalledWith('sales', '12w');
  });

  it('defaults an omitted range rather than erroring', async () => {
    const { controller, get } = setup();
    await controller.get('sales', undefined);
    expect(get).toHaveBeenCalledWith('sales', '7d');
  });

  it('defaults a range outside the dashboard vocabulary', async () => {
    const { controller, get } = setup();
    // `12m` is valid for a drill-down but not for the dashboard's range control.
    await controller.get('sales', '12m');
    expect(get).toHaveBeenCalledWith('sales', '7d');
  });

  // Overview is server-rendered and has no catalogue. Answering with an empty
  // success would hide the caller's bug.
  it('refuses the overview segment', async () => {
    const { controller, get } = setup();
    await expect(controller.get('overview', '7d')).rejects.toThrow(BadRequestException);
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses an unknown segment', async () => {
    const { controller } = setup();
    await expect(controller.get('leads', '7d')).rejects.toThrow(BadRequestException);
  });

  it('saves a widget selection', async () => {
    const { controller, setWidgets } = setup();
    await controller.setWidgets('sales', { widgetKeys: ['sales.top-plans'] });
    expect(setWidgets).toHaveBeenCalledWith('sales', ['sales.top-plans']);
  });

  it('refuses an empty widget selection', async () => {
    const { controller, setWidgets } = setup();
    await expect(controller.setWidgets('sales', { widgetKeys: [] })).rejects.toThrow(
      BadRequestException,
    );
    expect(setWidgets).not.toHaveBeenCalled();
  });

  it('gates both routes on ReportView', () => {
    const read = Reflect.getMetadata('permissions', DashboardSegmentsController.prototype.get);
    const write = Reflect.getMetadata(
      'permissions',
      DashboardSegmentsController.prototype.setWidgets,
    );
    expect(read).toContain(Permission.ReportView);
    expect(write).toContain(Permission.ReportView);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/api test -- dashboard-segments.controller`
Expected: FAIL — cannot resolve `./dashboard-segments.controller`.

Note: if the last test fails on the metadata key, open `apps/api/src/common/decorators/require-permissions.decorator.ts`, read the `SetMetadata` key it uses, and use that string instead of `'permissions'`.

- [ ] **Step 3: Write the controller**

Create `apps/api/src/dashboard/dashboard-segments.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  configurableDashboardSegmentSchema,
  dashboardRangeSchema,
  DEFAULT_DASHBOARD_RANGE,
  Permission,
  setDashboardWidgetsSchema,
  type ConfigurableDashboardSegment,
  type DashboardRange,
  type DashboardSegmentResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { DashboardSegmentsService } from './dashboard-segments.service';

/**
 * The segmented dashboard API (`/admin/dashboard/segments`).
 *
 * Both routes gate on {@link Permission.ReportView} — the capability that already
 * lets a user see these numbers. Editing is deliberately NOT on `GymManage`:
 * that is OWNER-only, and a manager who can read the figures is expected to be
 * able to arrange them. The layout is gym-wide, so an edit is visible to every
 * colleague; the console states that where the edit happens.
 */
@Controller('admin/dashboard/segments')
@UseGuards(TenantGuard, PermissionsGuard)
export class DashboardSegmentsController {
  constructor(private readonly segments: DashboardSegmentsService) {}

  /**
   * `GET /admin/dashboard/segments/:segment?range=` — one segment's widgets,
   * resolved to their live sections.
   */
  @Get(':segment')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  get(
    @Param('segment') segment: string,
    @Query('range') range: string | undefined,
  ): Promise<DashboardSegmentResponse> {
    return this.segments.get(parseSegment(segment), parseRange(range));
  }

  /**
   * `PUT /admin/dashboard/segments/:segment/widgets` — replace the segment's
   * widget selection with the posted set, in display order.
   */
  @Put(':segment/widgets')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.ReportView)
  async setWidgets(@Param('segment') segment: string, @Body() body: unknown): Promise<void> {
    const parsed = parse(setDashboardWidgetsSchema, body);
    await this.segments.setWidgets(parseSegment(segment), parsed.widgetKeys);
  }
}

/**
 * Resolve the `:segment` path param. `overview` is rejected rather than answered
 * with an empty success: it is server-rendered and carries no catalogue, so a
 * client asking for it has a bug worth surfacing.
 */
function parseSegment(raw: string): ConfigurableDashboardSegment {
  const parsed = configurableDashboardSegmentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(`Not a configurable dashboard segment: ${raw}`);
  }
  return parsed.data;
}

/**
 * Resolve `?range=`, falling back to the dashboard default. A hand-edited URL
 * (or a drill-down-only value like `12m`) should land on the default window, not
 * a 400 — the same forgiving rule the overview query already applies.
 */
function parseRange(raw: string | undefined): DashboardRange {
  const parsed = dashboardRangeSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_DASHBOARD_RANGE;
}

/** Validate `data` against `schema`, raising a `400` with per-field detail on failure. */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/api test -- dashboard-segments.controller`
Expected: PASS, 8 tests.

- [ ] **Step 5: Rewire the module and delete the pins API**

Replace `apps/api/src/dashboard/dashboard.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { DashboardController } from './dashboard.controller';
import { DashboardSegmentsController } from './dashboard-segments.controller';
import { DashboardSegmentsService } from './dashboard-segments.service';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard — the staff console's tenant-scoped control room.
 *
 * {@link DashboardController} (`/dashboard`) serves the overview segment's live
 * snapshot; {@link DashboardSegmentsController} (`/admin/dashboard/segments`)
 * serves the configurable segments, resolving each gym's chosen widgets against
 * the drill-down reports in {@link ReportsModule}.
 */
@Module({
  imports: [ReportsModule],
  controllers: [DashboardController, DashboardSegmentsController],
  providers: [DashboardService, DashboardSegmentsService],
})
export class DashboardModule {}
```

Then:

```bash
git rm apps/api/src/dashboard/dashboard-pins.controller.ts \
       apps/api/src/dashboard/dashboard-pins.service.ts \
       apps/api/src/dashboard/dashboard-pins.service.spec.ts
```

- [ ] **Step 6: Run the whole API suite**

Run: `pnpm --filter @fit/api test`
Expected: PASS with no reference to `DashboardPins` remaining. If a spec still imports the deleted service, delete that spec — its subject is gone.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/api/src/dashboard
git add apps/api/src/dashboard
git commit -m "feat(dashboard): serve segments, and retire per-user pinning"
```

---

### Task 6: Admin client — segment calls in, pin calls out

**Files:**

- Modify: `apps/admin/lib/api.ts`
- Modify: `apps/admin/app/(dashboard)/reports/actions.ts`
- Modify: `apps/admin/app/(dashboard)/reports/[metric]/page.tsx`
- Modify: `apps/admin/app/(dashboard)/reports/[metric]/drilldown-view.tsx`

**Interfaces:**

- Produces: `fetchDashboardSegment(segment: ConfigurableDashboardSegment, range?: DashboardRange): Promise<DashboardSegmentResponse>`; `saveDashboardSegmentWidgets(segment: ConfigurableDashboardSegment, widgetKeys: string[]): Promise<void>`.

- [ ] **Step 1: Add the segment helpers**

In `apps/admin/lib/api.ts`, add `ConfigurableDashboardSegment` and `DashboardSegmentResponse` to the type imports, then **replace** the four pin helpers (`fetchDashboardPins`, `fetchDashboardWidgets`, `addDashboardPin`, `removeDashboardPin`, around lines 2028-2070) with:

```ts
/**
 * `GET /admin/dashboard/segments/:segment` — one segment's widgets resolved to
 * their live report sections. `range` shapes every widget in the segment; the
 * API falls back to the dashboard default on an unknown value.
 */
export async function fetchDashboardSegment(
  segment: ConfigurableDashboardSegment,
  range?: DashboardRange,
): Promise<DashboardSegmentResponse> {
  const query = range ? `?range=${encodeURIComponent(range)}` : '';
  const res = await fetch(
    `${apiBaseUrl()}/admin/dashboard/segments/${encodeURIComponent(segment)}${query}`,
    {
      headers: await authHeaders(),
      // Segments reflect live tenant state — never serve a stale snapshot.
      cache: 'no-store',
    },
  );
  return unwrap<DashboardSegmentResponse>(res);
}

/**
 * `PUT /admin/dashboard/segments/:segment/widgets` — replace the segment's widget
 * selection with `widgetKeys`, in display order. Gym-wide: this changes what every
 * colleague sees.
 */
export async function saveDashboardSegmentWidgets(
  segment: ConfigurableDashboardSegment,
  widgetKeys: string[],
): Promise<void> {
  const res = await fetch(
    `${apiBaseUrl()}/admin/dashboard/segments/${encodeURIComponent(segment)}/widgets`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ widgetKeys }),
      cache: 'no-store',
    },
  );
  if (!res.ok && res.status !== 204) {
    await unwrap<void>(res);
  }
}
```

Remove the now-unused `DashboardPinsResponse`, `DashboardWidgetsResponse`, `CreateDashboardPin`, `DashboardPin` type imports.

- [ ] **Step 2: Strip pinning out of Reports**

In `apps/admin/app/(dashboard)/reports/actions.ts`, delete `pinReportAction`, `unpinReportAction`, `refreshPinned`, and the now-unused imports (`addDashboardPin`, `removeDashboardPin`, `createDashboardPinSchema`, `CreateDashboardPin`). Keep `ActionResult`, `Translator`, `requireReportView` and `toMessage` if other exports in the file use them; if the file ends up empty, delete it and remove its imports from `drilldown-view.tsx`.

In `apps/admin/app/(dashboard)/reports/[metric]/page.tsx`: remove `fetchDashboardPins` from the import on line 15 and from the `Promise.all` on line 93, and stop passing the pins prop to `DrilldownView`.

In `apps/admin/app/(dashboard)/reports/[metric]/drilldown-view.tsx`: remove the import on line 22, the pin-toggle handler around lines 165-180, the `pins` prop, and the pin control passed as `ReportSectionCard`'s `action`. Pass no `action` — the prop is optional.

- [ ] **Step 3: Verify nothing still references pinning**

Run:

```bash
grep -rn "DashboardPin\|dashboardPin\|pinReportAction\|unpinReportAction\|fetchDashboardWidgets" apps packages --exclude-dir=node_modules --exclude-dir=.next
```

Expected: no matches.

- [ ] **Step 4: Type-check the console**

Run: `pnpm --filter @fit/admin exec tsc --noEmit`
Expected: the only remaining errors are in `dashboard-view.tsx` (its `PinnedReports` block and `pinnedWidgets` prop) — Task 7 removes them. Fix any others now.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/admin/lib/api.ts "apps/admin/app/(dashboard)/reports"
git add apps/admin
git commit -m "feat(dashboard): call segments from the console, drop the pin calls"
```

---

### Task 7: Break the overview out of the 1348-line view

Pure refactor: identical rendered output, no behaviour change. It exists so the segment work lands in focused files instead of growing a file that is already too big to reason about.

**Files:**

- Create: `apps/admin/app/(dashboard)/overview/overview-view.tsx`, `in-gym-now.tsx`, `kpi-cards.tsx`, `revenue-card.tsx`, `plan-mix-card.tsx`, `schedule-card.tsx`, `alerts-card.tsx`, `recent-cards.tsx`, `format.ts`
- Modify: `apps/admin/app/(dashboard)/dashboard-view.tsx`, `apps/admin/app/(dashboard)/page.tsx`

**Interfaces:**

- Produces: `OverviewView({ data }: { data: DashboardOverviewResponse })` from `overview/overview-view.tsx`.

- [ ] **Step 1: Move the shared helpers**

Create `apps/admin/app/(dashboard)/overview/format.ts` and move `formatTime` (1312), `formatDate` (1317), `memberStatusVariant` (1322), `initials` (1333) and `timeAgo` (1340) from `dashboard-view.tsx` verbatim. Export each. Keep the `T` translator type alias `timeAgo` uses.

- [ ] **Step 2: Move the cards**

Move each block out of `dashboard-view.tsx` verbatim, carrying the `stylex.create` entries each one uses into the new file:

| From `dashboard-view.tsx`                                     | To                                           |
| ------------------------------------------------------------- | -------------------------------------------- |
| `InGymNow` (838)                                              | `overview/in-gym-now.tsx`                    |
| `KpiCard` (911), `StatKpiCard` (949), `DeltaChip` (982)       | `overview/kpi-cards.tsx`                     |
| `RevenueCard` (1000), `rangeCaptionKey` (1062)                | `overview/revenue-card.tsx`                  |
| `PlanMixCard` (1077)                                          | `overview/plan-mix-card.tsx`                 |
| `ScheduleCard` (1128)                                         | `overview/schedule-card.tsx`                 |
| `ALERT_ICON` (1180), `ALERT_TONE` (1186), `AlertsCard` (1192) | `overview/alerts-card.tsx`                   |
| `RecentCheckInsCard` (1228), `RecentMembersCard` (1267)       | `overview/recent-cards.tsx`                  |
| `EmptyState` (1308)                                           | `overview/format.ts` (used by several cards) |

Each new file starts with `'use client';` and exports its components. Constants `RANGE_VALUES` (50), `PERIOD_VALUES` (53), `WEEKDAY_KEYS` (61) and the `pulse` keyframes (63) go with the file that uses them — `RANGE_VALUES` to `revenue-card.tsx`, `WEEKDAY_KEYS` to `schedule-card.tsx`, `pulse` to `in-gym-now.tsx`, `PERIOD_VALUES` stays with the header in `overview-view.tsx`.

- [ ] **Step 3: Move the body**

Create `apps/admin/app/(dashboard)/overview/overview-view.tsx` holding what is left of `DashboardView` (593-777) renamed to `OverviewView`, importing the cards from their new homes.

Two changes while moving:

- Drop the `pinnedWidgets` prop, the `PinnedReports` component (778-837), the `unpinReportAction` import (44) and the render on line 745. Pinning is gone.
- Keep the period header, `useLiveRefresh`, and the `selectRange` / `selectPeriod` / `selectCustomRange` handlers exactly as they are.

- [ ] **Step 4: Reduce the old file to a re-export**

Replace the entire contents of `apps/admin/app/(dashboard)/dashboard-view.tsx` with:

```tsx
// Kept as the stable import path while the dashboard is reorganised into
// segments; the control-room overview itself now lives in `./overview`.
export { OverviewView as DashboardView } from './overview/overview-view';
```

- [ ] **Step 5: Update the page**

In `apps/admin/app/(dashboard)/page.tsx`: remove the `fetchDashboardWidgets` import and its `try/catch` block (111-118), the `PinnedWidget` type import (16), and change line 120 to:

```tsx
return <DashboardView data={overview} />;
```

- [ ] **Step 6: Verify nothing changed**

Run: `pnpm --filter @fit/admin exec tsc --noEmit`
Expected: clean.

Run: `pnpm --filter @fit/admin test`
Expected: PASS.

Run: `pnpm exec tsx scripts/check-tailwind-guardrail.ts`
Expected: PASS — the new `overview/` files are under an already-guarded path and must be StyleX-only.

Start the console (`pnpm --filter @fit/admin dev`), open `/`, and confirm the dashboard renders exactly as before minus the "Pinned reports" block.

- [ ] **Step 7: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)"
git add apps/admin
git commit -m "refactor(dashboard): give each control-room card its own file"
```

---

### Task 8: The segment tab bar

**Files:**

- Create: `apps/admin/app/(dashboard)/segments/segment-tabs.tsx`
- Test: `apps/admin/app/(dashboard)/segments/segment-tabs.test.tsx`

**Interfaces:**

- Produces: `SegmentTabs({ active, onSelect }: { active: DashboardSegment; onSelect: (segment: DashboardSegment) => void })`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dashboard)/segments/segment-tabs.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { SegmentTabs } from './segment-tabs';

const messages = {
  admin: {
    dashboard: {
      segments: {
        aria: 'Dashboard segments',
        overview: 'Overview',
        sales: 'Sales',
        members: 'Members',
        revenue: 'Revenue',
        classes: 'Classes',
        staff: 'Staff',
      },
    },
  },
};

function renderTabs(active = 'overview' as const, onSelect = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentTabs active={active} onSelect={onSelect} />
    </NextIntlClientProvider>,
  );
  return onSelect;
}

describe('SegmentTabs', () => {
  it('renders one tab per segment, overview first', () => {
    renderTabs();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Sales',
      'Members',
      'Revenue',
      'Classes',
      'Staff',
    ]);
  });

  it('marks only the active tab selected', () => {
    renderTabs('overview');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Sales' })).toHaveAttribute('aria-selected', 'false');
  });

  it('reports the chosen segment on click', async () => {
    const onSelect = renderTabs('overview');
    await userEvent.click(screen.getByRole('tab', { name: 'Members' }));
    expect(onSelect).toHaveBeenCalledWith('members');
  });

  // Roving tabindex: Tab enters the bar once, arrows move within it.
  it('keeps only the active tab in the tab order', () => {
    renderTabs('sales');
    expect(screen.getByRole('tab', { name: 'Sales' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects the next segment on ArrowRight and wraps at the end', async () => {
    const onSelect = renderTabs('staff');
    screen.getByRole('tab', { name: 'Staff' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenCalledWith('overview');
  });

  it('jumps to the first and last segment on Home and End', async () => {
    const onSelect = renderTabs('members');
    screen.getByRole('tab', { name: 'Members' }).focus();
    await userEvent.keyboard('{End}');
    expect(onSelect).toHaveBeenCalledWith('staff');
    await userEvent.keyboard('{Home}');
    expect(onSelect).toHaveBeenCalledWith('overview');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- segment-tabs`
Expected: FAIL — cannot resolve `./segment-tabs`.

- [ ] **Step 3: Write the tab bar**

Create `apps/admin/app/(dashboard)/segments/segment-tabs.tsx`:

```tsx
'use client';

// The dashboard's segment tab bar.
//
// Not `@fit/ui-web`'s `Tabs`: that primitive is Tailwind-classed and this screen
// is on the Tailwind guardrail's migrated manifest. The ARIA contract is the
// same one it implements — `role="tablist"`, roving `tabindex` so Tab enters the
// bar once, arrow/Home/End to move within it, automatic activation — restyled in
// StyleX.
//
// Distinct from Astryx's `SegmentedControl`, which this screen already uses for
// the period filter. Segments here are dashboard sections, not a value picker.

import { useRef, type KeyboardEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { DASHBOARD_SEGMENTS, type DashboardSegment } from '@fit/types';

const styles = stylex.create({
  list: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  tab: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.375rem',
    marginBottom: '-1px',
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transitionProperty: 'color, border-color',
    transitionDuration: '0.15s',
    outline: 'none',
    ':hover': { color: 'var(--color-text-primary)' },
    ':focus-visible': { outline: '2px solid var(--color-brand)', outlineOffset: '-2px' },
  },
  active: {
    borderBottomColor: 'var(--color-brand)',
    color: 'var(--color-brand)',
  },
});

export function SegmentTabs({
  active,
  onSelect,
}: {
  active: DashboardSegment;
  onSelect: (segment: DashboardSegment) => void;
}) {
  const t = useTranslations('admin.dashboard.segments');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Move focus and selection together, wrapping at both ends.
  const focusTab = (index: number): void => {
    const count = DASHBOARD_SEGMENTS.length;
    const wrapped = ((index % count) + count) % count;
    const segment = DASHBOARD_SEGMENTS[wrapped];
    if (!segment) return;
    tabRefs.current[wrapped]?.focus();
    onSelect(segment);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(0);
        break;
      case 'End':
        event.preventDefault();
        focusTab(DASHBOARD_SEGMENTS.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div role="tablist" aria-label={t('aria')} {...stylex.props(styles.list)}>
      {DASHBOARD_SEGMENTS.map((segment, index) => {
        const isActive = segment === active;
        return (
          <button
            key={segment}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(segment)}
            onKeyDown={(event) => onKeyDown(event, index)}
            {...stylex.props(styles.tab, isActive && styles.active)}
          >
            {t(segment)}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/admin test -- segment-tabs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/segments"
git add apps/admin
git commit -m "feat(dashboard): let the keyboard walk the segment bar"
```

---

### Task 9: The animated, caching segment panel

**Files:**

- Create: `apps/admin/app/(dashboard)/segments/widget-grid.tsx`
- Create: `apps/admin/app/(dashboard)/segments/actions.ts`
- Create: `apps/admin/app/(dashboard)/segments/segment-panel.tsx`
- Test: `apps/admin/app/(dashboard)/segments/segment-panel.test.tsx`

**Interfaces:**

- Consumes: `fetchDashboardSegment` (Task 6), `ReportSectionCard` from `../reports/report-sections`.
- Produces: `loadSegmentAction(segment, range)` returning `{ ok: true; data: DashboardSegmentResponse } | { ok: false; error: string }`; `WidgetGrid({ widgets, currency, locale })`; `SegmentPanel({ segment, range })`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dashboard)/segments/segment-panel.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardSegmentResponse } from '@fit/types';

const loadSegmentAction = vi.fn();
vi.mock('./actions', () => ({
  loadSegmentAction: (...args: unknown[]) => loadSegmentAction(...args),
}));

const { SegmentPanel } = await import('./segment-panel');

const messages = {
  admin: {
    dashboard: {
      segments: {
        retry: 'Retry',
        loadError: "Couldn't load this segment.",
        empty: 'No widgets in this segment yet.',
      },
      widgets: {},
    },
    reports: { drilldown: { empty: 'No data' } },
  },
};

function response(title: string): DashboardSegmentResponse {
  return {
    segment: 'sales',
    range: '7d',
    currency: 'GEL',
    widgets: [
      {
        key: 'sales.top-plans',
        size: 'md',
        section: { kind: 'series', id: 'revenue-by-plan', title, unit: 'money', points: [] },
      },
    ],
  };
}

function renderPanel(segment: 'sales' | 'members' = 'sales') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentPanel segment={segment} range="7d" />
    </NextIntlClientProvider>,
  );
}

describe('SegmentPanel', () => {
  beforeEach(() => {
    loadSegmentAction.mockReset();
    loadSegmentAction.mockResolvedValue({ ok: true, data: response('Top plans') });
  });

  it('fetches the segment and renders its widgets', async () => {
    renderPanel();
    expect(await screen.findByText('Top plans')).toBeInTheDocument();
    expect(loadSegmentAction).toHaveBeenCalledWith('sales', '7d');
  });

  // The cache is what makes the transition animate instead of spin.
  it('does not refetch a segment it has already loaded', async () => {
    const { rerender } = renderPanel('sales');
    await screen.findByText('Top plans');

    loadSegmentAction.mockResolvedValue({ ok: true, data: response('New members') });
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SegmentPanel segment="members" range="7d" />
      </NextIntlClientProvider>,
    );
    await screen.findByText('New members');

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SegmentPanel segment="sales" range="7d" />
      </NextIntlClientProvider>,
    );
    await screen.findByText('Top plans');

    expect(loadSegmentAction).toHaveBeenCalledTimes(2);
  });

  it('refetches when the range changes', async () => {
    const { rerender } = renderPanel('sales');
    await screen.findByText('Top plans');

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SegmentPanel segment="sales" range="30d" />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(loadSegmentAction).toHaveBeenCalledWith('sales', '30d'));
  });

  // A failed segment must not take the rest of the dashboard down with it.
  it('offers a retry when the fetch fails', async () => {
    loadSegmentAction.mockResolvedValue({ ok: false, error: 'boom' });
    renderPanel();

    expect(await screen.findByText("Couldn't load this segment.")).toBeInTheDocument();

    loadSegmentAction.mockResolvedValue({ ok: true, data: response('Top plans') });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Top plans')).toBeInTheDocument();
  });

  it('states plainly when a segment resolves to no widgets', async () => {
    loadSegmentAction.mockResolvedValue({
      ok: true,
      data: { ...response('x'), widgets: [] },
    });
    renderPanel();
    expect(await screen.findByText('No widgets in this segment yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- segment-panel`
Expected: FAIL — cannot resolve `./segment-panel`.

- [ ] **Step 3: Write the server action**

Create `apps/admin/app/(dashboard)/segments/actions.ts`:

```ts
'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  setDashboardWidgetsSchema,
  type ConfigurableDashboardSegment,
  type DashboardRange,
  type DashboardSegmentResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardSegment, saveDashboardSegmentWidgets } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert the reporting capability inside the action. The middleware gates the
 * route, but a Server Action is a POST endpoint in its own right — defence in
 * depth ahead of the API's own guard.
 */
async function requireReportView(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.ReportView);
}

/** Load one segment's widgets. Errors come back as a message, so a failed segment stays local. */
export async function loadSegmentAction(
  segment: ConfigurableDashboardSegment,
  range: DashboardRange,
): Promise<ActionResult<DashboardSegmentResponse>> {
  const t = await getTranslations('admin.dashboard.segments');
  if (!(await requireReportView())) {
    return { ok: false, error: t('loadError') };
  }
  try {
    return { ok: true, data: await fetchDashboardSegment(segment, range) };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}

/**
 * Replace a segment's widget selection. Gym-wide: this changes what every
 * colleague sees, which the picker states before it is used.
 */
export async function saveSegmentWidgetsAction(
  segment: ConfigurableDashboardSegment,
  widgetKeys: string[],
): Promise<ActionResult> {
  const t = await getTranslations('admin.dashboard.picker');
  if (!(await requireReportView())) {
    return { ok: false, error: t('saveError') };
  }
  const parsed = setDashboardWidgetsSchema.safeParse({ widgetKeys });
  if (!parsed.success) {
    return { ok: false, error: t('lastWidget') };
  }
  try {
    await saveDashboardSegmentWidgets(segment, parsed.data.widgetKeys);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('saveError') };
  }
}
```

- [ ] **Step 4: Write the widget grid**

Create `apps/admin/app/(dashboard)/segments/widget-grid.tsx`:

```tsx
'use client';

// The widget grid for one segment.
//
// Widget bodies are the EXISTING `ReportSectionCard`, so a series or heatmap
// looks the same on the dashboard as it does in Reports and there is no second
// renderer to keep in step.
//
// Motion: each card fades and rises on entry, staggered by its index, so a
// segment resolves as a short cascade rather than a single hard swap. The
// stagger is capped so a long segment never feels slow. Only `opacity` and
// `transform` animate — both compositor properties. Under
// `prefers-reduced-motion` the rise and the stagger drop away, leaving a plain
// fade: the motion is decoration and never gates the content.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { ResolvedDashboardWidget } from '@fit/types';
import { ReportSectionCard } from '../reports/report-sections';

/** Per-card entry delay, and the ceiling the cascade is clamped to. */
const STAGGER_MS = 40;
const MAX_STAGGER_MS = 240;

const fadeUp = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const fadeOnly = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (max-width: 60rem)': '1fr',
    },
    gap: '1.5rem',
  },
  sm: { gridColumn: 'span 1' },
  md: { gridColumn: { default: 'span 1', '@media (max-width: 60rem)': 'span 1' } },
  lg: { gridColumn: { default: 'span 2', '@media (max-width: 60rem)': 'span 1' } },
  empty: {
    margin: 0,
    paddingBlock: '3rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

const motion = stylex.create({
  enter: (delayMs: number) => ({
    animationName: {
      default: fadeUp,
      '@media (prefers-reduced-motion: reduce)': fadeOnly,
    },
    animationDuration: '0.22s',
    animationTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
    animationDelay: {
      default: `${delayMs}ms`,
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    animationFillMode: 'both',
  }),
});

export function WidgetGrid({
  widgets,
  currency,
  locale,
}: {
  widgets: ResolvedDashboardWidget[];
  currency: string;
  locale: string;
}) {
  const t = useTranslations('admin.dashboard.segments');
  const tReports = useTranslations('admin.reports.drilldown');

  if (widgets.length === 0) {
    return <p {...stylex.props(styles.empty)}>{t('empty')}</p>;
  }

  return (
    <div {...stylex.props(styles.grid)}>
      {widgets.map((widget, index) => (
        <div
          key={widget.key}
          {...stylex.props(
            styles[widget.size],
            motion.enter(Math.min(index * STAGGER_MS, MAX_STAGGER_MS)),
          )}
        >
          <ReportSectionCard
            section={widget.section}
            currency={currency}
            locale={locale}
            emptyLabel={tReports('empty')}
          />
        </div>
      ))}
    </div>
  );
}
```

If `admin.reports.drilldown.empty` does not exist, run `grep -n "emptyLabel" apps/admin/app/\(dashboard\)/reports/[metric]/drilldown-view.tsx` and use whichever key that view passes.

- [ ] **Step 5: Write the panel**

Create `apps/admin/app/(dashboard)/segments/segment-panel.tsx`:

```tsx
'use client';

// One segment's panel: fetch, cache, and the staged swap between segments.
//
// Each segment is fetched on FIRST activation and cached by `segment:range`, so
// returning to a visited segment is instant — which is what lets the switch
// animate rather than sit on a spinner. Changing the range invalidates by virtue
// of the composite key.
//
// The swap is staged like the console's drawers: the outgoing grid fades out
// while still mounted, and only then does the incoming one mount and cascade in.
// The panel holds its previous height across the swap so the page doesn't jump
// while the new grid measures.

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ConfigurableDashboardSegment,
  DashboardRange,
  DashboardSegmentResponse,
} from '@fit/types';
import { Button } from '@/components/ui';
import { loadSegmentAction } from './actions';
import { WidgetGrid } from './widget-grid';

/** Exit duration — must stay in step with `swap.exiting`'s `transitionDuration`. */
const EXIT_MS = 120;

const styles = stylex.create({
  panel: {
    transitionProperty: 'opacity, transform',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
  },
  entering: {
    opacity: 1,
    transform: 'translateY(0)',
    transitionDuration: '0s',
  },
  exiting: {
    opacity: 0,
    transform: {
      default: 'translateY(-4px)',
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    transitionDuration: `${EXIT_MS}ms`,
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
    height: '18rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-surface-muted)',
  },
});

export function SegmentPanel({
  segment,
  range,
}: {
  segment: ConfigurableDashboardSegment;
  range: DashboardRange;
}) {
  const t = useTranslations('admin.dashboard.segments');
  const locale = useLocale();

  // Cached responses survive re-renders and segment switches for the page's life.
  const cache = useRef(new Map<string, DashboardSegmentResponse>());
  const [shown, setShown] = useState<ConfigurableDashboardSegment>(segment);
  const [exiting, setExiting] = useState(false);
  const [data, setData] = useState<DashboardSegmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [minHeight, setMinHeight] = useState<number | undefined>();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Stage the swap: fade the current grid out, hold the height, then switch.
  useEffect(() => {
    if (segment === shown) return;
    setMinHeight(bodyRef.current?.offsetHeight);
    setExiting(true);
    const timer = setTimeout(() => {
      setShown(segment);
      setExiting(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [segment, shown]);

  // Load the shown segment, from cache when we already have it.
  useEffect(() => {
    const key = `${shown}:${range}`;
    const cached = cache.current.get(key);
    if (cached && attempt === 0) {
      setData(cached);
      setError(null);
      setMinHeight(undefined);
      return;
    }

    let cancelled = false;
    setData(null);
    setError(null);
    void loadSegmentAction(shown, range).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        cache.current.set(key, result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
      setMinHeight(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [shown, range, attempt]);

  return (
    <div
      ref={bodyRef}
      style={minHeight ? { minHeight } : undefined}
      {...stylex.props(styles.panel, exiting ? styles.exiting : styles.entering)}
    >
      {error !== null ? (
        <div role="alert" {...stylex.props(styles.status)}>
          <span>{t('loadError')}</span>
          <Button variant="secondary" size="sm" onPress={() => setAttempt((n) => n + 1)}>
            {t('retry')}
          </Button>
        </div>
      ) : data === null ? (
        <div {...stylex.props(styles.skeleton)} aria-hidden="true" />
      ) : (
        <WidgetGrid widgets={data.widgets} currency={data.currency} locale={locale} />
      )}
    </div>
  );
}
```

If the Astryx `Button` uses `onClick` rather than `onPress`, match whatever `apps/admin/app/(dashboard)/reports/reports-view.tsx` uses.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @fit/admin test -- segment-panel`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/segments"
git add apps/admin
git commit -m "feat(dashboard): cascade a segment's widgets in, and remember them"
```

---

### Task 10: The Add Widget picker

**Files:**

- Create: `apps/admin/app/(dashboard)/segments/add-widget-dialog.tsx`
- Test: `apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx`

**Interfaces:**

- Consumes: `saveSegmentWidgetsAction` (Task 9), `DASHBOARD_WIDGET_CATALOG`, `CONFIGURABLE_DASHBOARD_SEGMENTS`, `widgetsForSegment`.
- Produces: `AddWidgetDialog({ initialSegment, selectedKeys, onSaved })` where `selectedKeys: Record<ConfigurableDashboardSegment, string[]>`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const saveSegmentWidgetsAction = vi.fn();
vi.mock('./actions', () => ({
  saveSegmentWidgetsAction: (...args: unknown[]) => saveSegmentWidgetsAction(...args),
}));

const { AddWidgetDialog } = await import('./add-widget-dialog');

const messages = {
  admin: {
    dashboard: {
      segments: {
        sales: 'Sales',
        members: 'Members',
        revenue: 'Revenue',
        classes: 'Classes',
        staff: 'Staff',
        aria: 'Dashboard segments',
      },
      widgets: {
        salesPaymentMethod: 'Sales by payment method',
        salesTopProducts: 'Top-selling products',
        salesTopPlans: 'Top-selling plans',
        membersNewSignups: 'New member signups',
        membersChurn: 'Member churn',
        revenueOverTime: 'Revenue over time',
        revenueByLocation: 'Revenue by location',
        classesMostBooked: 'Most booked classes',
        classesPeakHours: 'Peak hours',
        staffSessionsPerTrainer: 'Sessions per trainer',
      },
      picker: {
        open: 'Add widget',
        title: 'Add widget',
        shared: 'This layout is shared with everyone at your gym.',
        lastWidget: 'Each segment keeps at least one widget.',
        apply: 'Save',
        cancel: 'Cancel',
        saveError: "Couldn't save your widgets.",
      },
    },
  },
};

function renderDialog(selected: Record<string, string[]>) {
  const onSaved = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddWidgetDialog initialSegment="sales" selectedKeys={selected as never} onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
  return onSaved;
}

const ALL_SALES = ['sales.payment-method', 'sales.top-products', 'sales.top-plans'];

describe('AddWidgetDialog', () => {
  beforeEach(() => {
    saveSegmentWidgetsAction.mockReset();
    saveSegmentWidgetsAction.mockResolvedValue({ ok: true, data: undefined });
  });

  it('says plainly that the layout is shared', async () => {
    renderDialog({ sales: ALL_SALES });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(
      screen.getByText('This layout is shared with everyone at your gym.'),
    ).toBeInTheDocument();
  });

  it('checks the widgets the segment currently shows', async () => {
    renderDialog({ sales: ['sales.top-plans'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    expect(screen.getByRole('checkbox', { name: 'Top-selling plans' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Top-selling products' })).not.toBeChecked();
  });

  it('saves only the segments whose selection changed', async () => {
    renderDialog({ sales: ALL_SALES, members: ['members.churn'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Top-selling products' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveSegmentWidgetsAction).toHaveBeenCalledTimes(1);
    expect(saveSegmentWidgetsAction).toHaveBeenCalledWith('sales', [
      'sales.payment-method',
      'sales.top-plans',
    ]);
  });

  // Zero stored widgets would read as "never configured" and restore the whole
  // catalogue, quietly undoing the removal.
  it('will not let the last widget in a segment be unchecked', async () => {
    renderDialog({ sales: ['sales.top-plans'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    const last = screen.getByRole('checkbox', { name: 'Top-selling plans' });
    expect(last).toBeDisabled();
    expect(screen.getByText('Each segment keeps at least one widget.')).toBeInTheDocument();
  });

  it('switches the listed widgets when another segment tab is chosen', async () => {
    renderDialog({ sales: ALL_SALES });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Members' }));

    expect(screen.getByRole('checkbox', { name: 'New member signups' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Top-selling plans' })).not.toBeInTheDocument();
  });

  it('reports a failed save and keeps the dialog open', async () => {
    saveSegmentWidgetsAction.mockResolvedValue({ ok: false, error: "Couldn't save your widgets." });
    renderDialog({ sales: ALL_SALES });
    await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Top-selling products' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("Couldn't save your widgets.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/admin test -- add-widget-dialog`
Expected: FAIL — cannot resolve `./add-widget-dialog`.

- [ ] **Step 3: Write the dialog**

Before writing, read `apps/admin/app/(dashboard)/classes/schedule/class-drawer.tsx` for the console's Astryx `Dialog` usage and `useSlideDrawer` wiring, and match it.

Create `apps/admin/app/(dashboard)/segments/add-widget-dialog.tsx`:

```tsx
'use client';

// The "Add widget" picker.
//
// The segment list IS the dialog's tab bar, so choosing what a segment shows
// happens in the same vocabulary as looking at it. Applying issues one save per
// CHANGED segment — an untouched tab costs no request.
//
// A segment must keep at least one widget: zero stored rows reads as "never
// configured", which restores the catalogue default and would quietly undo the
// removal. The last remaining checkbox is disabled rather than allowed to fail
// on save.

import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import {
  CONFIGURABLE_DASHBOARD_SEGMENTS,
  widgetsForSegment,
  type ConfigurableDashboardSegment,
} from '@fit/types';
import { Button, Dialog, Icon } from '@/components/ui';
import { saveSegmentWidgetsAction } from './actions';

type Selection = Record<ConfigurableDashboardSegment, string[]>;

const styles = stylex.create({
  tabs: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    marginBottom: '1rem',
  },
  tab: {
    flexShrink: 0,
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  tabActive: { borderBottomColor: 'var(--color-brand)', color: 'var(--color-brand)' },
  note: {
    margin: 0,
    marginBottom: '1rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    marginTop: '1.5rem',
  },
  error: {
    margin: 0,
    marginTop: '0.75rem',
    fontSize: '0.8125rem',
    color: 'var(--color-error)',
  },
});

export function AddWidgetDialog({
  initialSegment,
  selectedKeys,
  onSaved,
}: {
  initialSegment: ConfigurableDashboardSegment;
  selectedKeys: Selection;
  onSaved: () => void;
}) {
  const t = useTranslations('admin.dashboard.picker');
  const tSegments = useTranslations('admin.dashboard.segments');
  const tWidgets = useTranslations('admin.dashboard.widgets');

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<ConfigurableDashboardSegment>(initialSegment);
  const [draft, setDraft] = useState<Selection>(selectedKeys);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const catalogue = useMemo(() => widgetsForSegment(tab), [tab]);
  const chosen = draft[tab] ?? [];
  const isLast = chosen.length === 1;

  function toggle(key: string): void {
    setDraft((current) => {
      const keys = current[tab] ?? [];
      const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
      return { ...current, [tab]: next };
    });
  }

  async function apply(): Promise<void> {
    setSaving(true);
    setError(null);
    // Only the segments the user actually touched are written.
    const changed = CONFIGURABLE_DASHBOARD_SEGMENTS.filter(
      (segment) => (draft[segment] ?? []).join(' ') !== (selectedKeys[segment] ?? []).join(' '),
    );
    for (const segment of changed) {
      const result = await saveSegmentWidgetsAction(segment, draft[segment] ?? []);
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setIsOpen(false);
    onSaved();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onPress={() => setIsOpen(true)}>
        <Icon name="plus" />
        {t('open')}
      </Button>

      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} title={t('title')}>
        <p {...stylex.props(styles.note)}>{t('shared')}</p>

        <div role="tablist" aria-label={tSegments('aria')} {...stylex.props(styles.tabs)}>
          {CONFIGURABLE_DASHBOARD_SEGMENTS.map((segment) => (
            <button
              key={segment}
              type="button"
              role="tab"
              aria-selected={segment === tab}
              onClick={() => setTab(segment)}
              {...stylex.props(styles.tab, segment === tab && styles.tabActive)}
            >
              {tSegments(segment)}
            </button>
          ))}
        </div>

        <div {...stylex.props(styles.list)}>
          {catalogue.map((widget) => {
            const checked = chosen.includes(widget.key);
            return (
              <label key={widget.key} {...stylex.props(styles.row)}>
                <input
                  type="checkbox"
                  checked={checked}
                  // Unchecking the last one would restore the whole catalogue.
                  disabled={checked && isLast}
                  onChange={() => toggle(widget.key)}
                />
                {tWidgets(widget.labelKey)}
              </label>
            );
          })}
        </div>

        {isLast ? <p {...stylex.props(styles.note)}>{t('lastWidget')}</p> : null}
        {error !== null ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        ) : null}

        <div {...stylex.props(styles.footer)}>
          <Button variant="ghost" size="sm" onPress={() => setIsOpen(false)}>
            {t('cancel')}
          </Button>
          <Button variant="primary" size="sm" isDisabled={saving} onPress={() => void apply()}>
            {t('apply')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
```

Match the actual `Dialog`, `Button` and `Icon` prop names to the console's usage — check `class-drawer.tsx`. If `Icon` has no `plus` glyph, drop the icon.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @fit/admin test -- add-widget-dialog`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/segments"
git add apps/admin
git commit -m "feat(dashboard): pick a segment's widgets where you read them"
```

---

### Task 11: Wire the dashboard together

**Files:**

- Create: `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`
- Modify: `apps/admin/app/(dashboard)/page.tsx`

**Interfaces:**

- Consumes: `SegmentTabs` (Task 8), `SegmentPanel` (Task 9), `AddWidgetDialog` (Task 10), `OverviewView` (Task 7).
- Produces: `SegmentedDashboard({ overview, initialSegment, selectedKeys })`.

- [ ] **Step 1: Write the shell**

Create `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`:

```tsx
'use client';

// The dashboard shell: the tab bar, the picker, and whichever segment is active.
//
// The active segment lives in the URL (`?segment=`) beside the existing `?range=`
// and `?period=`, so the back button and a shared link behave the way they
// already do for those. `overview` renders the server-fetched control room
// unchanged; every other tab hands off to the lazily-fetched panel.

import { useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_DASHBOARD_SEGMENT,
  type ConfigurableDashboardSegment,
  type DashboardOverviewResponse,
  type DashboardRange,
  type DashboardSegment,
} from '@fit/types';
import { OverviewView } from '../overview/overview-view';
import { AddWidgetDialog } from './add-widget-dialog';
import { SegmentPanel } from './segment-panel';
import { SegmentTabs } from './segment-tabs';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  bar: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
});

export function SegmentedDashboard({
  overview,
  initialSegment,
  selectedKeys,
  range,
}: {
  overview: DashboardOverviewResponse;
  initialSegment: DashboardSegment;
  selectedKeys: Record<ConfigurableDashboardSegment, string[]>;
  range: DashboardRange;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const active = (searchParams.get('segment') as DashboardSegment | null) ?? initialSegment;

  function select(next: DashboardSegment): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_DASHBOARD_SEGMENT) {
      params.delete('segment');
    } else {
      params.set('segment', next);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.bar)}>
        <SegmentTabs active={active} onSelect={select} />
        {active !== 'overview' ? (
          <AddWidgetDialog
            initialSegment={active as ConfigurableDashboardSegment}
            selectedKeys={selectedKeys}
            onSaved={() => router.refresh()}
          />
        ) : null}
      </div>

      {active === 'overview' ? (
        <OverviewView data={overview} />
      ) : (
        <SegmentPanel segment={active as ConfigurableDashboardSegment} range={range} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the server page**

In `apps/admin/app/(dashboard)/page.tsx`:

- add `dashboardSegmentSchema`, `DEFAULT_DASHBOARD_SEGMENT`, `CONFIGURABLE_DASHBOARD_SEGMENTS`, `widgetsForSegment` to the `@fit/types` import;
- add a `parseSegment` helper beside the existing parsers:

```tsx
/** Resolve the `?segment=` query to a valid {@link DashboardSegment}, defaulting to overview. */
function parseSegment(raw: string | string[] | undefined): DashboardSegment {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = dashboardSegmentSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_DASHBOARD_SEGMENT;
}
```

- read it alongside the others: `const segment = parseSegment(params.segment);`
- replace the final `return <DashboardView data={overview} />;` with:

```tsx
// The picker needs each segment's CURRENT selection to check its boxes. The
// catalogue default stands in until a segment is opened and its stored
// selection arrives with the panel's own fetch.
const selectedKeys = Object.fromEntries(
  CONFIGURABLE_DASHBOARD_SEGMENTS.map((value) => [
    value,
    widgetsForSegment(value).map((widget) => widget.key),
  ]),
) as Record<ConfigurableDashboardSegment, string[]>;

return (
  <SegmentedDashboard
    overview={overview}
    initialSegment={segment}
    selectedKeys={selectedKeys}
    range={range}
  />
);
```

- swap the `DashboardView` import for `import { SegmentedDashboard } from './segments/segmented-dashboard';`.

- [ ] **Step 3: Verify the whole console**

Run: `pnpm --filter @fit/admin exec tsc --noEmit`
Expected: clean.

Run: `pnpm --filter @fit/admin test`
Expected: PASS.

Run: `pnpm exec tsx scripts/check-tailwind-guardrail.ts`
Expected: PASS.

- [ ] **Step 4: Confirm it works in the app**

Start the API and the console. Open `/` and check:

1. Overview renders as before, with a tab bar above it and no "Add widget" button.
2. Clicking **Sales** puts `?segment=sales` in the URL, shows a skeleton once, then cascades three widgets in.
3. Clicking **Overview** and back to **Sales** is instant — no skeleton the second time.
4. The browser back button returns to the previous segment.
5. **Add widget** → uncheck a Sales widget → **Save** → that widget disappears; reload and it is still gone.
6. With one Sales widget left, its checkbox is disabled.
7. In macOS System Settings → Accessibility → Display → Reduce motion, the cascade becomes a plain fade with no rise.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)"
git add apps/admin
git commit -m "feat(dashboard): give the console its segmented control room"
```

---

### Task 12: End-to-end coverage

**Files:**

- Modify: `apps/e2e/tests/admin-core-flows.spec.ts`

**Interfaces:**

- Consumes: the running console, already signed in as OWNER by `global-setup.ts`.

- [ ] **Step 1: Write the failing test**

Append to the `test.describe.serial('Admin core flows', …)` block in `apps/e2e/tests/admin-core-flows.spec.ts`:

```ts
test('Dashboard: a segment shows its widgets and the picker persists a change', async ({
  page,
}) => {
  await page.goto('/');

  // Overview is the landing tab and offers no picker.
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Add widget' })).toBeHidden();

  // Switching to Sales puts the segment in the URL and renders its widgets.
  await page.getByRole('tab', { name: 'Sales' }).click();
  await expect(page).toHaveURL(/segment=sales/);
  const paymentMethod = page.getByText('Sales by payment method', { exact: false });
  await expect(paymentMethod).toBeVisible();

  // Removing a widget sticks across a reload — the layout is stored, not local.
  await page.getByRole('button', { name: 'Add widget' }).click();
  await page.getByRole('checkbox', { name: 'Sales by payment method' }).uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(paymentMethod).toBeHidden();

  await page.reload();
  await expect(paymentMethod).toBeHidden();

  // Put it back, so the suite is safe to re-run against the same database.
  await page.getByRole('button', { name: 'Add widget' }).click();
  await page.getByRole('checkbox', { name: 'Sales by payment method' }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(paymentMethod).toBeVisible();
});
```

- [ ] **Step 2: Run it and watch it fail against a stale build**

Run: `pnpm --filter @fit/e2e test -- --grep "Dashboard: a segment"`
Expected: FAIL if the console is not rebuilt with Tasks 7-11. Rebuild, then re-run.

- [ ] **Step 3: Run it green**

Run: `pnpm --filter @fit/e2e test -- --grep "Dashboard: a segment"`
Expected: PASS.

The widget titles come from the API's section titles, which are English regardless of locale in the seeded data; the suite already pins `NEXT_LOCALE=en`. If the visible title differs from the catalogue label, assert on the title the API actually returns.

- [ ] **Step 4: Run every suite**

```bash
pnpm --filter @fit/types test
pnpm --filter @fit/api test
pnpm --filter @fit/admin test
pnpm exec tsx scripts/check-tailwind-guardrail.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/e2e/tests/admin-core-flows.spec.ts
git add apps/e2e
git commit -m "test(e2e): prove a segment renders and its widget choice sticks"
```

---

## Self-Review

**Spec coverage**

| Spec section                                                            | Task                     |
| ----------------------------------------------------------------------- | ------------------------ |
| §1 Catalogue, segment enum, invariants, default selection, min-one rule | 1                        |
| §1 Spec-1 catalogue of 10 widgets                                       | 1                        |
| §2 `DashboardWidget` model, migration, pin backfill                     | 2                        |
| §3 `GET` route, per-metric dedup, omit unresolvable                     | 3, 5                     |
| §3 `PUT` route, whole-slice replacement, validation                     | 4, 5                     |
| §3 `ReportView` on both routes; `overview` rejected; range vocabulary   | 5                        |
| §3 Pins API removed                                                     | 5, 6                     |
| §4 Lazy fetch, `segment:range` cache, `?segment=` in the URL            | 9, 11                    |
| §5 File structure, `overview/` extraction, own tab bar, picker          | 7, 8, 10                 |
| §6 Animation timings, stagger, reduced motion, min-height               | 9                        |
| §7 Per-segment error, empty section, stale key, default-when-empty      | 3, 9                     |
| §8 Types / API / admin / e2e / guardrail tests                          | 1, 3, 4, 5, 8, 9, 10, 12 |

**Known deviation:** the spec's §5 lists `widget-grid.tsx` but not `segmented-dashboard.tsx`. Task 11 adds the latter because `page.tsx` is a Server Component and the tab state must live in a Client Component. It is a mechanical split of the same responsibility, not a design change.

**Type consistency:** `DashboardSegmentsService.get(segment, range)` / `setWidgets(segment, widgetKeys)` are used with those exact signatures in Tasks 3, 4, 5. `loadSegmentAction` / `saveSegmentWidgetsAction` return `ActionResult` in Tasks 9, 10. `widgetsForSegment` / `findDashboardWidget` are named identically in Tasks 1, 3, 4, 10, 11. `ResolvedDashboardWidget` fields (`key`, `size`, `section`) match between Tasks 1, 3 and 9.

**Carry-forward for the follow-up specs:** each new widget needs a section added to `ReportDrilldownService` _and_ an entry in `DASHBOARD_WIDGET_CATALOG` _and_ a `labelKey` in both locale files. The Task-1 invariant test fails loudly if the first two drift apart.
