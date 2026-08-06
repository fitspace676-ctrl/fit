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
    expect(screen.getByRole('radiogroup', { name: 'Dashboard period' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Widget range' })).not.toBeInTheDocument();
  });

  it('offers the range filter on a segment tab and no period filter', () => {
    renderHeader('sales');
    expect(screen.getByRole('radiogroup', { name: 'Widget range' })).toBeInTheDocument();
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
    renderHeader('sales');
    await userEvent.click(screen.getByRole('radio', { name: '30d' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/?segment=revenue&range=30d');
  });
});
