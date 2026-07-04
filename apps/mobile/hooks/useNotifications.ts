// @fit/mobile — the member's notification inbox as a TanStack Query, plus the
// mark-read mutation that keeps it honest.
//
// The Profile → Notifications inbox screen (T8.5) reads `useNotifications` to
// list the caller's recent notifications with their read state, and fires
// `useMarkNotificationsRead` when an item is opened or "Mark all read" is
// tapped. The mutation invalidates the same query key, so the list (and its
// unread count) re-syncs straight after a write with no manual state juggling.
//
// Keyed on the active gym id: a notification is scoped to `(gym, member)`
// server-side, so a re-scoped session refetches the right inbox. The query is
// enabled only once a gym scope exists.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ListNotificationsResponse, MarkNotificationsReadResponse } from '@fit/types';
import { fetchNotifications, markNotificationsRead } from '../lib/notifications';

/** The query key for the notification inbox, shared by the read hook and the
 * mark-read mutation that invalidates it. */
export function notificationsKey(gymId: string | null) {
  return ['notifications', gymId] as const;
}

/**
 * Load the signed-in member's notification inbox (first page, newest first) for
 * the active gym. Pass `gymId: null` while the session has no gym scope — the
 * query stays disabled and reports `data` as undefined.
 */
export function useNotifications(gymId: string | null): UseQueryResult<ListNotificationsResponse> {
  return useQuery({
    queryKey: notificationsKey(gymId),
    queryFn: ({ signal }) => fetchNotifications({ signal }),
    enabled: gymId !== null,
  });
}

/**
 * Mark-read mutation for the inbox: pass the ids to mark those, or call with no
 * argument to mark every unread item. Invalidates the inbox query on success so
 * the list and badge repaint. Mutations don't retry by default — a mark-read is
 * idempotent server-side, so a single attempt is the right behaviour.
 */
export function useMarkNotificationsRead(
  gymId: string | null,
): UseMutationResult<MarkNotificationsReadResponse, Error, string[] | undefined> {
  const queryClient = useQueryClient();
  return useMutation<MarkNotificationsReadResponse, Error, string[] | undefined>({
    mutationFn: (ids) => markNotificationsRead(ids),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey(gymId) });
    },
  });
}
