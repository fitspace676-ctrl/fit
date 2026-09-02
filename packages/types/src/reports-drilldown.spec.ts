import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_DRILLDOWN_RANGE,
  reportDrilldownExportQuerySchema,
  reportDrilldownQuerySchema,
  reportDrilldownRangeSchema,
} from './reports-drilldown';
import { DEFAULT_REPORT_RANGE, reportRangeSchema } from './reports';

describe('drill-down query schemas', () => {
  it('shares the Reports console range vocabulary and default', () => {
    expect(reportDrilldownRangeSchema.options).toEqual(reportRangeSchema.options);
    expect(DEFAULT_REPORT_DRILLDOWN_RANGE).toBe(DEFAULT_REPORT_RANGE);
    expect(reportDrilldownQuerySchema.parse({})).toEqual({ range: DEFAULT_REPORT_RANGE });
  });

  it('carries a custom range with its two days, on the preview and the export', () => {
    expect(
      reportDrilldownQuerySchema.parse({ range: 'custom', from: '2026-08-01', to: '2026-08-15' }),
    ).toEqual({ range: 'custom', from: '2026-08-01', to: '2026-08-15' });
    expect(
      reportDrilldownExportQuerySchema.parse({
        range: 'custom',
        from: '2026-08-01',
        to: '2026-08-15',
        format: 'xlsx',
      }),
    ).toEqual({ range: 'custom', from: '2026-08-01', to: '2026-08-15', format: 'xlsx' });
    expect(
      reportDrilldownQuerySchema.safeParse({
        range: 'custom',
        from: '2026-08-15',
        to: '2026-08-01',
      }).success,
    ).toBe(false);
  });
});
