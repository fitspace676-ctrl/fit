// @fit/mobile — the member's in-app notification inbox (list + mark read).
//
// Backs the Profile → Notifications inbox screen (T8.5). Reads the caller's
// notifications and marks them read through the same `/notifications` endpoints
// (T8.4) the web member bell uses, over the authenticated `apiFetch` client:
//
//   GET  /notifications            — the inbox page (newest first) + unread count
//   POST /notifications/mark-read  — mark some (or all) items read
//
// A notification is a read projection (a plain DTO the API validates on the way
// *in*, cf. `NotificationDto`), so — like the web bell — responses here are
// shape-guarded rather than Zod-parsed: a malformed payload degrades to an empty
// inbox / a zeroed result instead of throwing. The app only reaches this screen
// behind the auth gate, so a 401/403 is treated as an empty inbox, not an error.

import type { ListNotificationsResponse, MarkNotificationsReadResponse } from '@fit/types';
import { apiFetch } from './api-client';

/** Arguments for {@link fetchNotifications}. */
export interface FetchNotificationsArgs {
  /** 1-based page to load; defaults to the first page. */
  page?: number;
  /** Page size; defaults to 20 (the API's default), capped server-side at 100. */
  limit?: number;
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the signed-in member's notifications via `GET /notifications`, newest
 * first. Returns the page plus the full unread count so the caller can render
 * the badge from the same request. A 401/403 (no longer a member this token can
 * read) yields an empty inbox rather than an error; any other non-OK throws with
 * the API's message so the screen can show a retry.
 */
export async function fetchNotifications({
  page = 1,
  limit = 20,
  signal,
}: FetchNotificationsArgs = {}): Promise<ListNotificationsResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });

  const response = await apiFetch(`/notifications?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return { data: [], total: 0, page, limit, unread: 0 };
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load notifications (${response.status})`);
  }

  const body = (await response
    .json()
    .catch(() => null)) as Partial<ListNotificationsResponse> | null;
  return {
    data: Array.isArray(body?.data) ? body.data : [],
    total: typeof body?.total === 'number' ? body.total : 0,
    page: typeof body?.page === 'number' ? body.page : page,
    limit: typeof body?.limit === 'number' ? body.limit : limit,
    unread: typeof body?.unread === 'number' ? body.unread : 0,
  };
}

/**
 * Mark notifications read via `POST /notifications/mark-read`. Pass the ids to
 * mark just those; omit `ids` (or pass an empty list) to mark every unread item
 * ("mark all read"). Idempotent server-side. Returns how many rows were newly
 * marked and the resulting unread count so the caller can refresh the badge
 * without a follow-up read.
 */
export async function markNotificationsRead(
  ids?: string[],
): Promise<MarkNotificationsReadResponse> {
  const response = await apiFetch('/notifications/mark-read', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to update notifications (${response.status})`);
  }

  const body = (await response
    .json()
    .catch(() => null)) as Partial<MarkNotificationsReadResponse> | null;
  return {
    updated: typeof body?.updated === 'number' ? body.updated : 0,
    unread: typeof body?.unread === 'number' ? body.unread : 0,
  };
}
