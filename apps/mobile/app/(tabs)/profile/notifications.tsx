// `/profile/notifications` — the inbox. `notifications` (21 keys, D10).
//
// ===========================================================================
// THE ONE NOTIFICATION SURFACE THAT IS ACTUALLY BACKED BY AN ENDPOINT.
//
// Three routes exist and all three are here: `GET /notifications` (the page,
// which carries the full unread total alongside it), `GET /notifications/
// unread-count` (the badge, for screens that do not render the list) and
// `POST /notifications/mark-read`. There is no preferences controller — see
// `/profile/notification-settings`, which says so on the glass.
//
// ---------------------------------------------------------------------------
// MARK-READ INVALIDATES A ROOT, NOT A KEY, AND THAT IS NOT A SHORTCUT.
//
// `queryKeys.notifications(gymId)` takes `filters` at index 2 and defaults it to
// `null`, so it names ONE filter bucket. Invalidating that alone would leave an
// `unreadOnly: true` list and the `['notifications', gymId, 'unreadCount']`
// badge untouched — the "badge says 3, inbox is empty" bug the key factory's own
// doc comment promises against. `useNotificationMutations.ts` invalidates the
// two-segment root instead, and this screen simply calls the mutation and lets
// the matrix do it. No `.refetch()` anywhere.
//
// ---------------------------------------------------------------------------
// AN ITEM'S `href` IS A **WEB PORTAL** PATH, AND IS TREATED AS A HINT.
//
// `NotificationDto.href` is documented as "an in-app deep-link target (e.g.
// `/bookings`)" and is authored by the API for the member PORTAL, whose routes
// are `/member/...`. This app's routes are not the portal's — `/bookings` here
// is `/profile/bookings` — so the href is mapped through a small, explicit table
// rather than handed to `router.push` verbatim. An unmapped href navigates
// NOWHERE rather than to an unmatched route: a dead-end tap is a small
// annoyance; expo-router's "Unmatched Route" screen is a broken app.

import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@fit/types';
import {
  AppBar,
  Button,
  DotBadge,
  EmptyState,
  IconButton,
  ListRow,
  Screen,
  Skeleton,
  Surface,
  layout,
  spacing,
  useToast,
  type IconName,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { NOTIFICATIONS_PENDING_COPY } from '../../../components/home/pending-copy';
import { sectionPhase } from '../../../components/home/section';
import { formatMediumDate, formatTime } from '../../../components/services/date-format';
import { useNotifications } from '../../../hooks/queries/useNotifications';
import { useMarkNotificationsRead } from '../../../hooks/mutations/useNotificationMutations';
import { useGymId } from '../../../hooks/useActiveGym';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

/** Category → the glyph the row draws. The three the API can send. */
const CATEGORY_ICON: Readonly<Record<NotificationDto['category'], IconName>> = {
  BOOKING: 'calendar',
  BILLING: 'card',
  SYSTEM: 'info',
};

/**
 * A portal href, mapped to a route THIS app has.
 *
 * Explicit and small on purpose — see the header. `null` means "do not
 * navigate", which is what an unknown href gets.
 */
export function routeForHref(href: string | null): string | null {
  if (href === null) return null;
  const path = href.replace(/^\/member/, '');
  if (path.startsWith('/classes')) return path;
  if (path.startsWith('/bookings')) return '/profile/bookings';
  if (path.startsWith('/account/membership') || path.startsWith('/membership')) {
    return '/profile/membership';
  }
  if (path.startsWith('/account/billing') || path.startsWith('/billing')) return '/profile/billing';
  if (path.startsWith('/shop')) return '/shop';
  if (path.startsWith('/trainers')) return '/trainers';
  if (path.startsWith('/services')) return '/services';
  return null;
}

export default function NotificationsScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';

  const inbox = useNotifications();
  const markRead = useMarkNotificationsRead();

  const items = useMemo(() => inbox.data?.data ?? [], [inbox.data]);
  const unread = inbox.data?.unread ?? 0;
  const phase = sectionPhase(inbox, online);

  /**
   * A mark-read that did not happen, said out loud.
   *
   * The mutation is otherwise INVISIBLE: it invalidates on success and the dot
   * disappears, so a failure leaves the dot exactly where it was and nothing on
   * screen distinguishes "the server refused" from "the member misread the
   * screen". Both `.mutate()` calls here were the only two in the app with no
   * callbacks at all.
   *
   * A toast rather than an `Alert`: unlike a failed LOAD there is nothing to
   * retry from — the row is still there and pressing it again re-fires the same
   * request, which is the recovery.
   *
   * TODO(i18n) `notifications.markReadError`. `notifications.error` exists but
   * is the LIST's sentence ("We couldn't load your notifications"), which is
   * not true of a write that failed over a list already on screen — see
   * `components/home/pending-copy.ts`.
   */
  const markReadFailed = useCallback(() => {
    toast.error(NOTIFICATIONS_PENDING_COPY.markReadError);
  }, [toast]);

  const open = useCallback(
    (item: NotificationDto) => {
      // Mark this one read on the way out. Idempotent server-side, so a row the
      // member re-opens costs one no-op request rather than needing a guard.
      if (item.readAt === null) markRead.mutate({ ids: [item.id] }, { onError: markReadFailed });
      const route = routeForHref(item.href);
      if (route !== null) router.push(route);
    },
    [markRead, markReadFailed, router],
  );

  return (
    <Screen
      testID="notifications-screen"
      header={
        <AppBar
          title={t('notifications.inboxTitle')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="notifications-back"
            />
          }
          trailing={
            <IconButton
              icon="settings"
              accessibilityLabel={t('notifications.settings')}
              onPress={() => {
                router.push('/profile/notification-settings');
              }}
              variant="surface"
              testID="notifications-settings"
            />
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="notifications-offline" />}

        {phase === 'loading' ? (
          <View
            testID="notifications-loading"
            accessible
            accessibilityLabel={t('notifications.title')}
            style={{ gap: spacing[2] }}
          >
            <Skeleton height={72} radius={22} />
            <Skeleton height={72} radius={22} />
            <Skeleton height={72} radius={22} />
          </View>
        ) : null}

        {phase === 'error' ? (
          <EmptyState
            testID="notifications-error"
            icon="info"
            title={t('notifications.error')}
            action={{
              label: t('notifications.retry'),
              onPress: () => {
                // The two-segment root, so the badge query goes with the list.
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.notifications(scoped).slice(0, 2),
                });
              },
              variant: 'secondary',
              testID: 'notifications-retry',
            }}
          />
        ) : null}

        {phase === 'ready' ? (
          items.length === 0 ? (
            <EmptyState
              testID="notifications-empty"
              icon="bell"
              title={t('notifications.empty')}
              body={t('notifications.emptyHint')}
            />
          ) : (
            <View style={{ gap: spacing[3] }}>
              {unread > 0 ? (
                <Button
                  testID="notifications-mark-all"
                  label={t('notifications.markAllRead')}
                  variant="secondary"
                  size="sm"
                  busy={markRead.isPending}
                  onPress={() => {
                    // No argument marks EVERY unread item read — the endpoint's
                    // own "mark all" form.
                    markRead.mutate(undefined, { onError: markReadFailed });
                  }}
                />
              ) : null}

              <Surface tone="card" padVertical={1} testID="notifications-list">
                {items.map((item) => {
                  const when = `${formatMediumDate(locale, item.createdAt)} · ${formatTime(
                    locale,
                    item.createdAt,
                  )}`;
                  const isUnread = item.readAt === null;
                  return (
                    <ListRow
                      key={item.id}
                      testID={`notifications-item-${item.id}`}
                      icon={CATEGORY_ICON[item.category]}
                      title={item.title}
                      hint={`${item.body} · ${when}`}
                      onPress={() => {
                        open(item);
                      }}
                      // The unread dot is the ONLY thing that says the item is
                      // unread, and it is inside the row's single accessibility
                      // node — so the word has to be in the label.
                      accessibilityLabel={
                        isUnread
                          ? `${t('notifications.title')}, ${item.title}, ${item.body}, ${when}`
                          : `${item.title}, ${item.body}, ${when}`
                      }
                      trailing={
                        isUnread ? (
                          <View
                            accessible={false}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                          >
                            <DotBadge />
                          </View>
                        ) : undefined
                      }
                    />
                  );
                })}
              </Surface>
            </View>
          )
        ) : null}
      </View>
    </Screen>
  );
}
