import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { DashboardStaffResponse } from '@fit/types';

const loadStaffAction = vi.fn();
vi.mock('./actions', () => ({
  loadStaffAction: (...args: unknown[]): unknown => loadStaffAction(...args) as unknown,
}));

const { StaffView } = await import('./staff-view');

const messages = {
  admin: {
    dashboard: {
      staff: {
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
          trainersDelivering: 'Trainers delivering',
          sessionsDelivered: 'Sessions delivered',
          utilizationRate: 'Trainer utilization',
          scheduledHoursPerWeek: 'Scheduled / week',
        },
        kpiCaption: '{window}',
        noValue: '—',
        sessions: {
          title: 'Sessions delivered',
          caption: 'Classes taught against one-to-one sessions',
          chartAria: 'Sessions delivered per period',
          classes: 'Classes',
          pt: 'PT',
          empty: 'No sessions delivered in this window.',
        },
        utilization: {
          title: 'Trainer utilization',
          caption: 'Delivered hours against stated availability',
          excluded: '{count} trainers have no availability set',
          empty: 'No trainer has availability set yet.',
        },
        perTrainer: {
          title: 'Delivery per trainer',
          caption: 'Top 8 by sessions',
          row: '{classes} classes · {pt} PT · {hours}h',
          empty: 'No sessions delivered in this window.',
        },
        coverage: {
          title: 'Shift coverage',
          caption: 'The standing weekly rota — scheduled, not worked',
          weekday: {
            mon: 'Mon',
            tue: 'Tue',
            wed: 'Wed',
            thu: 'Thu',
            fri: 'Fri',
            sat: 'Sat',
            sun: 'Sun',
          },
          row: '{staff} staff',
          empty: 'No shifts scheduled.',
        },
        gaps: {
          title: 'Blind spots',
          caption: 'What this tab cannot count',
          leave: '{count} staff-days of approved leave',
          noShifts: '{count} staff with no shift scheduled',
          noAvailability: '{count} trainers with no availability set',
          noTrainer: '{count} classes with no trainer assigned',
          invalidShifts: '{count} shifts that do not end after they start',
          none: 'Nothing missing — every figure above is complete.',
        },
        loadError: "Couldn't load staff.",
        retry: 'Retry',
      },
    },
  },
};

function response(over: Partial<DashboardStaffResponse> = {}): DashboardStaffResponse {
  return {
    granularity: 'daily',
    kpis: {
      trainersDelivering: 3,
      sessionsDelivered: 41,
      utilizationRate: 62.5,
      scheduledHoursPerWeek: 120,
    },
    sessionsOverTime: [{ label: '2026-08-01', classes: 6, pt: 2 }],
    trainers: [{ name: 'Ana', classes: 6, pt: 2, sessions: 8, hours: 9.5, utilizationRate: 62.5 }],
    shiftCoverage: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      hours: dayOfWeek < 5 ? 24 : 0,
      staffCount: dayOfWeek < 5 ? 3 : 0,
    })),
    gaps: {
      leaveStaffDays: 0,
      staffWithoutShifts: 0,
      trainersWithoutAvailability: 0,
      classesWithoutTrainer: 0,
      invalidShiftSlots: 0,
    },
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StaffView />
    </NextIntlClientProvider>,
  );
}

describe('StaffView', () => {
  beforeEach(() => {
    loadStaffAction.mockReset();
    loadStaffAction.mockResolvedValue({ ok: true, data: response() });
  });

  it('loads the tab and renders both halves', async () => {
    renderView();
    // By ROLE: several card titles double as KPI tile labels, so a bare text
    // query would match two nodes and pass for the wrong reason.
    expect(await screen.findByRole('heading', { name: 'Sessions delivered' })).toBeInTheDocument();
    for (const title of [
      'Trainer utilization',
      'Shift coverage',
      'Delivery per trainer',
      'Blind spots',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(loadStaffAction).toHaveBeenCalledWith({ granularity: 'daily' });
  });

  it('refetches on a granularity change and serves a revisited value from cache', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'Sessions delivered' });

    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    await screen.findByRole('heading', { name: 'Sessions delivered' });
    expect(loadStaffAction).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('radio', { name: 'Daily' }));
    await screen.findByRole('heading', { name: 'Sessions delivered' });
    expect(loadStaffAction).toHaveBeenCalledTimes(2);
  });

  // A trainer with no availability has nothing to divide by. Charting them at 0%
  // would blame the trainer for the gym's unfilled form.
  it('leaves an unrated trainer out of the utilization chart and says so', async () => {
    loadStaffAction.mockResolvedValue({
      ok: true,
      data: response({
        trainers: [
          { name: 'Ana', classes: 4, pt: 2, sessions: 6, hours: 8, utilizationRate: 40 },
          { name: 'Bo', classes: 1, pt: 0, sessions: 1, hours: 1, utilizationRate: null },
        ],
      }),
    });
    renderView();
    expect(await screen.findByRole('heading', { name: 'Trainer utilization' })).toBeInTheDocument();
    expect(screen.getByText('1 trainers have no availability set')).toBeInTheDocument();
  });

  it('renders a null utilization KPI as a dash, never as zero', async () => {
    loadStaffAction.mockResolvedValue({
      ok: true,
      data: response({
        kpis: {
          trainersDelivering: 0,
          sessionsDelivered: 0,
          utilizationRate: null,
          scheduledHoursPerWeek: 0,
        },
      }),
    });
    renderView();
    expect(await screen.findByRole('heading', { name: 'Sessions delivered' })).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('states the gaps when there are any, and says so when there are none', async () => {
    renderView();
    expect(await screen.findByText(/Nothing missing/)).toBeInTheDocument();

    loadStaffAction.mockResolvedValue({
      ok: true,
      data: response({
        gaps: {
          leaveStaffDays: 3,
          staffWithoutShifts: 0,
          trainersWithoutAvailability: 2,
          classesWithoutTrainer: 0,
          invalidShiftSlots: 0,
        },
      }),
    });
    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));

    expect(await screen.findByText('2 trainers with no availability set')).toBeInTheDocument();
    expect(screen.getByText('3 staff-days of approved leave')).toBeInTheDocument();
    // A satisfied line is not a to-do; zero rows are omitted, not shown at zero.
    expect(screen.queryByText(/no shift scheduled/)).not.toBeInTheDocument();
  });

  it('makes a failed first load the whole tab, with a retry', async () => {
    loadStaffAction.mockResolvedValue({ ok: false, error: "Couldn't load staff." });
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load staff.");
    expect(screen.queryByRole('heading', { name: 'Shift coverage' })).not.toBeInTheDocument();

    loadStaffAction.mockResolvedValue({ ok: true, data: response() });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Shift coverage' })).toBeInTheDocument();
  });

  it('keeps the previous figures on screen when a later load fails', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'Shift coverage' });

    loadStaffAction.mockResolvedValue({ ok: false, error: "Couldn't load staff." });
    await userEvent.click(screen.getByRole('radio', { name: 'Weekly' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load staff.");
    expect(screen.getByRole('heading', { name: 'Shift coverage' })).toBeInTheDocument();
  });

  it('recovers from the action call itself rejecting', async () => {
    loadStaffAction.mockRejectedValue(new Error('network'));
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load staff.");
  });
});
