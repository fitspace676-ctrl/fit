// @fit/admin — the Reports catalogue view under a branch filter.
//
// HALF OF THE "THE FILE MATCHES THE SCREEN" PROOF. A downloaded report that
// quietly covers every branch, while the table it came from covers one, is worse
// than no filter at all — so the guarantee is pinned from both ends:
//
//   • HERE (screen → link): the preview's CSV/XLSX hrefs carry exactly the
//     `locationId` the server ran the preview with, and carry none when the
//     console is on "All locations".
//   • `export/route.spec.ts` (link → file): the export route forwards that param
//     upstream verbatim, outranking a cookie that says something else.
//
// Chain those and the bytes in the file cover the branch on screen.
//
// The rest of the file covers the annotations, which are the other half of not
// lying: a gym-wide report must SAY it is gym-wide while a branch is selected, and
// `revenue-summary`'s three `null` columns must read as "no answer for one branch"
// rather than as zero or as a broken fetch.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { REPORT_DEFINITIONS, type ReportDefinition, type ReportResult } from '@fit/types';

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
      range7d: '7 days',
      range30d: '30 days',
      range12w: '12 weeks',
      range12m: '12 months',
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

/** The real catalogue entry for a key, so the test never invents a column shape. */
function definition(key: keyof typeof REPORT_DEFINITIONS): ReportDefinition {
  return REPORT_DEFINITIONS[key];
}

function result(key: keyof typeof REPORT_DEFINITIONS, rows: ReportResult['rows']): ReportResult {
  const def = definition(key);
  return {
    key: def.key,
    name: def.name,
    range: '30d',
    currency: 'GEL',
    columns: def.columns,
    rows,
  };
}

function renderView(preview: ReportResult, locationId: string | undefined) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReportsView
        reports={[definition(preview.key)]}
        selected={preview.key}
        range="30d"
        preview={preview}
        locationId={locationId}
      />
    </NextIntlClientProvider>,
  );
}

/** The `href` of one of the two download links in the preview header. */
function downloadHref(label: 'CSV' | 'XLSX'): string {
  return screen.getByRole('link', { name: label }).getAttribute('href') ?? '';
}

const SALES = result('sales-summary', [
  { period: '2026-08-01', orders: 4, gross: 12_000, refunded: 0, net: 12_000 },
]);

describe('ReportsView download links', () => {
  beforeEach(() => navigationMock.reset());

  it('carries the branch the preview was fetched for into both downloads', () => {
    renderView(SALES, 'loc-2');

    for (const label of ['CSV', 'XLSX'] as const) {
      const url = new URL(downloadHref(label), 'https://console.test');
      expect(url.pathname.endsWith('/reports/export')).toBe(true);
      expect(url.searchParams.get('locationId')).toBe('loc-2');
      // The same report and the same window as the table beneath the link — a
      // file scoped to the right branch but the wrong fortnight is the same class
      // of lie.
      expect(url.searchParams.get('report')).toBe('sales-summary');
      expect(url.searchParams.get('range')).toBe('30d');
      expect(url.searchParams.get('format')).toBe(label.toLowerCase());
    }
  });

  it('omits the param entirely on "All locations" — never locationId=all', () => {
    renderView(SALES, undefined);

    for (const label of ['CSV', 'XLSX'] as const) {
      const href = downloadHref(label);
      expect(href).not.toContain('locationId');
    }
  });
});

describe('ReportsView gym-wide caveat', () => {
  beforeEach(() => navigationMock.reset());

  // `pt-sessions` reads `PtSession`, which has no location column and no relation
  // that reaches one — genuinely gym-wide until Stage 6. It took this slot from
  // `member-check-in-log` when Stage 3 gave a check-in a real branch, exactly as
  // `member-check-in-log` had taken it from `member-roster` in Stage 2.
  const GYM_WIDE = result('pt-sessions', [{ trainer: 'Ana', sessions: 4 }]);

  it('marks a report the branch filter cannot reach', () => {
    renderView(GYM_WIDE, 'loc-2');
    expect(screen.getByText('Not split by branch')).toBeInTheDocument();
  });

  it('stays silent on a report the filter does reach', () => {
    renderView(SALES, 'loc-2');
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
  });

  it('stays silent in "All locations" mode, where the caveat is the definition', () => {
    renderView(GYM_WIDE, undefined);
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
  });

  // Stage 2 moved this one across the line: `GymMember` gained a home branch, so
  // the roster narrows and must NOT be annotated any more.
  it('no longer marks the member roster, which now narrows by home branch', () => {
    renderView(result('member-roster', [{ member: 'Ana', status: 'ACTIVE' }]), 'loc-2');
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
  });

  // Stage 3 moved this one across in turn, and by the other route: `CheckIn` got a
  // branch column of its own plus a write path, rather than a hop through the
  // member. The log now narrows by the door the visitor came through, so the
  // caveat would be a false disclaimer — it says the table on screen is every
  // branch's when it is one branch's.
  it('no longer marks the check-in log, which now narrows by the visited branch', () => {
    renderView(result('member-check-in-log', [{ member: 'Ana', location: 'Vake' }]), 'loc-2');
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
  });
});

describe('ReportsView revenue-summary under a branch filter', () => {
  beforeEach(() => navigationMock.reset());

  // This block used to assert the opposite. Under a branch the API returned
  // `null` for `mrr` / `activeMembers` / `arpm`, because the recurring base had no
  // branch, and the view explained those nulls with a note, dotted column headers
  // and em-dash cells. Stage 2 gave the member a home branch, the subscription
  // inherits it through the member who holds it, and all three now carry real
  // per-branch figures — so the explanation had to go with the nulls.
  const BRANCHED = result('revenue-summary', [
    { period: '2026-08-01', revenue: 40_000, mrr: 30_000, activeMembers: 5, arpm: 6_000 },
  ]);

  it('prints real per-branch figures with no caveat', () => {
    renderView(BRANCHED, 'loc-2');
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
  });

  it('renders every column as an ordinary answer, with no em-dash placeholders', () => {
    renderView(BRANCHED, 'loc-2');

    const row = screen.getAllByRole('row')[1];
    const cells = within(row as HTMLElement).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('400');
    for (const index of [2, 3, 4]) {
      expect(cells[index]).not.toHaveTextContent('—');
      expect(cells[index]).not.toHaveAttribute('aria-label', 'Not split by branch');
    }
  });

  it('leaves the column headers unannotated', () => {
    renderView(BRANCHED, 'loc-2');
    expect(screen.getByRole('columnheader', { name: 'MRR' })).not.toHaveAttribute('title');
    expect(screen.getByRole('columnheader', { name: 'Revenue' })).not.toHaveAttribute('title');
  });

  it('reads the same with no branch selected', () => {
    renderView(BRANCHED, undefined);
    expect(screen.queryByText('Not split by branch')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'MRR' })).not.toHaveAttribute('title');
  });
});
