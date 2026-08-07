import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardRevenueResponse } from '@fit/types';

const loadRevenueAction = vi.fn();
vi.mock('./actions', () => ({
  loadRevenueAction: (...args: unknown[]): unknown => loadRevenueAction(...args) as unknown,
}));

const { RevenueView } = await import('./revenue-view');

const messages = {
  admin: {
    dashboard: {
      revenue: {
        granularityLabel: 'Granularity',
        granularity: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' },
        window: { daily: 'Last 30 days', weekly: 'Last 12 weeks', monthly: 'Last 12 months' },
        kpi: {
          totalRevenue: 'Total revenue',
          mrr: 'Recurring / mo',
          revenuePerMember: 'Per member',
          outstandingTotal: 'Outstanding',
        },
        kpiCaption: '{window}',
        trend: {
          title: 'Revenue over time',
          caption: 'Memberships against sales & POS',
          chartAria: 'Revenue per period',
          recurring: 'Memberships',
          oneOff: 'Sales & POS',
          empty: 'No revenue in this window.',
        },
        mrr: {
          title: 'Recurring revenue',
          caption: '{total} now',
          chartAria: 'MRR per period',
          note: "Earlier periods are reconstructed from today's plans.",
          empty: 'No active plans to bill yet.',
        },
        projected: {
          title: 'Coming in',
          windowLabel: 'Projection window',
          window: { '7': '7d', '30': '30d' },
          caption: '{total} due in the next {days} days',
          chartAria: 'Scheduled charges per day',
          atRisk: '{count} past due · {total} at risk',
          empty: 'No charges scheduled in this window.',
        },
        outstanding: {
          title: 'Outstanding invoices',
          caption: 'Gym-wide',
          count: '{count} unsettled',
          overdue: '{count} overdue · {total}',
          failed: '{count} failed charges · {total}',
          empty: 'Nothing unsettled.',
        },
        byLocation: {
          title: 'Revenue by location',
          caption: 'Sales & POS only',
          empty: 'No located revenue in this window.',
        },
        loadError: "Couldn't load revenue.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardRevenueResponse> = {}): DashboardRevenueResponse {
  return {
    granularity: 'daily',
    projectionWindow: '7',
    currency: 'GEL',
    kpis: { totalRevenue: 120_00, mrr: 80_00, revenuePerMember: 40_00, outstandingTotal: 15_00 },
    revenueOverTime: [{ label: '2026-08-01', recurring: 80_00, oneOff: 40_00 }],
    mrrOverTime: [{ label: '2026-08-01', value: 80_00 }],
    projected: {
      total: 60_00,
      points: [{ label: '2026-08-07', value: 60_00 }],
      atRiskCount: 0,
      atRiskTotal: 0,
    },
    outstanding: {
      count: 1,
      total: 15_00,
      overdueCount: 0,
      overdueTotal: 0,
      failedCount: 0,
      failedTotal: 0,
    },
    byLocation: null,
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RevenueView />
    </NextIntlClientProvider>,
  );
}

describe('RevenueView', () => {
  beforeEach(() => {
    loadRevenueAction.mockReset();
    loadRevenueAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('loads the tab and renders its cards', async () => {
    renderView();
    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
    expect(screen.getByText('Recurring revenue')).toBeInTheDocument();
    expect(screen.getByText('Coming in')).toBeInTheDocument();
    expect(screen.getByText('Outstanding invoices')).toBeInTheDocument();
    expect(loadRevenueAction).toHaveBeenCalledWith({
      granularity: 'daily',
      projectionWindow: '7',
    });
  });

  // A single-location gym is sent `null`, which is not "no revenue" — the card
  // has no question to answer and must not appear at all.
  it('drops the location card when the API sends null', async () => {
    renderView();
    await screen.findByText('Revenue over time');
    expect(screen.queryByText('Revenue by location')).not.toBeInTheDocument();
  });

  it('renders the location card for a multi-location gym', async () => {
    loadRevenueAction.mockResolvedValue({
      ok: true,
      data: response({ byLocation: [{ location: 'Vake', value: 40_00 }] }),
    });
    renderView();
    expect(await screen.findByText('Revenue by location')).toBeInTheDocument();
    expect(screen.getByText('Vake')).toBeInTheDocument();
  });

  it('refetches on a granularity change and serves a revisited combination from cache', async () => {
    renderView();
    await screen.findByText('Revenue over time');

    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    await screen.findByText('Revenue over time');
    expect(loadRevenueAction).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('radio', { name: 'Daily' }));
    await screen.findByText('Revenue over time');
    expect(loadRevenueAction).toHaveBeenCalledTimes(2);
  });

  it('refetches on a projection-window change', async () => {
    renderView();
    await screen.findByText('Revenue over time');
    await userEvent.click(screen.getByRole('radio', { name: '30d' }));
    await screen.findByText('Revenue over time');
    expect(loadRevenueAction).toHaveBeenLastCalledWith({
      granularity: 'daily',
      projectionWindow: '30',
    });
  });

  // A first load that fails has nothing to show around the alert, so the alert
  // IS the tab.
  it('makes a failed first load the whole tab, with a retry', async () => {
    loadRevenueAction.mockResolvedValue({ ok: false, error: "Couldn't load revenue." });
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load revenue.");
    expect(screen.queryByText('Revenue over time')).not.toBeInTheDocument();

    loadRevenueAction.mockResolvedValue({ ok: true, data: response() });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
  });

  // Once figures are on screen a failure becomes a banner: the controls live
  // inside the cards, so replacing the tab would strand the user on the
  // combination that just failed.
  it('keeps the previous figures on screen when a later load fails', async () => {
    renderView();
    await screen.findByText('Revenue over time');

    loadRevenueAction.mockResolvedValue({ ok: false, error: "Couldn't load revenue." });
    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load revenue.");
    expect(screen.getByText('Revenue over time')).toBeInTheDocument();
  });

  // `loadRevenueAction` resolves its OWN failures, so a rejection here is the
  // call itself failing. Without the catch it leaves a permanent skeleton.
  it('recovers from the action call itself rejecting', async () => {
    loadRevenueAction.mockRejectedValue(new Error('network'));
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load revenue.");
  });
});
