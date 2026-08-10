'use client';

// @fit/admin — the Reports screen's client view (T11.22).
//
// A SEARCHABLE MASTER / DETAIL screen: a scrollable index of the gym's reports on
// the left, the selected report's preview beside it on the right. Selecting a
// report writes `?report=` to the URL so the server component re-fetches (the
// data source of truth stays server-side). Every section degrades to an explicit
// empty state; no figure is invented.
//
// It replaces a grid of 27 identical cards, and the three things wrong with that
// grid are the three things this layout exists to fix.
//
//   1. THE PREVIEW WAS OFF SCREEN. The catalogue ran ~1600px tall and the preview
//      table rendered underneath all of it, so clicking a card appeared to do
//      nothing. The preview now sits BESIDE the index, in view at the moment of
//      the click. This is the single biggest reason for the two-pane shape.
//
//   2. THERE WAS NO WAY TO FIND ANYTHING. Twenty-seven reports and no search. The
//      toolbar's field filters the index live across name, purpose, and segment,
//      so "refund" narrows to three rows instead of a scan of the whole page.
//
//   3. EVERY CELL WEIGHED THE SAME. Each card carried a 2-line clamped purpose and
//      a "5 columns" footnote, which is not a fact anyone chooses a report by. An
//      index row is now the report's NAME and nothing else, so a rail-height of
//      rows scans in one pass; the purpose and the column count both move to the
//      detail pane, where they describe the thing you are about to download.
//
// The old hairline grid also needed FILLER CELLS, because an unfilled grid area
// showed as a solid block of border colour. A list has no cell count to satisfy,
// so the fillers are gone with it.
//
// The `?range=` control lives HERE now, in the same toolbar as the search, rather
// than in a page header of its own. The two controls that govern this screen are
// one control surface; splitting them across two rows was why the range segment
// used to float alone against empty space.
//
// Presentation is Astryx `Card` / `Button` / `TextInput` over the Fit brand theme
// tokens, with all layout authored in compiled StyleX — no Tailwind utilities and
// no FormaCore Aurora-glass primitives.

import { useDeferredValue, useMemo, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
import type { NumberFormatter } from '@fit/i18n';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { groupReportsBySegment } from '@fit/types';
import type {
  ReportCellValue,
  ReportColumn,
  ReportColumnType,
  ReportDefinition,
  ReportKey,
  ReportRange,
  ReportResult,
} from '@fit/types';
import { Icon, type IconName } from '@/components/ui';
import { adminPath } from '@/lib/base-path';
import { chrome } from './report-chrome';

type T = ReturnType<typeof useTranslations>;

/** The range options offered by the toolbar's segmented control, ascending by span. */
const RANGE_OPTIONS: ReadonlyArray<{ value: ReportRange; labelKey: string }> = [
  { value: '7d', labelKey: 'range7d' },
  { value: '30d', labelKey: 'range30d' },
  { value: '12w', labelKey: 'range12w' },
  { value: '12m', labelKey: 'range12m' },
];

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: {
      default: '150ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },

  /* ---------------------------------------------------------------------- */
  /*  Toolbar                                                                */
  /* ---------------------------------------------------------------------- */

  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  search: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '16rem',
    maxWidth: '24rem',
  },
  searchIcon: {
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-secondary)',
  },

  /* ---------------------------------------------------------------------- */
  /*  Split                                                                  */
  /* ---------------------------------------------------------------------- */

  // Below 1024px the index stacks above the preview and drops its own scroll
  // (`indexScroll` re-opens the page's), because a nested scroll region inside a
  // scrolling page is the wrong feel on a narrow screen.
  split: {
    display: 'grid',
    alignItems: 'start',
    gap: '1rem',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 1024px)': 'minmax(0, 20rem) minmax(0, 1fr)',
    },
  },

  /* ---------------------------------------------------------------------- */
  /*  Index rail                                                             */
  /* ---------------------------------------------------------------------- */

  index: {
    overflow: 'hidden',
    // Sticky so the index stays put while a long preview table scrolls beside it.
    //
    // The offset is NOT arbitrary: `admin-shell.tsx` pins its 3.5rem top bar at
    // `top: 0` with a higher z-index, so a rail stuck at `top: 1rem` slides under
    // it and loses its first group heading. 3.5rem clears the bar; the extra 1rem
    // is the gap between the two.
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'sticky',
    },
    top: 'calc(3.5rem + 1rem)',
  },
  indexScroll: {
    overflowY: {
      default: 'visible',
      '@media (min-width: 1024px)': 'auto',
    },
    // The viewport, less the sticky offset above and the shell's 1.5rem page
    // gutter below, so the rail ends ON the fold rather than running past it.
    maxHeight: {
      default: 'none',
      '@media (min-width: 1024px)': 'calc(100dvh - 6rem)',
    },
    overscrollBehavior: 'contain',
  },
  // Sticky inside the rail's own scroll: the segment a row belongs to stays
  // legible while scrolling past it, which is what makes 27 rows navigable.
  //
  // A RECESSED BAND, not a row. The header used to sit on the card colour in
  // secondary ink, which put it on the same plane as the rows and in weaker ink
  // than their names — so the thing naming the group read as less important than
  // the group, and the eye slid past it. It now drops to the page's own body
  // colour, a step DARKER than the card the rows sit on, so the band reads as the
  // seam between two groups rather than as another entry in the list.
  //
  // Body colour rather than `--color-background-muted` on purpose: muted is the
  // row hover, and a header that shares the hover's fill would make every hovered
  // row look like a group heading.
  groupHead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
    backgroundColor: 'var(--color-background-body)',
    // Bottom edge only. The previous group's last row already draws a hairline,
    // and that hairline is this band's top edge; adding one here would double it.
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '0.875rem',
    paddingBlock: '0.5625rem',
  },
  // Full-strength ink. At this size, uppercase and tracked out, it still reads as
  // a label rather than competing with the report names below it.
  groupLabel: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-primary)',
  },
  // Name only, one line. The purpose used to sit here as a second line and it
  // ellipsised on 26 of the 27 rows, because the catalogue's descriptions run to
  // twenty words and the rail is 20rem wide. A column of "…" is noise, and it
  // doubled the row height, so barely a dozen reports fit on screen at once. The
  // purpose is on the row's `title` and, in full and unclamped, in the pane the
  // row opens.
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: '0.625rem',
    width: '100%',
    textAlign: 'left',
    paddingInline: '0.875rem',
    paddingBlock: '0.5rem',
    borderWidth: 0,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: {
      default: '160ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    ':hover:not(:disabled)': {
      backgroundColor: 'var(--color-background-muted)',
    },
    ':disabled': {
      cursor: 'default',
    },
  },
  // The selected row is marked by an accent rule on its leading edge, inset so it
  // reads as part of the rail rather than as a floating ring.
  rowActive: {
    backgroundColor: 'var(--color-background-muted)',
    boxShadow: 'inset 2px 0 0 0 var(--color-accent)',
  },
  rowIcon: {
    width: '0.9375rem',
    height: '0.9375rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
  },
  rowIconActive: {
    color: 'var(--color-accent)',
  },
  rowName: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },

  /* ---------------------------------------------------------------------- */
  /*  Detail pane                                                            */
  /* ---------------------------------------------------------------------- */

  detailCard: {
    overflow: 'hidden',
  },
  detailHead: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-start',
    },
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '1.25rem',
    paddingBlock: '1rem',
  },
  detailTitleBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,
  },
  detailTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  detailDesc: {
    margin: 0,
    maxWidth: '46rem',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  downloads: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
  },
  iconSm: {
    width: '1rem',
    height: '1rem',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    minWidth: '36rem',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    textAlign: 'left',
  },
  th: {
    paddingInline: '1.25rem',
    paddingBlock: '0.75rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  // The hover tint is not decoration: these tables run to 31 rows of right-aligned
  // figures, and a lit row is what keeps the eye on one period while it travels
  // across five columns.
  bodyRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    transitionProperty: 'background-color',
    transitionDuration: {
      default: '120ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    ':hover': {
      backgroundColor: 'var(--color-background-muted)',
    },
  },
  bodyRowLast: {
    borderBottomWidth: 0,
  },
  td: {
    paddingInline: '1.25rem',
    paddingBlock: '0.75rem',
    color: 'var(--color-text-primary)',
  },
  numericHead: {
    textAlign: 'right',
  },
  numericCell: {
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },

  /* ---------------------------------------------------------------------- */
  /*  Empty states                                                           */
  /* ---------------------------------------------------------------------- */

  // A quiet composition of type, not a dashed placeholder box. A dashed rectangle
  // reads as a slot waiting to be filled by the system; these states are waiting
  // on the reader, and say so.
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.625rem',
    minHeight: '12rem',
    paddingInline: '1.5rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    width: '1.25rem',
    height: '1.25rem',
    color: 'var(--color-text-disabled)',
  },
  emptyText: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  emptyRows: {
    display: 'grid',
    minHeight: '5rem',
    placeItems: 'center',
    paddingInline: '1rem',
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The icon that leads each index row, keyed by {@link ReportKey}. The report's
 * name / description / columns are the catalogue's — the API is the single source
 * of truth for that copy — and only the glyph is chosen here. Any key without an
 * entry falls back to the neutral chart glyph, so a report the API adds later
 * still renders rather than crashing.
 *
 * There is no per-report colour. These glyphs are wayfinding, not status, and a
 * different hue per report put competing accents on one screen.
 */
const REPORT_ICONS: Partial<Record<ReportKey, IconName>> = {
  // Sales
  'sales-summary': 'chart',
  'sales-by-payment-method': 'card',
  'plan-performance': 'award',
  'sales-by-staff': 'briefcase',
  'discounts-and-promotions': 'tag',
  'refunds-detail': 'minus',
  'pos-transaction-log': 'bag',
  // Members
  'membership-movement': 'users',
  'retention-and-churn': 'target',
  'members-at-risk': 'bell',
  'expiring-memberships': 'calendar',
  'member-roster': 'users',
  'member-check-in-log': 'qr',
  'upcoming-occasions': 'star',
  // Revenue
  'revenue-summary': 'chart',
  'revenue-by-channel': 'grid',
  'revenue-by-location': 'pin',
  'outstanding-invoices': 'info',
  'projected-revenue': 'arrow',
  'refunds-accounting': 'minus',
  // Classes
  'attendance-by-class': 'check',
  'class-utilization': 'grid',
  'class-cancellations': 'x',
  'waitlist-demand': 'flame',
  'pt-sessions': 'dumbbell',
  'no-show-rate': 'clock',
  // Staff
  'trainer-performance': 'award',
};

const FALLBACK_ICON: IconName = 'chart';

/**
 * Whether `report` matches the search `query`, across its display name, its
 * purpose, and the segment it is filed under — so "sales" finds the whole Sales
 * group and "refund" finds the three reports about refunds regardless of which
 * group they sit in. An empty query matches everything.
 */
function matchesQuery(report: ReportDefinition, segmentLabel: string, query: string): boolean {
  if (query === '') {
    return true;
  }
  const haystack = `${report.name} ${report.description} ${segmentLabel}`.toLowerCase();
  return haystack.includes(query);
}

/**
 * The Reports screen's client view. Renders the gym's report {@link ReportDefinition}
 * catalogue as a searchable index and, beside it, the selected report's previewed
 * rows with CSV / XLSX download links. Selecting a report — and changing the
 * reporting range — writes to the URL so the server component re-fetches; the
 * search box is the one piece of state that stays client-side, because filtering a
 * list already in memory has nothing to fetch.
 */
export function ReportsView({
  reports,
  selected,
  range,
  preview,
}: {
  reports: ReportDefinition[];
  selected: ReportKey | null;
  range: ReportRange;
  preview: ReportResult | null;
}) {
  const t = useTranslations('admin.reports');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');

  // Filtering 27 rows is cheap, but deferring it keeps typing responsive while a
  // `?report=` transition is already re-rendering the pane beside the list.
  const deferredQuery = useDeferredValue(query);

  function setParam(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  // Grouped by the API's own segment field, in the shared segment order, THEN
  // filtered. The hub never decides which groups exist: a segment with no reports
  // (or none left after the search) is absent, so a group cannot render as an
  // empty heading.
  const groups = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return groupReportsBySegment(reports)
      .map((group) => ({
        ...group,
        reports: group.reports.filter((report) => matchesQuery(report, group.label, needle)),
      }))
      .filter((group) => group.reports.length > 0);
  }, [reports, deferredQuery]);

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.search)}>
          <TextInput
            label={t('searchLabel')}
            isLabelHidden
            type="text"
            size="md"
            width="100%"
            value={query}
            onChange={setQuery}
            placeholder={t('searchPlaceholder')}
            hasClear
            startIcon={<Icon name="search" {...stylex.props(styles.searchIcon)} />}
          />
        </div>
        <SegmentedControl
          value={range}
          onChange={(next) => setParam('range', next)}
          label={t('reportingRange')}
          size="sm"
          isDisabled={isPending}
        >
          {RANGE_OPTIONS.map((option) => (
            <SegmentedControlItem
              key={option.value}
              value={option.value}
              label={t(option.labelKey)}
            />
          ))}
        </SegmentedControl>
      </div>

      <div {...stylex.props(styles.split, isPending && styles.pending)}>
        <Card variant="default" padding={0} xstyle={styles.index}>
          <nav aria-label={t('catalogueLabel')} {...stylex.props(styles.indexScroll)}>
            {groups.length === 0 ? (
              <EmptyState icon="search">
                <p {...stylex.props(styles.emptyText)}>{t('noMatches', { query: query.trim() })}</p>
                <Button
                  label={t('clearSearch')}
                  variant="secondary"
                  size="sm"
                  onClick={() => setQuery('')}
                />
              </EmptyState>
            ) : (
              groups.map((group) => (
                <section key={group.segment}>
                  <div {...stylex.props(styles.groupHead)}>
                    <h2 {...stylex.props(styles.groupLabel)}>{group.label}</h2>
                    <span {...stylex.props(chrome.num)}>{group.reports.length}</span>
                  </div>
                  {group.reports.map((report) => (
                    <IndexRow
                      key={report.key}
                      report={report}
                      active={report.key === selected}
                      disabled={isPending}
                      onSelect={() => setParam('report', report.key)}
                    />
                  ))}
                </section>
              ))
            )}
          </nav>
        </Card>

        {selected && preview ? (
          <ReportPreview
            preview={preview}
            // `ReportResult` carries no purpose line, so the catalogue supplies it.
            description={reports.find((report) => report.key === selected)?.description ?? null}
            range={range}
            t={t}
          />
        ) : (
          <Card variant="default" padding={0}>
            <EmptyState icon="chart">
              <p {...stylex.props(styles.emptyText)}>{t('selectPrompt')}</p>
            </EmptyState>
          </Card>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Index row                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One report in the index. The whole row is the control — a report is picked by
 * choosing it, so a separate "Run" button inside the row would be a second target
 * for one action. `aria-current` rather than `aria-pressed`: this is navigation
 * within a list, not a toggle, and it is what tells a reader who cannot see the
 * accent rule which report the pane beside them is showing.
 */
function IndexRow({
  report,
  active,
  disabled,
  onSelect,
}: {
  report: ReportDefinition;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      disabled={disabled}
      onClick={onSelect}
      title={report.description}
      {...stylex.props(styles.row, active && styles.rowActive)}
    >
      <Icon
        name={REPORT_ICONS[report.key] ?? FALLBACK_ICON}
        {...stylex.props(styles.rowIcon, active && styles.rowIconActive)}
      />
      <span {...stylex.props(styles.rowName)}>{report.name}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview                                                                    */
/* -------------------------------------------------------------------------- */

function ReportPreview({
  preview,
  description,
  range,
  t,
}: {
  preview: ReportResult;
  description: string | null;
  range: ReportRange;
  t: T;
}) {
  const locale = useLocale();
  const money = useMemo(
    () =>
      createNumberFormat(locale, {
        style: 'currency',
        currency: preview.currency,
        maximumFractionDigits: 2,
      }),
    [preview.currency, locale],
  );
  const number = useMemo(() => createNumberFormat(locale), [locale]);

  // Renders as a plain anchor so the browser downloads the file, so the basePath is
  // not applied for us.
  const exportHref = (format: 'csv' | 'xlsx'): string =>
    adminPath(
      `/reports/export?report=${encodeURIComponent(preview.key)}&range=${encodeURIComponent(
        range,
      )}&format=${format}`,
    );

  return (
    <Card variant="default" padding={0} xstyle={styles.detailCard}>
      <div {...stylex.props(styles.detailHead)}>
        <div {...stylex.props(styles.detailTitleBox)}>
          <h2 {...stylex.props(styles.detailTitle)}>{preview.name}</h2>
          {description ? <p {...stylex.props(styles.detailDesc)}>{description}</p> : null}
          {/* What you are about to download, in one line: how many rows the range
              produced, and how wide the file will be. */}
          <p {...stylex.props(chrome.num)}>
            {t('rowCount', { count: preview.rows.length })}
            {' · '}
            {t('columnCount', { count: preview.columns.length })}
          </p>
        </div>
        <div {...stylex.props(styles.downloads)}>
          <Button
            label={t('downloadCsv')}
            variant="secondary"
            size="sm"
            href={exportHref('csv')}
            icon={<Icon name="download" {...stylex.props(styles.iconSm)} />}
          />
          <Button
            label={t('downloadXlsx')}
            variant="secondary"
            size="sm"
            href={exportHref('xlsx')}
            icon={<Icon name="download" {...stylex.props(styles.iconSm)} />}
          />
        </div>
      </div>

      {preview.rows.length === 0 ? (
        <p {...stylex.props(styles.emptyRows)}>{t('emptyRows')}</p>
      ) : (
        <div {...stylex.props(styles.tableWrap)}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr {...stylex.props(styles.headRow)}>
                {preview.columns.map((column) => (
                  <th
                    key={column.key}
                    {...stylex.props(styles.th, isNumericColumn(column.type) && styles.numericHead)}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, i) => (
                <tr
                  key={i}
                  {...stylex.props(
                    styles.bodyRow,
                    i === preview.rows.length - 1 && styles.bodyRowLast,
                  )}
                >
                  {preview.columns.map((column) => (
                    <td
                      key={column.key}
                      {...stylex.props(
                        styles.td,
                        isNumericColumn(column.type) && styles.numericCell,
                      )}
                    >
                      {formatCell(column, row[column.key] ?? null, money, number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Right-align the columns Excel would treat as numeric (money / percent / plain number). */
function isNumericColumn(type: ReportColumnType): boolean {
  return type === 'money' || type === 'percent' || type === 'number';
}

/**
 * Format one cell for the on-screen preview by column type: `money` minor-unit
 * integers become a localized currency amount, `percent` a one-decimal figure with
 * a `%` suffix, `number` a grouped integer, and `text`/`date` their own string. A
 * null / empty cell shows an em dash rather than a blank.
 */
function formatCell(
  column: ReportColumn,
  value: ReportCellValue,
  money: NumberFormatter,
  number: NumberFormatter,
): string {
  if (value === null || value === '') {
    return '—';
  }
  switch (column.type) {
    case 'money':
      return money.format(Number(value) / 100);
    case 'percent':
      return `${(Math.round(Number(value) * 10) / 10).toFixed(1)}%`;
    case 'number':
      return number.format(Number(value));
    default:
      return String(value);
  }
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                */
/* -------------------------------------------------------------------------- */

/** A centred glyph over its message, for "nothing picked yet" and "nothing found". */
function EmptyState({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.empty)}>
      <Icon name={icon} aria-hidden {...stylex.props(styles.emptyIcon)} />
      {children}
    </div>
  );
}
