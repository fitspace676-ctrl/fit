// @fit/mobile — the notification inbox and push-token registration.
//
// Two controllers, one capability (`NotificationManage`, which every MEMBER
// holds because both are self-service).
//
// `GET /notifications` returns the *unread total* alongside the page, and
// `POST /notifications/mark-read` returns the new unread count — so the bell
// badge is refreshed by the same round trips that render the list, and
// `GET /notifications/unread-count` is only needed by a screen that shows the
// badge without the inbox.

import type {
  ListNotificationsQuery,
  MarkNotificationsReadData,
  MarkNotificationsReadResponse,
  ListNotificationsResponse,
  RegisterPushTokenData,
  RegisterPushTokenResponse,
  UnreadCountResponse,
} from '@fit/types';
import { apiFetch, apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * `GET /notifications?page&limit&unreadOnly?` — one page of the inbox.
 *
 * `total` counts the *applied filter*; `unread` is always the full unread count
 * regardless of `unreadOnly`, which is what the badge wants.
 */
export async function listNotifications(
  params: Partial<ListNotificationsQuery> = {},
  options: FetchOptions = {},
): Promise<ListNotificationsResponse> {
  return apiJson<ListNotificationsResponse>(endpointPath(ENDPOINTS.listNotifications), {
    method: ENDPOINTS.listNotifications.method,
    query: { page: params.page, limit: params.limit, unreadOnly: params.unreadOnly },
    signal: options.signal,
  });
}

/** `GET /notifications/unread-count` — just the badge number. */
export async function getUnreadCount(options: FetchOptions = {}): Promise<UnreadCountResponse> {
  return apiJson<UnreadCountResponse>(endpointPath(ENDPOINTS.getUnreadCount), {
    method: ENDPOINTS.getUnreadCount.method,
    signal: options.signal,
  });
}

/**
 * `POST /notifications/mark-read` — mark specific ids, or **all** unread when
 * `ids` is omitted or empty.
 *
 * Idempotent: unknown or already-read ids are ignored rather than erroring, so a
 * double tap is harmless.
 */
export async function markNotificationsRead(
  input: MarkNotificationsReadData = {},
  options: FetchOptions = {},
): Promise<MarkNotificationsReadResponse> {
  return apiJson<MarkNotificationsReadResponse>(endpointPath(ENDPOINTS.markNotificationsRead), {
    method: ENDPOINTS.markNotificationsRead.method,
    json: input,
    signal: options.signal,
  });
}

/**
 * `POST /notifications/push-token` — register (or update) this install's Expo
 * push token.
 *
 * The upsert key is `(userId, deviceId)`, so re-registering after a token
 * rotation updates the row in place instead of piling up dead targets. `201`
 * means newly registered, `200` an update — both resolve here; the distinction is
 * on the status, which the client does not need.
 */
export async function registerPushToken(
  input: RegisterPushTokenData,
  options: FetchOptions = {},
): Promise<RegisterPushTokenResponse> {
  return apiJson<RegisterPushTokenResponse>(endpointPath(ENDPOINTS.registerPushToken), {
    method: ENDPOINTS.registerPushToken.method,
    json: input,
    signal: options.signal,
  });
}

/**
 * `DELETE /notifications/push-token/:deviceId` — stop sending to this install.
 *
 * `204`, so it resolves to `void`. Called on sign-out *before*
 * `POST /auth/logout` (the token is needed to authorize it) — WP-4 owns that
 * sequencing; this is the transport it uses.
 */
export async function unregisterPushToken(
  params: { deviceId: string },
  options: FetchOptions = {},
): Promise<void> {
  await apiFetch(endpointPath(ENDPOINTS.unregisterPushToken, { deviceId: params.deviceId }), {
    method: ENDPOINTS.unregisterPushToken.method,
    signal: options.signal,
  });
}
