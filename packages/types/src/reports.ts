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

/* -------------------------------------------------------------------------- */
/*  Request                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The reporting window the Reports console offers: today, the last 7 days, the
 * month so far, or two days of the reader's own choosing. The last one needs
 * `from` / `to` beside it — see {@link reportQuerySchema}.
 *
 * This used to alias the analytics vocabulary (`7d` / `30d` / `12w` / `12m`).
 * The two screens ask different questions — the dashboard trends over a fixed
 * span, a report answers "how did today / this week / this month go" — so the
 * Reports control now has its own words. The old spans did not vanish: they live
 * on as {@link reportWindowPresetSchema}, which the dashboard charts and the
 * emailed digest still window over.
 */
export const reportRangeSchema = z.enum(['today', '7d', 'mtd', 'custom']);
export type ReportRange = z.infer<typeof reportRangeSchema>;

/**
 * The default window when a report query omits `range` — the month so far. Typed
 * as the literal, not {@link ReportRange}, so it can also stand in as a resolver
 * preset: `custom` is the one range with no default window of its own.
 */
export const DEFAULT_REPORT_RANGE = 'mtd' satisfies ReportRange;

/**
 * Every preset the window resolver understands. A superset of the console's
 * {@link reportRangeSchema} (minus `custom`): `30d` / `12w` / `12m` are no longer
 * on the Reports control but the dashboard's granularity tabs and the report
 * digest still resolve through them, and one resolver serving all three is the
 * point — a bucket starts in the same place on every screen.
 */
export const reportWindowPresetSchema = z.enum(['today', '7d', '30d', 'mtd', '12w', '12m']);
export type ReportWindowPreset = z.infer<typeof reportWindowPresetSchema>;

/** Two calendar days, inclusive, in the gym's own zone. */
export interface ReportCustomWindow {
  from: string;
  to: string;
}

/** What the window resolver takes: a preset token, or a custom pair of days. */
export type ReportWindowInput = ReportWindowPreset | ReportCustomWindow;

/** Inclusive length, in days, of the longest custom window a report will run over. */
export const MAX_CUSTOM_RANGE_DAYS = 366;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → UTC-midnight epoch millis, or `null` when it is not a real day. */
function isoDayToUtc(value: string): number | null {
  const match = ISO_DAY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const at = Date.UTC(year, month - 1, day);
  const back = new Date(at);
  // Date.UTC rolls `2026-02-30` over to March; a real day round-trips.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return at;
}

/** A `YYYY-MM-DD` calendar day that exists. */
const isoDaySchema = z.string().refine((value) => isoDayToUtc(value) !== null, {
  message: 'Expected a YYYY-MM-DD calendar day',
});

/**
 * The `range` / `from` / `to` trio every report query carries. Kept as a shape
 * plus a refinement (rather than one schema) so the export query can add
 * `format` and still be refined the same way — `z.object(...).superRefine()`
 * cannot be extended afterwards.
 */
const reportWindowShape = {
  range: reportRangeSchema.default(DEFAULT_REPORT_RANGE),
  from: isoDaySchema.optional(),
  to: isoDaySchema.optional(),
};

type ReportWindowFields = { range: ReportRange; from?: string; to?: string };

/**
 * A `custom` range needs both days, in order, and no longer than
 * {@link MAX_CUSTOM_RANGE_DAYS}. A preset ignores the days — and DROPS them, so a
 * stale `&from=` left in a URL cannot reach the resolver beside `7d`.
 */
function refineReportWindow<T extends ReportWindowFields>(value: T, ctx: z.RefinementCtx): void {
  if (value.range !== 'custom') {
    delete value.from;
    delete value.to;
    return;
  }
  if (value.from === undefined || value.to === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.from === undefined ? 'from' : 'to'],
      message: 'A custom range needs both from and to',
    });
    return;
  }
  const from = isoDayToUtc(value.from);
  const to = isoDayToUtc(value.to);
  if (from === null || to === null) return; // already reported by isoDaySchema
  if (to < from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: 'to must not be before from',
    });
    return;
  }
  const days = Math.round((to - from) / 86_400_000) + 1;
  if (days > MAX_CUSTOM_RANGE_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: `A custom range covers at most ${MAX_CUSTOM_RANGE_DAYS} days`,
    });
  }
}

/**
 * The window's name in a download's filename: the preset token, or a custom
 * range's two days joined by an underscore (`2026-08-01_2026-08-15`) — both
 * shell-safe and both readable back into the query they came from.
 */
export function reportWindowSlug(query: ReportWindowFields): string {
  const input = reportWindowInput(query);
  return typeof input === 'string' ? input : `${input.from}_${input.to}`;
}

/**
 * The query string a window travels as — `range`, plus `from` / `to` only on a
 * custom range — shared by the console's links, its fetchers and its download
 * URLs so none of them can spell the window differently.
 */
export function reportQueryParams(query: ReportWindowFields): URLSearchParams {
  const params = new URLSearchParams({ range: query.range });
  if (query.range === 'custom' && query.from !== undefined && query.to !== undefined) {
    params.set('from', query.from);
    params.set('to', query.to);
  }
  return params;
}

/** What the resolver should window over, from a parsed query. */
export function reportWindowInput(query: ReportWindowFields): ReportWindowInput {
  if (query.range === 'custom') {
    // The schemas guarantee both days on a custom range; a hand-built query
    // that skips them gets the default rather than a half-open window.
    if (query.from === undefined || query.to === undefined) return DEFAULT_REPORT_RANGE;
    return { from: query.from, to: query.to };
  }
  return query.range;
}

/* -------------------------------------------------------------------------- */
/*  Segments                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The groups the Reports hub files its catalogue under.
 *
 * These are the dashboard's own segments (`./dashboard-segments`) minus
 * `overview`, which is a summary of the others rather than a subject of its own.
 * Sharing the vocabulary is the point: a figure called "net sales" has to mean
 * the same thing on the Sales dashboard tab and in a Sales report, and the surest
 * way to keep that true is for both to be filed under the same word.
 *
 * A segment with no reports yet is simply absent from the hub — the grouping is
 * derived from the catalogue, never hardcoded alongside it.
 */
export const REPORT_SEGMENTS = [
  'sales',
  'members',
  'revenue',
  'products',
  'classes',
  'staff',
] as const;

/** A report segment — {@link REPORT_SEGMENTS}. */
export const reportSegmentSchema = z.enum(REPORT_SEGMENTS);
export type ReportSegment = z.infer<typeof reportSegmentSchema>;

/** Display copy for each segment heading in the hub. */
export const REPORT_SEGMENT_LABEL: Record<ReportSegment, string> = {
  sales: 'Sales',
  members: 'Members',
  revenue: 'Revenue',
  products: 'Products',
  classes: 'Classes & training',
  staff: 'Trainers & staff',
};

/**
 * The report catalogue keys (T4.8). Stable, URL-safe slugs used as the `:report`
 * path segment and as the {@link REPORT_DEFINITIONS} map keys.
 *
 * Ordered by segment so the catalogue reads in the hub's own order. Each report's
 * segment lives on its {@link ReportDefinition}, not in this list.
 */
export const REPORT_KEYS = [
  // Sales
  'sales-summary',
  'sales-by-payment-method',
  'plan-performance',
  'sales-by-staff',
  'discounts-and-promotions',
  'refunds-detail',
  'pos-transaction-log',
  'sales-transactions',
  'daily-reconciliation',
  // Members
  'membership-movement',
  'retention-and-churn',
  'members-at-risk',
  'expiring-memberships',
  'member-roster',
  'member-check-in-log',
  'upcoming-occasions',
  // Revenue
  'revenue-summary',
  'revenue-by-channel',
  'revenue-by-location',
  'revenue-by-payment-method',
  'outstanding-invoices',
  'projected-revenue',
  'refunds-accounting',
  // Products
  'product-sales',
  'product-sales-detail',
  'stock-inventory',
  'stock-movements',
  // Classes
  'attendance-by-class',
  'class-utilization',
  'class-cancellations',
  'waitlist-demand',
  'pt-sessions',
  'credit-usage',
  'no-show-rate',
  // Staff
  'trainer-activity',
  'trainer-activity-detail',
  'trainer-performance',
  'trainer-sales',
  'trainer-sales-detail',
  'staff-schedule',
  'audit-log',
] as const;

/** A report catalogue key — {@link REPORT_KEYS}. */
export const reportKeySchema = z.enum(REPORT_KEYS);
export type ReportKey = z.infer<typeof reportKeySchema>;

/**
 * The reports the product OFFERS: the ones the hub lists, Settings > Reports
 * can toggle, and the digest may draw from. In the owner's own reading order.
 *
 * On 2026-09-02 the owner re-specified the catalogue segment by segment (Sales,
 * Members, Revenue, Products, Classes, Staff) and asked to see these and nothing else. The other {@link REPORT_KEYS} are
 * RETIRED, not deleted: their definitions, services, translations and tests
 * stay in the repo (a retired report still answers a bookmarked preview or
 * export link, exactly as a report a gym switched off does), so a segment the
 * owner re-specifies later is a matter of adding its keys here, not of digging
 * code out of git. Nothing derives its visible list from `REPORT_KEYS` any
 * more; everything a reader can find goes through this list.
 */
export const OFFERED_REPORT_KEYS = [
  // Sales
  'sales-transactions',
  'plan-performance',
  'daily-reconciliation',
  'refunds-detail',
  // Members
  'member-roster',
  'member-check-in-log',
  'members-at-risk',
  // Revenue
  'outstanding-invoices',
  'projected-revenue',
  'revenue-by-payment-method',
  // Products - the detail report is the "transaction detail" of Product sales.
  'product-sales',
  'product-sales-detail',
  'stock-inventory',
  'stock-movements',
  // Classes & training - the bookings report is the "class detail" of Classes & attendance.
  'attendance-by-class',
  'class-cancellations',
  'pt-sessions',
  'credit-usage',
  // Trainers & staff - each "detail" report is the line-level view of the one before it.
  'trainer-activity',
  'trainer-activity-detail',
  'trainer-sales',
  'trainer-sales-detail',
  'staff-schedule',
  'audit-log',
] as const satisfies readonly ReportKey[];

/** A report the product currently offers — {@link OFFERED_REPORT_KEYS}. */
export type OfferedReportKey = (typeof OFFERED_REPORT_KEYS)[number];

/** Whether `key` is one of the reports the product currently offers. */
export function isOfferedReport(key: ReportKey): key is OfferedReportKey {
  return (OFFERED_REPORT_KEYS as readonly ReportKey[]).includes(key);
}

/** The file formats a report can be exported as. */
export const reportFormatSchema = z.enum(['csv', 'xlsx']);
export type ReportFormat = z.infer<typeof reportFormatSchema>;

/** `GET /admin/reports/:report?range=&from=&to=` query — the on-screen preview. */
export const reportQuerySchema = z.object(reportWindowShape).superRefine(refineReportWindow);
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** `GET /admin/reports/:report/export?range=&from=&to=&format=` query — the file download. */
export const reportExportQuerySchema = z
  .object({ ...reportWindowShape, format: reportFormatSchema.default('csv') })
  .superRefine(refineReportWindow);
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

/** A report's static description — its key, segment, display copy, and column shape. */
export interface ReportDefinition {
  key: ReportKey;
  /** The hub group this report is filed under — see {@link REPORT_SEGMENTS}. */
  segment: ReportSegment;
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
  /* ---- Sales ------------------------------------------------------------ */

  'sales-summary': {
    key: 'sales-summary',
    segment: 'sales',
    name: 'Sales summary',
    description: 'Gross takings, refunds and net sales per period across the window.',
    columns: [
      { key: 'period', label: 'Period', type: 'date' },
      { key: 'orders', label: 'Orders', type: 'number' },
      { key: 'gross', label: 'Gross', type: 'money' },
      { key: 'refunded', label: 'Refunded', type: 'money' },
      { key: 'net', label: 'Net', type: 'money' },
    ],
  },
  'sales-by-payment-method': {
    key: 'sales-by-payment-method',
    segment: 'sales',
    name: 'Sales by payment method',
    description: 'How sales were settled — cash, card, or a member account.',
    columns: [
      { key: 'method', label: 'Method', type: 'text' },
      { key: 'orders', label: 'Orders', type: 'number' },
      { key: 'gross', label: 'Gross', type: 'money' },
      { key: 'refunded', label: 'Refunded', type: 'money' },
      { key: 'net', label: 'Net', type: 'money' },
    ],
  },
  'plan-performance': {
    key: 'plan-performance',
    segment: 'sales',
    name: 'Plan & service performance',
    description:
      "What sold - memberships, session packs, personal training, other services and products - how many, for how much, each one's share of the window's sales, and at which branch.",
    columns: [
      { key: 'item', label: 'Plan / service', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'sold', label: 'Sold', type: 'number' },
      { key: 'revenue', label: 'Sales value', type: 'money' },
      { key: 'share', label: 'Share of sales', type: 'percent' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'sales-by-staff': {
    key: 'sales-by-staff',
    segment: 'sales',
    name: 'Sales by staff member',
    description: 'Who rang up what at the till, for commission and incentive tracking.',
    columns: [
      { key: 'staff', label: 'Staff member', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'orders', label: 'Sales', type: 'number' },
      { key: 'gross', label: 'Gross', type: 'money' },
      { key: 'net', label: 'Net', type: 'money' },
    ],
  },
  'discounts-and-promotions': {
    key: 'discounts-and-promotions',
    segment: 'sales',
    name: 'Discounts & promotions',
    description: 'Every promo code redeemed in the window and what it gave away.',
    columns: [
      { key: 'code', label: 'Code', type: 'text' },
      { key: 'discountType', label: 'Type', type: 'text' },
      { key: 'redemptions', label: 'Redemptions', type: 'number' },
      { key: 'discountGiven', label: 'Given away', type: 'money' },
    ],
  },
  'refunds-detail': {
    key: 'refunds-detail',
    segment: 'sales',
    name: 'Refunds',
    description:
      'Every refund in the window - when, whose, against which sale and which items, how much, why, who processed it, and where.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'order', label: 'Original sale', type: 'text' },
      { key: 'items', label: 'Original items', type: 'text' },
      { key: 'amount', label: 'Refund amount', type: 'money' },
      { key: 'reason', label: 'Reason', type: 'text' },
      { key: 'processedBy', label: 'Staff member', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'pos-transaction-log': {
    key: 'pos-transaction-log',
    segment: 'sales',
    name: 'POS transaction log',
    description: 'Receipt-level till detail for reconciliation and disputes.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'order', label: 'Order', type: 'text' },
      { key: 'items', label: 'Items', type: 'text' },
      { key: 'method', label: 'Method', type: 'text' },
      { key: 'total', label: 'Total', type: 'money' },
      { key: 'staff', label: 'Sold by', type: 'text' },
    ],
  },
  'sales-transactions': {
    key: 'sales-transactions',
    segment: 'sales',
    name: 'Sales transactions',
    description:
      'Every sale in the window, one row per transaction - who bought what, how much, how it was paid, through which channel, where, and by whom.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'items', label: 'Items', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'method', label: 'Payment method', type: 'text' },
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'staff', label: 'Staff', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  'daily-reconciliation': {
    key: 'daily-reconciliation',
    segment: 'sales',
    name: 'Daily reconciliation',
    description:
      "Each day's takings and how they were collected - cash, card at the till, online, bank transfer, any other method - beside the refunds issued, the number of sales, and the receipts behind the total.",
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'total', label: 'Total sales', type: 'money' },
      { key: 'cash', label: 'Cash', type: 'money' },
      { key: 'card', label: 'Card / POS', type: 'money' },
      { key: 'online', label: 'Online', type: 'money' },
      { key: 'bankTransfer', label: 'Bank transfer', type: 'money' },
      // Everything the four named methods do not cover - today a member's account
      // balance, and any method the till learns later - so the row always sums.
      { key: 'other', label: 'Other payment methods', type: 'money' },
      { key: 'refunds', label: 'Refunds', type: 'money' },
      { key: 'transactions', label: 'Transactions', type: 'number' },
      { key: 'references', label: 'Underlying transactions', type: 'text' },
    ],
  },

  /* ---- Members ---------------------------------------------------------- */

  'membership-movement': {
    key: 'membership-movement',
    segment: 'members',
    name: 'Membership movement',
    description: 'Signups, cancellations and the net change per period, with the running total.',
    columns: [
      { key: 'period', label: 'Period', type: 'date' },
      { key: 'newMembers', label: 'New', type: 'number' },
      { key: 'cancellations', label: 'Cancelled', type: 'number' },
      { key: 'netChange', label: 'Net change', type: 'number' },
      { key: 'totalMembers', label: 'Total members', type: 'number' },
    ],
  },
  'retention-and-churn': {
    key: 'retention-and-churn',
    segment: 'members',
    name: 'Retention & churn',
    description:
      'Churn measured over rolling 30, 60 and 90-day windows ending at each period. Retention is the complement of the 30-day rate.',
    columns: [
      { key: 'period', label: 'Period', type: 'date' },
      { key: 'churned', label: 'Cancelled', type: 'number' },
      { key: 'retentionRate30', label: 'Retention (30d)', type: 'percent' },
      { key: 'churnRate30', label: 'Churn (30d)', type: 'percent' },
      { key: 'churnRate60', label: 'Churn (60d)', type: 'percent' },
      { key: 'churnRate90', label: 'Churn (90d)', type: 'percent' },
    ],
  },
  'members-at-risk': {
    key: 'members-at-risk',
    segment: 'members',
    name: 'Retention & engagement',
    description:
      'Members who need retention or renewal attention, filed by why: a renewal falling due, a membership about to expire, one that recently expired or was cancelled, a member who came back, and members who have stopped turning up.',
    columns: [
      { key: 'group', label: 'Attention', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'plan', label: 'Plan', type: 'text' },
      { key: 'status', label: 'Membership status', type: 'text' },
      { key: 'lastVisit', label: 'Last visit', type: 'date' },
      { key: 'daysSince', label: 'Days since last visit', type: 'number' },
      { key: 'expiresOn', label: 'Expires', type: 'date' },
      { key: 'renewal', label: 'Renewal', type: 'text' },
      { key: 'value', label: 'Membership value', type: 'money' },
    ],
  },
  'expiring-memberships': {
    key: 'expiring-memberships',
    segment: 'members',
    name: 'Expiring memberships',
    description:
      'Memberships running out inside the selected window, with the plan and how to reach them.',
    columns: [
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'plan', label: 'Plan', type: 'text' },
      { key: 'expiresOn', label: 'Expires', type: 'date' },
      { key: 'daysLeft', label: 'Days left', type: 'number' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
    ],
  },
  'member-roster': {
    key: 'member-roster',
    segment: 'members',
    name: 'Membership report',
    description:
      'The full member base with current membership information: status (active, new, expiring, renewal due, expired, cancelled, frozen), plan, dates, visits in the window, value and the next renewal.',
    columns: [
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'status', label: 'Membership status', type: 'text' },
      { key: 'plan', label: 'Plan', type: 'text' },
      { key: 'joined', label: 'Joined', type: 'date' },
      { key: 'startDate', label: 'Membership start', type: 'date' },
      { key: 'expiresOn', label: 'Expires', type: 'date' },
      { key: 'lastVisit', label: 'Last visit', type: 'date' },
      { key: 'visits', label: 'Visits in window', type: 'number' },
      { key: 'value', label: 'Membership value', type: 'money' },
      { key: 'nextRenewal', label: 'Next renewal', type: 'date' },
    ],
  },
  'member-check-in-log': {
    key: 'member-check-in-log',
    segment: 'members',
    name: 'Check-in report',
    description:
      'Every visit in the window - who came in, when, by which method, and to which branch.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'method', label: 'Method', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'upcoming-occasions': {
    key: 'upcoming-occasions',
    segment: 'members',
    name: 'Birthdays & anniversaries',
    description:
      'Birthdays and joining anniversaries falling inside the selected window, soonest first.',
    columns: [
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'occasion', label: 'Occasion', type: 'text' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'years', label: 'Years', type: 'number' },
      { key: 'phone', label: 'Phone', type: 'text' },
    ],
  },

  /* ---- Revenue ---------------------------------------------------------- */

  'revenue-summary': {
    key: 'revenue-summary',
    segment: 'revenue',
    name: 'Revenue summary',
    description:
      'Net revenue per period beside the recurring base: MRR and average revenue per member, both as they stood at the end of each period.',
    columns: [
      { key: 'period', label: 'Period', type: 'date' },
      { key: 'revenue', label: 'Revenue', type: 'money' },
      { key: 'mrr', label: 'MRR', type: 'money' },
      { key: 'activeMembers', label: 'Subscribed', type: 'number' },
      { key: 'arpm', label: 'Avg / member', type: 'money' },
    ],
  },
  'revenue-by-channel': {
    key: 'revenue-by-channel',
    segment: 'revenue',
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
  'revenue-by-location': {
    key: 'revenue-by-location',
    segment: 'revenue',
    name: 'Revenue by location',
    description:
      'Takings split across branches. Sales that never recorded a branch are grouped under "No location" rather than dropped.',
    columns: [
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'orders', label: 'Orders', type: 'number' },
      { key: 'gross', label: 'Gross', type: 'money' },
      { key: 'refunded', label: 'Refunded', type: 'money' },
      { key: 'net', label: 'Net', type: 'money' },
    ],
  },
  'revenue-by-payment-method': {
    key: 'revenue-by-payment-method',
    segment: 'revenue',
    name: 'Revenue by payment method',
    description:
      "How revenue was collected - cash, card at the till, online, bank transfer, any other method - per branch, net of refunds, with each method's share of the total.",
    columns: [
      { key: 'method', label: 'Payment method', type: 'text' },
      { key: 'payments', label: 'Payments', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'money' },
      { key: 'share', label: 'Share of revenue', type: 'percent' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'outstanding-invoices': {
    key: 'outstanding-invoices',
    segment: 'revenue',
    name: 'Invoices & payments',
    description:
      'Every invoice issued in the window plus every one still owed: what it was for, when it was issued and due, what was paid and what is outstanding, its status (paid, unpaid, overdue, upcoming, refunded), how and when it was paid, and where.',
    columns: [
      { key: 'invoice', label: 'Invoice', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'item', label: 'Plan / purchase', type: 'text' },
      { key: 'issuedAt', label: 'Invoice date', type: 'date' },
      { key: 'dueDate', label: 'Due', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'paid', label: 'Paid', type: 'money' },
      { key: 'outstanding', label: 'Outstanding', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'method', label: 'Payment method', type: 'text' },
      { key: 'paidAt', label: 'Paid on', type: 'date' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'projected-revenue': {
    key: 'projected-revenue',
    segment: 'revenue',
    name: 'Recurring & projected revenue',
    description:
      'Every live subscription with what it recurs at, its value per month (the monthly column sums to current recurring revenue), the next charge date, and what it is scheduled to charge inside the window AHEAD (the expected column sums to expected revenue for that period). Scheduled, not guaranteed: a renewal can fail or be cancelled first.',
    columns: [
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'plan', label: 'Plan', type: 'text' },
      { key: 'recurring', label: 'Recurring amount', type: 'money' },
      { key: 'interval', label: 'Billed', type: 'text' },
      { key: 'monthly', label: 'Per month', type: 'money' },
      { key: 'nextCharge', label: 'Next charge', type: 'date' },
      { key: 'expected', label: 'Expected in window', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  'refunds-accounting': {
    key: 'refunds-accounting',
    segment: 'revenue',
    name: 'Refunds (accounting)',
    description:
      'Refunds per period against the takings they reverse — the books view. Chargebacks are not included: no dispute data reaches the system yet.',
    columns: [
      { key: 'period', label: 'Period', type: 'date' },
      { key: 'refunds', label: 'Refunds', type: 'number' },
      { key: 'refunded', label: 'Refunded', type: 'money' },
      { key: 'gross', label: 'Gross taken', type: 'money' },
      { key: 'shareOfGross', label: 'Share of gross', type: 'percent' },
    ],
  },

  /* ---- Classes ---------------------------------------------------------- */

  'product-sales': {
    key: 'product-sales',
    segment: 'products',
    name: 'Product sales',
    description:
      'How physical products sold, through the till and online: per product, variant and branch - quantity, sales value, cost of goods, gross margin, average selling price, the POS / online split and how many sales carried it.',
    columns: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'variant', label: 'Variant', type: 'text' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'quantity', label: 'Quantity sold', type: 'number' },
      { key: 'revenue', label: 'Sales value', type: 'money' },
      { key: 'cogs', label: 'Cost of goods', type: 'money' },
      { key: 'margin', label: 'Gross margin', type: 'money' },
      { key: 'marginPct', label: 'Margin %', type: 'percent' },
      { key: 'avgPrice', label: 'Avg selling price', type: 'money' },
      { key: 'posSales', label: 'POS sales', type: 'money' },
      { key: 'onlineSales', label: 'Online sales', type: 'money' },
      { key: 'transactions', label: 'Transactions', type: 'number' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'product-sales-detail': {
    key: 'product-sales-detail',
    segment: 'products',
    name: 'Product sales detail',
    description:
      'Every product line sold in the window: when, what, how many, to whom, through which channel, at what price and cost, how it was paid, where, by whom, and the sale it belongs to.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'variant', label: 'Variant', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'price', label: 'Selling price', type: 'money' },
      { key: 'cost', label: 'Cost price', type: 'money' },
      { key: 'margin', label: 'Margin', type: 'money' },
      { key: 'method', label: 'Payment method', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'staff', label: 'Staff', type: 'text' },
      { key: 'reference', label: 'Reference', type: 'text' },
    ],
  },
  'stock-inventory': {
    key: 'stock-inventory',
    segment: 'products',
    name: 'Stock & inventory',
    description:
      'Current stock of every product and variant, its unit cost and stock value, the low-stock threshold, and a status against it (in stock, low stock, out of stock, not tracked). Stock is held per product, not per branch.',
    columns: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'variant', label: 'Variant', type: 'text' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'stock', label: 'Current stock', type: 'number' },
      { key: 'unitCost', label: 'Unit cost', type: 'money' },
      { key: 'stockValue', label: 'Stock value', type: 'money' },
      { key: 'threshold', label: 'Low-stock threshold', type: 'number' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  'stock-movements': {
    key: 'stock-movements',
    segment: 'products',
    name: 'Stock movement history',
    description:
      'Every change to product stock in the window, oldest first: the type (initial stock, received, POS sale, online sale, customer return, manual adjustment, stocktake correction, write-off), the change, stock before and after, the cost impact, the sale it came from, who made it, and the note left with it.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'variant', label: 'Variant', type: 'text' },
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'type', label: 'Movement type', type: 'text' },
      { key: 'delta', label: 'Quantity change', type: 'number' },
      { key: 'before', label: 'Stock before', type: 'number' },
      { key: 'after', label: 'Stock after', type: 'number' },
      { key: 'valueImpact', label: 'Cost impact', type: 'money' },
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'staff', label: 'Staff member', type: 'text' },
      { key: 'note', label: 'Note', type: 'text' },
    ],
  },
  'attendance-by-class': {
    key: 'attendance-by-class',
    segment: 'classes',
    name: 'Classes & attendance',
    description:
      'Every class session in the window: who taught it and where, its capacity, how many booked, attended, cancelled, failed to turn up or waited for a seat, and utilisation against capacity.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'capacity', label: 'Capacity', type: 'number' },
      { key: 'booked', label: 'Booked', type: 'number' },
      { key: 'attended', label: 'Attended', type: 'number' },
      { key: 'cancelled', label: 'Cancelled', type: 'number' },
      { key: 'noShows', label: 'No-shows', type: 'number' },
      { key: 'waitlist', label: 'Waitlisted', type: 'number' },
      { key: 'utilization', label: 'Utilization', type: 'percent' },
    ],
  },
  'class-utilization': {
    key: 'class-utilization',
    segment: 'classes',
    name: 'Class utilization',
    description:
      'Seats booked against seats offered per class — which sessions run full and which run empty.',
    columns: [
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'sessions', label: 'Sessions', type: 'number' },
      { key: 'capacity', label: 'Seats offered', type: 'number' },
      { key: 'booked', label: 'Seats booked', type: 'number' },
      { key: 'utilization', label: 'Utilization', type: 'percent' },
    ],
  },
  'class-cancellations': {
    key: 'class-cancellations',
    segment: 'classes',
    name: 'Class bookings',
    description:
      'Every booking on a session in the window, one row each: who, when they booked, the outcome (booked, attended, no-show, cancelled, waitlisted), whether they checked in around the class, and their waitlist place. The time a booking was cancelled is not recorded.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'bookedAt', label: 'Booked at', type: 'text' },
      { key: 'status', label: 'Attendance status', type: 'text' },
      { key: 'checkedIn', label: 'Checked in', type: 'text' },
      { key: 'waitlistPosition', label: 'Waitlist place', type: 'number' },
    ],
  },
  'waitlist-demand': {
    key: 'waitlist-demand',
    segment: 'classes',
    name: 'Waitlist demand',
    description:
      'How often a class filled up and how many were turned away — where another session would pay.',
    columns: [
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'sessions', label: 'Sessions', type: 'number' },
      { key: 'sessionsFull', label: 'Sessions full', type: 'number' },
      { key: 'waitlisted', label: 'Waitlisted', type: 'number' },
      { key: 'fullRate', label: 'Full rate', type: 'percent' },
    ],
  },
  'pt-sessions': {
    key: 'pt-sessions',
    segment: 'classes',
    name: 'PT sessions',
    description:
      "Every personal-training session in the window, one row each: a slot a member booked (with the invoice it raised) and the trainer calendar's own sessions. Neither is tied to a credit pack, so there is no package column yet.",
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'duration', label: 'Duration (min)', type: 'number' },
      { key: 'value', label: 'Session value', type: 'money' },
    ],
  },
  'credit-usage': {
    key: 'credit-usage',
    segment: 'classes',
    name: 'PT package & credit usage',
    description:
      'Every credit pack a member holds: sessions or credits purchased, used and remaining, when it expires, the last session it paid for, and whether it is active, used up or expired.',
    columns: [
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'package', label: 'Package', type: 'text' },
      { key: 'purchased', label: 'Purchased', type: 'number' },
      { key: 'used', label: 'Used', type: 'number' },
      { key: 'remaining', label: 'Remaining', type: 'number' },
      { key: 'expiresOn', label: 'Expires', type: 'date' },
      { key: 'lastSession', label: 'Last session', type: 'date' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  /* ---- Trainers & staff ------------------------------------------------- */

  'trainer-activity': {
    key: 'trainer-activity',
    segment: 'staff',
    name: 'Trainer activity',
    description:
      'What each trainer did in the window: classes run, PT sessions delivered, how many different members they trained, and how their class bookings ended - attended, cancelled, no-show. The location column lists the branches their classes ran at; a PT session carries no branch.',
    columns: [
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'classes', label: 'Classes run', type: 'number' },
      { key: 'ptSessions', label: 'PT sessions delivered', type: 'number' },
      { key: 'membersTrained', label: 'Members trained', type: 'number' },
      { key: 'attended', label: 'Class attendance', type: 'number' },
      { key: 'cancellations', label: 'Cancellations', type: 'number' },
      { key: 'noShows', label: 'No-shows', type: 'number' },
    ],
  },
  'trainer-activity-detail': {
    key: 'trainer-activity-detail',
    segment: 'staff',
    name: 'Trainer activity detail',
    description:
      'Every class booking and PT session in the window, one row each, under the trainer it belongs to: when, which kind, which class or session, which member, where, and how it ended.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'session', label: 'Class / session', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  'trainer-performance': {
    key: 'trainer-performance',
    segment: 'staff',
    name: 'Trainer performance',
    description:
      'Sessions delivered per trainer — group classes and personal training — with how full their classes ran.',
    columns: [
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'classes', label: 'Classes', type: 'number' },
      { key: 'ptSessions', label: 'PT sessions', type: 'number' },
      { key: 'seatsOffered', label: 'Seats offered', type: 'number' },
      { key: 'seatsBooked', label: 'Seats booked', type: 'number' },
      { key: 'utilization', label: 'Utilization', type: 'percent' },
    ],
  },

  'no-show-rate': {
    key: 'no-show-rate',
    segment: 'classes',
    name: 'No-show rate',
    description: 'Completed bookings and no-show rate per trainer.',
    columns: [
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'completed', label: 'Completed bookings', type: 'number' },
      { key: 'noShow', label: 'No-shows', type: 'number' },
      { key: 'noShowRate', label: 'No-show rate', type: 'percent' },
    ],
  },
  'trainer-sales': {
    key: 'trainer-sales',
    segment: 'staff',
    name: 'Trainer sales',
    description:
      'Personal-training sales per trainer and branch: session packs sold (attributed to the staff member who sold them - a pack is not tied to a trainer) and PT sessions delivered (attributed to the trainer who delivers them, with the invoice each raised), and their value.',
    columns: [
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'packagesSold', label: 'PT packages sold', type: 'number' },
      { key: 'sessionsSold', label: 'PT sessions sold', type: 'number' },
      { key: 'totalValue', label: 'Total sales value', type: 'money' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'trainer-sales-detail': {
    key: 'trainer-sales-detail',
    segment: 'staff',
    name: 'Trainer sales detail',
    description:
      'Every personal-training sale in the window, one row each: the trainer it is attributed to, the member, the pack or session, how many sessions it carries, the amount, when, and where.',
    columns: [
      { key: 'date', label: 'Purchase date', type: 'date' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'package', label: 'Package', type: 'text' },
      { key: 'sessions', label: 'Sessions', type: 'number' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'staff-schedule': {
    key: 'staff-schedule',
    segment: 'staff',
    name: 'Staff schedule',
    description:
      "Scheduled working time: the weekly shift pattern projected onto every day of the window it falls on. A shift's location is the text the rota holds, not a branch record.",
    columns: [
      { key: 'staff', label: 'Staff member', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'start', label: 'Scheduled start', type: 'text' },
      { key: 'end', label: 'Scheduled end', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
    ],
  },
  'audit-log': {
    key: 'audit-log',
    segment: 'staff',
    name: 'Audit log',
    description:
      'Recorded actions in the window: who, what, the record it touched, and the values before and after where the entry holds them. The trail is written by platform-operator actions and review moderation today; staff edits to members, prices and roles do not reach it yet.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'staff', label: 'Staff member', type: 'text' },
      { key: 'action', label: 'Action', type: 'text' },
      { key: 'target', label: 'Affected record', type: 'text' },
      { key: 'previous', label: 'Previous value', type: 'text' },
      { key: 'next', label: 'New value', type: 'text' },
    ],
  },
};

/**
 * The catalogue as an ordered list, for the Reports hub's `GET /admin/reports`:
 * the OFFERED reports only, in {@link OFFERED_REPORT_KEYS} order. A retired
 * report keeps its definition in {@link REPORT_DEFINITIONS} but is not in here.
 */
export const REPORT_CATALOG: ReportDefinition[] = OFFERED_REPORT_KEYS.map(
  (key) => REPORT_DEFINITIONS[key],
);

/**
 * The report the hub opens on when the URL names none.
 *
 * The hub used to open on nothing: an empty preview pane beside an index where no
 * row was marked, which is a screen with no answer to "what am I looking at". The
 * first OFFERED report is the catalogue's own idea of the most general one, so it
 * is what the screen leads with.
 */
export const DEFAULT_REPORT_KEY: ReportKey = OFFERED_REPORT_KEYS[0];

/**
 * The catalogue grouped for the hub, in {@link REPORT_SEGMENTS} order, with each
 * segment's reports in {@link REPORT_KEYS} order.
 *
 * DERIVED from the catalogue rather than hand-maintained beside it: a segment
 * appears only once a report claims it, so a segment that is still on the roadmap
 * cannot render as an empty heading, and adding a report cannot leave the grouping
 * out of date.
 */
export function groupReportsBySegment(
  reports: readonly ReportDefinition[],
  /** Segment headings — the catalogue response's own, localised, when there is one. */
  labels: Record<ReportSegment, string> = REPORT_SEGMENT_LABEL,
): Array<{ segment: ReportSegment; label: string; reports: ReportDefinition[] }> {
  return REPORT_SEGMENTS.map((segment) => ({
    segment,
    label: labels[segment],
    reports: reports.filter((report) => report.segment === segment),
  })).filter((group) => group.reports.length > 0);
}

/**
 * Successful `GET /admin/reports` response — the report catalogue, in the
 * language the request asked for, with the segment headings to file it under.
 */
export interface ReportCatalogResponse {
  reports: ReportDefinition[];
  segments: Record<ReportSegment, string>;
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
  /**
   * The first and last calendar day (gym's zone) the window resolved to — the
   * two days asked for on a `custom` range, and the days a preset landed on
   * otherwise, so the screen's date control can show the window it got.
   */
  from: string;
  to: string;
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
 * the trailing 7 days, a `monthly` one the trailing 30. Window PRESETS, not the
 * console's range: `30d` left the Reports control but the resolver still knows
 * it, so a digest section is windowed by the same math as the screen with no
 * separate logic to drift.
 */
export const REPORT_DIGEST_RANGE: Record<ReportDigestCadence, ReportWindowPreset> = {
  weekly: '7d',
  monthly: '30d',
};

/**
 * The reports, in order, that a digest includes — a CURATED list, not the whole
 * catalogue.
 *
 * This used to be an alias for {@link REPORT_KEYS}, which meant every report added
 * to the console silently joined the weekly email to every owner and manager. The
 * catalogue has since grown past what anyone wants in an inbox, so the digest now
 * names its sections outright: a new report reaches the digest only when somebody
 * decides it should.
 *
 * Drawn from {@link OFFERED_REPORT_KEYS} only: an email must not carry a report
 * the console no longer shows. The two sections are the ones that summarise a
 * week - a per-transaction table would be the whole ledger in an inbox.
 */
export const REPORT_DIGEST_KEYS: readonly OfferedReportKey[] = [
  'daily-reconciliation',
  'plan-performance',
];

/**
 * One report inside a digest — the same shape a live `GET /admin/reports/:report`
 * preview returns ({@link ReportResult}), so the email renderer reuses the report's
 * own columns + rows and no digest-specific report shape can drift from the source.
 */
/**
 * One digest section: a computed report WITHOUT the console's `range` — the
 * digest windows over a {@link ReportWindowPreset} the console no longer offers
 * (`30d`), and the {@link ReportDigest} carries that once for every section.
 */
export type ReportDigestSection = Omit<ReportResult, 'range' | 'from' | 'to'>;

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
  range: ReportWindowPreset;
  sections: ReportDigestSection[];
}

/* -------------------------------------------------------------------------- */
/*  Cell serialization (shared by the CSV + XLSX exporters)                     */
/* -------------------------------------------------------------------------- */

/**
 * Assumed minor units per major unit for the exporters' `money` columns (USD/EUR/
 * GEL — all two-decimal this milestone), mirroring the orders CSV export (T4.11).
 *
 * Exported because the drill-down export flattens its own money the same way, and
 * a second copy of `100` is exactly how two exports of the same figure start
 * disagreeing.
 */
export const REPORT_MINOR_PER_MAJOR = 100;

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
