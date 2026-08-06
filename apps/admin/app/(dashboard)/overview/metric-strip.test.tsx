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
