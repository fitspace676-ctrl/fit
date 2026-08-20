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
    },
  },
};

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

function renderShell(initialSegment: DashboardSegment = 'overview') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeProvider initial="dark">
        <SegmentedDashboard overview={overviewFixture} initialSegment={initialSegment} />
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
