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
export const REPORT_SEGMENTS = ['sales', 'members', 'revenue', 'classes', 'staff'] as const;

/** A report segment — {@link REPORT_SEGMENTS}. */
export const reportSegmentSchema = z.enum(REPORT_SEGMENTS);
export type ReportSegment = z.infer<typeof reportSegmentSchema>;

/** Display copy for each segment heading in the hub. */
export const REPORT_SEGMENT_LABEL: Record<ReportSegment, string> = {
  sales: 'Sales',
  members: 'Members',
  revenue: 'Revenue',
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
  'outstanding-invoices',
  'projected-revenue',
  'refunds-accounting',
  // Classes
  'attendance-by-class',
  'class-utilization',
  'class-cancellations',
  'waitlist-demand',
  'pt-sessions',
  'no-show-rate',
  // Staff
  'trainer-performance',
] as const;

/** A report catalogue key — {@link REPORT_KEYS}. */
export const reportKeySchema = z.enum(REPORT_KEYS);
export type ReportKey = z.infer<typeof reportKeySchema>;

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
      "Each day's takings and how they were collected - cash, card at the till, online, bank transfer, member account - beside the refunds issued, the number of sales, and the receipts behind the total.",
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'total', label: 'Total sales', type: 'money' },
      { key: 'cash', label: 'Cash', type: 'money' },
      { key: 'card', label: 'Card / POS', type: 'money' },
      { key: 'online', label: 'Online', type: 'money' },
      { key: 'bankTransfer', label: 'Bank transfer', type: 'money' },
      { key: 'memberAccount', label: 'Member account', type: 'money' },
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
    name: 'Members at risk',
    description:
      'Members who are still paying but have stopped turning up — call list, longest absence first.',
    columns: [
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'plan', label: 'Plan', type: 'text' },
      { key: 'lastVisit', label: 'Last visit', type: 'date' },
      { key: 'daysAway', label: 'Days away', type: 'number' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
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
    name: 'Member roster',
    description: 'Every member with their status, plan, join date and last visit.',
    columns: [
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'plan', label: 'Plan', type: 'text' },
      { key: 'joined', label: 'Joined', type: 'date' },
      { key: 'lastVisit', label: 'Last visit', type: 'date' },
      { key: 'email', label: 'Email', type: 'text' },
    ],
  },
  'member-check-in-log': {
    key: 'member-check-in-log',
    segment: 'members',
    name: 'Check-in log',
    description: 'Every visit in the window — who came in, when, how, and to which branch.',
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
  'outstanding-invoices': {
    key: 'outstanding-invoices',
    segment: 'revenue',
    name: 'Outstanding invoices',
    description: 'Unpaid and failed invoices, longest overdue first, with who owes what.',
    columns: [
      { key: 'invoice', label: 'Invoice', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'dueDate', label: 'Due', type: 'date' },
      { key: 'daysOverdue', label: 'Days overdue', type: 'number' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
  },
  'projected-revenue': {
    key: 'projected-revenue',
    segment: 'revenue',
    name: 'Projected revenue',
    description:
      'Subscription renewals falling due in the window ahead, and what they are scheduled to charge.',
    columns: [
      { key: 'period', label: 'Period', type: 'date' },
      { key: 'renewals', label: 'Renewals due', type: 'number' },
      { key: 'expected', label: 'Expected', type: 'money' },
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

  'attendance-by-class': {
    key: 'attendance-by-class',
    segment: 'classes',
    name: 'Class attendance',
    description: 'Seats booked, attended and missed per class, with both rates.',
    columns: [
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'booked', label: 'Booked', type: 'number' },
      { key: 'attended', label: 'Attended', type: 'number' },
      { key: 'noShow', label: 'No-shows', type: 'number' },
      { key: 'attendanceRate', label: 'Attendance rate', type: 'percent' },
      { key: 'noShowRate', label: 'No-show rate', type: 'percent' },
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
    name: 'Cancellations & no-shows',
    description:
      'Line-item list of who cancelled or failed to turn up, for policy and no-show fees.',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time', type: 'text' },
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'member', label: 'Member', type: 'text' },
      { key: 'outcome', label: 'Outcome', type: 'text' },
      { key: 'trainer', label: 'Trainer', type: 'text' },
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
      'Personal-training sessions per trainer. Revenue is not included: a PT session carries no price, and the money sits in the credit pack that paid for it.',
    columns: [
      { key: 'trainer', label: 'Trainer', type: 'text' },
      { key: 'sessions', label: 'Sessions', type: 'number' },
      { key: 'completed', label: 'Completed', type: 'number' },
      { key: 'cancelled', label: 'Cancelled', type: 'number' },
      { key: 'completionRate', label: 'Completion rate', type: 'percent' },
    ],
  },
  /* ---- Trainers & staff ------------------------------------------------- */

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
};

/** The catalogue as an ordered list, for the Reports hub's `GET /admin/reports`. */
export const REPORT_CATALOG: ReportDefinition[] = REPORT_KEYS.map((key) => REPORT_DEFINITIONS[key]);

/**
 * The report the hub opens on when the URL names none.
 *
 * The hub used to open on nothing: an empty preview pane beside an index where no
 * row was marked, which is a screen with no answer to "what am I looking at". The
 * first report in {@link REPORT_KEYS} is the catalogue's own idea of the most
 * general one, so it is what the screen leads with.
 */
export const DEFAULT_REPORT_KEY: ReportKey = REPORT_KEYS[0];

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
 * names its four sections outright: a new report reaches the digest only when
 * somebody decides it should.
 */
export const REPORT_DIGEST_KEYS: readonly ReportKey[] = [
  'sales-summary',
  'membership-movement',
  'attendance-by-class',
  'no-show-rate',
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
