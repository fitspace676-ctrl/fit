// @fit/mobile — the inbox and the bell badge.
//
// `GET /notifications` returns the full unread count alongside the page, so a
// screen showing both needs one request, not two. `useUnreadCount` exists for
// the tab bar, which renders the badge without the list.
//
// Both live under `['notifications', gymId, …]`, and `markNotificationsRead`
// invalidates that two-segment root — see `useNotificationMutations.ts` for why
// the factory's own return value is not enough.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { ListNotificationsResponse, UnreadCountResponse } from '@fit/types';
import { getUnreadCount, listNotifications } from '../../lib/api/notifications';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** One page of the inbox. */
export interface NotificationsPage {
  page?: number;
  limit?: number;
  /** Only unread items. The response's `unread` total is unaffected by it. */
  unreadOnly?: boolean;
}

/** Options for `GET /notifications`. */
export function notificationsQueryOptions(
  gymId: string | null,
  params: NotificationsPage = {},
): UseQueryOptions<ListNotificationsResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.notifications(scope.gymId, {
      page: params.page ?? null,
      limit: params.limit ?? null,
      unreadOnly: params.unreadOnly ?? null,
    }),
    queryFn: ({ signal }) => listNotifications(params, { signal }),
    enabled: scope.enabled,
  };
}

/** One page of the notification inbox, plus the full unread total. */
export function useNotifications(params: NotificationsPage = {}) {
  return useQuery(notificationsQueryOptions(useGymId(), params));
}

/** Options for `GET /notifications/unread-count`. */
export function unreadCountQueryOptions(
  gymId: string | null,
): UseQueryOptions<UnreadCountResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.unreadCount(scope.gymId),
    queryFn: ({ signal }) => getUnreadCount({ signal }),
    enabled: scope.enabled,
  };
}

/** Just the badge number, for a tab bar that does not render the list. */
export function useUnreadCount() {
  return useQuery(unreadCountQueryOptions(useGymId()));
}
