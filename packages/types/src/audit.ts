// @fit/types — gym audit-log viewer contracts (Zod schemas + inferred types).
//
// The wire shape for the staff console's audit-log viewer (T4.9): the paginated,
// filtered `GET /audit-logs` feed the admin table renders. The API validates the
// inbound query with `listAuditLogQuerySchema` and the `@fit/admin` console reuses
// the inferred types, so the table and the controller can never drift on the wire
// format.
//
// `AuditLog` rows are written by privileged platform actions (the SuperAdmin
// console — owner impersonation and gym suspend/reactivate, T2.12); this viewer
// is the gym-side read of the trail for the operator's *own* gym. The store keeps
// `actorId` / `targetId` as denormalised scalars (no FK — the trail must outlive
// whatever it references), so the service resolves the acting / targeted user's
// name + email best-effort for display, leaving them `null` when the user no
// longer exists.

import { z } from 'zod';

/**
 * The audit-log action keys the platform writes today (T2.12): owner
 * impersonation and a gym status change. Exposed as a closed list so the viewer's
 * action filter can offer human labels; the query filter itself accepts any
 * string (see {@link listAuditLogQuerySchema}) so a newly-added action is
 * filterable the moment it is written, without a contract change.
 */
export const AUDIT_ACTIONS = ['gym.impersonate', 'gym.status.update'] as const;

/** A known audit action key — {@link AUDIT_ACTIONS}. */
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * A `YYYY-MM-DD` calendar day, the format an `<input type="date">` emits and the
 * audit filter's date-range bounds use. Kept as a string on the wire (not a
 * `Date`) so the query round-trips cleanly through the URL and the API re-parses
 * it into an instant range server-side.
 */
const calendarDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

/**
 * Query for `GET /audit-logs`. Pagination is **mandatory server-side** (the trail
 * grows unbounded, never loaded into memory): `page` is 1-based and `limit` is
 * capped at 100. `action` filters to one action key; `from` / `to` bound the
 * range by calendar day (inclusive, interpreted in UTC). Every field is optional
 * with a sensible default so a bare `GET /audit-logs` is valid. Numbers are
 * coerced because they arrive as query strings. Results are always newest-first.
 */
export const listAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Exact action-key filter; any non-empty string, not just a known action. */
  action: z.string().trim().min(1).max(100).optional(),
  /** Lower bound of the range, inclusive — entries on or after this day. */
  from: calendarDaySchema.optional(),
  /** Upper bound of the range, inclusive — entries on or before this day. */
  to: calendarDaySchema.optional(),
});

/** Validated `GET /audit-logs` query — {@link listAuditLogQuerySchema}. */
export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;

/**
 * One audit-log entry as the viewer table renders it — a denormalised row, never
 * the raw `AuditLog`. The acting (`actor*`) and targeted (`target*`) identities
 * are resolved from the `User` table for display and are `null` when the id is
 * absent (no target) or the user no longer exists (the trail outlives them).
 * `createdAt` is an ISO-8601 instant the table formats in the staff member's
 * local zone; `metadata` is the action-specific JSON context, shown as detail.
 */
export interface AuditLogRow {
  id: string;
  /** Action key, e.g. `gym.impersonate` — {@link AUDIT_ACTIONS}. */
  action: string;
  actorId: string;
  /** The acting user's display name, or `null` when unresolved. */
  actorName: string | null;
  /** The acting user's email, or `null` when unresolved. */
  actorEmail: string | null;
  /** The targeted user's id, when the action named one. */
  targetId: string | null;
  /** The targeted user's display name, or `null` when absent / unresolved. */
  targetName: string | null;
  /** The targeted user's email, or `null` when absent / unresolved. */
  targetEmail: string | null;
  /** Action-specific context (previous/next status, token TTL, …), or `null`. */
  metadata: Record<string, unknown> | null;
  /** ISO-8601 instant the action was recorded. */
  createdAt: string;
}

/**
 * Successful `GET /audit-logs` response — one page of the gym's audit trail plus
 * the totals the pager needs. `total` is the count *after* filters (so the pager
 * is accurate), `page` / `limit` echo the request. An empty `data` is a normal
 * result the table renders as its empty state.
 */
export interface ListAuditLogResponse {
  data: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}
