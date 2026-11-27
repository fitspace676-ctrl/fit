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
      },
    },
  },
};

const period: DashboardResolvedPeriod = { period: 'today', from: '2026-08-07', to: '2026-08-07' };

function renderHeader(
  active: DashboardSegment = 'overview',
  resolved: DashboardResolvedPeriod = period,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardHeader active={active} period={resolved} />
    </NextIntlClientProvider>,
  );
}

describe('DashboardHeader', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it('titles the page on every tab', () => {
    renderHeader('staff');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  // Each tab gets the filter that changes something on it, and only that one:
  // period drives the overview's KPI numbers, range drives segment widgets.
  it('offers the period filter on Overview and no range filter', () => {
    renderHeader('overview');
    expect(screen.getByRole('radiogroup', { name: 'Dashboard period' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Widget range' })).not.toBeInTheDocument();
  });

  // The period decides every tab's window, so every tab offers it: Sales,
  // Members, Revenue, Classes and Staff all read the overview's resolved window.
  it.each(['sales', 'members', 'revenue', 'classes', 'staff'] as const)(
    'offers the same period filter on the %s tab',
    (segment) => {
      renderHeader(segment);
      expect(screen.getByRole('radiogroup', { name: 'Dashboard period' })).toBeInTheDocument();
    },
  );

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

  // `selectCustomRange` (including its `if (!next) return` guard and its
  // `period=custom` write) is the only path in this file with no coverage
  // above. Astryx's `DateRangeInput` opens a native-Popover-API surface and
  // hands back a range only once two Calendar day cells are clicked; drive it
  // for real rather than reaching around it, per §7.
  it('offers the date picker only for a custom period, and names a preset window', () => {
    renderHeader('overview');
    expect(screen.queryByRole('button', { name: /Custom date range/ })).toBeNull();
    // The window the figures cover, in the operator's words (no dash).
    expect(screen.getByText('August 7')).toBeInTheDocument();
  });

  it('writes a custom range and switches the period to custom', async () => {
    navigationMock.setSearch('segment=sales&period=custom');
    renderHeader('overview', { ...period, period: 'custom' });

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
