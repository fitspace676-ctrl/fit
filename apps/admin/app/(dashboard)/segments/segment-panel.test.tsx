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
    segment: 'staff',
    range: '7d',
    currency: 'GEL',
    widgets: [
      {
        key: 'staff.sessions-per-trainer',
        size: 'md',
        section: { kind: 'series', id: 'revenue-by-plan', title, unit: 'money', points: [] },
      },
    ],
  };
}

function panel(segment: 'staff', range: '7d' | '30d' = '7d') {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentPanel segment={segment} range={range} />
    </NextIntlClientProvider>
  );
}

function renderPanel(segment: 'staff' = 'staff') {
  return render(panel(segment));
}

describe('SegmentPanel', () => {
  beforeEach(() => {
    loadSegmentAction.mockReset();
    loadSegmentAction.mockResolvedValue({ ok: true, data: response('Peak hours') });
  });

  it('fetches the segment and renders its widgets', async () => {
    renderPanel();
    expect(await screen.findByText('Peak hours')).toBeInTheDocument();
    expect(loadSegmentAction).toHaveBeenCalledWith('staff', '7d');
  });

  // The cache is what makes the transition animate instead of spin. Driven by the
  // RANGE rather than the segment: the cache is keyed on `segment:range`, so both
  // exercise the same path — and with one configurable segment left there is no
  // second one to switch to.
  it('does not refetch a combination it has already loaded', async () => {
    const { rerender } = renderPanel('staff');
    await screen.findByText('Peak hours');

    loadSegmentAction.mockResolvedValue({ ok: true, data: response('Sessions per trainer') });
    rerender(panel('staff', '30d'));
    await screen.findByText('Sessions per trainer');

    rerender(panel('staff', '7d'));
    await screen.findByText('Peak hours');

    expect(loadSegmentAction).toHaveBeenCalledTimes(2);
  });

  it('refetches when the range changes', async () => {
    const { rerender } = renderPanel('staff');
    await screen.findByText('Peak hours');

    rerender(panel('staff', '30d'));

    await waitFor(() => expect(loadSegmentAction).toHaveBeenCalledWith('staff', '30d'));
  });

  // A failed segment must not take the rest of the dashboard down with it.
  it('offers a retry when the fetch fails', async () => {
    loadSegmentAction.mockResolvedValue({ ok: false, error: 'boom' });
    renderPanel();

    expect(await screen.findByText("Couldn't load this segment.")).toBeInTheDocument();

    loadSegmentAction.mockResolvedValue({ ok: true, data: response('Peak hours') });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Peak hours')).toBeInTheDocument();
  });

  it('states plainly when a segment resolves to no widgets', async () => {
    loadSegmentAction.mockResolvedValue({
      ok: true,
      data: { ...response('x'), widgets: [] },
    });
    renderPanel();
    expect(await screen.findByText('No widgets in this segment yet.')).toBeInTheDocument();
  });

  // Regression (fix round 1, Finding 1): `attempt` used to gate every cache hit,
  // not just the retried combination's — so retrying ANYTHING quietly defeated the
  // cache for EVERYTHING, forever. Reproduced across ranges rather than across
  // segments, which is the same cache key and the only form the fixture can take
  // now: cache 7d, fail + retry 30d, come back to 7d — it must be served from
  // cache, not refetched.
  it('keeps other combinations cached across an unrelated retry', async () => {
    const { rerender } = renderPanel('staff');
    await screen.findByText('Peak hours');
    expect(loadSegmentAction).toHaveBeenCalledTimes(1);

    loadSegmentAction.mockResolvedValueOnce({ ok: false, error: 'boom' });
    rerender(panel('staff', '30d'));
    await screen.findByText("Couldn't load this segment.");
    expect(loadSegmentAction).toHaveBeenCalledTimes(2);

    loadSegmentAction.mockResolvedValueOnce({ ok: true, data: response('Sessions per trainer') });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Sessions per trainer');
    expect(loadSegmentAction).toHaveBeenCalledTimes(3);

    // The retry above must not have poisoned the 7d entry.
    rerender(panel('staff', '7d'));
    await screen.findByText('Peak hours');
    expect(loadSegmentAction).toHaveBeenCalledTimes(3);
  });

  // Regression (fix round 1, Finding 2) — DELETED, not skipped.
  //
  // It drove the staged exit/enter swap by rerendering the panel with a DIFFERENT
  // segment, and `classes` was the last one available to switch to. With `staff`
  // alone in the catalogue no caller can hand this component two segments, so the
  // swap machinery it covered is unreachable from the app and the case cannot be
  // written without a cast that lies about the types.
  //
  // The machinery is still in `segment-panel.tsx`. Restore this case from
  // git history (`git log -S "bounces back" -- apps/admin`) the moment a second
  // configurable segment returns — and if none ever does, delete the swap code
  // with it rather than leaving an untested path behind.
});
