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
 * One member as the roster table renders it — a denormalised row, never the raw
 * `GymMember` + `User`. `phone` is `null` until the member profile (T4.3) carries
 * it; `planName` / `lastVisitAt` / `nextBillingAt` are `null` until billing +
 * attendance land (Phase 5/6). Dates are ISO-8601 instants the table formats in
 * the staff member's local zone.
 */
export interface MemberRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  planName: string | null;
  lastVisitAt: string | null;
  nextBillingAt: string | null;
}

/**
 * Successful `GET /members` response — one page of the roster plus the totals the
 * pager needs. `total` is the count *after* filters (so the pager is accurate),
 * `page` / `limit` echo the request. An empty `data` is a normal result the table
 * renders as its empty state.
 */
export interface ListMembersResponse {
  data: MemberRow[];
  total: number;
  page: number;
  limit: number;
}

/** One subscription on a member's detail page. Empty until billing lands (Phase 5/6). */
export interface MemberSubscription {
  id: string;
  planName: string;
  status: string;
  startedAt: string;
  /** ISO instant the subscription renews / ends, or `null` for open-ended. */
  renewsAt: string | null;
}

/** One class booking on a member's detail page. Empty until attendance lands (Phase 5/6). */
export interface MemberBooking {
  id: string;
  title: string;
  startsAt: string;
  status: string;
}

/** One payment on a member's detail page. Empty until billing lands (Phase 5/6). */
export interface MemberPayment {
  id: string;
  /** Amount in minor currency units (tetri). */
  amount: number;
  status: string;
  paidAt: string;
}

/**
 * One member as the detail page needs it — the same row the table renders, plus
 * the tabbed history. The history collections are empty (and `notes` an empty
 * string) until their backing models land (Phase 5/6); the page renders each as
 * its own "nothing yet" empty state.
 */
export interface MemberDetail extends MemberRow {
  /** ISO instant the member joined the gym. */
  joinedAt: string;
  subscriptions: MemberSubscription[];
  bookings: MemberBooking[];
  payments: MemberPayment[];
  /** Free-text staff notes. Empty until member notes land (T4.3+). */
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
