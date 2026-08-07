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
    expect(within(strip).getByText((_, node) => node?.textContent === '▲8%')).toBeInTheDocument();
    expect(within(strip).getByText((_, node) => node?.textContent === '▼3%')).toBeInTheDocument();
    expect(within(strip).getByText((_, node) => node?.textContent === '▲12%')).toBeInTheDocument();
    expect(
      within(strip).queryByText((_, node) => node?.textContent === '▲0%'),
    ).not.toBeInTheDocument();
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

/*
 * The hairlines are the 1px grid gap showing the container's border colour
 * through, with each cell painting over it. That makes an UNFILLED grid area a
 * solid block of border colour rather than empty space — so the tier's cell
 * count has to tile at every breakpoint, and the filler cells exist for that.
 *
 * There used to be exactly one, hand-placed, correct only for exactly five
 * tiles. Adding a sixth would have broken the layout silently and only at some
 * widths. These tests turn that into a loud failure.
 */
describe('metric strip tiling', () => {
  function tierTwo(): Element {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <MetricStrip data={overview()} />
      </NextIntlClientProvider>,
    );
    // The strip is two tier rows; the second holds the standing counts.
    const strip = screen.getByRole('group', { name: 'Key metrics' });
    const tiers = [...strip.children];
    const last = tiers[tiers.length - 1];
    if (!last) throw new Error('no second tier');
    return last;
  }

  it('tiles the second tier at both the 2-column and 3-column breakpoints', () => {
    const cells = tierTwo().children.length;
    expect(cells % 2).toBe(0);
    expect(cells % 3).toBe(0);
  });

  // The 1024px+ rule is `repeat(5, …)` and hides the fillers, so it tiles only
  // while there are exactly five real tiles. If this fails, that media query
  // needs its column count changed alongside — it will not adapt on its own.
  it('still has the five real tiles the 5-column breakpoint assumes', () => {
    const real = [...tierTwo().children].filter((el) => el.getAttribute('aria-hidden') !== 'true');
    expect(real).toHaveLength(5);
  });
});
