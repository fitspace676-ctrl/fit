// @fit/admin — the Reports catalogue view under a branch filter.
//
// HALF OF THE "THE FILE MATCHES THE SCREEN" PROOF. A downloaded report that
// quietly covers every branch, while the table it came from covers one, is worse
// than no filter at all — so the guarantee is pinned from both ends:
//
//   • HERE (screen → link): the preview's CSV/XLSX hrefs carry exactly the
//     `locationId` the page ran the preview with, and none on "All locations".
//   • `export-routes.spec.ts` (link → file): the export route forwards that param
//     upstream verbatim, outranking a cookie that says something else.
//
// The rest covers the other half of not lying: a report the API leaves gym-wide
// must SAY so while a branch is selected, and a report that narrows must not.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  GYM_WIDE_REPORT_KEYS,
  REPORT_DEFINITIONS,
  REPORT_SEGMENT_LABEL,
  type ReportKey,
  type ReportResult,
} from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';

// The view writes `?report=` / `?range=` through the router, so the App Router
// hooks have to exist.
vi.mock('next/navigation', () => navigationMock.factory());

const { ReportsView } = await import('./reports-view');

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
      catalogueLabel: 'Report catalogue',
      columnCount: '{count} columns',
      rowCount: '{count} rows',
      selectPrompt: 'Pick a report.',
      downloadCsv: 'CSV',
      downloadXlsx: 'XLSX',
      emptyRows: 'No data in this period yet.',
      searchLabel: 'Search reports',
      searchPlaceholder: 'Search reports',
      noMatches: 'No report matches "{query}".',
      noneEnabled: 'No reports are switched on.',
      clearSearch: 'Clear search',
    },
  },
};

/** A preview for a real catalogue entry, so the test never invents a column shape. */
function result(key: ReportKey): ReportResult {
  const definition = REPORT_DEFINITIONS[key];
  return {
    key,
    name: definition.name,
    range: 'mtd',
    from: '2026-09-01',
    to: '2026-09-15',
    currency: 'GEL',
    columns: definition.columns,
    rows: [],
  };
}

function renderView(preview: ReportResult, locationId: string | undefined) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReportsView
        reports={[REPORT_DEFINITIONS[preview.key]]}
        segments={REPORT_SEGMENT_LABEL}
        selected={preview.key}
        reportQuery={{ range: 'mtd', locationId }}
        preview={preview}
        canExport
      />
    </NextIntlClientProvider>,
  );
}

/** The `href` of one of the two download links in the preview header. */
function downloadHref(label: 'CSV' | 'XLSX'): string {
  return screen.getByRole('link', { name: label }).getAttribute('href') ?? '';
}

describe('ReportsView download links', () => {
  beforeEach(() => navigationMock.reset());

  it('carries the branch the preview was fetched for into both downloads', () => {
    renderView(result('sales-transactions'), 'loc-2');

    for (const label of ['CSV', 'XLSX'] as const) {
      const url = new URL(downloadHref(label), 'https://console.test');
      expect(url.pathname.endsWith('/reports/export')).toBe(true);
      expect(url.searchParams.get('locationId')).toBe('loc-2');
      // The same report and window as the table beneath the link — a file scoped
      // to the right branch but the wrong fortnight is the same class of lie.
      expect(url.searchParams.get('report')).toBe('sales-transactions');
      expect(url.searchParams.get('range')).toBe('mtd');
      expect(url.searchParams.get('format')).toBe(label.toLowerCase());
    }
  });

  it('omits the param entirely on "All locations" — never locationId=all', () => {
    renderView(result('sales-transactions'), undefined);

    for (const label of ['CSV', 'XLSX'] as const) {
      expect(downloadHref(label)).not.toContain('locationId');
    }
  });
});

describe('ReportsView gym-wide caveat', () => {
  beforeEach(() => navigationMock.reset());

  it.each([...GYM_WIDE_REPORT_KEYS])('marks %s, which the branch filter cannot reach', (key) => {
    renderView(result(key), 'loc-2');
    expect(screen.getByRole('note')).toHaveTextContent('Not split by branch');
  });

  it('stays silent in "All locations" mode, where the caveat is the definition', () => {
    renderView(result('discounts-and-promotions'), undefined);
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
  });

  it('stays silent on a report the filter does reach', () => {
    renderView(result('sales-transactions'), 'loc-2');
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
  });

  // Stage 6 gave `PtSession` a branch, so both coaching reports now narrow — the
  // caveat on them would be a false disclaimer saying one branch's table is every
  // branch's.
  it.each(['pt-sessions', 'trainer-performance'] as const)(
    'no longer marks %s, which now narrows by where the hour was delivered',
    (key) => {
      renderView(result(key), 'loc-2');
      expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
    },
  );
});
