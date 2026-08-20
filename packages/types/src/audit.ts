// @fit/types — audit-log viewer contracts (Zod schemas + inferred types).
//
// The wire shape for TWO reads of one trail:
//   • `GET /audit-logs`       — the staff console's view of its OWN gym, pinned
//                               to the caller's tenant and unable to name another.
//   • `GET /admin/audit-logs` — the operator console's view ACROSS every gym,
//                               SUPER_ADMIN only, with `gymId` as a filter rather
//                               than a boundary, and the gym named on each row.
//
// The API validates each inbound query with the schema below and both consoles
// reuse the inferred types, so a table and its controller can never drift on the
// wire format.
//
// `AuditLog` rows are written by privileged platform actions — the operator
// console creating, suspending and impersonating into gyms. The store keeps
// `actorId` / `targetId` (and `gymId`) as denormalised scalars with no FK, because
// the trail must outlive whatever it references; identities are therefore resolved
// best-effort for display and left `null` when the record is gone.

import { z } from 'zod';

/**
 * The audit-log action keys the platform writes today, all of them from the
 * operator console. Exposed as a closed list so a viewer's action filter can
 * offer human labels; the query filter itself accepts any string (see
 * {@link listAuditLogQuerySchema}) so a newly-added action is filterable the
 * moment it is written, without a contract change.
 *
 * Impersonation is TWO keys, and the difference matters when reading the trail:
 * `gym.impersonate` is the operator asking for a handoff code, `…start` is a
 * session actually being minted from one. A request with no matching start is a
 * code that expired unused — which is a normal thing to see, and not a session.
 */
export const AUDIT_ACTIONS = [
  'gym.create',
  'gym.status.update',
  'gym.impersonate',
  'gym.impersonate.start',
] as const;

/** A known audit action key — {@link AUDIT_ACTIONS}. */
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Human labels for the known actions, for a filter or a table cell. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'gym.create': 'Gym created',
  'gym.status.update': 'Status changed',
  'gym.impersonate': 'Impersonation requested',
  'gym.impersonate.start': 'Impersonation started',
};

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

/**
 * Query for the platform-wide `GET /admin/audit-logs` (SUPER_ADMIN only).
 *
 * The gym-scoped query plus one filter the gym-scoped feed cannot have: `gymId`.
 * A staff member's trail is pinned to their own gym by the tenant context and
 * they may not name another; an operator reads ACROSS tenants, so naming one is
 * how they narrow rather than how they escape.
 */
export const listAdminAuditLogQuerySchema = listAuditLogQuerySchema.extend({
  /** Narrow to one gym; omitted means every gym on the platform. */
  gymId: z.string().trim().min(1).max(64).optional(),
});

/** Validated `GET /admin/audit-logs` query — {@link listAdminAuditLogQuerySchema}. */
export type ListAdminAuditLogQuery = z.infer<typeof listAdminAuditLogQuerySchema>;

/**
 * One entry in the platform-wide trail: the gym-scoped row plus **which gym** it
 * belongs to. Across tenants that is not decoration — "suspended" and
 * "impersonated" mean nothing without naming the tenant they happened to.
 *
 * `gym` is `null` for an entry whose gym has since been deleted. The trail is
 * denormalised on purpose and outlives what it references, so an entry about a
 * gym that no longer exists is a real answer, not a broken row.
 */
export interface AdminAuditLogRow extends AuditLogRow {
  gym: { id: string; name: string; subdomainSlug: string } | null;
}

/** Successful `GET /admin/audit-logs` response — one page, newest first. */
export interface ListAdminAuditLogResponse {
  data: AdminAuditLogRow[];
  total: number;
  page: number;
  limit: number;
}
