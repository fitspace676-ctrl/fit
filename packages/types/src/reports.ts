// @fit/types — admin reports contracts (Zod schemas + inferred types).
//
// The wire shape for the admin console's Reports screen (T4.8): a small catalogue
// of tenant-scoped, range-windowed operational reports the console can preview on
// screen and download as CSV or XLSX. Every report is a REAL aggregation over rows
// that already exist in the schema — there are no fabricated figures (same honesty
// contract as `./analytics`). Where a report's slice has no source rows in the
// window it is simply absent from the result rather than shown as a fake zero.
//
// A report is described by a {@link ReportDefinition} (its columns + copy) and
// produced as a {@link ReportResult} (the definition's columns + the computed
// rows). The column list is the single source of truth the API service, the CSV
// stream, and the XLSX writer all agree on — mirroring how {@link ORDER_EXPORT_COLUMNS}
// pins the orders export.
//
// Money is carried the same way the order/billing/analytics contracts carry it —
// an integer in the currency's MINOR units (cents/tetri) — so no float rounding
// crosses the wire; the on-screen client formats with `Intl.NumberFormat` against
// the result's `currency`. The file exporters (CSV/XLSX) render money as major-unit
// decimals for spreadsheet reconciliation, exactly like the orders CSV export (T4.11).

import { z } from 'zod';
import { analyticsRangeSchema, DEFAULT_ANALYTICS_RANGE, type AnalyticsRange } from './analytics';

/* -------------------------------------------------------------------------- */
/*  Request                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The reporting window a report is computed over. Reuses the analytics range
 * vocabulary (`7d` / `30d` / `12w` / `12m`) so the Reports and Analytics screens
 * offer one consistent set of presets, and each value fixes the bucket granularity
 * of any time-series report (membership growth) the same way analytics does.
 */
export const reportRangeSchema = analyticsRangeSchema;
export type ReportRange = AnalyticsRange;

/** The default window when a report query omits `range`. */
export const DEFAULT_REPORT_RANGE: ReportRange = DEFAULT_ANALYTICS_RANGE;

/**
 * The report catalogue keys (T4.8). Stable, URL-safe slugs used as the `:report`
 * path segment and as the {@link REPORT_DEFINITIONS} map keys:
 *   • `revenue-by-channel`  — captured takings split POS vs ONLINE.
 *   • `attendance-by-class` — attended / no-show per class template + trainer.
 *   • `membership-growth`   — new + cumulative members bucketed across the window.
 *   • `no-show-rate`        — no-show rate per trainer.
 */
export const REPORT_KEYS = [
  'revenue-by-channel',
  'attendance-by-class',
  'membership-growth',
  'no-show-rate',
] as const;

/** A report catalogue key — {@link REPORT_KEYS}. */
export const reportKeySchema = z.enum(REPORT_KEYS);
export type ReportKey = z.infer<typeof reportKeySchema>;

/** The file formats a report can be exported as. */
export const reportFormatSchema = z.enum(['csv', 'xlsx']);
export type ReportFormat = z.infer<typeof reportFormatSchema>;

/** `GET /admin/reports/:report?range=` query — the on-screen preview. */
export const reportQuerySchema = z.object({
  range: reportRangeSchema.default(DEFAULT_REPORT_RANGE),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** `GET /admin/reports/:report/export?range=&format=` query — the file download. */
export const reportExportQuerySchema = z.object({
  range: reportRangeSchema.default(DEFAULT_REPORT_RANGE),
  format: reportFormatSchema.default('csv'),
});
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Definitions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How a report column is rendered. Drives both the on-screen formatting and the
 * file exporters: `money` cells are minor-unit integers on the wire (major-unit
 * decimals in the file), `percent` cells are 0–100 numbers, `date` cells are
 * `YYYY-MM-DD` strings, `number` is a plain integer, `text` a label.
 */
export const reportColumnTypeSchema = z.enum(['text', 'number', 'money', 'percent', 'date']);
export type ReportColumnType = z.infer<typeof reportColumnTypeSchema>;

/** One column of a report: the row-object key it reads, its header label, its type. */
export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

/** A report's static description — its key, display copy, and column shape. */
export interface ReportDefinition {
  key: ReportKey;
  name: string;
  description: string;
  columns: ReportColumn[];
}

/**
 * The report catalogue: the single source of truth for every report's columns and
 * copy, keyed by {@link ReportKey}. The API service produces rows against these
 * exact column keys; the CSV stream and XLSX writer read the same list for headers
 * and cell types, so the three surfaces can never drift.
 */
export const REPORT_DEFINITIONS: Record<ReportKey, ReportDefinition> = {
  'revenue-by-channel': {
    key: 'revenue-by-channel',
    name: 'Revenue by channel',
    description: 'Captured takings split by sales channel (POS vs online), net of refunds.',
    columns: [
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'orders', label: 'Orders', type: 'number' },
      { key: 'gross', label: 'Gross', type: 'money' },
      { key: 'refunded', label: 'Refunded', type: 'money' },
      { key: 'net', label: 'Net', type: 'money' },
    ],
  },
  'attendance-by-class': {
    key: 'attendance-by-class',
    name: 'Attendance by class',
    description: 'Attended vs no-show bookings per class, with the attendance rate.',
    columns: [
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'attended', label: 'Attended', type: 'number' },
      { key: 'noShow', label: 'No-shows', type: 'number' },
      { key: 'attendanceRate', label: 'Attendance rate', type: 'percent' },
    ],
  },
  'membership-growth': {
    key: 'membership-growth',
    name: 'Membership growth',
    description: 'New and cumulative members across the reporting window.',
    columns: [
      { key: 'period', label: 'Period', type: 'date' },
      { key: 'newMembers', label: 'New members', type: 'number' },
      { key: 'cumulativeMembers', label: 'Total members', type: 'number' },
    ],
  },
  'no-show-rate': {
    key: 'no-show-rate',
    name: 'No-show rate',
    description: 'Completed bookings and no-show rate per trainer.',
    columns: [
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'completed', label: 'Completed bookings', type: 'number' },
      { key: 'noShow', label: 'No-shows', type: 'number' },
      { key: 'noShowRate', label: 'No-show rate', type: 'percent' },
    ],
  },
};

/** The catalogue as an ordered list, for the Reports hub's `GET /admin/reports`. */
export const REPORT_CATALOG: ReportDefinition[] = REPORT_KEYS.map((key) => REPORT_DEFINITIONS[key]);

/** Successful `GET /admin/reports` response — the report catalogue. */
export interface ReportCatalogResponse {
  reports: ReportDefinition[];
}

/* -------------------------------------------------------------------------- */
/*  Result                                                                      */
/* -------------------------------------------------------------------------- */

/** One value in a report row — a label/date string, a number, or null (no value). */
export type ReportCellValue = string | number | null;

/** One computed report row, keyed by its columns' `key`s. */
export type ReportRow = Record<string, ReportCellValue>;

/**
 * A computed report (`GET /admin/reports/:report`): the definition's `columns`
 * echoed back for the renderer, the computed `rows`, the `range` it covers, and
 * the reporting `currency` any `money` column is denominated in. Money values in
 * `rows` are MINOR-unit integers.
 */
export interface ReportResult {
  key: ReportKey;
  name: string;
  range: ReportRange;
  currency: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}

/* -------------------------------------------------------------------------- */
/*  Scheduled digest (T4.10)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How often a gym's owner/manager receive the operational report digest by email
 * (T4.10): `weekly` (the trailing week) or `monthly` (the trailing 30 days). The
 * cadence fixes the reporting window each section is computed over — see
 * {@link REPORT_DIGEST_RANGE}.
 */
export const reportDigestCadenceSchema = z.enum(['weekly', 'monthly']);

/** A report-digest cadence — {@link reportDigestCadenceSchema}. */
export type ReportDigestCadence = z.infer<typeof reportDigestCadenceSchema>;

/** Human label for a digest cadence, for the email subject/heading copy. */
export const REPORT_DIGEST_CADENCE_LABEL: Record<ReportDigestCadence, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/**
 * The reporting window each cadence's sections cover — a `weekly` digest reports
 * the trailing 7 days, a `monthly` one the trailing 30. Reuses the report range
 * vocabulary so a digest section is exactly the report the console would show for
 * that same range, with no separate windowing logic to drift.
 */
export const REPORT_DIGEST_RANGE: Record<ReportDigestCadence, ReportRange> = {
  weekly: '7d',
  monthly: '30d',
};

/**
 * The reports, in order, that a digest includes — the full catalogue. Kept as its
 * own list (rather than inlining {@link REPORT_KEYS}) so the digest's contents can
 * be curated independently of the on-screen catalogue if they ever diverge.
 */
export const REPORT_DIGEST_KEYS: readonly ReportKey[] = REPORT_KEYS;

/**
 * One report inside a digest — the same shape a live `GET /admin/reports/:report`
 * preview returns ({@link ReportResult}), so the email renderer reuses the report's
 * own columns + rows and no digest-specific report shape can drift from the source.
 */
export type ReportDigestSection = ReportResult;

/**
 * A gym's computed report digest (T4.10): the gym it is for, the `cadence` and the
 * `range` its sections cover, and one {@link ReportDigestSection} per included
 * report. This is the payload {@link ReportResult}-based email rendering consumes;
 * a section whose report produced no rows still appears (its table renders an
 * honest "no activity" empty state) so the recipient sees the full picture.
 */
export interface ReportDigest {
  gymName: string;
  cadence: ReportDigestCadence;
  range: ReportRange;
  sections: ReportDigestSection[];
}

/* -------------------------------------------------------------------------- */
/*  Cell serialization (shared by the CSV + XLSX exporters)                     */
/* -------------------------------------------------------------------------- */

/**
 * Assumed minor units per major unit for the exporters' `money` columns (USD/EUR/
 * GEL — all two-decimal this milestone), mirroring the orders CSV export (T4.11).
 */
const REPORT_MINOR_PER_MAJOR = 100;

/** Round to one decimal place (percentage columns in the file exports). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Render one cell as the plain string a CSV field carries, by column type: `money`
 * minor units become a major-unit decimal (`1000` → `"10.00"`), `percent` a
 * one-decimal figure (`42.5`), everything else its own string. A null cell is
 * empty. The service wraps the result in RFC-4180 escaping before joining.
 */
export function formatReportCsvCell(type: ReportColumnType, value: ReportCellValue): string {
  if (value === null || value === '') {
    return '';
  }
  switch (type) {
    case 'money':
      return (Number(value) / REPORT_MINOR_PER_MAJOR).toFixed(2);
    case 'percent':
      return round1(Number(value)).toFixed(1);
    default:
      return String(value);
  }
}

/** Render a whole row as ordered CSV cell strings, matching `columns`. */
export function reportCsvRow(columns: ReportColumn[], row: ReportRow): string[] {
  return columns.map((column) => formatReportCsvCell(column.type, row[column.key] ?? null));
}

/**
 * A typed cell for the XLSX writer: a `number` cell (Excel treats it numerically)
 * or a `text` cell (an inline string). `money`/`percent`/`number` become numbers
 * — money in major units, percent rounded — so the spreadsheet can sum and sort
 * them; `text`/`date` and any null stay strings.
 */
export type ReportXlsxCell = { type: 'number'; value: number } | { type: 'text'; value: string };

/** Render one cell as its typed XLSX value, by column type. */
export function reportXlsxCell(type: ReportColumnType, value: ReportCellValue): ReportXlsxCell {
  if (value === null || value === '') {
    return { type: 'text', value: '' };
  }
  switch (type) {
    case 'money':
      return { type: 'number', value: Number(value) / REPORT_MINOR_PER_MAJOR };
    case 'percent':
      return { type: 'number', value: round1(Number(value)) };
    case 'number':
      return { type: 'number', value: Number(value) };
    default:
      return { type: 'text', value: String(value) };
  }
}

/** Render a whole row as ordered typed XLSX cells, matching `columns`. */
export function reportXlsxRow(columns: ReportColumn[], row: ReportRow): ReportXlsxCell[] {
  return columns.map((column) => reportXlsxCell(column.type, row[column.key] ?? null));
}
