import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardMembersResponse } from '@fit/types';

const loadMembersAction = vi.fn();
vi.mock('./actions', () => ({
  loadMembersAction: (...args: unknown[]): unknown => loadMembersAction(...args) as unknown,
}));

const { MembersView } = await import('./members-view');

const messages = {
  admin: {
    dashboard: {
      members: {
        granularityLabel: 'Granularity',
        granularity: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' },
        window: { daily: 'Last 30 days', weekly: 'Last 12 weeks', monthly: 'Last 12 months' },
        kpi: {
          activeMembers: 'Active members',
          newSignups: 'New signups',
          churned: 'Churned',
          avgLtv: 'Avg LTV',
        },
        kpiCaption: '{window}',
        active: {
          title: 'Total active members',
          caption: '{window} · {total} now',
          chartAria: 'Active members per period',
          empty: 'No members in this window.',
        },
        signupsVsChurn: {
          title: 'Signups vs cancellations',
          caption: 'Joins against memberships that ended',
          chartAria: 'Signups against cancellations per period',
          signups: 'Signups',
          churned: 'Cancellations',
          empty: 'No joins or cancellations in this window.',
        },
        retention: {
          title: 'Retention rate',
          windowLabel: 'Retention window',
          window: { '30': '30d', '60': '60d', '90': '90d' },
          caption: 'Members still here {days} days on',
          chartAria: 'Retention rate per period',
          gapNote: 'Gaps are periods with nobody to retain — not 0%.',
          empty: 'Not enough history to measure retention yet.',
        },
        status: {
          title: 'Members by status',
          name: {
            trial: 'Trial',
            active: 'Active',
            'past-due': 'Past due',
            frozen: 'Frozen',
            canceled: 'Cancelled',
            expired: 'Expired',
          },
          empty: 'No memberships on record.',
        },
        loadError: "Couldn't load members.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardMembersResponse> = {}): DashboardMembersResponse {
  return {
    granularity: 'daily',
    retentionWindow: '30',
    expiringWindow: '7',
    currency: 'GEL',
    kpis: { activeMembers: 42, newSignups: 5, churned: 2, avgLtv: 18_000 },
    activeOverTime: [
      { label: '2026-08-01', value: 40 },
      { label: '2026-08-02', value: 42 },
    ],
    signupsVsChurn: [
      { label: '2026-08-01', signups: 3, churned: 1 },
      { label: '2026-08-02', signups: 2, churned: 1 },
    ],
    retention: [
      { label: '2026-08-01', value: 90 },
      { label: '2026-08-02', value: 91.5 },
    ],
    byStatus: [
      { status: 'active', count: 30 },
      { status: 'frozen', count: 12 },
    ],
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MembersView />
    </NextIntlClientProvider>,
  );
}

describe('MembersView', () => {
  beforeEach(() => {
    loadMembersAction.mockReset();
    loadMembersAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('fetches with the defaults and renders every card', async () => {
    renderView();

    expect(await screen.findByText('Total active members')).toBeInTheDocument();
    expect(screen.getByText('Signups vs cancellations')).toBeInTheDocument();
    expect(screen.getByText('Retention rate')).toBeInTheDocument();
    expect(screen.getByText('Members by status')).toBeInTheDocument();
    expect(screen.getByText('Active members')).toBeInTheDocument();
    expect(loadMembersAction).toHaveBeenCalledWith({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
    });
  });

  // Three tiles are counts and one is money. Nothing else in this suite asserts a
  // formatted figure, so a stray `/ 100` on a count — or a missing one on the LTV
  // — would leave the whole admin suite green.
  // Scoped to the KPI strip, not the whole tab: the charts now label their last
  // point with a value chip, so a bare `getByText('42')` matches the tile AND
  // the chip. The tile is what this case is about.
  it('renders counts as counts and the LTV as money', async () => {
    renderView();
    await screen.findByText('Total active members');

    const strip = screen.getByText('Active members').closest('div')?.parentElement;
    expect(strip).not.toBeNull();
    expect(within(strip as HTMLElement).getByText('42')).toBeInTheDocument();
    expect(screen.getByText('GEL 180')).toBeInTheDocument();
  });

  it('refetches when the granularity changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Total active members');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));

    await waitFor(() =>
      expect(loadMembersAction).toHaveBeenCalledWith({
        granularity: 'monthly',
        retentionWindow: '30',
        expiringWindow: '7',
      }),
    );
  });

  it('refetches when the retention window changes', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Retention rate');

    await user.click(screen.getByRole('radio', { name: '90d' }));

    await waitFor(() =>
      expect(loadMembersAction).toHaveBeenCalledWith({
        granularity: 'daily',
        retentionWindow: '90',
        expiringWindow: '7',
      }),
    );
  });

  it('serves a revisited combination from cache without a second call', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Total active members');

    await user.click(screen.getByRole('radio', { name: 'Monthly' }));
    await waitFor(() => expect(loadMembersAction).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('radio', { name: 'Daily' }));
    await waitFor(() => expect(screen.getByText('Total active members')).toBeInTheDocument());
    expect(loadMembersAction).toHaveBeenCalledTimes(2);
  });

  it('shows a full-page alert with a working retry when the first load fails', async () => {
    const user = userEvent.setup();
    loadMembersAction.mockResolvedValueOnce({ ok: false, error: "Couldn't load members." });
    renderView();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load members.");

    loadMembersAction.mockResolvedValue({ ok: true, data: response() });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Total active members')).toBeInTheDocument();
  });

  // Losing the controls on a failure would strand the user on the combination
  // that just failed — the Sales tab's review found exactly this.
  it('keeps the controls mounted when a later load fails', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('Total active members');

    loadMembersAction.mockResolvedValue({ ok: false, error: "Couldn't load members." });
    await user.click(screen.getByRole('radio', { name: 'Monthly' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load members.");
    expect(screen.getByRole('radio', { name: 'Daily' })).toBeInTheDocument();
    expect(screen.getByText('Total active members')).toBeInTheDocument();
  });

  // A gap is "nobody to retain", not 0%. The note is what stops a broken line
  // reading as a rendering bug.
  it('explains a retention gap rather than drawing it as zero', async () => {
    loadMembersAction.mockResolvedValue({
      ok: true,
      data: response({
        retention: [
          { label: '2026-08-01', value: null },
          { label: '2026-08-02', value: 91.5 },
        ],
      }),
    });
    renderView();

    expect(
      await screen.findByText('Gaps are periods with nobody to retain — not 0%.'),
    ).toBeInTheDocument();
  });

  it('shows each card its own empty state', async () => {
    loadMembersAction.mockResolvedValue({
      ok: true,
      data: response({
        kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
        activeOverTime: [{ label: '2026-08-01', value: 0 }],
        signupsVsChurn: [{ label: '2026-08-01', signups: 0, churned: 0 }],
        retention: [{ label: '2026-08-01', value: null }],
        byStatus: [],
      }),
    });
    renderView();

    expect(await screen.findByText('No members in this window.')).toBeInTheDocument();
    expect(screen.getByText('No joins or cancellations in this window.')).toBeInTheDocument();
    expect(screen.getByText('Not enough history to measure retention yet.')).toBeInTheDocument();
    expect(screen.getByText('No memberships on record.')).toBeInTheDocument();
  });
});
