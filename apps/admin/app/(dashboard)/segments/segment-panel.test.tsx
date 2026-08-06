import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardSegmentResponse } from '@fit/types';

const loadSegmentAction = vi.fn();
vi.mock('./actions', () => ({
  loadSegmentAction: (...args: unknown[]): unknown => loadSegmentAction(...args) as unknown,
}));

const { SegmentPanel } = await import('./segment-panel');

const messages = {
  admin: {
    dashboard: {
      segments: {
        retry: 'Retry',
        loadError: "Couldn't load this segment.",
        empty: 'No widgets in this segment yet.',
      },
      widgets: {},
    },
    // Matches the real `admin.reports.drilldown.emptySection` key `WidgetGrid`
    // passes `ReportSectionCard` — kept in sync so the suite never emits a
    // MISSING_MESSAGE warning for a key production doesn't actually look up.
    reports: { drilldown: { emptySection: 'No data' } },
  },
};

function response(title: string): DashboardSegmentResponse {
  return {
    segment: 'sales',
    range: '7d',
    currency: 'GEL',
    widgets: [
      {
        key: 'sales.top-plans',
        size: 'md',
        section: { kind: 'series', id: 'revenue-by-plan', title, unit: 'money', points: [] },
      },
    ],
  };
}

function panel(segment: 'sales' | 'members', range: '7d' | '30d' = '7d') {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentPanel segment={segment} range={range} />
    </NextIntlClientProvider>
  );
}

function renderPanel(segment: 'sales' | 'members' = 'sales') {
  return render(panel(segment));
}

describe('SegmentPanel', () => {
  beforeEach(() => {
    loadSegmentAction.mockReset();
    loadSegmentAction.mockResolvedValue({ ok: true, data: response('Top plans') });
  });

  it('fetches the segment and renders its widgets', async () => {
    renderPanel();
    expect(await screen.findByText('Top plans')).toBeInTheDocument();
    expect(loadSegmentAction).toHaveBeenCalledWith('sales', '7d');
  });

  // The cache is what makes the transition animate instead of spin.
  it('does not refetch a segment it has already loaded', async () => {
    const { rerender } = renderPanel('sales');
    await screen.findByText('Top plans');

    loadSegmentAction.mockResolvedValue({ ok: true, data: response('New members') });
    rerender(panel('members'));
    await screen.findByText('New members');

    rerender(panel('sales'));
    await screen.findByText('Top plans');

    expect(loadSegmentAction).toHaveBeenCalledTimes(2);
  });

  it('refetches when the range changes', async () => {
    const { rerender } = renderPanel('sales');
    await screen.findByText('Top plans');

    rerender(panel('sales', '30d'));

    await waitFor(() => expect(loadSegmentAction).toHaveBeenCalledWith('sales', '30d'));
  });

  // A failed segment must not take the rest of the dashboard down with it.
  it('offers a retry when the fetch fails', async () => {
    loadSegmentAction.mockResolvedValue({ ok: false, error: 'boom' });
    renderPanel();

    expect(await screen.findByText("Couldn't load this segment.")).toBeInTheDocument();

    loadSegmentAction.mockResolvedValue({ ok: true, data: response('Top plans') });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Top plans')).toBeInTheDocument();
  });

  it('states plainly when a segment resolves to no widgets', async () => {
    loadSegmentAction.mockResolvedValue({
      ok: true,
      data: { ...response('x'), widgets: [] },
    });
    renderPanel();
    expect(await screen.findByText('No widgets in this segment yet.')).toBeInTheDocument();
  });

  // Regression (fix round 1, Finding 1): `attempt` used to gate every cache
  // hit, not just the retried segment's — so retrying ANY segment quietly
  // defeated the cache for EVERY segment, forever. Reproduces the reviewer's
  // exact sequence: cache `sales`, fail + retry `members`, come back to
  // `sales` — it must be served from cache, not refetched.
  it('keeps other segments cached across an unrelated retry', async () => {
    const { rerender } = renderPanel('sales');
    await screen.findByText('Top plans');
    expect(loadSegmentAction).toHaveBeenCalledTimes(1);

    loadSegmentAction.mockResolvedValueOnce({ ok: false, error: 'boom' });
    rerender(panel('members'));
    await screen.findByText("Couldn't load this segment.");
    expect(loadSegmentAction).toHaveBeenCalledTimes(2);

    loadSegmentAction.mockResolvedValueOnce({ ok: true, data: response('New members') });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('New members');
    expect(loadSegmentAction).toHaveBeenCalledTimes(3);

    // The retry above must not have poisoned `sales`'s cache entry.
    rerender(panel('sales'));
    await screen.findByText('Top plans');
    expect(loadSegmentAction).toHaveBeenCalledTimes(3);
  });

  // Regression (fix round 1, Finding 2): switching away and back to the
  // segment already on screen, inside the 120ms exit window, used to leave
  // the panel stuck in the "exiting" phase forever (the timeout that would
  // have cleared it gets cancelled by the bounce-back, and the early return
  // for "nothing to swap" never reset the flag). `data-phase` is a plain
  // attribute standing in for the `exiting`/`entering` StyleX classes, which
  // the test-only StyleX shim collapses to one fixed class and so cannot
  // observe — see apps/admin/test/stylex-mock.ts.
  it('resets the swap instead of sticking exited when the tab bounces back to the segment already shown', async () => {
    const { rerender } = renderPanel('sales');
    await screen.findByText('Top plans');
    expect(screen.getByTestId('segment-panel')).toHaveAttribute('data-phase', 'entering');

    // Switch away — starts the 120ms exit before `shown` itself flips.
    rerender(panel('members'));
    expect(screen.getByTestId('segment-panel')).toHaveAttribute('data-phase', 'exiting');

    // Bounce back to `sales` before that timer fires. `shown` never stopped
    // being `sales`, so this must cancel the exit and rest — not hang faded out.
    rerender(panel('sales'));
    expect(screen.getByTestId('segment-panel')).toHaveAttribute('data-phase', 'entering');
  });
});
