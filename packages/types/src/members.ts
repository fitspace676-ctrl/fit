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
 * A member's gender on their profile — mirrors the Prisma `Gender` enum. Kept
 * deliberately small (the gym serves a single region and staff pick from a short
 * list); `null` when not recorded.
 */
export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);

/** A member's recorded gender — {@link genderSchema}. */
export type Gender = z.infer<typeof genderSchema>;

/** Lifecycle of a member follow-up task — mirrors the Prisma `MemberTaskStatus` enum. */
export const memberTaskStatusSchema = z.enum(['PENDING', 'DONE']);

/** A task's completion state — {@link memberTaskStatusSchema}. */
export type MemberTaskStatus = z.infer<typeof memberTaskStatusSchema>;

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
  tag: z.string().min(1).optional(),
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
  /** Colour-keyed labels applied by staff (`GymMember.tags`), for the roster's TAGS cell. */
  tags: string[];
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
  /** The gym's distinct member tags, sorted — the Tag filter's options. */
  availableTags: string[];
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

/**
 * One invoice on a member's detail page — a numbered {@link Invoice} raised for the
 * member (T5.9/T5.10), newest first. Distinct from {@link MemberPayment}: an invoice
 * is the billing *document* (with a per-gym `number` and a downloadable PDF), whereas a
 * payment is a captured charge on a shop order. The PDF is rendered on demand and
 * streamed from `GET /invoices/:id/pdf`, so there is no URL on the wire.
 */
export interface MemberInvoice {
  id: string;
  /** Per-gym, per-year sequential reference (e.g. `"2026-0001"`). */
  number: string;
  /** Amount in minor currency units (tetri). */
  amount: number;
  currency: string;
  /** Settlement state — `PAID` / `PENDING` / `FAILED` / `REFUNDED`. */
  status: string;
  /** ISO instant the invoice was raised. */
  issuedAt: string;
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
  /** ISO instant the freeze auto-resumes, or `null` when the plan is not frozen. */
  frozenUntil: string | null;
  /** The plan's freeze allowance — whole days of freeze granted per billing period. */
  freezeDaysPerPeriod: number;
  /** Days of freeze already committed against this period's allowance. */
  freezeDaysUsed: number;
}

/**
 * One staff note on a member's detail page — free-text internal notes, newest
 * first. Real rows from the `MemberNote` model (T4.x); never fabricated.
 */
export interface MemberNoteEntry {
  id: string;
  /** Display name of the staff member who wrote the note. */
  author: string;
  /** The note body. */
  body: string;
  /** ISO instant the note was created. */
  createdAt: string;
}

/**
 * One follow-up task on a member's detail page — a to-do a staff member logged
 * against the member (call back, chase payment, …). Real `MemberTask` rows.
 */
export interface MemberTaskEntry {
  id: string;
  /** Short task headline. */
  title: string;
  /** ISO date the task is due, or `null` when open-ended. */
  dueDate: string | null;
  /** Who the task is assigned to (free text: a team or a person), or `null`. */
  assignee: string | null;
  /** Whether the task is still pending or done — {@link memberTaskStatusSchema}. */
  status: MemberTaskStatus;
  /** ISO instant the task was created. */
  createdAt: string;
}

/**
 * One entry of a member's access log — a single `CheckIn` row (our model records
 * arrivals only, no check-out), newest first.
 */
export interface MemberAccessLogEntry {
  id: string;
  /** ISO instant of the check-in. */
  at: string;
  /** How the member checked in — `"QR"` / `"MANUAL"` (the `CheckInMethod` enum). */
  method: string;
  /** The location/branch id the check-in was recorded at, or `null`. */
  location: string | null;
}

/** One line item of a member POS purchase — an `OrderItem` label + quantity. */
export interface MemberPurchaseItem {
  /** The item's display label as snapshotted on the order. */
  label: string;
  /** Quantity purchased. */
  qty: number;
}

/**
 * One point-of-sale purchase on a member's detail page — an `Order` linked to the
 * member (`Order.memberId`) with its captured `Payment`, newest first.
 */
export interface MemberPurchase {
  id: string;
  /** ISO instant the order was placed. */
  at: string;
  /** The order's line items (label + qty). */
  items: MemberPurchaseItem[];
  /** Order total in minor currency units (tetri). */
  total: number;
  /** ISO-4217 currency code of {@link total}. */
  currency: string;
  /** Payment method (`"CARD"` / `"CASH"` / …), or `null` when unpaid. */
  method: string | null;
  /** The location/branch id the sale was made at, or `null`. */
  location: string | null;
}

/**
 * One member as the detail page needs it — the same row the table renders, plus
 * the "formacore" KPIs (`lifetimeValue` / `totalVisits` / `nextBilling`), the
 * live `currentPlan`, the `recentActivity` timeline, the `attendance8w` series,
 * the tabbed history (subscriptions / bookings / payments / invoices / POS
 * purchases / access log), the profile extras (DOB, gender, address, emergency
 * contact, medical notes), and the member's `tags`, staff `notes` and follow-up
 * `tasks`. Every figure is a real tenant-scoped query — never fabricated (see
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
  /** The member's numbered invoices (billing documents), newest first (T5.10). */
  invoices: MemberInvoice[];
  /** The member's POS purchases (orders + captured payment), newest first. */
  purchases: MemberPurchase[];
  /** The member's access log (check-ins), newest first. */
  accessLog: MemberAccessLogEntry[];
  /** ISO date of birth, or `null` when not recorded. */
  dateOfBirth: string | null;
  /** Recorded gender — {@link genderSchema}, or `null`. */
  gender: Gender | null;
  /** Postal / home address, or `null`. */
  address: string | null;
  /** Emergency contact's name, or `null`. */
  emergencyContactName: string | null;
  /** Emergency contact's phone, or `null`. */
  emergencyContactPhone: string | null;
  /** Free-text medical notes (allergies, conditions), or `null`. */
  medicalNotes: string | null;
  /** Free-text staff notes, newest first (real `MemberNote` rows). */
  notes: MemberNoteEntry[];
  /** Follow-up tasks logged against the member, newest first. */
  tasks: MemberTaskEntry[];
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
 * A nullable, editable free-text profile field shared by the create/update
 * bodies. Trimmed and length-bounded; when **omitted** it stays `undefined` (the
 * service leaves the column untouched), when sent **empty** it becomes `null`
 * (clears the column) — mirroring the reference's full-profile edit semantics.
 */
const editableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined ? undefined : value.length > 0 ? value : null));

/**
 * The profile-extra fields shared by create + update (T4.x): date of birth,
 * gender, address, emergency contact, medical notes and tags. Every field is
 * optional so a minimal create still validates; `null`/empty clears on edit.
 */
const memberProfileShape = {
  dateOfBirth: editableText(40),
  gender: genderSchema.nullish(),
  address: editableText(200),
  emergencyContactName: editableText(120),
  emergencyContactPhone: editableText(32),
  medicalNotes: editableText(2000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
} as const;

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
  ...memberProfileShape,
  /** Optional catalogue plan to enrol the new member on (creates a live subscription). */
  planId: z.string().min(1).optional(),
  /** ISO start date for the enrolment above (required alongside `planId`). */
  startDate: editableText(40),
  /** Preferred payment method recorded on the profile (`"CASH"` / `"CARD"` / …). */
  paymentMethod: editableText(40),
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
  ...memberProfileShape,
});

/** Validated `PATCH /members/:id` body — {@link updateMemberSchema}. */
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/**
 * Body for `POST /members/:id/notes` — add a staff note to a member. The author is
 * taken from the session server-side (never trusted from the client).
 */
export const createMemberNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note is required').max(2000),
});

/** Validated `POST /members/:id/notes` body — {@link createMemberNoteSchema}. */
export type CreateMemberNoteInput = z.infer<typeof createMemberNoteSchema>;

/**
 * Body for `POST /members/:id/tasks` — log a follow-up task against a member.
 * `dueDate` / `assignee` are optional; a bare `title` is enough.
 */
export const createMemberTaskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200),
  dueDate: editableText(40),
  assignee: editableText(120),
});

/** Validated `POST /members/:id/tasks` body — {@link createMemberTaskSchema}. */
export type CreateMemberTaskInput = z.infer<typeof createMemberTaskSchema>;

/** Body for `PATCH /members/:id/tasks/:taskId` — flip a task between pending and done. */
export const updateMemberTaskSchema = z.object({
  status: memberTaskStatusSchema,
});

/** Validated `PATCH /members/:id/tasks/:taskId` body — {@link updateMemberTaskSchema}. */
export type UpdateMemberTaskInput = z.infer<typeof updateMemberTaskSchema>;

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
