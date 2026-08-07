import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardResolvedPeriod, DashboardSegment } from '@fit/types';
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

function renderHeader(active: DashboardSegment = 'overview') {
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
    renderHeader('revenue');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  // Each tab gets the filter that changes something on it, and only that one:
  // period drives the overview's KPI numbers, range drives segment widgets.
  it('offers the period filter on Overview and no range filter', () => {
    renderHeader('overview');
    expect(screen.getByRole('radiogroup', { name: 'Dashboard period' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Widget range' })).not.toBeInTheDocument();
  });

  it('offers the range filter on a segment tab and no period filter', () => {
    renderHeader('revenue');
    expect(screen.getByRole('radiogroup', { name: 'Widget range' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Dashboard period' })).not.toBeInTheDocument();
  });

  // Sales and Members are hand-built and read no URL param: each has its own
  // granularity control picking the window. A `?range=` here would be a second,
  // DEAD time filter sitting forty pixels above a live one — and one that still
  // fires a navigation, so it would read as broken rather than absent.
  it.each(['sales', 'members'] as const)('offers neither filter on the %s tab', (segment) => {
    renderHeader(segment);
    expect(screen.queryByRole('radiogroup', { name: 'Widget range' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Dashboard period' })).not.toBeInTheDocument();
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
    renderHeader('revenue');
    await userEvent.click(screen.getByRole('radio', { name: '30d' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?segment=revenue&range=30d');
  });

  // `selectCustomRange` (including its `if (!next) return` guard and its
  // `period=custom` write) is the only path in this file with no coverage
  // above. Astryx's `DateRangeInput` opens a native-Popover-API surface and
  // hands back a range only once two Calendar day cells are clicked; drive it
  // for real rather than reaching around it, per §7.
  it('writes a custom range and switches the period to custom', async () => {
    navigationMock.setSearch('segment=sales');
    renderHeader('overview');

    await userEvent.click(screen.getByRole('button', { name: /Custom date range/ }));
    // `period.from`/`period.to` are both 2026-08-07, so the calendar opens on
    // August 2026 without needing to page months.
    await userEvent.click(screen.getByRole('button', { name: /August 3, 2026/ }));
    await userEvent.click(screen.getByRole('button', { name: /August 10, 2026/ }));

    expect(navigationMock.replace).toHaveBeenCalledWith(
      '/?segment=sales&period=custom&from=2026-08-03&to=2026-08-10',
    );
  });
});
