import { describe, expect, it } from 'vitest';
import { REPORT_CHARTS, aggregateGroups, aggregateTime } from './report-charts';
import { OFFERED_REPORT_KEYS, REPORT_DEFINITIONS } from '@fit/types';

describe('aggregateTime', () => {
  const window = { from: '2026-11-01', to: '2026-11-04' };

  it('keeps every day of the window, quiet days included', () => {
    const data = aggregateTime(
      [
        { date: '2026-11-01', amount: 500 },
        { date: '2026-11-01', amount: 250 },
        { date: '2026-11-03', amount: 100 },
      ],
      { kind: 'time', date: 'date', agg: 'sum', value: ['amount'] },
      window,
    );
    expect(data.map((d) => [d.label, d.value])).toEqual([
      ['2026-11-01', 750],
      ['2026-11-02', 0],
      ['2026-11-03', 100],
      ['2026-11-04', 0],
    ]);
  });

  it('counts rows and carries a negative series beside the value', () => {
    const data = aggregateTime(
      [
        { date: '2026-11-02', total: 900, refunds: 50 },
        { date: '2026-11-02', total: 100, refunds: 0 },
      ],
      { kind: 'time', date: 'date', agg: 'sum', value: ['total'], negative: 'refunds' },
      window,
    );
    expect(data[1]).toEqual({ label: '2026-11-02', value: 1000, negative: 50 });
  });

  it('spans the rows own dates for a forecast', () => {
    const data = aggregateTime(
      [{ nextCharge: '2026-12-10', expected: 1 }],
      { kind: 'time', date: 'nextCharge', agg: 'count', axis: 'data' },
      window,
    );
    expect(data).toEqual([{ label: '2026-12-10', value: 1 }]);
  });

  it('groups a long window by week', () => {
    const data = aggregateTime(
      [{ date: '2026-03-04' }],
      { kind: 'time', date: 'date', agg: 'count' },
      { from: '2026-01-01', to: '2026-06-30' },
    );
    expect(data.length).toBeLessThan(30);
    // 2026-03-04 is a Wednesday; its week starts Monday 2026-03-02.
    expect(data.find((d) => d.value === 1)?.label).toBe('2026-03-02');
  });
});

describe('aggregateGroups', () => {
  const rows = ['a', 'a', 'a', 'b', 'b', 'c', 'd', null].map((method) => ({ method }));

  it('ranks by size and folds the tail into one "other"', () => {
    const groups = aggregateGroups(rows, { kind: 'rank', group: 'method', agg: 'count' }, 3);
    expect(groups).toEqual([
      { label: 'a', value: 3 },
      { label: 'b', value: 2 },
      { label: '', value: 3, other: true },
    ]);
  });

  it('averages without inventing an "other" total', () => {
    const groups = aggregateGroups(
      [
        { cls: 'Yoga', u: 60 },
        { cls: 'Yoga', u: 40 },
        { cls: 'Box', u: 10 },
      ],
      { kind: 'rank', group: 'cls', agg: 'avg', value: ['u'] },
      1,
    );
    expect(groups).toEqual([{ label: 'Yoga', value: 50 }]);
  });
});

describe('REPORT_CHARTS', () => {
  it('only reads columns the report actually has', () => {
    for (const key of OFFERED_REPORT_KEYS) {
      const columns = new Set(REPORT_DEFINITIONS[key].columns.map((c) => c.key));
      for (const spec of REPORT_CHARTS[key] ?? []) {
        const used =
          spec.kind === 'time'
            ? [spec.date, ...(spec.value ?? []), ...(spec.negative ? [spec.negative] : [])]
            : [spec.group, ...(spec.value ?? [])];
        for (const col of used) expect(columns, `${key}.${col}`).toContain(col);
      }
    }
  });
});
