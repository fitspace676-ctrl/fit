'use client';

// The charts above a report's preview table.
//
// Built from the preview's OWN rows: the API already sends every row of the
// window (up to its detail cap), so a chart here is a summary of exactly the
// table beneath it and of the file the download produces. No second request,
// and no figure the table cannot back.
//
// Each offered report names one or two views of itself (`REPORT_CHARTS`):
//
//   time   a quantity per day: columns on a date axis
//   rank   which categories carry the most: the top eight as bars, the rest
//          folded into "other"
//   split  how one whole divides: a single segmented bar with its parts named
//
// A report with no entry simply shows its table, as before.

import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import type { ReportColumn, ReportKey, ReportResult, ReportRow } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { formatBucket } from '../format';

/* -------------------------------------------------------------------------- */
/*  Specs                                                                      */
/* -------------------------------------------------------------------------- */

type Agg = 'sum' | 'count' | 'avg';

interface TimeSpec {
  kind: 'time';
  date: string;
  agg: Agg;
  /** Summed per row; several columns add up (e.g. classes + PT). Omit for `count`. */
  value?: string[];
  /** Hung below the baseline on the same scale (refunds). */
  negative?: string;
  /** `data`: span the rows' own dates (a forecast runs past the window). */
  axis?: 'window' | 'data';
}

interface GroupSpec {
  kind: 'rank' | 'split';
  group: string;
  agg: Agg;
  value?: string[];
}

export type ReportChartSpec = TimeSpec | GroupSpec;

export const REPORT_CHARTS: Partial<Record<ReportKey, ReportChartSpec[]>> = {
  // Sales
  'sales-transactions': [
    { kind: 'time', date: 'date', agg: 'sum', value: ['amount'] },
    { kind: 'rank', group: 'method', agg: 'sum', value: ['amount'] },
  ],
  'plan-performance': [{ kind: 'rank', group: 'item', agg: 'sum', value: ['revenue'] }],
  'daily-reconciliation': [
    { kind: 'time', date: 'date', agg: 'sum', value: ['total'], negative: 'refunds' },
  ],
  'refunds-detail': [
    { kind: 'time', date: 'date', agg: 'sum', value: ['amount'] },
    { kind: 'rank', group: 'reason', agg: 'count' },
  ],
  // Members
  'member-roster': [
    { kind: 'split', group: 'status', agg: 'count' },
    { kind: 'rank', group: 'plan', agg: 'count' },
  ],
  'member-check-in-log': [
    { kind: 'time', date: 'date', agg: 'count' },
    { kind: 'split', group: 'method', agg: 'count' },
  ],
  'members-at-risk': [{ kind: 'split', group: 'group', agg: 'count' }],
  // Revenue
  'outstanding-invoices': [
    { kind: 'split', group: 'status', agg: 'sum', value: ['outstanding'] },
    { kind: 'rank', group: 'item', agg: 'sum', value: ['outstanding'] },
  ],
  'projected-revenue': [
    { kind: 'time', date: 'nextCharge', agg: 'sum', value: ['expected'], axis: 'data' },
  ],
  'revenue-by-payment-method': [{ kind: 'rank', group: 'method', agg: 'sum', value: ['revenue'] }],
  // Products
  'product-sales': [{ kind: 'rank', group: 'product', agg: 'sum', value: ['revenue'] }],
  'product-sales-detail': [
    { kind: 'time', date: 'date', agg: 'sum', value: ['price'] },
    { kind: 'rank', group: 'product', agg: 'sum', value: ['quantity'] },
  ],
  'stock-inventory': [
    { kind: 'rank', group: 'product', agg: 'sum', value: ['stockValue'] },
    { kind: 'split', group: 'status', agg: 'count' },
  ],
  'stock-movements': [
    { kind: 'time', date: 'date', agg: 'count' },
    { kind: 'split', group: 'type', agg: 'count' },
  ],
  // Classes & training
  'attendance-by-class': [
    { kind: 'time', date: 'date', agg: 'sum', value: ['attended'] },
    { kind: 'rank', group: 'class', agg: 'avg', value: ['utilization'] },
  ],
  'class-cancellations': [
    { kind: 'time', date: 'date', agg: 'count' },
    { kind: 'split', group: 'status', agg: 'count' },
  ],
  'pt-sessions': [
    { kind: 'time', date: 'date', agg: 'count' },
    { kind: 'split', group: 'status', agg: 'count' },
  ],
  'credit-usage': [
    { kind: 'split', group: 'status', agg: 'count' },
    { kind: 'rank', group: 'package', agg: 'sum', value: ['used'] },
  ],
  // Trainers & staff
  'trainer-activity': [
    { kind: 'rank', group: 'trainer', agg: 'sum', value: ['classes', 'ptSessions'] },
  ],
  'trainer-activity-detail': [
    { kind: 'rank', group: 'trainer', agg: 'count' },
    { kind: 'split', group: 'type', agg: 'count' },
  ],
  'trainer-sales': [{ kind: 'rank', group: 'trainer', agg: 'sum', value: ['totalValue'] }],
  'trainer-sales-detail': [{ kind: 'time', date: 'date', agg: 'sum', value: ['amount'] }],
  'staff-schedule': [{ kind: 'rank', group: 'staff', agg: 'count' }],
  'audit-log': [
    { kind: 'time', date: 'date', agg: 'count' },
    { kind: 'rank', group: 'action', agg: 'count' },
  ],
};

/** Categories a rank chart names before folding the rest into "other". */
const RANK_LIMIT = 8;
/** Parts a split bar names before folding the rest into "other". */
const SPLIT_LIMIT = 5;
/** Beyond this many days a time chart groups by week, so columns stay readable. */
const DAILY_LIMIT = 62;
/** The API's detail cap (`DETAIL_ROW_LIMIT`): a preview this long may be cut short. */
const ROW_CAP = 5000;

/* -------------------------------------------------------------------------- */
/*  Aggregation (pure)                                                         */
/* -------------------------------------------------------------------------- */

function rowValue(row: ReportRow, columns: string[] | undefined): number {
  if (!columns) return 1;
  return columns.reduce((sum, key) => {
    const v = row[key];
    return sum + (typeof v === 'number' ? v : 0);
  }, 0);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}

/** The Monday that starts `iso`'s week. */
function weekStart(iso: string): string {
  const day = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

/**
 * One bucket per day of the axis (or per week past {@link DAILY_LIMIT}), every
 * day present even when nothing happened on it, so a quiet day reads as a gap
 * rather than vanishing from the axis.
 */
export function aggregateTime(
  rows: ReportRow[],
  spec: TimeSpec,
  window: { from: string; to: string },
): ColumnDatum[] {
  const dated = rows.filter(
    (row): row is ReportRow => typeof row[spec.date] === 'string' && row[spec.date] !== '',
  );
  const dates = dated.map((row) => String(row[spec.date]).slice(0, 10)).sort();
  let from = window.from;
  let to = window.to;
  if (spec.axis === 'data' && dates.length > 0) {
    from = dates[0] ?? from;
    to = dates[dates.length - 1] ?? to;
  }
  if (to < from) return [];
  const weekly = daysBetween(from, to) + 1 > DAILY_LIMIT;
  const bucketOf = (iso: string) => (weekly ? weekStart(iso) : iso);

  const buckets = new Map<string, { value: number; negative: number; n: number }>();
  for (let day = bucketOf(from); day <= to; day = addDays(day, weekly ? 7 : 1)) {
    buckets.set(day, { value: 0, negative: 0, n: 0 });
  }
  for (const row of dated) {
    const bucket = buckets.get(bucketOf(String(row[spec.date]).slice(0, 10)));
    if (!bucket) continue;
    bucket.value += spec.agg === 'count' ? 1 : rowValue(row, spec.value);
    bucket.n += 1;
    if (spec.negative) bucket.negative += rowValue(row, [spec.negative]);
  }
  return [...buckets.entries()].map(([label, b]) => ({
    label,
    value: spec.agg === 'avg' ? (b.n > 0 ? b.value / b.n : null) : b.value,
    ...(spec.negative ? { negative: b.negative } : {}),
  }));
}

export interface GroupDatum {
  label: string;
  value: number;
  /** The folded remainder, named "other" on screen. */
  other?: boolean;
}

/** Categories by size, largest first, the tail beyond `limit` folded into one. */
export function aggregateGroups(rows: ReportRow[], spec: GroupSpec, limit: number): GroupDatum[] {
  const groups = new Map<string, { value: number; n: number }>();
  for (const row of rows) {
    const raw = row[spec.group];
    const label = raw === null || raw === undefined || raw === '' ? '' : String(raw);
    const g = groups.get(label) ?? { value: 0, n: 0 };
    g.value += spec.agg === 'count' ? 1 : rowValue(row, spec.value);
    g.n += 1;
    groups.set(label, g);
  }
  const all = [...groups.entries()]
    .map(([label, g]) => ({ label, value: spec.agg === 'avg' ? g.value / g.n : g.value }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value);
  // An average does not add up, so its tail is left off rather than summed.
  if (all.length <= limit || spec.agg === 'avg') return all.slice(0, limit);
  const head = all.slice(0, limit - 1);
  const rest = all.slice(limit - 1).reduce((sum, g) => sum + g.value, 0);
  return [...head, { label: '', value: rest, other: true }];
}

/* -------------------------------------------------------------------------- */
/*  Presentation                                                               */
/* -------------------------------------------------------------------------- */

/** The split bar's parts: the brand's blue steps, then greys for the tail. */
const SPLIT_FILLS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'light-dark(#c7e2f6, #153e58)',
  'light-dark(#8f8f8b, #8f8f8b)',
  'light-dark(#babab7, #53534f)',
  'light-dark(#dcdcda, #3e3e3b)',
];

const styles = stylex.create({
  grid: {
    display: 'grid',
    gap: '1rem',
    paddingInline: '1.25rem',
    paddingBottom: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1280px)': 'repeat(auto-fit, minmax(22rem, 1fr))',
    },
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    minWidth: 0,
    paddingBlock: '1rem',
    paddingInline: '1rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  note: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '0.75rem',
    rowGap: '0.3125rem',
    alignItems: 'baseline',
  },
  name: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  value: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  track: {
    display: 'block',
    gridColumn: '1 / -1',
    height: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    overflow: 'hidden',
  },
  fill: {
    display: 'block',
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
  },
  fillOther: {
    backgroundColor: 'light-dark(#babab7, #53534f)',
  },
  split: {
    display: 'flex',
    gap: '2px',
    height: '0.75rem',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  legendRow: {
    display: 'grid',
    gridTemplateColumns: '0.625rem minmax(0, 1fr) auto auto',
    alignItems: 'center',
    columnGap: '0.625rem',
  },
  swatch: {
    width: '0.625rem',
    height: '0.625rem',
    borderRadius: '3px',
  },
  share: {
    minWidth: '2.75rem',
    textAlign: 'end',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
});

export function ReportCharts({
  preview,
  money,
  number,
}: {
  preview: ReportResult;
  /** Formats MAJOR units; the rows carry minor units. */
  money: NumberFormatter;
  number: NumberFormatter;
}) {
  const specs = REPORT_CHARTS[preview.key];
  const t = useTranslations('admin.reports.charts');
  if (!specs || preview.rows.length === 0) return null;

  const column = (key: string): ReportColumn | undefined =>
    preview.columns.find((c) => c.key === key);

  return (
    <div {...stylex.props(styles.grid)}>
      {specs.map((spec, i) => (
        <ChartTile
          key={i}
          spec={spec}
          preview={preview}
          column={column}
          money={money}
          number={number}
          t={t}
        />
      ))}
      {preview.rows.length >= ROW_CAP ? <p {...stylex.props(styles.note)}>{t('capped')}</p> : null}
    </div>
  );
}

type ChartT = ReturnType<typeof useTranslations<'admin.reports.charts'>>;

function ChartTile({
  spec,
  preview,
  column,
  money,
  number,
  t,
}: {
  spec: ReportChartSpec;
  preview: ReportResult;
  column: (key: string) => ReportColumn | undefined;
  money: NumberFormatter;
  number: NumberFormatter;
  t: ChartT;
}) {
  const locale = useLocale();
  // What the figures are: the summed column's own type, or a count.
  const valueColumn = spec.value?.length ? column(spec.value[0] ?? '') : undefined;
  const type = spec.agg === 'count' ? 'number' : (valueColumn?.type ?? 'number');
  const toMajor = (v: number) => (type === 'money' ? v / 100 : v);
  const format = (v: number): string =>
    type === 'money'
      ? money.format(v)
      : type === 'percent'
        ? `${v.toFixed(1)}%`
        : number.format(Math.round(v * 10) / 10);
  const valueLabel =
    spec.agg === 'count'
      ? t('count')
      : spec.value && spec.value.length > 1
        ? t('total')
        : (valueColumn?.label ?? t('count'));

  if (spec.kind === 'time') {
    return (
      <TimeTile
        spec={spec}
        preview={preview}
        valueLabel={valueLabel}
        negativeLabel={spec.negative ? column(spec.negative)?.label : undefined}
        toMajor={toMajor}
        format={format}
        integer={type === 'number'}
        locale={locale}
        t={t}
      />
    );
  }
  const groupLabel = column(spec.group)?.label ?? spec.group;
  return (
    <GroupTile
      spec={spec}
      rows={preview.rows}
      valueLabel={valueLabel}
      groupLabel={groupLabel}
      toMajor={toMajor}
      format={format}
      t={t}
    />
  );
}

function TimeTile({
  spec,
  preview,
  valueLabel,
  negativeLabel,
  toMajor,
  format,
  integer,
  locale,
  t,
}: {
  spec: TimeSpec;
  preview: ReportResult;
  valueLabel: string;
  negativeLabel?: string;
  toMajor: (v: number) => number;
  format: (v: number) => string;
  integer: boolean;
  locale: string;
  t: ChartT;
}) {
  const data = useMemo(
    () =>
      aggregateTime(preview.rows, spec, preview).map((d) => ({
        ...d,
        value: d.value === null ? null : toMajor(d.value),
        ...(d.negative !== undefined ? { negative: toMajor(d.negative) } : {}),
      })),
    [preview, spec, toMajor],
  );
  if (data.length === 0) return null;
  return (
    <section {...stylex.props(styles.tile)}>
      <h3 {...stylex.props(styles.title)}>{t('time', { value: valueLabel })}</h3>
      <ColumnChart
        data={data}
        integer={integer}
        height={180}
        ariaLabel={t('time', { value: valueLabel })}
        formatValue={format}
        formatLabel={(label) => formatBucket(locale, label)}
        valueName={valueLabel}
        negativeName={negativeLabel}
        meanLabel={data.length > 2 ? t('average') : undefined}
      />
    </section>
  );
}

function GroupTile({
  spec,
  rows,
  valueLabel,
  groupLabel,
  toMajor,
  format,
  t,
}: {
  spec: GroupSpec;
  rows: ReportRow[];
  valueLabel: string;
  groupLabel: string;
  toMajor: (v: number) => number;
  format: (v: number) => string;
  t: ChartT;
}) {
  const groups = useMemo(
    () =>
      aggregateGroups(rows, spec, spec.kind === 'rank' ? RANK_LIMIT : SPLIT_LIMIT + 1).map((g) => ({
        ...g,
        value: toMajor(g.value),
      })),
    [rows, spec, toMajor],
  );
  if (groups.length === 0) return null;
  const name = (g: GroupDatum) => (g.other ? t('other') : g.label || t('none'));
  const title =
    spec.kind === 'split'
      ? t('split', { group: groupLabel, value: valueLabel })
      : t('rank', { group: groupLabel, value: valueLabel });

  if (spec.kind === 'split') {
    const total = groups.reduce((sum, g) => sum + g.value, 0);
    const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
    return (
      <section {...stylex.props(styles.tile)}>
        <h3 {...stylex.props(styles.title)}>{title}</h3>
        <div
          role="img"
          aria-label={groups.map((g) => `${name(g)} ${pct(g.value)}%`).join(', ')}
          {...stylex.props(styles.split)}
        >
          {groups.map((g, i) => (
            <span
              key={`${g.label}-${i}`}
              data-grow="x"
              style={{
                width: `${(g.value / total) * 100}%`,
                backgroundColor: SPLIT_FILLS[g.other ? SPLIT_FILLS.length - 1 : i],
              }}
            />
          ))}
        </div>
        <ul {...stylex.props(styles.list)}>
          {groups.map((g, i) => (
            <li key={`${g.label}-${i}`} {...stylex.props(styles.legendRow)}>
              <span
                aria-hidden
                {...stylex.props(styles.swatch)}
                style={{ backgroundColor: SPLIT_FILLS[g.other ? SPLIT_FILLS.length - 1 : i] }}
              />
              <span {...stylex.props(styles.name, g.other && styles.muted)}>{name(g)}</span>
              <span {...stylex.props(styles.value)}>{format(g.value)}</span>
              <span {...stylex.props(styles.share)}>{pct(g.value)}%</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const best = Math.max(...groups.filter((g) => !g.other).map((g) => g.value), 1e-9);
  return (
    <section {...stylex.props(styles.tile)}>
      <h3 {...stylex.props(styles.title)}>{title}</h3>
      <ul {...stylex.props(styles.list)}>
        {groups.map((g, i) => (
          <li key={`${g.label}-${i}`} {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.name, g.other && styles.muted)} title={name(g)}>
              {name(g)}
            </span>
            <span {...stylex.props(styles.value)}>{format(g.value)}</span>
            <span aria-hidden {...stylex.props(styles.track)}>
              <span
                data-grow="x"
                {...stylex.props(styles.fill, g.other && styles.fillOther)}
                style={{ width: `${Math.min(100, Math.max(2, (g.value / best) * 100))}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
