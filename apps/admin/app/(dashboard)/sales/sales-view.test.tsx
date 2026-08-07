import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardSalesResponse } from '@fit/types';

const loadSalesAction = vi.fn();
vi.mock('./actions', () => ({
  loadSalesAction: (...args: unknown[]): unknown => loadSalesAction(...args) as unknown,
}));

const { SalesView } = await import('./sales-view');

const messages = {
  admin: {
    dashboard: {
      sales: {
        granularityLabel: 'Granularity',
        granularity: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' },
        window: { daily: 'Last 30 days', weekly: 'Last 12 weeks', monthly: 'Last 12 months' },
        productTypeLabel: 'Product type',
        productType: {
          all: 'All sales',
          memberships: 'Memberships',
          'session-packs': 'Class & PT packs',
          retail: 'Retail & POS',
        },
        kpi: {
          grossSales: 'Gross sales',
          netSales: 'Net sales',
          refunded: 'Refunded',
          avgSale: 'Avg sale',
        },
        kpiCaption: '{window} · {productType}',
        refundedHint: 'Against sales in this window',
        trend: {
          title: 'Revenue over time',
          caption: '{window} · {productType} · {total} net',
          chartAria: 'Net revenue per period',
          empty: 'No revenue in this window.',
        },
        vsRefunds: {
          title: 'New sales vs refunds',
          caption: 'Each dated by when it was taken',
          chartAria: 'Sales against refunds per period',
          sales: 'Sales',
          refunds: 'Refunds',
          empty: 'No sales or refunds in this window.',
        },
        method: {
          title: 'Sales by payment method',
          share: 'POS {pos}% · Online {online}%',
          channel: { pos: 'POS', online: 'Online' },
          name: { cash: 'Cash', card: 'Card', 'member-account': 'Member account' },
          row: '{channel} · {name}',
          empty: 'No payments in this window.',
        },
        topSellers: {
          title: 'Top sellers',
          orders: '{count, plural, one {# order} other {# orders}}',
          empty: 'Nothing sold in this window.',
        },
        loadError: "Couldn't load sales.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardSalesResponse> = {}): DashboardSalesResponse {
  return {
    granularity: 'daily',
    productType: 'all',
    currency: 'GEL',
    kpis: { grossSales: 16_000, netSales: 14_000, refunded: 2_000, avgSale: 7_000 },
    revenueOverTime: [
      { label: '2026-08-01', value: 9_000 },
      { label: '2026-08-02', value: 5_000 },
    ],
    salesVsRefunds: [
      { label: '2026-08-01', sales: 10_000, refunds: 0 },
      { label: '2026-08-02', sales: 6_000, refunds: 2_000 },
    ],
    byPaymentMethod: [{ channel: 'pos', method: 'cash', value: 14_000 }],
    topSellers: [{ label: 'Premium', orders: 2, value: 14_000 }],
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SalesView />
    </NextIntlClientProvider>,
  );
}

describe('SalesView', () => {
  beforeEach(() => {
    loadSalesAction.mockReset();
    loadSalesAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('fetches with the defaults and renders every card', async () => {
    renderView();

    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
    expect(screen.getByText('New sales vs refunds')).toBeInTheDocument();
    expect(screen.getByText('Sales by payment method')).toBeInTheDocument();
    expect(screen.getByText('Top sellers')).toBeInTheDocument();
    expect(screen.getByText('Gross sales')).toBeInTheDocument();
    expect(loadSalesAction).toHaveBeenCalledWith({ granularity: 'daily', productType: 'all' });
  });

  // The whole tab carries money in MINOR units and every card divides by 100
  // itself. Nothing else in this suite asserts a formatted figure, so adding a
  // stray `/ 100` in `SalesView` — or dropping one from a card — would leave the
  // entire admin suite green. These are the assertions that fail if it happens.
  it('renders money in major units, once divided, in every card', async () => {
    renderView();
    await screen.findByText('Revenue over time');

    // KPI strip: 16_000 / 14_000 / 2_000 / 7_000 minor units.
    expect(screen.getByText('GEL 160')).toBeInTheDocument();
    expect(screen.getByText('GEL 20')).toBeInTheDocument();
    expect(screen.getByText('GEL 70')).toBeInTheDocument();
    // Four sites land on 140: the strip's net sales (14_000), the trend
    // caption's net total (9_000 + 5_000), the payment-method bar and the top
    // seller (14_000 each). Asserting the count pins all four at once — a card
    // that stopped dividing would drop out of this set.
    expect(screen.getAllByText(/GEL 140/)).toHaveLength(4);
  });

  it('refetches when the granularity changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Revenue over time');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));

    await waitFor(() =>
      expect(loadSalesAction).toHaveBeenCalledWith({
        granularity: 'monthly',
        productType: 'all',
      }),
    );
  });

  it('refetches when the product type changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Revenue over time');

    await user.click(screen.getByRole('radio', { name: 'Memberships' }));

    await waitFor(() =>
      expect(loadSalesAction).toHaveBeenCalledWith({
        granularity: 'daily',
        productType: 'memberships',
      }),
    );
  });

  // The cache is what makes flipping between two combinations feel instant.
  it('serves a revisited combination from cache without a second call', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Revenue over time');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));
    await waitFor(() => expect(loadSalesAction).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('radio', { name: 'Daily' }));
    await waitFor(() => expect(screen.getByText('Revenue over time')).toBeInTheDocument());
    expect(loadSalesAction).toHaveBeenCalledTimes(2);
  });

  it('shows an alert and a working retry when the load fails', async () => {
    const user = userEvent.setup();
    loadSalesAction.mockResolvedValueOnce({ ok: false, error: "Couldn't load sales." });
    renderView();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load sales.");

    loadSalesAction.mockResolvedValue({ ok: true, data: response() });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Revenue over time')).toBeInTheDocument();
  });

  it('shows each card its own empty state', async () => {
    loadSalesAction.mockResolvedValue({
      ok: true,
      data: response({
        kpis: { grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 },
        revenueOverTime: [{ label: '2026-08-01', value: 0 }],
        salesVsRefunds: [{ label: '2026-08-01', sales: 0, refunds: 0 }],
        byPaymentMethod: [],
        topSellers: [],
      }),
    });
    renderView();

    expect(await screen.findByText('No revenue in this window.')).toBeInTheDocument();
    expect(screen.getByText('No sales or refunds in this window.')).toBeInTheDocument();
    expect(screen.getByText('No payments in this window.')).toBeInTheDocument();
    expect(screen.getByText('Nothing sold in this window.')).toBeInTheDocument();
  });

  // Coverage gap named by the task-10 review: `SalesVsRefundsCard`'s hasData
  // check is OR-semantics (`primary !== 0 || secondary !== 0`) — a bucket with
  // refunds but no sales must still count as having data, so the card renders
  // the chart rather than its empty state. The brief's own empty-state test only
  // exercises the all-zero case; this exercises the "one side non-zero" branch.
  it('renders the sales-vs-refunds chart when a bucket has refunds but no sales', async () => {
    loadSalesAction.mockResolvedValue({
      ok: true,
      data: response({
        salesVsRefunds: [{ label: '2026-08-01', sales: 0, refunds: 2_000 }],
      }),
    });
    renderView();

    await screen.findByText('New sales vs refunds');
    expect(screen.queryByText('No sales or refunds in this window.')).not.toBeInTheDocument();
  });
});
