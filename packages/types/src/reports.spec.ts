import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_RANGE,
  formatReportCsvCell,
  REPORT_CATALOG,
  REPORT_DEFINITIONS,
  REPORT_KEYS,
  reportCsvRow,
  reportExportQuerySchema,
  reportQuerySchema,
  reportXlsxCell,
  reportXlsxRow,
  type ReportColumn,
} from './reports';

describe('report definitions', () => {
  it('exposes a definition for every catalogue key, in order', () => {
    expect(REPORT_CATALOG.map((r) => r.key)).toEqual([...REPORT_KEYS]);
    for (const key of REPORT_KEYS) {
      expect(REPORT_DEFINITIONS[key].key).toBe(key);
    }
  });

  it('every definition has a non-empty column list with unique keys', () => {
    for (const key of REPORT_KEYS) {
      const columns = REPORT_DEFINITIONS[key].columns;
      expect(columns.length).toBeGreaterThan(0);
      const keys = columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('report query schemas', () => {
  it('defaults the preview range to the shared default', () => {
    expect(reportQuerySchema.parse({})).toEqual({ range: DEFAULT_REPORT_RANGE });
  });

  it('defaults the export to a CSV of the default range', () => {
    expect(reportExportQuerySchema.parse({})).toEqual({
      range: DEFAULT_REPORT_RANGE,
      format: 'csv',
    });
  });

  it('accepts a valid range + format and rejects unknown ones', () => {
    expect(reportExportQuerySchema.parse({ range: '12m', format: 'xlsx' })).toEqual({
      range: '12m',
      format: 'xlsx',
    });
    expect(reportExportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ range: '1y' }).success).toBe(false);
  });
});

describe('formatReportCsvCell', () => {
  it('renders money minor units as major-unit decimals', () => {
    expect(formatReportCsvCell('money', 1000)).toBe('10.00');
    expect(formatReportCsvCell('money', 0)).toBe('0.00');
    expect(formatReportCsvCell('money', 12345)).toBe('123.45');
  });

  it('renders a percentage to one decimal', () => {
    expect(formatReportCsvCell('percent', 42.5)).toBe('42.5');
    expect(formatReportCsvCell('percent', 100)).toBe('100.0');
  });

  it('passes text/number/date through as strings and null as empty', () => {
    expect(formatReportCsvCell('text', 'POS')).toBe('POS');
    expect(formatReportCsvCell('number', 7)).toBe('7');
    expect(formatReportCsvCell('date', '2026-06-01')).toBe('2026-06-01');
    expect(formatReportCsvCell('percent', null)).toBe('');
    expect(formatReportCsvCell('money', null)).toBe('');
  });
});

describe('reportCsvRow', () => {
  const columns: ReportColumn[] = [
    { key: 'channel', label: 'Channel', type: 'text' },
    { key: 'orders', label: 'Orders', type: 'number' },
    { key: 'net', label: 'Net', type: 'money' },
  ];

  it('emits one cell per column, in order, formatted by type', () => {
    expect(reportCsvRow(columns, { channel: 'POS', orders: 3, net: 4500 })).toEqual([
      'POS',
      '3',
      '45.00',
    ]);
  });

  it('renders a missing key as empty', () => {
    expect(reportCsvRow(columns, { channel: 'ONLINE', orders: 0 })).toEqual(['ONLINE', '0', '']);
  });
});

describe('reportXlsxCell', () => {
  it('turns money into a numeric major-unit value', () => {
    expect(reportXlsxCell('money', 4500)).toEqual({ type: 'number', value: 45 });
  });

  it('turns percent + number into numeric cells and text/date into strings', () => {
    expect(reportXlsxCell('percent', 42.55)).toEqual({ type: 'number', value: 42.6 });
    expect(reportXlsxCell('number', 12)).toEqual({ type: 'number', value: 12 });
    expect(reportXlsxCell('text', 'Yoga')).toEqual({ type: 'text', value: 'Yoga' });
    expect(reportXlsxCell('date', '2026-06-01')).toEqual({ type: 'text', value: '2026-06-01' });
  });

  it('renders null as an empty text cell', () => {
    expect(reportXlsxCell('money', null)).toEqual({ type: 'text', value: '' });
  });
});

describe('reportXlsxRow', () => {
  it('maps each column to a typed cell', () => {
    const columns: ReportColumn[] = [
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'rate', label: 'Rate', type: 'percent' },
    ];
    expect(reportXlsxRow(columns, { class: 'Spin', rate: 80 })).toEqual([
      { type: 'text', value: 'Spin' },
      { type: 'number', value: 80 },
    ]);
  });
});
