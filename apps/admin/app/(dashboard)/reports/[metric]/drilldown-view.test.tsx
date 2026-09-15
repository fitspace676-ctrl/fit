// @fit/admin — one drill-down under a branch filter: the download links carry the
// branch the page ran with, and the one branch-blind column says so.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReportDrilldown } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';

vi.mock('next/navigation', () => navigationMock.factory());

const { DrilldownView } = await import('./drilldown-view');

const messages = {
  admin: {
    common: { notSplitByBranch: 'Not split by branch' },
    reports: {
      reportingRange: 'Reporting range',
      rangeToday: 'Today',
      range7d: '7 days',
      rangeMtd: 'Month to date',
      rangeCustom: 'Custom',
      rangeFrom: 'From',
      rangeTo: 'To',
      calendar: {
        open: 'Choose a date',
        previousMonth: 'Previous month',
        nextMonth: 'Next month',
        chooseYear: 'Choose a year',
      },
      downloadCsv: 'CSV',
      downloadXlsx: 'XLSX',
      drilldown: { back: 'Back to reports', emptySection: 'No data yet.' },
    },
  },
};

const STAFF: ReportDrilldown = {
  metric: 'staff',
  name: 'Staff',
  description: 'Trainer delivery over the window.',
  range: 'mtd',
  from: '2026-09-01',
  to: '2026-09-15',
  currency: 'GEL',
  kpis: [],
  sections: [
    {
      kind: 'table',
      id: 'staff-performance',
      title: 'Staff performance',
      columns: [
        { key: 'trainer', label: 'Trainer', type: 'text' },
        { key: 'classes', label: 'Classes', type: 'number' },
        { key: 'rating', label: 'Avg rating', type: 'number' },
      ],
      rows: [{ trainer: 'Ana', classes: 4, rating: 4.5 }],
    },
  ],
};

function renderView(locationId: string | undefined) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DrilldownView drilldown={STAFF} canExport locationId={locationId} />
    </NextIntlClientProvider>,
  );
}

describe('DrilldownView under a branch filter', () => {
  beforeEach(() => navigationMock.reset());

  it('carries the branch on screen into both downloads', () => {
    renderView('loc-2');

    for (const label of ['CSV', 'XLSX'] as const) {
      const href = screen.getByRole('link', { name: label }).getAttribute('href') ?? '';
      const url = new URL(href, 'https://console.test');
      expect(url.pathname.endsWith('/reports/staff/export')).toBe(true);
      expect(url.searchParams.get('locationId')).toBe('loc-2');
      expect(url.searchParams.get('range')).toBe('mtd');
    }
  });

  it('omits the param on "All locations"', () => {
    renderView(undefined);

    for (const label of ['CSV', 'XLSX'] as const) {
      expect(screen.getByRole('link', { name: label }).getAttribute('href')).not.toContain(
        'locationId',
      );
    }
  });

  // A review is written about a trainer, so the rating stays the trainer's across
  // every branch while the delivery figures beside it narrow.
  it('names the branch-blind rating column, and only with a branch selected', () => {
    renderView('loc-2');
    expect(screen.getByRole('note')).toHaveTextContent('Not split by branch');
    expect(screen.getByRole('note')).toHaveTextContent('Avg rating');
  });

  it('stays silent with no branch selected', () => {
    renderView(undefined);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
