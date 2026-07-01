// @fit/types — gym-member admin contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's member management
// (T4.2): the paginated `GET /members` roster the admin table renders, the
// `GET /members/:id` detail view its tabs read, and the `POST /members/bulk-export`
// async CSV job. The API validates inbound queries/bodies with these Zod schemas
// and the `@fit/admin` console reuses the inferred types, so the table / detail
// page and the controller can never drift on the wire format.
//
// Several MemberRow fields have no backing model yet — `phone` lands with the
// member profile (T4.3), and `planName` / `lastVisitAt` / `nextBillingAt` plus
// the detail's `subscriptions` / `bookings` / `payments` come with billing +
// class-attendance (Phase 5/6). Like the trainers (T3.6) and classes (T3.4)
// contracts, this file fixes the *final* wire shape now; the service returns
// `null` / `[]` for the deferred fields until their sources exist, so no client
// change is needed when they land.

import { z } from 'zod';

/**
 * A member's standing within the gym, mirroring the Prisma `GymMemberStatus`
 * enum. `ACTIVE` is a current member; `INVITED` has been added but not yet
 * onboarded; `SUSPENDED` is frozen/deactivated (T4.3). The roster filter and the
 * status badge both key off this.
 */
export const memberStatusSchema = z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']);

/** A member's lifecycle state — {@link memberStatusSchema}. */
export type MemberStatus = z.infer<typeof memberStatusSchema>;

/** Sortable columns for the roster. Mirrors the `orderBy` keys the service maps. */
export const memberSortSchema = z.enum(['name', 'status', 'joinedAt', 'lastVisitAt']);

/** A column the roster may be sorted by — {@link memberSortSchema}. */
export type MemberSort = z.infer<typeof memberSortSchema>;

/** Sort direction. */
export const sortDirSchema = z.enum(['asc', 'desc']);

/** Ascending or descending sort — {@link sortDirSchema}. */
export type SortDir = z.infer<typeof sortDirSchema>;

/**
 * Query for `GET /members`. Pagination is **mandatory server-side** (the roster
 * must scale to 10k+ members, never loaded into memory): `page` is 1-based and
 * `limit` is capped at 100. `search` matches name/email; `status` and `planId`
 * narrow the list; `sort` + `dir` drive server-side ordering. Every field is
 * optional with a sensible default so a bare `GET /members` is valid. Numbers
 * are coerced because they arrive as query strings.
 */
export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: memberStatusSchema.optional(),
  planId: z.string().min(1).optional(),
  sort: memberSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /members` query — {@link listMembersQuerySchema}. */
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

/**
 * A member's live plan, denormalised for the roster's PLAN cell (Planflow
 * "formacore"). Derived from the member's live {@link Subscription} + its
 * catalogue {@link SubscriptionPlan}: `name` is the plan name, `interval` its
 * billing period, `detail` a short human hint (e.g. "annual" / "monthly" /
 * "paused" / "overdue" / a lari price), and `color` a hex swatch for the row dot.
 * `null` when the member holds no live subscription.
 */
export interface MemberPlan {
  /** Catalogue plan id, or `null` for a live subscription whose plan was deleted. */
  planId: string | null;
  /** Plan name (`"No plan"` when the subscription's plan was deleted). */
  name: string;
  /** Billing interval — `"MONTH"` / `"YEAR"`, or `null` when unknown. */
  interval: 'MONTH' | 'YEAR' | null;
  /** Price in minor currency units (tetri) snapshotted on the subscription. */
  priceAmount: number;
  /** ISO-4217 currency code of {@link priceAmount}. */
  currency: string;
  /** Short PLAN-cell detail, e.g. "annual" / "monthly" / "paused" / "overdue". */
  detail: string;
  /** A hex swatch for the row's plan dot. */
  color: string | null;
}

/**
 * The kind of a member's NEXT-BILLING cell, so the table can render a date, a
 * paused/overdue chip, or an em dash without re-deriving it from the raw dates.
 */
export type MemberBillingState = 'due' | 'paused' | 'overdue' | 'none';

/**
 * One member as the roster table renders it — a denormalised row, never the raw
 * `GymMember` + `User`. Enriched (Planflow "formacore") with the member's live
 * `plan`, latest `lastVisitAt` (from `CheckIn`), and the `nextBilling` cell state.
 * `planName` is retained (the plan's name, or `null`) so older callers keep
 * working. Dates are ISO-8601 instants the table formats in the staff member's
 * local zone.
 */
export interface MemberRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  /** The live plan's name (or `null`), kept for backwards compatibility. */
  planName: string | null;
  /** The live plan denormalised for the roster's PLAN cell, or `null`. */
  plan: MemberPlan | null;
  /** ISO instant of the member's most recent `CheckIn`, or `null` for none. */
  lastVisitAt: string | null;
  /** ISO instant the live subscription next bills, or `null` (see `billingState`). */
  nextBillingAt: string | null;
  /** How the NEXT-BILLING cell should read (`due` date / `paused` / `overdue` / `none`). */
  billingState: MemberBillingState;
}

/** One plan in the roster's gym-wide "plan mix" bar. Mirrors `DashboardPlanSlice`. */
export interface MemberPlanSlice {
  /** Catalogue plan id, or `null` for live subscriptions whose plan was deleted. */
  planId: string | null;
  /** Plan name for the legend (`"No plan"` when unattributed). */
  name: string;
  /** Live subscribers on this plan. */
  count: number;
  /** A hex colour for the stacked bar + legend dot. */
  color: string | null;
}

/**
 * The roster's gym-wide "plan mix" bar: the paid-members total plus one slice per
 * live plan (subscribers grouped by their catalogue plan, richest first). Every
 * figure is a real tenant-scoped aggregate over live subscriptions.
 */
export interface MemberPlanMix {
  /** Total live (paid) subscriptions across all plans. */
  total: number;
  /** One slice per plan, richest first. */
  plans: MemberPlanSlice[];
}

/**
 * The roster's segmented tab counts — the gym-wide member count in each state,
 * so the tabs render "All 128 / Active 96 / Frozen 4 / Trial 2 / Expired 26"
 * without a per-tab request. `frozen` counts members with a live `FROZEN`
 * subscription; `trial` / `expired` mirror the `INVITED` / `SUSPENDED` roster
 * states (the reference's segment labels); `all` / `active` mirror the roster.
 */
export interface MemberTabCounts {
  /** Every `MEMBER`-role membership. */
  all: number;
  /** `ACTIVE` memberships. */
  active: number;
  /** Members whose live subscription is `FROZEN`. */
  frozen: number;
  /** `INVITED` memberships (the reference's "Trial" segment). */
  trial: number;
  /** `SUSPENDED` memberships (the reference's "Expired" segment). */
  expired: number;
}

/**
 * Successful `GET /members` response — one page of the roster plus the totals the
 * pager needs, and the gym-wide `planMix` + tab `counts` the "formacore" header
 * renders. `total` is the count *after* filters (so the pager is accurate),
 * `page` / `limit` echo the request. An empty `data` is a normal result the table
 * renders as its empty state.
 */
export interface ListMembersResponse {
  data: MemberRow[];
  total: number;
  page: number;
  limit: number;
  /** Gym-wide live plan mix (independent of the page's filters). */
  planMix: MemberPlanMix;
  /** Gym-wide member counts per segment (independent of the page's filters). */
  counts: MemberTabCounts;
}

/** One subscription on a member's detail page — the member's `Subscription` rows. */
export interface MemberSubscription {
  id: string;
  planName: string;
  status: string;
  startedAt: string;
  /** ISO instant the subscription renews / ends, or `null` for open-ended. */
  renewsAt: string | null;
}

/** One class booking on a member's detail page — the member's `Booking` rows. */
export interface MemberBooking {
  id: string;
  title: string;
  startsAt: string;
  status: string;
}

/** One payment on a member's detail page — a captured `Payment` on the member's orders. */
export interface MemberPayment {
  id: string;
  /** Amount in minor currency units (tetri). */
  amount: number;
  status: string;
  paidAt: string;
}

/** The kind of a member-detail activity-timeline entry, driving its icon/tone. */
export type MemberActivityKind = 'checkin' | 'booking' | 'payment' | 'milestone';

/**
 * One entry of the member detail's "Recent activity" timeline — a merge of the
 * member's real recent check-ins / bookings / payments (+ the join milestone),
 * newest first. Never fabricated: an entry exists only for a real record.
 */
export interface MemberActivity {
  kind: MemberActivityKind;
  /** Short headline (e.g. "Checked in", "Booked Spin Express", "Payment captured"). */
  title: string;
  /** Secondary detail (e.g. the amount, the class time, the booking status). */
  detail: string;
  /** When the event happened, ISO-8601 instant. */
  at: string;
}

/** One week of the member detail's "Attendance · last 8 weeks" bar chart. */
export interface MemberAttendanceWeek {
  /** ISO instant of the week's Monday (client formats a short label). */
  weekStart: string;
  /** Check-ins recorded in that week. */
  count: number;
}

/**
 * The member's live plan on the detail page's "Current plan" panel — richer than
 * the row's {@link MemberPlan}: it also carries the period bounds so the panel can
 * draw a days-remaining bar. `null` when the member holds no live subscription.
 */
export interface MemberCurrentPlan {
  /** The live `Subscription` id (for the Freeze / Add-credit affordances). */
  subscriptionId: string;
  planId: string | null;
  name: string;
  status: string;
  /** Billing interval — `"MONTH"` / `"YEAR"`, or `null` when unknown. */
  interval: 'MONTH' | 'YEAR' | null;
  /** Price in minor currency units (tetri). */
  priceAmount: number;
  currency: string;
  /** ISO instant the current period began. */
  currentPeriodStart: string;
  /** ISO instant the current period ends (renews / bills). */
  currentPeriodEnd: string;
  /** Whole days from now until `currentPeriodEnd` (clamped at 0), for the bar. */
  daysRemaining: number;
  color: string | null;
}

/**
 * One member as the detail page needs it — the same row the table renders, plus
 * the "formacore" KPIs (`lifetimeValue` / `totalVisits` / `nextBilling`), the
 * live `currentPlan`, the `recentActivity` timeline, the `attendance8w` series,
 * and the tabbed history. Every figure is a real tenant-scoped query. `tags` is
 * always empty and `notes` always `''` — the schema has NO member-tags or
 * member-notes model, so these are honest empty states, never fabricated (see
 * `members.service.ts`).
 */
export interface MemberDetail extends MemberRow {
  /** ISO instant the member joined the gym (the "Member since" KPI). */
  joinedAt: string;
  /** Sum of the member's CAPTURED payments, in minor currency units (tetri). */
  lifetimeValue: number;
  /** ISO-4217 currency code of {@link lifetimeValue}. */
  currency: string;
  /** Total `CheckIn` count for the member (the "Total visits" KPI). */
  totalVisits: number;
  /** The member's live plan for the "Current plan" panel, or `null`. */
  currentPlan: MemberCurrentPlan | null;
  /** Merged recent activity timeline, newest first. */
  recentActivity: MemberActivity[];
  /** Per-week check-in counts for the last 8 weeks, oldest → newest. */
  attendance8w: MemberAttendanceWeek[];
  subscriptions: MemberSubscription[];
  bookings: MemberBooking[];
  payments: MemberPayment[];
  /**
   * Member tags. ALWAYS empty: the Prisma schema has no member-tag / label model,
   * so there is nothing to read. The detail page renders a disabled "Add" chip
   * rather than fabricate tags. Wire slot kept for when a tags model lands.
   */
  tags: string[];
  /**
   * Free-text staff notes. ALWAYS `''`: the schema has no member-notes model, so
   * the Notes tab renders a "No notes yet" empty state. Not fabricated.
   */
  notes: string;
}

/**
 * Successful `GET /members/:id` response. Per the contract the body is the member
 * detail spread flat (not wrapped), so a missing / cross-tenant id is a `404`
 * rather than an empty body — the page distinguishes "no such member" from "a
 * member with no history yet".
 */
export type GetMemberResponse = MemberDetail;

/**
 * A contact phone field shared by the create/update bodies: trimmed, optional,
 * length-bounded, and normalised so an empty string is treated as "not set"
 * (`undefined`) rather than persisting a blank. Format is intentionally loose —
 * the gym serves a single region and staff type numbers in their own convention.
 */
const memberPhoneSchema = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((value) => (value ? value : undefined));

/**
 * Body for `POST /members` — create a member (T4.3). `name` and `email` identify
 * the person (the email is the cross-gym `User` identity; a member who already
 * exists as a user elsewhere is linked rather than duplicated). `phone` is
 * optional contact info; `status` defaults to `ACTIVE` (a staff-added member is a
 * current member unless explicitly invited). The API re-validates with this exact
 * schema, so the admin form and the controller can never drift.
 */
export const createMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(200),
  phone: memberPhoneSchema,
  status: memberStatusSchema.default('ACTIVE'),
});

/** Validated `POST /members` body — {@link createMemberSchema}. */
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/**
 * Body for `PATCH /members/:id` — edit a member's profile (T4.3). A full-profile
 * edit of the mutable contact fields: `name` is required and `phone` is sent on
 * every save, with an empty value clearing it (`null`) rather than being ignored.
 * The email is the immutable auth identity and status is changed through the
 * dedicated deactivate/reactivate actions, not here.
 */
export const updateMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((value) => (value ? value : null)),
});

/** Validated `PATCH /members/:id` body — {@link updateMemberSchema}. */
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/**
 * Successful `POST /members` response (`201 Created`) — the newly created member
 * as the detail page renders it (history tabs empty for a brand-new member).
 */
export type CreateMemberResponse = MemberDetail;

/** Successful `PATCH /members/:id` response — the updated member detail. */
export type UpdateMemberResponse = MemberDetail;

/**
 * Successful `POST /members/:id/deactivate` and `POST /members/:id/reactivate`
 * response — the member detail with the new `status` (`SUSPENDED` / `ACTIVE`).
 */
export type SetMemberStatusResponse = MemberDetail;

/**
 * Body for `POST /members/bulk-export`. Either an explicit `ids` selection (the
 * rows the staff member ticked) or a `filters` object mirroring the roster query
 * (export everything matching the current view). Both optional — an empty body
 * exports the whole gym. The export runs async (streamed CSV, never an in-memory
 * array), so the endpoint only enqueues the job.
 */
export const bulkExportMembersSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
  filters: z.record(z.unknown()).optional(),
});

/** Validated `POST /members/bulk-export` body — {@link bulkExportMembersSchema}. */
export type BulkExportMembersInput = z.infer<typeof bulkExportMembersSchema>;

/**
 * Successful `POST /members/bulk-export` response (`202 Accepted`). The CSV is
 * generated asynchronously; `jobId` is the handle the client polls / downloads
 * once the streamed export completes.
 */
export interface BulkExportMembersResponse {
  jobId: string;
}
