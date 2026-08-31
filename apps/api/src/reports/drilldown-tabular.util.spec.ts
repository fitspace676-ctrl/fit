import { describe, expect, it } from 'vitest';
import type { ReportDrilldown } from '@fit/types';
import { drilldownTables } from './drilldown-tabular.util';

/** A drill-down carrying one section of each kind, for the flattening assertions. */
function drilldown(sections: ReportDrilldown['sections']): ReportDrilldown {
  return {
    metric: 'sales',
    name: 'Sales',
    description: 'Test',
    range: 'mtd',
    from: '2026-08-01',
    to: '2026-08-31',
    currency: 'GEL',
    kpis: [
      { id: 'gross-sales', label: 'Gross sales', value: 724_300, unit: 'money' },
      { id: 'sale-count', label: 'Sales', value: 84, unit: 'count' },
      { id: 'attendance', label: 'Attendance', value: 92.5, unit: 'percent' },
    ],
    sections,
  };
}

describe('drilldownTables', () => {
  it('leads with a KPI summary whose money is in MAJOR units and named by currency', () => {
    const [summary] = drilldownTables(drilldown([]));

    expect(summary!.title).toBe('Summary');
    expect(summary!.rows).toEqual([
      // 724_300 minor units → 7243.00 major. A currency and a count cannot share a
      // typed column, so the unit rides beside the number instead of inside it.
      { metric: 'Gross sales', value: 7_243, unit: 'GEL' },
      { metric: 'Sales', value: 84, unit: 'count' },
      { metric: 'Attendance', value: 92.5, unit: '%' },
    ]);
  });

  it('maps a value unit onto the catalogue column type the exporters format by', () => {
    const [, money, count, percent] = drilldownTables(
      drilldown([
        { kind: 'series', id: 's1', title: 'Money', unit: 'money', points: [] },
        { kind: 'breakdown', id: 's2', title: 'Count', unit: 'count', items: [] },
        { kind: 'split', id: 's3', title: 'Percent', unit: 'percent', slices: [] },
      ]),
    );

    expect(money!.columns[1]!.type).toBe('money');
    expect(count!.columns[1]!.type).toBe('number');
    expect(percent!.columns[1]!.type).toBe('percent');
  });

  it('flattens a series into period/value rows', () => {
    const [, series] = drilldownTables(
      drilldown([
        {
          kind: 'series',
          id: 'net-sales-over-time',
          title: 'Net sales over time',
          unit: 'money',
          points: [
            { label: '2026-08-01', value: 30_000 },
            { label: '2026-08-02', value: -4_000 },
          ],
        },
      ]),
    );

    expect(series!.columns.map((c) => c.key)).toEqual(['period', 'value']);
    expect(series!.rows).toEqual([
      { period: '2026-08-01', value: 30_000 },
      { period: '2026-08-02', value: -4_000 },
    ]);
  });

  it('transposes a heatmap into one row per row-label, one column per col-label', () => {
    const [, heatmap] = drilldownTables(
      drilldown([
        {
          kind: 'heatmap',
          id: 'peak-hours',
          title: 'Peak hours',
          rowLabels: ['Mon', 'Tue'],
          colLabels: ['08', '09'],
          cells: [
            [3, 5],
            [0, 7],
          ],
        },
      ]),
    );

    expect(heatmap!.columns.map((c) => c.label)).toEqual(['', '08', '09']);
    expect(heatmap!.rows).toEqual([
      { row: 'Mon', c0: 3, c1: 5 },
      { row: 'Tue', c0: 0, c1: 7 },
    ]);
  });

  it('passes a table section through with its own columns', () => {
    const columns = [
      { key: 'date', label: 'Date', type: 'date' as const },
      { key: 'amount', label: 'Amount', type: 'money' as const },
    ];
    const [, table] = drilldownTables(
      drilldown([
        {
          kind: 'table',
          id: 'recent-refunds',
          title: 'Recent refunds',
          columns,
          rows: [{ date: '2026-08-07', amount: 4_500 }],
        },
      ]),
    );

    expect(table!.columns).toEqual(columns);
    expect(table!.rows).toEqual([{ date: '2026-08-07', amount: 4_500 }]);
  });

  it('keeps an empty section as a headers-only table rather than dropping it', () => {
    const tables = drilldownTables(
      drilldown([
        {
          kind: 'breakdown',
          id: 'top-selling-plans',
          title: 'Top plans',
          unit: 'money',
          items: [],
        },
      ]),
    );

    // "Nothing sold in this window" is an answer; an absent tab is a question.
    expect(tables).toHaveLength(2);
    expect(tables[1]!.title).toBe('Top plans');
    expect(tables[1]!.rows).toEqual([]);
    expect(tables[1]!.columns.length).toBeGreaterThan(0);
  });
});
