'use client';

// @fit/admin — the reusable renderer for one drill-down report section (T12.12).
//
// A {@link ReportSection} is a discriminated union the API emits; this maps each
// `kind` to the brand Astryx chart/table so the drill-down pages AND the
// dashboard's segment widgets render identically from one place. Presentation is Astryx
// `Card` + the brand `charts.tsx` primitives over compiled StyleX (`var(--color-*)`)
// — no Tailwind, no recharts. Money values are MINOR-unit integers formatted here
// against the report `currency`.

import { type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { createNumberFormat } from '@fit/i18n';
import type { ReportSection, ReportValueUnit, ReportColumnType, ReportCellValue } from '@fit/types';
import { Card, DataTable, type Column } from '@fit/ui-kit';
import { AreaChart, BarChart, Donut, Heatmap } from '../charts';
import { chrome } from './report-chrome';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  axisRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  splitWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  donutValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  donutCaption: {
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  swatch: {
    width: '0.625rem',
    height: '0.625rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  legendValue: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  cellRight: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    display: 'grid',
    minHeight: '5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingBlock: '1.25rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/** A dashed "no data in this range" placeholder for an empty section. */
function EmptyNote({ label }: { label: string }): ReactNode {
  return <p {...stylex.props(styles.empty)}>{label}</p>;
}

/** A drill-down table row with a stable render key attached. */
type KeyedRow = Record<string, ReportCellValue> & { __rk: string };

/**
 * Render one section inside a brand `Card` — its title, an optional header `action`,
 * and the chart/table for its `kind`. An empty series/table degrades to the shared
 * `EmptyState` rather than a broken frame.
 */
export function ReportSectionCard({
  section,
  currency,
  locale,
  emptyLabel,
  action,
}: {
  section: ReportSection;
  currency: string;
  locale: string;
  emptyLabel: string;
  action?: ReactNode;
}) {
  return (
    <Card padding="card" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h3 {...stylex.props(chrome.cardHeading)}>{section.title}</h3>
        {action}
      </div>
      <SectionBody section={section} currency={currency} locale={locale} emptyLabel={emptyLabel} />
    </Card>
  );
}

function SectionBody({
  section,
  currency,
  locale,
  emptyLabel,
}: {
  section: ReportSection;
  currency: string;
  locale: string;
  emptyLabel: string;
}): ReactNode {
  switch (section.kind) {
    case 'series': {
      if (section.points.length === 0) {
        return <EmptyNote label={emptyLabel} />;
      }
      const first = section.points[0];
      const last = section.points[section.points.length - 1];
      return (
        <>
          <AreaChart
            data={section.points.map((point) => ({
              label: point.label,
              value: section.unit === 'money' ? point.value / 100 : point.value,
            }))}
            ariaLabel={section.title}
          />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first?.label}</span>
            <span>{last?.label}</span>
          </div>
        </>
      );
    }
    case 'breakdown':
      return (
        <BarChart
          data={section.items}
          formatValue={(value) => formatUnitValue(section.unit, value, currency, locale)}
          emptyLabel={emptyLabel}
        />
      );
    case 'split':
      return <SplitBody section={section} currency={currency} locale={locale} empty={emptyLabel} />;
    case 'heatmap':
      return (
        <Heatmap
          rowLabels={section.rowLabels}
          colLabels={section.colLabels}
          cells={section.cells}
          ariaLabel={section.title}
        />
      );
    case 'table':
      return <TableBody section={section} currency={currency} locale={locale} empty={emptyLabel} />;
  }
}

/** The tone → brand colour token for a split slice's swatch + donut. */
function toneColor(tone: 'positive' | 'negative' | 'neutral'): string {
  if (tone === 'positive') return 'var(--color-success)';
  if (tone === 'negative') return 'var(--color-error)';
  return 'var(--color-text-secondary)';
}

function SplitBody({
  section,
  currency,
  locale,
  empty,
}: {
  section: Extract<ReportSection, { kind: 'split' }>;
  currency: string;
  locale: string;
  empty: string;
}): ReactNode {
  const total = section.slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) {
    return <EmptyNote label={empty} />;
  }
  const lead = section.slices[0];
  const leadPct = lead ? Math.round((lead.value / total) * 100) : 0;
  return (
    <div {...stylex.props(styles.splitWrap)}>
      <Donut pct={leadPct} size={104} stroke={12}>
        <span {...stylex.props(styles.donutValue)}>{leadPct}%</span>
        <span {...stylex.props(styles.donutCaption)}>{lead?.label}</span>
      </Donut>
      <ul {...stylex.props(styles.legend)}>
        {section.slices.map((slice) => (
          <li key={slice.label} {...stylex.props(styles.legendRow)}>
            <span
              {...stylex.props(styles.swatch)}
              style={{ backgroundColor: toneColor(slice.tone) }}
            />
            <span>{slice.label}</span>
            <span {...stylex.props(styles.legendValue)}>
              {formatUnitValue(section.unit, slice.value, currency, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableBody({
  section,
  currency,
  locale,
  empty,
}: {
  section: Extract<ReportSection, { kind: 'table' }>;
  currency: string;
  locale: string;
  empty: string;
}): ReactNode {
  const columns: Column<KeyedRow>[] = section.columns.map((column) => ({
    key: column.key,
    header: column.label,
    align: isNumeric(column.type) ? 'right' : 'left',
    cell: (row) => (
      <span {...(isNumeric(column.type) ? stylex.props(styles.cellRight) : {})}>
        {formatCell(column.type, row[column.key] ?? null, currency, locale)}
      </span>
    ),
  }));
  const rows: KeyedRow[] = section.rows.map((row, index) => ({ ...row, __rk: String(index) }));
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.__rk}
      empty={<EmptyNote label={empty} />}
    />
  );
}

/** Whether a column type renders right-aligned + tabular. */
function isNumeric(type: ReportColumnType): boolean {
  return type === 'money' || type === 'number' || type === 'percent';
}

/** Format a chart/KPI value by its unit against the report currency + locale. */
export function formatUnitValue(
  unit: ReportValueUnit,
  value: number,
  currency: string,
  locale: string,
): string {
  if (unit === 'money') {
    return createNumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value / 100);
  }
  if (unit === 'percent') {
    return `${Math.round(value * 10) / 10}%`;
  }
  return createNumberFormat(locale).format(value);
}

/** Format one table cell by its column type. `null`/empty renders an em dash. */
export function formatCell(
  type: ReportColumnType,
  value: ReportCellValue,
  currency: string,
  locale: string,
): string {
  if (value === null || value === '') {
    return '—';
  }
  switch (type) {
    case 'money':
      return createNumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(Number(value) / 100);
    case 'percent':
      return `${Math.round(Number(value) * 10) / 10}%`;
    case 'number':
      return createNumberFormat(locale).format(Number(value));
    default:
      return String(value);
  }
}
