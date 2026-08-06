import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ConfigurableDashboardSegment, DashboardOverviewResponse } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';

vi.mock('next/navigation', () => navigationMock.factory());

// The shell's job is routing and mounting, not rendering. Standing in for
// these children keeps this test on the shell's own logic and off the chart,
// dialog and fetch machinery they each drag in. `DashboardHeader` is left
// real (not mocked) — Step 7 wired it directly into the shell, and a mock
// here would hide whether that wiring actually works.
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

// A real resolved period, not `{}` — the header (rendered for real, not
// mocked) reads `overview.period` directly.
const overviewFixture = {
  period: { period: 'today', from: '2026-08-07', to: '2026-08-07' },
} as DashboardOverviewResponse;

function renderShell(initialSegment: 'overview' | ConfigurableDashboardSegment = 'overview') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentedDashboard
        overview={overviewFixture}
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

  // The bug this shell fixes: the header used to live inside OverviewView, so
  // every other tab opened untitled. Assert the real (unmocked) header
  // renders its title on a segment tab, not just on Overview.
  it('titles the page on a segment tab, not just on Overview', () => {
    navigationMock.setSearch('segment=members');
    renderShell('members');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  // The load-bearing one. `initialSegment` is the server's parse of the URL at
  // request time; `?segment=` is what the URL says NOW, and every client-side tab
  // switch moves the second without the first. So the two are made to disagree
  // here, and the query has to win — without this case, deleting the URL parse
  // outright and returning `initialSegment` would still pass every other test,
  // because in all of them the prop and the expected answer coincide.
  it('prefers the live query over the segment the server first rendered', () => {
    navigationMock.setSearch('segment=members');
    renderShell('overview');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'dashboard-tab-members',
    );
    expect(screen.queryByTestId('overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('panel')).toHaveTextContent('members');
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
          overview={overviewFixture}
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
