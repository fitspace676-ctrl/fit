'use client';

// @fit/admin — the Reports screen's client view, rebuilt on Astryx (T11.22).
//
// Renders the real report {@link ReportDefinition} catalogue as cards, a
// date-range control, and — when a report is selected — a preview table of its
// computed rows with CSV / XLSX download links. Selecting a card or a range
// writes `?report=`/`?range=` to the URL so the server component re-fetches
// (the data source of truth stays server-side). Every section degrades to an
// explicit empty state; no figure is invented.
//
// Presentation is Astryx `Card` / `Button` / `SegmentedControl` over the Fit
// brand theme tokens, with all layout authored in compiled StyleX
// (`var(--color-*)` / `var(--font-family-*)`) — no Tailwind utilities and no
// FormaCore Aurora-glass primitives. The data flow below is unchanged; only the
// presentation moved off Tailwind.

import { useMemo, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type {
  ReportCellValue,
  ReportColumn,
  ReportColumnType,
  ReportDefinition,
  ReportKey,
  ReportRange,
  ReportResult,
} from '@fit/types';
import { Btn, Icon, type IconName } from '@/components/ui';

type T = ReturnType<typeof useTranslations>;

/** The range options offered by the segmented control, in ascending span order. */
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
    gap: '1.5rem',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
  rangeControl: {
    alignSelf: 'flex-start',
  },
  catalogue: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1280px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  card: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  cardActive: {
    boxShadow: '0 0 0 2px var(--color-accent)',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  iconTile: {
    display: 'grid',
    height: '2.75rem',
    width: '2.75rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
  },
  chipSuccess: {
    backgroundColor: 'var(--color-success-muted)',
    color: 'var(--color-success)',
  },
  chipBlue: {
    backgroundColor: 'var(--color-background-blue)',
    color: 'var(--color-text-blue)',
  },
  chipAccent: {
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  chipWarning: {
    backgroundColor: 'var(--color-warning-muted)',
    color: 'var(--color-warning)',
  },
  chipNeutral: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  icon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  iconSm: {
    width: '1rem',
    height: '1rem',
  },
  cardCopy: {
    minWidth: 0,
    flex: 1,
  },
  cardTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  cardDescription: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.75rem',
    lineHeight: 1.625,
    color: 'var(--color-text-secondary)',
  },
  cardFoot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '1rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
  },
  columnCount: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  previewCard: {
    overflow: 'hidden',
  },
  previewHead: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'center',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 640px)': 'space-between',
    },
    gap: '0.75rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '1.25rem',
    paddingBlock: '1rem',
  },
  previewTitleBox: {
    minWidth: 0,
  },
  previewTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  rowCount: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  downloads: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
  },
  emptyPad: {
    padding: '2rem',
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
  bodyRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
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
  empty: {
    display: 'grid',
    minHeight: '6rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '1.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Per-report card presentation (icon + tinted chip), keyed by {@link ReportKey}.
 * The report's name/description/columns are the catalogue's (the API is the single
 * source of truth for that copy); only the visual accent is chosen here. Any key
 * without an entry falls back to the neutral chart chip, so a future report the
 * API adds still renders rather than crashing.
 */
const REPORT_META: Record<ReportKey, { icon: IconName; chip: keyof typeof styles }> = {
  'revenue-by-channel': { icon: 'card', chip: 'chipSuccess' },
  'attendance-by-class': { icon: 'check', chip: 'chipBlue' },
  'membership-growth': { icon: 'users', chip: 'chipAccent' },
  'no-show-rate': { icon: 'clock', chip: 'chipWarning' },
};

const FALLBACK_META = {
  icon: 'chart' as IconName,
  chip: 'chipNeutral' as keyof typeof styles,
};

/**
 * The Reports screen's client view. Renders the real report {@link ReportDefinition}
 * catalogue as cards, a date-range control, and — when a report is selected — a
 * preview table of its computed rows with CSV / XLSX download links. Selecting a
 * card or a range writes `?report=`/`?range=` to the URL so the server component
 * re-fetches (the data source of truth stays server-side). Every section degrades
 * to an explicit empty state; no figure is invented.
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

  function navigate(overrides: Record<string, string>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      params.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <div {...stylex.props(styles.page, isPending && styles.pending)}>
      <SegmentedControl
        value={range}
        onChange={(next) => navigate({ range: next })}
        label={t('reportingRange')}
        size="sm"
        isDisabled={isPending}
        xstyle={styles.rangeControl}
      >
        {RANGE_OPTIONS.map((option) => (
          <SegmentedControlItem
            key={option.value}
            value={option.value}
            label={t(option.labelKey)}
          />
        ))}
      </SegmentedControl>

      {/* Report catalogue */}
      <section aria-label={t('catalogueLabel')} {...stylex.props(styles.catalogue)}>
        {reports.map((report) => (
          <ReportCard
            key={report.key}
            report={report}
            active={report.key === selected}
            disabled={isPending}
            onSelect={() => navigate({ report: report.key })}
            t={t}
          />
        ))}
      </section>

      {/* Preview */}
      {selected && preview ? (
        <ReportPreview preview={preview} range={range} t={t} />
      ) : (
        <Card variant="default" padding={0} xstyle={styles.emptyPad}>
          <EmptyState>{t('selectPrompt')}</EmptyState>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Report card                                                                */
/* -------------------------------------------------------------------------- */

function ReportCard({
  report,
  active,
  disabled,
  onSelect,
  t,
}: {
  report: ReportDefinition;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  t: T;
}) {
  const meta = REPORT_META[report.key] ?? FALLBACK_META;
  return (
    <Card variant="default" padding={0} xstyle={[styles.card, active && styles.cardActive]}>
      <div {...stylex.props(styles.cardTop)}>
        <span {...stylex.props(styles.iconTile, styles[meta.chip])}>
          <Icon name={meta.icon} {...stylex.props(styles.icon)} />
        </span>
        <div {...stylex.props(styles.cardCopy)}>
          <h3 {...stylex.props(styles.cardTitle)}>{report.name}</h3>
          <p {...stylex.props(styles.cardDescription)}>{report.description}</p>
        </div>
      </div>
      <div {...stylex.props(styles.cardFoot)}>
        <span {...stylex.props(styles.columnCount)}>
          {t('columnCount', { count: report.columns.length })}
        </span>
        <Btn v={active ? 'primary' : 'ink'} size="sm" disabled={disabled} onClick={onSelect}>
          {active ? t('viewing') : t('run')}
        </Btn>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview                                                                     */
/* -------------------------------------------------------------------------- */

function ReportPreview({ preview, range, t }: { preview: ReportResult; range: ReportRange; t: T }) {
  const locale = useLocale();
  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: preview.currency,
        maximumFractionDigits: 2,
      }),
    [preview.currency, locale],
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const exportHref = (format: 'csv' | 'xlsx'): string =>
    `/reports/export?report=${encodeURIComponent(preview.key)}&range=${encodeURIComponent(
      range,
    )}&format=${format}`;

  return (
    <Card variant="default" padding={0} xstyle={styles.previewCard}>
      <div {...stylex.props(styles.previewHead)}>
        <div {...stylex.props(styles.previewTitleBox)}>
          <h2 {...stylex.props(styles.previewTitle)}>{preview.name}</h2>
          <p {...stylex.props(styles.rowCount)}>{t('rowCount', { count: preview.rows.length })}</p>
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
        <div {...stylex.props(styles.emptyPad)}>
          <EmptyState>{t('emptyRows')}</EmptyState>
        </div>
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
  money: Intl.NumberFormat,
  number: Intl.NumberFormat,
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

function EmptyState({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.empty)}>{children}</div>;
}
