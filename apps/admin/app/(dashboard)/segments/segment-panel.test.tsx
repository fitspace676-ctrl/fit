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
    reports: { drilldown: { empty: 'No data' } },
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

function renderPanel(segment: 'sales' | 'members' = 'sales') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentPanel segment={segment} range="7d" />
    </NextIntlClientProvider>,
  );
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
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SegmentPanel segment="members" range="7d" />
      </NextIntlClientProvider>,
    );
    await screen.findByText('New members');

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SegmentPanel segment="sales" range="7d" />
      </NextIntlClientProvider>,
    );
    await screen.findByText('Top plans');

    expect(loadSegmentAction).toHaveBeenCalledTimes(2);
  });

  it('refetches when the range changes', async () => {
    const { rerender } = renderPanel('sales');
    await screen.findByText('Top plans');

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SegmentPanel segment="sales" range="30d" />
      </NextIntlClientProvider>,
    );

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
});
