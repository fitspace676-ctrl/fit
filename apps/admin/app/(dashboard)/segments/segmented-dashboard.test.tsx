import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import {
  DASHBOARD_SEGMENTS,
  type DashboardOverviewResponse,
  type DashboardSegment,
} from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ActiveLocationProvider } from '@/components/active-location';

vi.mock('next/navigation', () => navigationMock.factory());

// The shell's job is routing and mounting, not rendering. Standing in for these
// children keeps this test on the shell's own logic and off the chart and fetch
// machinery they each drag in. `DashboardHeader` is left real — a mock here would
// hide whether the shell still wires it correctly.
//
// One mock per tab, and that IS the shell now: the panel, the picker and the
// selection plumbing this file used to cover went with the widget catalogue.
vi.mock('../overview/overview-view', () => ({ OverviewView: () => <div>Overview view</div> }));
vi.mock('../sales/sales-view', () => ({ SalesView: () => <div>Sales view</div> }));
vi.mock('../member-retention/members-view', () => ({ MembersView: () => <div>Members view</div> }));
vi.mock('../revenue-insights/revenue-view', () => ({ RevenueView: () => <div>Revenue view</div> }));
vi.mock('../class-insights/classes-view', () => ({ ClassesView: () => <div>Classes view</div> }));
vi.mock('../staff-insights/staff-view', () => ({ StaffView: () => <div>Staff view</div> }));

const { SegmentedDashboard } = await import('./segmented-dashboard');

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
      },
      segments: {
        aria: 'Dashboard segments',
        overview: 'Overview',
        sales: 'Sales',
        members: 'Members',
        revenue: 'Revenue',
        classes: 'Classes',
        staff: 'Staff',
      },
      branchScope: {
        overview: 'Occupancy, check-ins, members and subscriptions are gym-wide.',
        members: 'Not split by branch - members have no home branch yet.',
        staff: 'Not split by branch - trainers, PT sessions and shifts have no branch yet.',
        revenue: 'Recurring revenue, MRR, the projection and outstanding invoices are gym-wide.',
        classes: 'PT sessions are gym-wide.',
      },
    },
    common: { notSplitByBranch: 'Not split by branch' },
  },
};

/** The branch-scope caveat each tab carries, or `null` when it carries none. */
// `null` means the tab filters completely and must carry NO caveat. Members and
// Revenue moved to `null` in Stage 2 (the member gained a home branch, and every
// subscription and invoice figure inherits it through the member who holds it);
// Overview followed in Stage 3, once check-ins recorded the branch walked into.
// Each was a false statement by then, not merely a stale one.
const SCOPE_NOTE: Record<DashboardSegment, string | null> = {
  overview: null,
  sales: null,
  members: null,
  revenue: null,
  classes: messages.admin.dashboard.branchScope.classes,
  staff: messages.admin.dashboard.branchScope.staff,
};

const LOCATIONS = [
  { id: 'loc-downtown', name: 'Downtown' },
  { id: 'loc-harbour', name: 'Harbour' },
];

/** What each tab's stand-in renders, keyed by tab. */
const VIEW_TEXT: Record<DashboardSegment, string> = {
  overview: 'Overview view',
  sales: 'Sales view',
  members: 'Members view',
  revenue: 'Revenue view',
  classes: 'Classes view',
  staff: 'Staff view',
};

// A real resolved period, not `{}` — the header (rendered for real, not mocked)
// reads `overview.period` directly.
const overviewFixture = {
  period: { period: 'today', from: '2026-08-07', to: '2026-08-07' },
} as DashboardOverviewResponse;

/**
 * @param activeLocation the branch the console is scoped to — `'all'` (the
 *   default) or a live location id, exactly as the provider spells it.
 */
function renderShell(initialSegment: DashboardSegment = 'overview', activeLocation = 'all') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider initial="dark">
        <ActiveLocationProvider initial={activeLocation} locations={LOCATIONS}>
          <SegmentedDashboard overview={overviewFixture} initialSegment={initialSegment} />
        </ActiveLocationProvider>
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe('SegmentedDashboard', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it.each(DASHBOARD_SEGMENTS)('renders the %s tab and labels the panel with it', (segment) => {
    navigationMock.setSearch(`segment=${segment}`);
    const { unmount } = renderShell(segment);

    expect(screen.getByText(VIEW_TEXT[segment])).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      `dashboard-tab-${segment}`,
    );
    // Exactly one view at a time — no tab is left mounted behind another.
    for (const other of DASHBOARD_SEGMENTS.filter((value) => value !== segment)) {
      expect(screen.queryByText(VIEW_TEXT[other])).not.toBeInTheDocument();
    }
    unmount();
  });

  // The bug this shell fixed: the header used to live inside OverviewView, so
  // every other tab opened untitled.
  it('titles the page on every tab, not just on Overview', () => {
    navigationMock.setSearch('segment=staff');
    renderShell('staff');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  // The load-bearing one. `initialSegment` is the server's parse of the URL at
  // request time; `?segment=` is what the URL says NOW, and every client-side tab
  // switch moves the second without the first. So the two are made to disagree
  // here, and the query has to win — without this case, deleting the URL parse
  // outright and returning `initialSegment` would still pass every other test.
  it('prefers the live query over the segment the server first rendered', () => {
    navigationMock.setSearch('segment=classes');
    renderShell('overview');
    expect(screen.getByText('Classes view')).toBeInTheDocument();
    expect(screen.queryByText('Overview view')).not.toBeInTheDocument();
  });

  // `?segment=` is user-editable. An unrecognised value must land on the default.
  it('falls back to the default segment on an unrecognised query value', () => {
    navigationMock.setSearch('segment=not-a-segment');
    renderShell('overview');
    expect(screen.getByText('Overview view')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'dashboard-tab-overview',
    );
  });

  it('drops the segment param entirely when returning to the default tab', async () => {
    navigationMock.setSearch('segment=staff&range=30d');
    renderShell('staff');
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?range=30d');
  });

  it('writes the chosen segment to the query without touching the other params', async () => {
    navigationMock.setSearch('range=30d');
    renderShell('overview');
    await userEvent.click(screen.getByRole('tab', { name: 'Revenue' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?range=30d&segment=revenue');
  });
});

// The point of the branch filter's first stage: several figures on these tabs
// are NOT narrowed by it, and the console — not the API, which has no field for
// it — has to say which. A tab that quietly showed a gym-wide number under a
// branch heading would be the one failure mode worth shipping this note for.
describe('SegmentedDashboard branch-scope note', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it.each(DASHBOARD_SEGMENTS.filter((segment) => SCOPE_NOTE[segment] !== null))(
    'warns on the %s tab that some figures stay gym-wide under a branch',
    (segment) => {
      navigationMock.setSearch(`segment=${segment}&locationId=loc-harbour`);
      const { unmount } = renderShell(segment, 'loc-harbour');

      const note = screen.getByRole('note');
      expect(note).toHaveTextContent(SCOPE_NOTE[segment] as string);
      // Named for a screen reader, which would otherwise announce a bare note.
      expect(note).toHaveAccessibleName('Not split by branch');
      unmount();
    },
  );

  // A caveat on a tab that filters completely teaches the reader to distrust a
  // number that is correct — which is why these are asserted absent by name
  // rather than simply left out of the table-driven case above.
  it.each(DASHBOARD_SEGMENTS.filter((segment) => SCOPE_NOTE[segment] === null))(
    'leaves the %s tab unannotated, because it filters completely',
    (segment) => {
      navigationMock.setSearch(`segment=${segment}&locationId=loc-harbour`);
      const { unmount } = renderShell(segment, 'loc-harbour');
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      unmount();
    },
  );

  // In "All locations" the caveat is not redundant, it is false: every figure on
  // the tab really is the whole gym, which is what was asked for.
  it.each(DASHBOARD_SEGMENTS)('shows no note on the %s tab in all-locations mode', (segment) => {
    navigationMock.setSearch(`segment=${segment}`);
    const { unmount } = renderShell(segment, 'all');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    unmount();
  });

  // The note has to be met BEFORE the numbers it qualifies, not after scrolling
  // past them — which is why it lives in the shell rather than inside each view.
  it('places the note ahead of the tab content', () => {
    navigationMock.setSearch('segment=classes&locationId=loc-harbour');
    renderShell('classes', 'loc-harbour');
    const panel = screen.getByRole('tabpanel');
    const note = screen.getByRole('note');
    const view = screen.getByText('Classes view');
    expect(panel).toContainElement(note);
    expect(note.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
