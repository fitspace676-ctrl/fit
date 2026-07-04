// @fit/types — in-app notification inbox contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the member notification surface (T6.10)
// and the inbox API that feeds it (T8.4). The member portal's bell + inbox reads
// its unread count and paginated list from these endpoints and marks items read;
// the API validates the inbound query/body with these schemas and both clients
// reuse the inferred types, so the two can never drift on the wire format.
//
//   GET  /notifications              — paginated inbox list (newest first)
//   GET  /notifications/unread-count — the unread badge count
//   POST /notifications/mark-read    — mark some (or all) items read

import { z } from 'zod';

/**
 * The category of an in-app notification, uppercase on the wire. Mirrors the
 * Prisma `NotificationCategory` enum exactly (no boundary mapping): `BOOKING`
 * for class booking/waitlist events, `BILLING` for subscription/invoice events,
 * `SYSTEM` for general notices. Drives the icon the portal renders per item.
 */
export const notificationCategorySchema = z.enum(['BOOKING', 'BILLING', 'SYSTEM']);

/** An in-app notification category — {@link notificationCategorySchema}. */
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

/**
 * One inbox row as the API returns it (a read projection, so a plain interface —
 * cf. `ActivityEvent`). `readAt` is null while unread; `href` is an optional
 * in-app deep-link the portal routes to when the item is tapped. Timestamps are
 * ISO-8601 strings.
 */
export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** In-app deep-link target (e.g. `/bookings`), or null for a plain notice. */
  href: string | null;
  /** ISO-8601 instant the member first opened the item, or null while unread. */
  readAt: string | null;
  /** ISO-8601 instant the notification was created. */
  createdAt: string;
}

/**
 * Query for `GET /notifications` — offset pagination (identical shape to the
 * other list endpoints), with an optional `unreadOnly` filter. `page`/`limit`
 * and `unreadOnly` arrive as query strings, so they are coerced.
 */
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** When true, return only unread (`readAt = null`) items. */
  unreadOnly: z.coerce.boolean().optional(),
});

/** Validated `GET /notifications` query — {@link listNotificationsQuerySchema}. */
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/**
 * Response for `GET /notifications` — the standard `{ data; total; page; limit }`
 * page, plus the total `unread` count so the caller can refresh the bell badge
 * from the same request. `total` is the count for the applied filter; `unread`
 * is always the full unread count regardless of `unreadOnly`.
 */
export interface ListNotificationsResponse {
  data: NotificationDto[];
  total: number;
  page: number;
  limit: number;
  unread: number;
}

/** Response for `GET /notifications/unread-count` — the unread badge count. */
export interface UnreadCountResponse {
  unread: number;
}

/**
 * Body for `POST /notifications/mark-read`. When `ids` is a non-empty list, only
 * those notifications are marked read; when omitted (or empty), every unread
 * notification for the caller is marked read ("mark all read"). Unknown or
 * already-read ids are silently ignored (idempotent).
 */
export const markNotificationsReadSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
});

/** Validated `POST /notifications/mark-read` body — {@link markNotificationsReadSchema}. */
export type MarkNotificationsReadData = z.infer<typeof markNotificationsReadSchema>;

/**
 * Response for `POST /notifications/mark-read` — how many rows were newly marked
 * read (`updated`) and the resulting `unread` count, so the client updates the
 * badge without a follow-up request.
 */
export interface MarkNotificationsReadResponse {
  updated: number;
  unread: number;
}
