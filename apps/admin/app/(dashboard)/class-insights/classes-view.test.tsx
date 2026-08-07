import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardClassesResponse } from '@fit/types';

const loadClassesAction = vi.fn();
vi.mock('./actions', () => ({
  loadClassesAction: (...args: unknown[]): unknown => loadClassesAction(...args) as unknown,
}));

const { ClassesView } = await import('./classes-view');

const messages = {
  admin: {
    dashboard: {
      classes: {
        granularityLabel: 'Granularity',
        granularity: {
          daily: 'Daily',
          weekly: 'Weekly',
          monthly: 'Monthly',
        },
        window: {
          daily: 'Last 30 days',
          weekly: 'Last 12 weeks',
          monthly: 'Last 12 months',
        },
        kpi: {
          classesHeld: 'Classes held',
          seatsBooked: 'Seats booked',
          noShowRate: 'No-show rate',
          utilizationRate: 'Utilization',
        },
        kpiCaption: '{window}',
        noValue: '—',
        bookings: {
          title: 'Bookings over time',
          caption: 'Seats held, by when the class runs',
          chartAria: 'Seats booked per period',
          empty: 'No bookings in this window.',
        },
        attendance: {
          title: 'Attendance rate',
          caption: 'Of the bookings that were marked',
          chartAria: 'Attendance rate per period',
          coverage: '{coverage}% of finished bookings were marked',
          coverageUnknown: 'No classes have finished in this window yet',
          gapNote: 'Gaps are periods with nothing marked — not 0%.',
          empty: 'Nothing has been marked in this window.',
        },
        utilization: {
          title: 'Utilization',
          caption: 'Seats booked against seats offered',
          chartAria: 'Utilization per period',
          gapNote: 'Gaps are periods with no capacity to fill — not 0%.',
          empty: 'No classes with capacity in this window.',
        },
        pt: {
          title: 'PT sessions',
          caption: 'Booked one-to-one sessions',
          chartAria: 'PT sessions per period',
          empty: 'No PT sessions in this window.',
        },
        topTypes: {
          title: 'Most booked classes',
          caption: 'Top 8 by seats booked',
          row: '{sessions} sessions · {utilization} full',
          empty: 'No classes booked in this window.',
        },
        heatmap: {
          title: 'When demand lands',
          caption: 'Seats booked by weekday and hour (UTC)',
          chartAria: 'Seats booked by weekday and hour',
          weekday: {
            mon: 'Mon',
            tue: 'Tue',
            wed: 'Wed',
            thu: 'Thu',
            fri: 'Fri',
            sat: 'Sat',
            sun: 'Sun',
          },
          empty: 'No bookings to map in this window.',
        },
        loadError: "Couldn't load classes.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardClassesResponse> = {}): DashboardClassesResponse {
  return {
    granularity: 'daily',
    kpis: { classesHeld: 12, seatsBooked: 80, noShowRate: 12.5, utilizationRate: 66.7 },
    bookingsOverTime: [{ label: '2026-08-01', value: 80 }],
    attendanceOverTime: [{ label: '2026-08-01', value: 87.5 }],
    utilizationOverTime: [{ label: '2026-08-01', value: 66.7 }],
    ptSessionsOverTime: [{ label: '2026-08-01', value: 4 }],
    topClassTypes: [{ name: 'Yoga', seatsBooked: 40, sessions: 5, utilizationRate: 80 }],
    demandByHour: Array.from({ length: 7 }, (_, day) =>
      Array.from({ length: 24 }, (_, hour) => (day === 3 && hour === 10 ? 5 : 0)),
    ),
    markedCoverage: 62.5,
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ClassesView />
    </NextIntlClientProvider>,
  );
}

describe('ClassesView', () => {
  beforeEach(() => {
    loadClassesAction.mockReset();
    loadClassesAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('loads the tab and renders its cards', async () => {
    renderView();
    // By ROLE, not text: "Utilization" and "No-show rate" are also KPI tile
    // labels, so a bare text query would match two nodes and pass for the wrong
    // reason.
    expect(await screen.findByRole('heading', { name: 'Bookings over time' })).toBeInTheDocument();
    for (const title of [
      'Attendance rate',
      'Utilization',
      'When demand lands',
      'Most booked classes',
      'PT sessions',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(loadClassesAction).toHaveBeenCalledWith({ granularity: 'daily' });
  });

  it('refetches on a granularity change and serves a revisited value from cache', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'Bookings over time' });

    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    await screen.findByRole('heading', { name: 'Bookings over time' });
    expect(loadClassesAction).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('radio', { name: 'Daily' }));
    await screen.findByRole('heading', { name: 'Bookings over time' });
    expect(loadClassesAction).toHaveBeenCalledTimes(2);
  });

  // `null` means "nothing to measure". Rendering it as 0% would claim nobody
  // turned up in a window where nobody was marked.
  it('renders a null rate as a dash, never as zero', async () => {
    loadClassesAction.mockResolvedValue({
      ok: true,
      data: response({
        kpis: { classesHeld: 0, seatsBooked: 0, noShowRate: null, utilizationRate: null },
        markedCoverage: null,
      }),
    });
    renderView();
    expect(await screen.findByRole('heading', { name: 'Bookings over time' })).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getAllByText('\u2014').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('No classes have finished in this window yet')).toBeInTheDocument();
  });

  it('labels the heatmap rows in the viewer locale', async () => {
    renderView();
    expect(await screen.findByLabelText('Seats booked by weekday and hour')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  // A first load that fails has nothing to show around the alert, so the alert
  // IS the tab.
  it('makes a failed first load the whole tab, with a retry', async () => {
    loadClassesAction.mockResolvedValue({ ok: false, error: "Couldn't load classes." });
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load classes.");
    expect(screen.queryByRole('heading', { name: 'Bookings over time' })).not.toBeInTheDocument();

    loadClassesAction.mockResolvedValue({ ok: true, data: response() });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Bookings over time' })).toBeInTheDocument();
  });

  // Once figures are on screen a failure becomes a banner: the control lives
  // inside a card, so replacing the tab would strand the user on the value that
  // just failed.
  it('keeps the previous figures on screen when a later load fails', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'Bookings over time' });

    loadClassesAction.mockResolvedValue({ ok: false, error: "Couldn't load classes." });
    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load classes.");
    expect(screen.getByRole('heading', { name: 'Bookings over time' })).toBeInTheDocument();
  });

  // `loadClassesAction` resolves its OWN failures, so a rejection here is the
  // call itself failing. Without the catch it leaves a permanent skeleton.
  it('recovers from the action call itself rejecting', async () => {
    loadClassesAction.mockRejectedValue(new Error('network'));
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load classes.");
  });
});
