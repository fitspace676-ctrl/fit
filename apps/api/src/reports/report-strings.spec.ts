import { describe, expect, it } from 'vitest';
import {
  REPORT_DEFINITIONS,
  REPORT_KEYS,
  REPORT_METRIC_DEFINITIONS,
  REPORT_METRICS,
  REPORT_SEGMENTS,
  type ReportDrilldown,
  type ReportResult,
} from '@fit/types';
import {
  localizeDefinition,
  localizeDrilldown,
  localizeReportResult,
  reportStrings,
} from './report-strings';

/** Every string a Georgian reader could see, flattened, for the copy rules. */
function georgianStrings(): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(reportStrings('ka'));
  return out;
}

describe('reportStrings', () => {
  it('translates every catalogue report, its description and every one of its columns', () => {
    const ka = reportStrings('ka');
    for (const key of REPORT_KEYS) {
      const entry = ka.catalogue[key];
      expect(entry, key).toBeDefined();
      expect(entry.name, `${key} name`).toMatch(/[ა-ჰ]/);
      expect(entry.description, `${key} description`).toMatch(/[ა-ჰ]/);
      for (const column of REPORT_DEFINITIONS[key].columns) {
        // Georgian, or an acronym that stays one in both languages (MRR).
        expect(entry.columns[column.key], `${key}.${column.key}`).toMatch(/[ა-ჰ]|^[A-Z]{2,}$/);
      }
    }
  });

  it('translates every segment and every drill-down metric', () => {
    const ka = reportStrings('ka');
    for (const segment of REPORT_SEGMENTS) expect(ka.segments[segment]).toMatch(/[ა-ჰ]/);
    for (const metric of REPORT_METRICS) {
      expect(ka.metrics[metric].name, metric).toMatch(/[ა-ჰ]/);
      expect(ka.metrics[metric].description, metric).toMatch(/[ა-ჰ]/);
    }
  });

  it('has a title for every section id the drill-down catalogue declares', () => {
    const ka = reportStrings('ka');
    for (const metric of REPORT_METRICS) {
      for (const id of REPORT_METRIC_DEFINITIONS[metric].sections) {
        expect(ka.sections[id]?.title, id).toMatch(/[ა-ჰ]/);
      }
    }
  });

  it('English reads the catalogue straight from @fit/types, so the two cannot drift', () => {
    const en = reportStrings('en');
    expect(en.catalogue['sales-summary'].name).toBe(REPORT_DEFINITIONS['sales-summary'].name);
    expect(en.catalogue['sales-summary'].columns.gross).toBe('Gross');
    expect(en.metrics.pos.name).toBe(REPORT_METRIC_DEFINITIONS.pos.name);
  });

  it('uses plain hyphens, never a long dash, in the Georgian copy', () => {
    const offenders = georgianStrings().filter((s) => /[—–]/.test(s));
    expect(offenders).toEqual([]);
  });
});

describe('localizeReportResult', () => {
  const result: ReportResult = {
    key: 'sales-by-payment-method',
    name: 'Sales by payment method',
    range: 'mtd',
    from: '2026-08-01',
    to: '2026-08-31',
    currency: 'GEL',
    columns: REPORT_DEFINITIONS['sales-by-payment-method'].columns,
    rows: [],
  };

  it('leaves English untouched', () => {
    expect(localizeReportResult(result, 'en')).toEqual(result);
  });

  it('renames the report and its columns in Georgian, keeping the column keys', () => {
    const ka = localizeReportResult(result, 'ka');
    expect(ka.name).toBe('გაყიდვები გადახდის მეთოდით');
    expect(ka.columns.map((c) => c.key)).toEqual(result.columns.map((c) => c.key));
    expect(ka.columns[0]).toEqual({ key: 'method', label: 'მეთოდი', type: 'text' });
    expect(ka.columns.every((c) => /[ა-ჰ]/.test(c.label))).toBe(true);
  });
});

describe('localizeDefinition', () => {
  it('translates a catalogue entry in place: name, description, column labels; keys and segment kept', () => {
    const ka = localizeDefinition(REPORT_DEFINITIONS['sales-summary'], 'ka');
    expect(ka).toMatchObject({
      key: 'sales-summary',
      segment: 'sales',
      name: 'გაყიდვების შეჯამება',
    });
    expect(ka.description).toMatch(/[ა-ჰ]/);
    expect(ka.columns.map((c) => c.key)).toEqual(
      REPORT_DEFINITIONS['sales-summary'].columns.map((c) => c.key),
    );
    expect(localizeDefinition(REPORT_DEFINITIONS['sales-summary'], 'en')).toBe(
      REPORT_DEFINITIONS['sales-summary'],
    );
  });
});

describe('localizeDrilldown', () => {
  const drilldown: ReportDrilldown = {
    metric: 'members',
    name: 'Members',
    description: 'New members over time, active vs expired, churn trend, and monthly growth.',
    range: 'mtd',
    from: '2026-08-01',
    to: '2026-08-31',
    currency: 'GEL',
    kpis: [{ id: 'total-members', label: 'Total members', value: 3, unit: 'count' }],
    sections: [
      {
        kind: 'split',
        id: 'active-vs-expired',
        title: 'Active vs expired',
        unit: 'count',
        slices: [
          { label: 'Active', value: 2, tone: 'positive' },
          { label: 'Expired', value: 1, tone: 'negative' },
        ],
      },
      {
        kind: 'table',
        id: 'members-monthly',
        title: 'Monthly breakdown',
        columns: [
          { key: 'period', label: 'Month', type: 'date' },
          { key: 'netGrowth', label: 'Net growth', type: 'number' },
        ],
        rows: [{ period: '2026-08-01', netGrowth: 1 }],
      },
      {
        kind: 'heatmap',
        id: 'peak-hours',
        title: 'Peak hours',
        rowLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        colLabels: ['0', '1'],
        cells: [[0, 0]],
      },
    ],
  };

  it('translates the heading, KPI labels by id, section titles by id, table columns and split slices', () => {
    const ka = localizeDrilldown(drilldown, 'ka');
    expect(ka.name).toBe('წევრები');
    expect(ka.description).toMatch(/[ა-ჰ]/);
    expect(ka.kpis[0]).toMatchObject({ id: 'total-members', label: 'სულ წევრი', value: 3 });
    const split = ka.sections[0] as Extract<ReportDrilldown['sections'][number], { kind: 'split' }>;
    expect(split.title).toBe('აქტიური და ვადაგასული');
    expect(split.slices.map((s) => s.label)).toEqual(['აქტიური', 'ვადაგასული']);
    const table = ka.sections[1] as Extract<ReportDrilldown['sections'][number], { kind: 'table' }>;
    expect(table.columns.map((c) => c.label)).toEqual(['თვე', 'წმინდა ზრდა']);
    // Data rows are never touched: they are the gym's own figures and names.
    expect(table.rows).toEqual([{ period: '2026-08-01', netGrowth: 1 }]);
    const heat = ka.sections[2] as Extract<
      ReportDrilldown['sections'][number],
      { kind: 'heatmap' }
    >;
    expect(heat.rowLabels[0]).toBe('ორშ');
  });

  it('falls back to the English label for an id it does not know, rather than blanking it', () => {
    const odd: ReportDrilldown = {
      ...drilldown,
      kpis: [{ id: 'not-a-kpi', label: 'Something new', value: 1, unit: 'count' }],
    };
    expect(localizeDrilldown(odd, 'ka').kpis[0]?.label).toBe('Something new');
  });
});
