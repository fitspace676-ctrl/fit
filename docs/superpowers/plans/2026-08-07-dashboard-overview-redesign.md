# Dashboard Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the segmented dashboard's shell (header, ARIA, tests) and rebuild the overview tab as a two-tier metric strip over an asymmetric two-column work area.

**Architecture:** The page header moves out of `OverviewView` and into `SegmentedDashboard`, above the tab bar, where it renders whichever date filter governs the visible tab — `period` on Overview, `range` on a segment tab. The overview's nine KPI cards collapse into one `MetricStrip` with two tiers, and its remaining cards move into a `2.2fr / minmax(280px, 1fr)` grid whose right rail sticks on wide screens.

**Tech Stack:** Next.js 15 App Router (client components), React 19, StyleX (compiled, no Tailwind), Astryx design system (`@astryxdesign/core/*`), `next-intl`, Vitest + Testing Library + jsdom.

**Spec:** [`docs/superpowers/specs/2026-08-07-dashboard-overview-redesign-design.md`](../specs/2026-08-07-dashboard-overview-redesign-design.md)

## Global Constraints

- **No Tailwind.** This screen is on the Tailwind guardrail's migrated manifest. All styling is `stylex.create()` using `var(--color-*)` / `var(--font-family-*)` / `var(--radius-*)` tokens. `pnpm check:tailwind-guardrail` enforces this.
- **No design-token changes.** `@fit/astryx-theme` is not edited. No new CSS custom properties.
- **No new data.** No API calls, no schema changes, no new fields on `DashboardOverviewResponse`.
- **Every user-facing string is an i18n key** under `admin.dashboard.*`, added to **both** `packages/i18n/locales/en.json` and `packages/i18n/locales/ka.json`. A missing `ka` key logs a `MISSING_MESSAGE` warning at runtime.
- **`router.replace`, never `router.push`** for filter/segment changes — matches the existing convention in `overview-view.tsx`.
- Run from the repo root unless a step says otherwise. The admin test command is `pnpm --filter @fit/admin test`.
- Type-check with `pnpm --filter @fit/admin type-check` before every commit.

## File Structure

| File                                                                                               | Responsibility                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/test/next-navigation-mock.ts` **new**                                                  | Shared Vitest mock for `useRouter` / `usePathname` / `useSearchParams`. No test mocks these today; three new tests need them. |
| `apps/admin/app/(dashboard)/dashboard-header.tsx` **new**                                          | `<h1>`, subtitle, and the tab-appropriate date filter. Sole writer of `?period=` / `?from=` / `?to=` / `?range=`.             |
| `apps/admin/app/(dashboard)/overview/metric-strip.tsx` **new**                                     | Nine metrics, two tiers, one container. Absorbs `DeltaChip`.                                                                  |
| `apps/admin/app/(dashboard)/overview/recent-activity-card.tsx` **new**                             | `RecentCheckInsCard` + `RecentMembersCard` behind a tab switch.                                                               |
| `apps/admin/app/(dashboard)/overview/overview-view.tsx` **modified**                               | Header removed, KPI rows replaced by the strip, cards regrouped into main column + rail.                                      |
| `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx` **modified**                         | Renders the header; wraps its contents in one `role="tabpanel"`.                                                              |
| `apps/admin/app/(dashboard)/segments/segment-tabs.tsx` **modified**                                | `id` + `aria-controls` on each tab.                                                                                           |
| `apps/admin/app/(dashboard)/overview/kpi-cards.tsx` **deleted**                                    | Superseded by `metric-strip.tsx`.                                                                                             |
| `apps/admin/app/(dashboard)/overview/{revenue,schedule}-card.tsx` **modified**                     | Drop `gridColumn: span 2`.                                                                                                    |
| `apps/admin/app/(dashboard)/overview/{revenue,plan-mix,schedule,alerts,recent}-*.tsx` **modified** | `sectionLabel` type treatment.                                                                                                |

---

### Task 1: Wire the tab bar to its panel

The tab bar sets `role="tablist"` and `role="tab"` but nothing carries `role="tabpanel"`, and no tab names the panel it controls. Screen-reader users get a tab list that announces no relationship to the content below it.

**Files:**

- Modify: `apps/admin/app/(dashboard)/segments/segment-tabs.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx`
- Test: `apps/admin/app/(dashboard)/segments/segment-tabs.test.tsx`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: the DOM id `dashboard-tabpanel` on the panel container, and `dashboard-tab-${segment}` on each tab button. Task 2 asserts against both.

- [ ] **Step 1: Write the failing test**

Append to `apps/admin/app/(dashboard)/segments/segment-tabs.test.tsx`, inside the existing `describe('SegmentTabs', …)` block:

```tsx
// The tablist half of the ARIA pattern was in place from the start; this is
// the other half — every tab must name the panel it drives, and its own id is
// what the panel points back at with aria-labelledby.
it('points every tab at the panel and gives each a stable id', () => {
  renderTabs('overview');
  for (const segment of ['overview', 'sales', 'members', 'revenue', 'classes', 'staff']) {
    const label = segment[0].toUpperCase() + segment.slice(1);
    const tab = screen.getByRole('tab', { name: label });
    expect(tab).toHaveAttribute('id', `dashboard-tab-${segment}`);
    expect(tab).toHaveAttribute('aria-controls', 'dashboard-tabpanel');
  }
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm --filter @fit/admin test -- segment-tabs
```

Expected: FAIL — `expect(element).toHaveAttribute("id", "dashboard-tab-overview")` with received `null`.

- [ ] **Step 3: Add the attributes to the tab buttons**

In `segment-tabs.tsx`, inside the `DASHBOARD_SEGMENTS.map(...)` callback, add two attributes to the `<button>` (keep every existing one):

```tsx
          <button
            key={segment}
            id={`dashboard-tab-${segment}`}
            aria-controls="dashboard-tabpanel"
            ref={registerRef(index)}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(segment)}
            onKeyDown={(event) => onKeyDown(event, index)}
            {...stylex.props(styles.tab, isActive && styles.active)}
          >
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm --filter @fit/admin test -- segment-tabs
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Add the panel container**

In `segmented-dashboard.tsx`, replace the two sibling render blocks with one panel. Before:

```tsx
{
  active === 'overview' ? <OverviewView data={overview} /> : null;
}

{
  lastSegment !== null ? (
    <div
      key={savedAt}
      hidden={active === 'overview'}
      {...stylex.props(active === 'overview' && styles.hidden)}
    >
      <SegmentPanel segment={lastSegment} range={range} onLoaded={noteSelection} />
    </div>
  ) : null;
}
```

After:

```tsx
{
  /*
        One panel, not two. Both the overview and the lazily-fetched segment live
        inside it, and `aria-labelledby` follows whichever tab is active — which is
        what completes the tablist/tabpanel pair the tab bar has always claimed.

        No `tabIndex={0}` here: the APG asks for it only when a panel has no
        focusable descendants, and these are full of buttons, links and charts. A
        tab stop on the container would just be one more thing to tab past.
      */
}
<div id="dashboard-tabpanel" role="tabpanel" aria-labelledby={`dashboard-tab-${active}`}>
  {active === 'overview' ? <OverviewView data={overview} /> : null}

  {lastSegment !== null ? (
    <div
      key={savedAt}
      hidden={active === 'overview'}
      {...stylex.props(active === 'overview' && styles.hidden)}
    >
      <SegmentPanel segment={lastSegment} range={range} onLoaded={noteSelection} />
    </div>
  ) : null}
</div>;
```

- [ ] **Step 6: Type-check and run the whole admin suite**

```bash
pnpm --filter @fit/admin type-check
pnpm --filter @fit/admin test
```

Expected: type-check clean; 29 tests passing across 5 files.

- [ ] **Step 7: Commit**

```bash
git add "apps/admin/app/(dashboard)/segments/segment-tabs.tsx" \
        "apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx" \
        "apps/admin/app/(dashboard)/segments/segment-tabs.test.tsx"
git commit -m "fix(dashboard): let the segment tabs name the panel they drive

The bar announced role=tablist and role=tab from the start, but nothing
carried role=tabpanel and no tab named what it controlled, so a screen
reader heard a tab list with no content attached to it.

Both the overview and the segment panel move inside one tabpanel whose
aria-labelledby follows the active tab, which keeps the trick of holding
the last segment mounted-but-hidden: the hidden attribute takes it out of
the accessibility tree too."
```

---

### Task 2: Test the shell and correct its comment

`segmented-dashboard.tsx` holds the screen's most delicate logic and has no test. Its header comment also credits `router.replace` with a working back button.

**Files:**

- Create: `apps/admin/test/next-navigation-mock.ts`
- Create: `apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx`
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx` (comment only)

**Interfaces:**

- Consumes: `dashboard-tabpanel` / `dashboard-tab-${segment}` from Task 1.
- Produces: `apps/admin/test/next-navigation-mock.ts` exporting `navigationMock` — `{ replace, refresh, push, setSearch, reset }`. Tasks 3 reuses it.

- [ ] **Step 1: Create the shared navigation mock**

No existing test mocks `next/navigation`; three new tests need it. Create `apps/admin/test/next-navigation-mock.ts`:

```ts
// Shared `next/navigation` double for component tests.
//
// The App Router hooks throw outside a Next request scope, so any client
// component that reads the URL — the dashboard shell, the dashboard header —
// needs them replaced. Vitest hoists `vi.mock` above imports, so a test file
// registers the mock itself and imports these handles to drive and assert it.
import { vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

/** The query string `useSearchParams()` will report. Set it before rendering. */
let search = '';

export const navigationMock = {
  replace,
  push,
  refresh,
  /** Set the query string the next render observes, e.g. `setSearch('segment=sales')`. */
  setSearch(next: string): void {
    search = next;
  },
  /** Clear call history and the query string. Call in `beforeEach`. */
  reset(): void {
    replace.mockReset();
    push.mockReset();
    refresh.mockReset();
    search = '';
  },
  /** The module factory to hand `vi.mock('next/navigation', …)`. */
  factory() {
    return {
      useRouter: () => ({ replace, push, refresh }),
      usePathname: () => '/',
      useSearchParams: () => new URLSearchParams(search),
    };
  },
};
```

- [ ] **Step 2: Write the failing test**

Create `apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ConfigurableDashboardSegment, DashboardOverviewResponse } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';

vi.mock('next/navigation', () => navigationMock.factory());

// The shell's job is routing and mounting, not rendering. Standing in for the
// three children keeps this test on the shell's own logic and off the chart,
// dialog and fetch machinery they each drag in.
vi.mock('../overview/overview-view', () => ({
  OverviewView: () => <div data-testid="overview" />,
}));
vi.mock('./segment-panel', () => ({
  SegmentPanel: ({ segment }: { segment: ConfigurableDashboardSegment }) => (
    <div data-testid="panel">{segment}</div>
  ),
}));
vi.mock('./add-widget-dialog', () => ({
  AddWidgetDialog: () => <button type="button">Add widget</button>,
}));

const { SegmentedDashboard } = await import('./segmented-dashboard');

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

const selectedKeys = {
  sales: ['sales.top-plans'],
  members: [],
  revenue: [],
  classes: [],
  staff: [],
};

function renderShell(initialSegment: 'overview' | ConfigurableDashboardSegment = 'overview') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentedDashboard
        overview={{} as DashboardOverviewResponse}
        initialSegment={initialSegment}
        selectedKeys={selectedKeys}
        range="7d"
      />
    </NextIntlClientProvider>,
  );
}

describe('SegmentedDashboard', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it('labels the panel with whichever tab is active', () => {
    navigationMock.setSearch('segment=members');
    renderShell('members');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'dashboard-tab-members',
    );
  });

  // `?segment=` is user-editable. An unrecognised value must land on the default
  // rather than reach SegmentPanel as a segment the API has never heard of.
  it('falls back to the default segment on an unrecognised query value', () => {
    navigationMock.setSearch('segment=not-a-segment');
    renderShell('overview');
    expect(screen.getByTestId('overview')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'dashboard-tab-overview',
    );
  });

  // The panel stays mounted behind Overview so its fetch cache — a ref, and so
  // only as long-lived as the mount — survives the round trip.
  it('keeps the last segment mounted but hidden while Overview is on screen', () => {
    // Open a segment, then go back to Overview the way the app does it: the
    // click drops `?segment=`, so the next render sees an empty query AND an
    // `initialSegment` the server re-parsed as `overview`. Re-rendering with the
    // segment still selected would prove nothing — `active` would never leave it.
    navigationMock.setSearch('segment=sales');
    const { rerender } = renderShell('sales');
    expect(screen.getByTestId('panel')).toBeVisible();

    navigationMock.setSearch('');
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SegmentedDashboard
          overview={{} as DashboardOverviewResponse}
          initialSegment="overview"
          selectedKeys={selectedKeys}
          range="7d"
        />
      </NextIntlClientProvider>,
    );
    // Still mounted — `lastSegment` survives because a useState initialiser runs
    // only on mount, which is exactly what keeps the panel's fetch cache alive.
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    expect(screen.getByTestId('panel')).not.toBeVisible();
  });

  it('drops the segment param entirely when returning to the default tab', async () => {
    navigationMock.setSearch('segment=sales&range=30d');
    renderShell('sales');
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?range=30d');
  });

  it('writes the chosen segment to the query without touching the other params', async () => {
    navigationMock.setSearch('range=30d');
    renderShell('overview');
    await userEvent.click(screen.getByRole('tab', { name: 'Revenue' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?range=30d&segment=revenue');
  });

  it('offers the widget picker on a segment tab but not on Overview', () => {
    navigationMock.setSearch('segment=sales');
    const { unmount } = renderShell('sales');
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
    unmount();

    navigationMock.setSearch('');
    renderShell('overview');
    expect(screen.queryByRole('button', { name: 'Add widget' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

```bash
pnpm --filter @fit/admin test -- segmented-dashboard
```

Expected: FAIL — `Cannot find module '@/test/next-navigation-mock'` if Step 1 was skipped, otherwise all six assertions run against the real component. Any failure here is a genuine defect: read it before changing the test.

- [ ] **Step 4: Make the tests pass**

The component should already satisfy every assertion — this task is characterisation, not a behaviour change. If a test fails, fix `segmented-dashboard.tsx`, not the test. The one expected adjustment is that `@/test/…` must resolve: `vitest.config.ts` already aliases `@/` to the app root, so no config change is needed.

- [ ] **Step 5: Correct the misleading comment**

In `segmented-dashboard.tsx`, replace the fourth and fifth lines of the header comment. Before:

```tsx
// The active segment lives in the URL (`?segment=`) beside the existing `?range=`
// and `?period=`, so the back button and a shared link behave the way they
// already do for those. `overview` renders the server-fetched control room
// unchanged; every other tab hands off to the lazily-fetched panel.
```

After:

```tsx
// The active segment lives in the URL (`?segment=`) beside the existing `?range=`
// and `?period=`, so a shared or bookmarked link opens on the right tab. Like
// those two it is written with `router.replace`, so switching tabs does not
// stack history entries — and the back button leaves the dashboard rather than
// stepping back through segments. `overview` renders the server-fetched control
// room unchanged; every other tab hands off to the lazily-fetched panel.
```

- [ ] **Step 6: Run the suite and type-check**

```bash
pnpm --filter @fit/admin type-check
pnpm --filter @fit/admin test
```

Expected: type-check clean; 35 tests across 6 files.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/test/next-navigation-mock.ts \
        "apps/admin/app/(dashboard)/segments/segmented-dashboard.test.tsx" \
        "apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx"
git commit -m "test(dashboard): pin the shell's routing and its mounted-but-hidden panel

The shell carries the screen's most delicate logic — parsing a
user-editable ?segment=, holding the last segment mounted so its fetch
cache survives a trip through Overview, remounting on save — and was the
only file in the segments directory without a test.

Its header comment also credited router.replace with a working back
button. replace is the right call, matching how range and period already
navigate, so the comment is what changes."
```

---

### Task 3: Move the header into the shell

The page header lives inside `OverviewView`, which renders only on the Overview tab. Every segment tab therefore has no title and no date filter — while `?range=` silently drives what its panel fetches.

**Files:**

- Create: `apps/admin/app/(dashboard)/dashboard-header.tsx`
- Create: `apps/admin/app/(dashboard)/dashboard-header.test.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/overview-view.tsx` (remove the header)
- Modify: `apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx` (render it)
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `navigationMock` from Task 2.
- Produces: `DashboardHeader({ active, period, range }: { active: DashboardSegment; period: DashboardResolvedPeriod; range: DashboardRange })`. Task 6 relies on `OverviewView` no longer rendering an `<h1>`.

- [ ] **Step 1: Add the two new i18n keys**

`period.aria` and `period.rangeLabel` already exist. The range filter on segment tabs needs its own accessible name. In `packages/i18n/locales/en.json`, inside `admin.dashboard.period`, add:

```json
      "rangeAria": "Widget range"
```

In `packages/i18n/locales/ka.json`, same place:

```json
      "rangeAria": "ვიჯეტების პერიოდი"
```

The range option labels themselves already exist as `admin.dashboard.ranges.7d` / `.30d` / `.12w`.

- [ ] **Step 2: Write the failing test**

Create `apps/admin/app/(dashboard)/dashboard-header.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardResolvedPeriod } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';

vi.mock('next/navigation', () => navigationMock.factory());

const { DashboardHeader } = await import('./dashboard-header');

const messages = {
  admin: {
    dashboard: {
      title: 'Dashboard',
      subtitle: "Here's what's happening with your gym.",
      period: {
        today: 'Today',
        week: 'This Week',
        month: 'This Month',
        custom: 'Custom',
        aria: 'Dashboard period',
        rangeLabel: 'Custom date range',
        rangeAria: 'Widget range',
      },
      ranges: { '7d': '7d', '30d': '30d', '12w': '12w' },
    },
  },
};

const period: DashboardResolvedPeriod = { period: 'today', from: '2026-08-07', to: '2026-08-07' };

function renderHeader(active: 'overview' | 'sales' = 'overview') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardHeader active={active} period={period} range="7d" />
    </NextIntlClientProvider>,
  );
}

describe('DashboardHeader', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it('titles the page on every tab', () => {
    renderHeader('sales');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  // Each tab gets the filter that changes something on it, and only that one:
  // period drives the overview's KPI numbers, range drives segment widgets.
  it('offers the period filter on Overview and no range filter', () => {
    renderHeader('overview');
    expect(screen.getByRole('group', { name: 'Dashboard period' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Widget range' })).not.toBeInTheDocument();
  });

  it('offers the range filter on a segment tab and no period filter', () => {
    renderHeader('sales');
    expect(screen.getByRole('group', { name: 'Widget range' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Dashboard period' })).not.toBeInTheDocument();
  });

  it('writes the chosen period to the query', async () => {
    navigationMock.setSearch('segment=sales');
    renderHeader('overview');
    await userEvent.click(screen.getByRole('radio', { name: 'This Week' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?segment=sales&period=week');
  });

  // A preset carries no explicit dates, so any custom window must be cleared or
  // the server would keep resolving the stale one.
  it('drops a stale custom window when a preset is chosen', async () => {
    navigationMock.setSearch('period=custom&from=2026-01-01&to=2026-01-31');
    renderHeader('overview');
    await userEvent.click(screen.getByRole('radio', { name: 'This Month' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?period=month');
  });

  it('writes the chosen range to the query from a segment tab', async () => {
    navigationMock.setSearch('segment=revenue');
    renderHeader('sales');
    await userEvent.click(screen.getByRole('radio', { name: '30d' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?segment=revenue&range=30d');
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

```bash
pnpm --filter @fit/admin test -- dashboard-header
```

Expected: FAIL — `Failed to resolve import "./dashboard-header"`.

- [ ] **Step 4: Write the component**

Create `apps/admin/app/(dashboard)/dashboard-header.tsx`. The three query-writing functions are moved verbatim from `overview-view.tsx`; `selectRange` is new and follows the same shape.

```tsx
'use client';

// The dashboard's page header: title, subtitle, and the one date filter that
// governs whatever tab is on screen.
//
// It sits ABOVE the tab bar in the shell rather than inside a tab's content,
// because it used to live inside `OverviewView` — and so vanished on every other
// tab, leaving those tabs untitled and their `?range=` unreachable even though it
// was still deciding what their widgets fetched.
//
// Which filter it shows is deliberate, not incidental:
//   - Overview  → `period`, which bounds the KPI numbers on that tab. `?range=`
//     keeps its own toggle inside `RevenueCard`, next to the chart it redraws.
//   - a segment → `range`, which keys every widget fetch on that tab. `period` is
//     not offered, because nothing on a segment tab reads it.
// Showing both everywhere would put a dead control on each tab; showing neither
// is what the bug was.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput';
import type {
  DashboardPeriod,
  DashboardRange,
  DashboardResolvedPeriod,
  DashboardSegment,
} from '@fit/types';

/** The period values offered by the header date filter, in ascending span order. */
const PERIOD_VALUES = [
  'today',
  'week',
  'month',
  'custom',
] as const satisfies readonly DashboardPeriod[];

/** The range values offered on a segment tab, in ascending span order. */
const RANGE_VALUES = ['7d', '30d', '12w'] as const satisfies readonly DashboardRange[];

const styles = stylex.create({
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
});

export function DashboardHeader({
  active,
  period,
  range,
}: {
  active: DashboardSegment;
  period: DashboardResolvedPeriod;
  range: DashboardRange;
}) {
  const t = useTranslations('admin.dashboard');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /** Navigate to the same path with `params` as the new query. */
  function apply(params: URLSearchParams): void {
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  function selectPeriod(next: DashboardPeriod): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', next);
    // Presets carry no explicit dates — drop any stale custom window.
    if (next !== 'custom') {
      params.delete('from');
      params.delete('to');
    }
    apply(params);
  }

  function selectCustomRange(next: DateRange | null): void {
    if (!next) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', 'custom');
    params.set('from', next.start);
    params.set('to', next.end);
    apply(params);
  }

  function selectRange(next: DashboardRange): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    apply(params);
  }

  const periodRange: DateRange = {
    start: period.from as DateRange['start'],
    end: period.to as DateRange['end'],
  };

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.headerText)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </div>
      <div {...stylex.props(styles.controls)}>
        {active === 'overview' ? (
          <>
            <SegmentedControl
              value={period.period}
              onChange={(next) => selectPeriod(next as DashboardPeriod)}
              label={t('period.aria')}
              size="sm"
              isDisabled={isPending}
            >
              {PERIOD_VALUES.map((value) => (
                <SegmentedControlItem key={value} value={value} label={t(`period.${value}`)} />
              ))}
            </SegmentedControl>
            <DateRangeInput
              label={t('period.rangeLabel')}
              isLabelHidden
              value={periodRange}
              onChange={selectCustomRange}
              hasClear={false}
              size="sm"
              numberOfMonths={1}
              isDisabled={isPending}
            />
          </>
        ) : (
          <SegmentedControl
            value={range}
            onChange={(next) => selectRange(next as DashboardRange)}
            label={t('period.rangeAria')}
            size="sm"
            isDisabled={isPending}
          >
            {RANGE_VALUES.map((value) => (
              <SegmentedControlItem key={value} value={value} label={t(`ranges.${value}`)} />
            ))}
          </SegmentedControl>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
pnpm --filter @fit/admin test -- dashboard-header
```

Expected: PASS, 6 tests.

If the `getByRole('group', …)` queries fail, Astryx's `SegmentedControl` renders a different implicit role than `group` for its labelled wrapper. Read the rendered output with `screen.debug()` and match the role it actually uses — change the test's query, not the component.

- [ ] **Step 6: Remove the header from `OverviewView`**

In `overview-view.tsx`, delete: the `PERIOD_VALUES` constant; the `header` / `headerText` / `title` / `subtitle` / `headerControls` style keys; the `selectPeriod`, `selectCustomRange` and `periodRange` definitions; the entire `<header>` element and its trailing `{/* Page header + period filter */}` comment. Then drop the now-unused imports: `SegmentedControl`, `SegmentedControlItem`, `DateRangeInput`, `DateRange`, `DashboardPeriod`.

Keep `selectRange`, `useRouter`, `usePathname`, `useSearchParams` and `isPending` — `RevenueCard` still uses them.

- [ ] **Step 7: Render the header in the shell**

In `segmented-dashboard.tsx`, add the import and place the header first inside the page `<div>`, above the bar:

```tsx
import { DashboardHeader } from '../dashboard-header';
```

```tsx
    <div {...stylex.props(styles.page)}>
      <DashboardHeader active={active} period={overview.period} range={range} />

      <div {...stylex.props(styles.bar)}>
```

- [ ] **Step 8: Verify the whole suite and both tabs by hand**

```bash
pnpm --filter @fit/admin type-check
pnpm --filter @fit/admin test
```

Expected: type-check clean; 41 tests across 7 files.

Then, with the dev server running (`pnpm --filter @fit/admin dev`), open `http://localhost:3002/admin` and confirm: the title shows on every tab; Overview shows the period control and no range control; clicking Sales swaps it for a `7d / 30d / 12w` control; changing that control refetches the widgets.

- [ ] **Step 9: Commit**

```bash
git add "apps/admin/app/(dashboard)/dashboard-header.tsx" \
        "apps/admin/app/(dashboard)/dashboard-header.test.tsx" \
        "apps/admin/app/(dashboard)/overview/overview-view.tsx" \
        "apps/admin/app/(dashboard)/segments/segmented-dashboard.tsx" \
        packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "fix(dashboard): give every segment tab a title and a working filter

The header lived inside OverviewView, which the shell renders only on the
Overview tab — so the other five opened untitled, and their ?range= had
no control anywhere on screen even though it was deciding what every
widget on them fetched.

It moves above the tab bar and shows the one filter that governs the
visible tab: period on Overview, range on a segment. Offering both
everywhere would leave a dead control on each."
```

---

### Task 4: Collapse the KPI cards into a metric strip

Nine metrics render as nine separate `Card`s, each with a `minHeight: 13rem` and a 2.75rem accent icon tile, split across two rows on a boundary that puts a delta-bearing metric in with the plain counts.

**Files:**

- Create: `apps/admin/app/(dashboard)/overview/metric-strip.tsx`
- Create: `apps/admin/app/(dashboard)/overview/metric-strip.test.tsx`
- Delete: `apps/admin/app/(dashboard)/overview/kpi-cards.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/overview-view.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `MetricStrip({ data }: { data: DashboardOverviewResponse })`. Task 6 places it above the work area.

- [ ] **Step 1: Add the strip's accessible name**

In `packages/i18n/locales/en.json`, inside `admin.dashboard`, add a sibling of `kpi`:

```json
    "metrics": { "aria": "Key metrics" },
```

In `packages/i18n/locales/ka.json`, same place:

```json
    "metrics": { "aria": "ძირითადი მაჩვენებლები" },
```

- [ ] **Step 2: Write the failing test**

Create `apps/admin/app/(dashboard)/overview/metric-strip.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardOverviewResponse } from '@fit/types';
import { MetricStrip } from './metric-strip';

const messages = {
  admin: {
    dashboard: {
      metrics: { aria: 'Key metrics' },
      kpi: {
        revenue: 'Revenue',
        checkIns: 'Check-ins',
        newMembers: 'New members',
        noPriorData: 'no prior data',
      },
      secondaryKpi: {
        activeMembers: 'Active members',
        revenueThisMonth: 'Revenue this month',
        overduePayments: 'Overdue payments',
        classes: 'Classes',
        expiringSoon: 'Expiring soon',
        renewalsDue: 'Renewals due',
        expiringSoonHint: 'Within 7 days',
        renewalsDueHint: 'This month',
      },
    },
  },
};

function overview(overrides: Partial<DashboardOverviewResponse> = {}) {
  return {
    currency: 'GEL',
    kpis: {
      todaysRevenue: { value: 124000, deltaPct: 8 },
      checkInsToday: { value: 86, deltaPct: -3 },
      newMembers7d: { value: 12, deltaPct: null },
    },
    secondaryKpis: {
      activeMembers: 840,
      revenueThisMonth: { value: 3100000, deltaPct: 12 },
      overduePayments: 0,
      classesToday: 14,
      expiringSoon: 23,
      renewalsDue: 31,
    },
    ...overrides,
  } as DashboardOverviewResponse;
}

function renderStrip(data = overview()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MetricStrip data={data} />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('group', { name: 'Key metrics' });
}

describe('MetricStrip', () => {
  it('renders all nine metrics', () => {
    const strip = renderStrip();
    for (const label of [
      'Revenue',
      'Check-ins',
      'New members',
      'Revenue this month',
      'Active members',
      'Overdue payments',
      'Classes',
      'Expiring soon',
      'Renewals due',
    ]) {
      expect(within(strip).getByText(label)).toBeInTheDocument();
    }
  });

  // Four metrics carry a period-over-period delta; the other five are standing
  // counts with no baseline, and inventing a trend for them would be a lie.
  it('shows a signed delta only for the four metrics that have one', () => {
    const strip = renderStrip();
    expect(within(strip).getByText('▲ 8%')).toBeInTheDocument();
    expect(within(strip).getByText('▼ 3%')).toBeInTheDocument();
    expect(within(strip).getByText('▲ 12%')).toBeInTheDocument();
    expect(within(strip).queryByText(/▲ 0%/)).not.toBeInTheDocument();
  });

  it('says so when a metric has no prior window to compare against', () => {
    const strip = renderStrip();
    expect(within(strip).getByText('no prior data')).toBeInTheDocument();
  });

  it('gives the count metrics their static hint, never a delta', () => {
    const strip = renderStrip();
    expect(within(strip).getByText('Within 7 days')).toBeInTheDocument();
    expect(within(strip).getByText('This month')).toBeInTheDocument();
  });

  // A real zero is a fact about the gym, not a missing value.
  it('renders a genuine zero as 0', () => {
    const strip = renderStrip();
    expect(within(strip).getByText('0')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

```bash
pnpm --filter @fit/admin test -- metric-strip
```

Expected: FAIL — `Failed to resolve import "./metric-strip"`.

- [ ] **Step 4: Write the component**

Create `apps/admin/app/(dashboard)/overview/metric-strip.tsx`:

```tsx
'use client';

// The overview's nine numbers, in one container instead of nine cards.
//
// Two tiers, and the line between them is the data's own: exactly four metrics
// carry a period-over-period delta (`DashboardKpi`), and five are standing counts
// with no baseline. Tier one gets the larger numeral and the delta chip; tier two
// is smaller and muted, and shows a static hint where a trend would be a lie.
//
// That is a different split from the one this replaces, which had
// `revenueThisMonth` — a full KPI — sitting in the secondary row with the plain
// counts purely because of where it landed in the layout.

import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import type { DashboardKpi, DashboardOverviewResponse } from '@fit/types';

const styles = stylex.create({
  strip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-outer)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-surface)',
  },
  tier: {
    display: 'grid',
    // The hairlines between cells are the cells' own top/left borders, so the
    // grid needs no gap and the container's radius stays clean.
    gap: 0,
  },
  tierOne: {
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  tierTwo: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(5, minmax(0, 1fr))',
    },
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem 1rem',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
    // The first cell of a row must not draw a border against the container edge.
    ':first-child': { borderLeftWidth: 0 },
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  valueLarge: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  valueSmall: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  foot: {
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
});

export function MetricStrip({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data.currency,
        maximumFractionDigits: 0,
      }),
    [data.currency, locale],
  );
  const count = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <div role="group" aria-label={t('metrics.aria')} {...stylex.props(styles.strip)}>
      <div {...stylex.props(styles.tier, styles.tierOne)}>
        <KpiCell
          label={t('kpi.revenue')}
          value={money.format(data.kpis.todaysRevenue.value / 100)}
          kpi={data.kpis.todaysRevenue}
        />
        <KpiCell
          label={t('kpi.checkIns')}
          value={count.format(data.kpis.checkInsToday.value)}
          kpi={data.kpis.checkInsToday}
        />
        <KpiCell
          label={t('kpi.newMembers')}
          value={count.format(data.kpis.newMembers7d.value)}
          kpi={data.kpis.newMembers7d}
        />
        <KpiCell
          label={t('secondaryKpi.revenueThisMonth')}
          value={money.format(data.secondaryKpis.revenueThisMonth.value / 100)}
          kpi={data.secondaryKpis.revenueThisMonth}
        />
      </div>

      <div {...stylex.props(styles.tier, styles.tierTwo)}>
        <CountCell
          label={t('secondaryKpi.activeMembers')}
          value={count.format(data.secondaryKpis.activeMembers)}
        />
        <CountCell
          label={t('secondaryKpi.overduePayments')}
          value={count.format(data.secondaryKpis.overduePayments)}
        />
        <CountCell
          label={t('secondaryKpi.classes')}
          value={count.format(data.secondaryKpis.classesToday)}
        />
        <CountCell
          label={t('secondaryKpi.expiringSoon')}
          value={count.format(data.secondaryKpis.expiringSoon)}
          hint={t('secondaryKpi.expiringSoonHint')}
        />
        <CountCell
          label={t('secondaryKpi.renewalsDue')}
          value={count.format(data.secondaryKpis.renewalsDue)}
          hint={t('secondaryKpi.renewalsDueHint')}
        />
      </div>
    </div>
  );
}

/** A tier-one cell: the larger numeral plus its period-over-period delta. */
function KpiCell({ label, value, kpi }: { label: string; value: string; kpi: DashboardKpi }) {
  return (
    <div {...stylex.props(styles.cell)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.valueLarge)}>{value}</span>
      <DeltaChip kpi={kpi} />
    </div>
  );
}

/** A tier-two cell: a standing count, with an optional descriptive hint. */
function CountCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div {...stylex.props(styles.cell)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.valueSmall)}>{value}</span>
      {hint ? <span {...stylex.props(styles.foot)}>{hint}</span> : null}
    </div>
  );
}

/**
 * The delta badge, moved here verbatim from the KPI cards this strip replaces.
 * `deltaPct === null` means the comparison window has no data — said plainly
 * rather than shown as a 0% change, which would read as "flat".
 */
function DeltaChip({ kpi }: { kpi: DashboardKpi }) {
  const t = useTranslations('admin.dashboard');
  if (kpi.deltaPct === null) {
    return <span {...stylex.props(styles.foot)}>{t('kpi.noPriorData')}</span>;
  }
  const good = kpi.deltaPct >= 0;
  return (
    <Badge
      variant={good ? 'success' : 'error'}
      label={`${good ? '▲' : '▼'} ${Math.abs(kpi.deltaPct)}%`}
    />
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
pnpm --filter @fit/admin test -- metric-strip
```

Expected: PASS, 5 tests.

If `getByRole('group', …)` fails, jsdom is not exposing the container's `role="group"` — it is set explicitly here, so a failure means a typo. If the `▲ 8%` assertions fail, print the rendered badge with `screen.debug()`: Astryx's `Badge` may wrap the label in a nested element, in which case `getByText` still matches on the text node.

- [ ] **Step 6: Swap the strip into `OverviewView` and delete the old cards**

In `overview-view.tsx`:

1. Replace `import { KpiCard, StatKpiCard } from './kpi-cards';` with `import { MetricStrip } from './metric-strip';`.
2. Delete both KPI sections — the `<section {...stylex.props(styles.gridThirds)}>` holding `<InGymNow>` plus the `kpiGroup` div, and the whole `<section {...stylex.props(styles.secondaryKpiGrid)}>` — and put in their place:

```tsx
      <MetricStrip data={data} />

      <section {...stylex.props(styles.gridThirds)}>
        <InGymNow data={data} />
      </section>
```

3. Delete the `kpiGroup` and `secondaryKpiGrid` style keys.

`InGymNow` moves into the rail in Task 6; this interim keeps the page working and reviewable on its own.

- [ ] **Step 7: Delete `kpi-cards.tsx`**

```bash
git rm "apps/admin/app/(dashboard)/overview/kpi-cards.tsx"
```

Nothing else imports it — `locations-board.tsx` defines its own local `KpiCard`, and `(dashboard)/kpi-card.tsx` is an unrelated file with no importers.

- [ ] **Step 8: Verify**

```bash
pnpm --filter @fit/admin type-check
pnpm --filter @fit/admin test
pnpm check:tailwind-guardrail
```

Expected: type-check clean (a failure here means a leftover `KpiCard` reference); 46 tests across 8 files; guardrail clean.

- [ ] **Step 9: Commit**

```bash
git add -A "apps/admin/app/(dashboard)/overview" packages/i18n/locales
git commit -m "feat(dashboard): read the overview's nine numbers as one strip

Nine metrics rendered as nine cards, each 13rem tall behind its own
accent icon tile, across two rows split on nothing in particular —
revenueThisMonth carries a delta and still sat with the plain counts.

They collapse into one container with two tiers, split on the line the
data already draws: the four metrics with a period-over-period delta, and
the five standing counts that get a static hint instead of an invented
trend."
```

---

### Task 5: Merge the two recent-activity cards

`RecentCheckInsCard` and `RecentMembersCard` are two full-width cards stacked at the foot of the page. They are the same kind of thing — a short feed of recent rows — and belong behind one switch.

**Files:**

- Create: `apps/admin/app/(dashboard)/overview/recent-activity-card.tsx`
- Create: `apps/admin/app/(dashboard)/overview/recent-activity-card.test.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/overview-view.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `RecentActivityCard({ data }: { data: DashboardOverviewResponse })`. Task 6 places it in the rail. `RecentCheckInsCard` and `RecentMembersCard` keep their existing signatures and stay exported from `recent-cards.tsx`.

- [ ] **Step 1: Add the switch's accessible name**

In `packages/i18n/locales/en.json`, inside `admin.dashboard`:

```json
    "recentActivity": { "aria": "Recent activity" },
```

In `packages/i18n/locales/ka.json`:

```json
    "recentActivity": { "aria": "ბოლო აქტივობა" },
```

- [ ] **Step 2: Write the failing test**

Create `apps/admin/app/(dashboard)/overview/recent-activity-card.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardOverviewResponse } from '@fit/types';

// The two feeds are already covered by their own rendering; this test is about
// the switch between them, so stand them in with markers.
vi.mock('./recent-cards', () => ({
  RecentCheckInsCard: () => <div>check-ins feed</div>,
  RecentMembersCard: () => <div>members feed</div>,
}));

const { RecentActivityCard } = await import('./recent-activity-card');

const messages = {
  admin: {
    dashboard: {
      recentActivity: { aria: 'Recent activity' },
      recentCheckIns: { title: 'Recent check-ins' },
      recentMembers: { title: 'Recent members' },
    },
  },
};

function renderCard() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RecentActivityCard data={{} as DashboardOverviewResponse} />
    </NextIntlClientProvider>,
  );
}

describe('RecentActivityCard', () => {
  it('opens on the check-ins feed', () => {
    renderCard();
    expect(screen.getByText('check-ins feed')).toBeInTheDocument();
    expect(screen.queryByText('members feed')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recent check-ins' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches to the members feed and back', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('tab', { name: 'Recent members' }));
    expect(screen.getByText('members feed')).toBeInTheDocument();
    expect(screen.queryByText('check-ins feed')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Recent check-ins' }));
    expect(screen.getByText('check-ins feed')).toBeInTheDocument();
  });

  it('keeps only the selected tab in the tab order', () => {
    renderCard();
    expect(screen.getByRole('tab', { name: 'Recent check-ins' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Recent members' })).toHaveAttribute('tabindex', '-1');
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

```bash
pnpm --filter @fit/admin test -- recent-activity-card
```

Expected: FAIL — `Failed to resolve import "./recent-activity-card"`.

- [ ] **Step 4: Write the component**

Create `apps/admin/app/(dashboard)/overview/recent-activity-card.tsx`. It reuses `useRovingTablist` — the same hook the segment bar uses, so the keyboard contract matches the rest of the screen.

```tsx
'use client';

// The two recent-row feeds behind one switch.
//
// Check-ins and new members are the same kind of thing — a short list of what
// just happened — and as two full-width cards at the foot of the page they cost
// two surfaces to say it. One card with a two-tab switch says it in the rail.
//
// The tab bar reuses `useRovingTablist`, the hook the segment bar is built on, so
// arrow/Home/End behave identically in both places.

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { DashboardOverviewResponse } from '@fit/types';
import { useRovingTablist } from '../segments/use-roving-tablist';
import { RecentCheckInsCard, RecentMembersCard } from './recent-cards';

const FEEDS = ['checkIns', 'members'] as const;
type Feed = (typeof FEEDS)[number];

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  tabs: {
    display: 'flex',
    gap: '0.25rem',
    paddingInline: '1.25rem',
    paddingTop: '1rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  tab: {
    marginBottom: '-1px',
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    paddingInline: '0.25rem',
    paddingBottom: '0.625rem',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    outline: 'none',
    ':hover': { color: 'var(--color-text-primary)' },
    ':focus-visible': { outline: '2px solid var(--color-brand)', outlineOffset: '-2px' },
  },
  active: {
    borderBottomColor: 'var(--color-brand)',
    color: 'var(--color-brand)',
  },
});

export function RecentActivityCard({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const [feed, setFeed] = useState<Feed>('checkIns');
  const { registerRef, onKeyDown } = useRovingTablist(FEEDS, setFeed);

  const labels: Record<Feed, string> = {
    checkIns: t('recentCheckIns.title'),
    members: t('recentMembers.title'),
  };

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div role="tablist" aria-label={t('recentActivity.aria')} {...stylex.props(styles.tabs)}>
        {FEEDS.map((value, index) => {
          const isActive = value === feed;
          return (
            <button
              key={value}
              ref={registerRef(index)}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setFeed(value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              {...stylex.props(styles.tab, isActive && styles.active)}
            >
              {labels[value]}
            </button>
          );
        })}
      </div>
      {feed === 'checkIns' ? <RecentCheckInsCard data={data} /> : <RecentMembersCard data={data} />}
    </Card>
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
pnpm --filter @fit/admin test -- recent-activity-card
```

Expected: PASS, 3 tests.

`useRovingTablist` needs no change: it is already `useRovingTablist<T>(items: readonly T[], onSelect: (item: T) => void)` (`use-roving-tablist.ts:24`), so `T` infers as `Feed` and `setFeed` satisfies `onSelect`.

- [ ] **Step 6: Swap it into `OverviewView`**

In `overview-view.tsx`, replace the import and the two trailing cards.

```tsx
import { RecentActivityCard } from './recent-activity-card';
```

Delete `import { RecentCheckInsCard, RecentMembersCard } from './recent-cards';` and replace both trailing elements:

```tsx
{
  /* Recent check-ins */
}
<RecentCheckInsCard data={data} />;

{
  /* Recent members (gym-admin parity) */
}
<RecentMembersCard data={data} />;
```

with:

```tsx
<RecentActivityCard data={data} />
```

`recent-cards.tsx` keeps both exports — `RecentActivityCard` is now their only consumer.

- [ ] **Step 7: Verify**

```bash
pnpm --filter @fit/admin type-check
pnpm --filter @fit/admin test
```

Expected: type-check clean; 49 tests across 9 files.

- [ ] **Step 8: Commit**

```bash
git add -A "apps/admin/app/(dashboard)/overview" packages/i18n/locales
git commit -m "feat(dashboard): put both recent feeds behind one switch

Check-ins and new members are the same kind of thing — a short list of
what just happened — and spent two full-width cards at the foot of the
page saying it.

The switch reuses useRovingTablist, so its arrow/Home/End keys behave
exactly like the segment bar's a few hundred pixels above it."
```

---

### Task 6: Rebuild the work area as two columns

With the strip and the merged feed in place, the remaining five cards can leave the single-column stack of full-width bands.

**Files:**

- Modify: `apps/admin/app/(dashboard)/overview/overview-view.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/revenue-card.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/schedule-card.tsx`

**Interfaces:**

- Consumes: `MetricStrip` (Task 4), `RecentActivityCard` (Task 5), and the header's removal (Task 3).
- Produces: the final overview layout. Task 7 restyles the cards inside it.

- [ ] **Step 1: Let the parent own the column spans**

In `revenue-card.tsx`, the `cardWide` style key starts:

```tsx
  cardWide: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
```

Delete the `gridColumn` block, leaving:

```tsx
  cardWide: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
```

Do the same to the equivalent `gridColumn` block in `schedule-card.tsx`. A card should not hold an opinion about how many of its parent's columns it occupies — that is the parent's business, and it is why the old layout could not be changed from one place.

- [ ] **Step 2: Rewrite the layout styles**

In `overview-view.tsx`, replace the `gridThirds` style key with these three:

```tsx
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
    // `minWidth: 0` stops a wide chart or a long table from forcing the whole
    // grid track wider than its share — the standard grid-blowout guard.
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
  },
```

- [ ] **Step 3: Rewrite the render**

Replace everything after `<MetricStrip data={data} />` — the interim `<section>` holding `InGymNow`, both `gridThirds` sections, and `<RecentActivityCard>` — with:

```tsx
<div {...stylex.props(styles.workArea)}>
  <div {...stylex.props(styles.column)}>
    <RevenueCard data={data} money={money} onSelectRange={selectRange} disabled={isPending} />
    <ScheduleCard data={data} />
    <PlanMixCard data={data} />
  </div>

  {/*
          The rail is what is happening right now — live occupancy, anything that
          needs attention, and the feed of what just happened. It sticks on wide
          screens so scrolling the revenue chart never scrolls the gym's live
          count off the page.
        */}
  <div {...stylex.props(styles.rail)}>
    <InGymNow data={data} />
    <AlertsCard data={data} />
    <RecentActivityCard data={data} />
  </div>
</div>
```

The full `OverviewView` body is now: `<MetricStrip>`, then this one `workArea` div.

- [ ] **Step 4: Verify the page in a browser at three widths**

```bash
pnpm --filter @fit/admin type-check
pnpm --filter @fit/admin test
```

Then, with the dev server running, open `http://localhost:3002/admin` and check at **1440px**, **1100px** and **600px** wide:

- 1440px — two columns; the rail sticks when you scroll; the strip shows 4 cells over 5.
- 1100px — still two columns; the rail scrolls with the page.
- 600px — one column, rail below the main column; the strip is 2 cells wide.
- At every width the page must not scroll horizontally.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(dashboard)/overview"
git commit -m "feat(dashboard): give the overview a main column and a live rail

Eight sections of full-width bands used a wide monitor as a narrow one,
and read as one undifferentiated stack: nothing on the page said where to
start.

The work the operator scrolls through — revenue, schedule, plan mix —
takes the wide column; what is true right now takes a rail that sticks,
so the gym's live count does not scroll away while reading a chart.

RevenueCard and ScheduleCard lose their own span-2: a card should not
have an opinion about how much of its parent's grid it occupies, which is
why the old layout could not be changed from one place."
```

---

### Task 7: Retire the uppercase card headings

Every card heading is `uppercase` at `letterSpacing: 0.15em` and `fontWeight: 700`. Repeated across six cards it is the single strongest reason the page reads as dated, and it makes each heading compete with the number underneath it.

**Files:**

- Modify: `apps/admin/app/(dashboard)/overview/revenue-card.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/plan-mix-card.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/schedule-card.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/alerts-card.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/recent-cards.tsx`
- Modify: `apps/admin/app/(dashboard)/overview/in-gym-now.tsx`

**Interfaces:**

- Consumes: the layout from Task 6.
- Produces: nothing other tasks depend on. This is the last task.

- [ ] **Step 1: Find every copy of the treatment**

```bash
grep -rn "textTransform: 'uppercase'" "apps/admin/app/(dashboard)/overview/"
```

Expected: one `sectionLabel` (or equivalently named) style key per card file. Note each file and key name before editing — some cards may also use it on a secondary label, which stays as it is; only the card's own heading changes.

- [ ] **Step 2: Restyle each heading**

In each file, the heading style key reads like this:

```tsx
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
```

Replace the last four properties so it reads:

```tsx
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
```

`textTransform` is removed entirely — the i18n strings are already sentence case (`"Recent check-ins"`, `"Today's schedule"`), so nothing needs rewording in either locale. The colour moves from `secondary` to `primary` because the heading is no longer shouting for attention through letter-spacing and no longer needs to be dimmed to compensate.

- [ ] **Step 3: Confirm nothing else relied on the uppercasing**

```bash
grep -rn "letterSpacing: '0.15em'" "apps/admin/app/(dashboard)/overview/"
```

Expected: no matches. Any survivor is a secondary label deliberately left alone in Step 1 — check it reads correctly in the browser rather than changing it reflexively.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @fit/admin type-check
pnpm --filter @fit/admin test
pnpm --filter @fit/admin lint
pnpm check:tailwind-guardrail
```

Expected: all clean, 49 tests passing.

Then look at `http://localhost:3002/admin` once more: the headings should sit quietly above their content instead of competing with it, in both light and dark themes.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(dashboard)/overview"
git commit -m "style(dashboard): stop the card headings shouting

Every heading on the page was uppercase at .15em tracking and weight 700.
Six copies of one treatment is most of why the overview read as an older
dashboard, and it made each heading compete with the number beneath it.

Sentence case at 600 and a neutral tracking, one shade darker now that it
no longer needs dimming to stay out of the way. The strings were already
sentence case, so neither locale changes."
```

---

## Self-Review

**Spec coverage**

| Spec section                                                  | Task                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| §1 The filter split                                           | Task 3                                                                                              |
| §2 Components — `dashboard-header.tsx`                        | Task 3                                                                                              |
| §2 Components — `metric-strip.tsx`, `kpi-cards.tsx` deleted   | Task 4                                                                                              |
| §2 Components — `recent-activity-card.tsx`                    | Task 5                                                                                              |
| §2 Components — `overview-view.tsx` rewritten                 | Tasks 3, 4, 5, 6                                                                                    |
| §3 Layout — two tiers, work area, sticky rail, span-2 removal | Tasks 4, 6                                                                                          |
| §4 Visual pass — headings, KPI chrome, icon tiles             | Tasks 4, 7                                                                                          |
| §5 ARIA — tab↔panel, no `tabIndex` on the panel               | Task 1                                                                                              |
| §6 Error handling — unchanged                                 | No task; `page.tsx`'s `ApiError` path and `SegmentPanel`'s retry are untouched by every task above. |
| §7 Testing — all five test files                              | Tasks 1–5                                                                                           |
| §8 Risks — sticky offset, Georgian label width                | Task 6 Step 4 checks both in the browser                                                            |

**Known gaps, deliberate:** the spec's `revenue-card.tsx` range toggle keeps its current styling; only its `gridColumn` and heading change. `in-gym-now.tsx` moves into the rail without internal changes.

**Type consistency:** `MetricStrip({ data })`, `RecentActivityCard({ data })` and `DashboardHeader({ active, period, range })` are used in Tasks 3–6 exactly as declared in their Interfaces blocks. `DashboardResolvedPeriod` is the exported name in `packages/types/src/dashboard.ts:116`. `navigationMock` exposes `replace` / `push` / `refresh` / `setSearch` / `reset` / `factory`, and Tasks 2 and 3 use only those.
