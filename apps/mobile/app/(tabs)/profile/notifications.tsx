import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { NotificationCategory, NotificationDto } from '@fit/types';
import { useI18n } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useMarkNotificationsRead, useNotifications } from '../../../hooks/useNotifications';

/**
 * Member notification inbox (T8.5) — the target of the bell on Home and Profile
 * and of the `fit://notifications/:id` deep link (remapped here by
 * `app/+native-intent.ts`).
 *
 * Lists the caller's real notifications with their read state, wired to the
 * inbox API (T8.4) via `useNotifications`: an emoji per category, unread items
 * tinted with a dot, newest first. Tapping an item marks it read and follows its
 * in-app deep link (`href`) when present — the same navigation the push-tap
 * handler uses (`usePushNotifications`); a header action marks everything read.
 * Pull-to-refresh revalidates, and the gear opens notification *preferences*
 * (`/profile/notification-settings`), where per-category delivery is chosen.
 *
 * Dark-only aurora glass over the `ink-950` canvas, matching the Profile hub the
 * bell sits on (cf. Shop cart) rather than the system-themed settings screens.
 */

/** The emoji shown per notification category — mirrors the web bell's icon map. */
const CATEGORY_GLYPH: Record<NotificationCategory, string> = {
  BOOKING: '📅',
  BILLING: '💳',
  SYSTEM: '🔔',
};

export default function NotificationsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const gymId = useActiveGymId();

  const inbox = useNotifications(gymId);
  const markRead = useMarkNotificationsRead(gymId);

  const items = useMemo(() => inbox.data?.data ?? [], [inbox.data]);
  const unread = inbox.data?.unread ?? 0;
  const refreshing = inbox.isFetching && !inbox.isLoading;

  // Tapping an item marks it read (no-op if already read) and follows its in-app
  // deep link when present — the same best-effort navigation the push-tap handler
  // performs. `mutate` is fire-and-forget; the mutation invalidates the inbox so
  // the row repaints as read.
  const onItemPress = useCallback(
    (item: NotificationDto): void => {
      if (!item.readAt) markRead.mutate([item.id]);
      if (item.href) router.push(item.href);
    },
    [markRead],
  );

  const onMarkAll = useCallback((): void => {
    if (unread > 0 && !markRead.isPending) markRead.mutate(undefined);
  }, [markRead, unread]);

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-center px-5 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('notifications.back')}
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
        >
          <Text className="text-xl font-bold text-ink-300">‹</Text>
        </Pressable>
        <View className="flex-1 flex-row items-center justify-center gap-1.5">
          <Text className="text-lg font-extrabold tracking-tight text-white">
            {t('notifications.inboxTitle')}
          </Text>
          {unread > 0 ? (
            <Text
              className="font-mono text-sm text-ink-500"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              · {unread}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('notifications.settings')}
          onPress={() => router.push('/profile/notification-settings')}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
        >
          <Text className="text-base">⚙️</Text>
        </Pressable>
      </View>

      {/* ---- mark-all-read action ---- */}
      {unread > 0 ? (
        <View className="flex-row justify-end px-5 pb-1">
          <Pressable
            accessibilityRole="button"
            disabled={markRead.isPending}
            onPress={onMarkAll}
            hitSlop={6}
            className="active:opacity-70"
            style={{ opacity: markRead.isPending ? 0.5 : 1 }}
          >
            <Text className="text-xs font-semibold text-brand-300">
              {t('notifications.markAllRead')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* ---- body ---- */}
      {inbox.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#8B7FF0" />
        </View>
      ) : inbox.isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-card border border-white/10 bg-white/5">
            <Text className="text-2xl">⚠️</Text>
          </View>
          <Text className="mt-4 text-center text-base font-semibold text-white">
            {t('notifications.error')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void inbox.refetch()}
            className="mt-5 h-11 items-center justify-center rounded-btn bg-brand-600 px-6 active:bg-brand-700"
          >
            <Text className="text-sm font-bold text-white">{t('notifications.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void inbox.refetch()}
              tintColor="#94A3B8"
            />
          }
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8 pt-24">
              <View className="h-16 w-16 items-center justify-center rounded-card border border-white/10 bg-white/5">
                <Text className="text-2xl">🔔</Text>
              </View>
              <Text className="mt-4 text-center text-base font-semibold text-white">
                {t('notifications.empty')}
              </Text>
              <Text className="mt-1 text-center text-sm text-ink-400">
                {t('notifications.emptyHint')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <NotificationRow
              item={item}
              nowLabel={t('notifications.timeNow')}
              onPress={onItemPress}
            />
          )}
        />
      )}
    </View>
  );
}

/** One inbox row: an emoji tile, title + body, relative age, and — while unread —
 * a tinted surface with a brand dot. */
function NotificationRow({
  item,
  nowLabel,
  onPress,
}: {
  item: NotificationDto;
  nowLabel: string;
  onPress: (item: NotificationDto) => void;
}) {
  const unread = item.readAt === null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(item)}
      className={`flex-row items-start gap-3 rounded-card border p-3.5 active:opacity-80 ${
        unread ? 'border-brand-400/25 bg-brand-500/[0.08]' : 'border-white/[0.06] bg-white/[0.03]'
      }`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-btn ${
          unread ? 'bg-brand-500/20' : 'bg-white/[0.06]'
        }`}
      >
        <Text className="text-base">{CATEGORY_GLYPH[item.category]}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-sm font-semibold text-white" numberOfLines={1}>
            {item.title}
          </Text>
          {unread ? <View className="h-2 w-2 rounded-full bg-brand-400" /> : null}
        </View>
        <Text className="mt-0.5 text-xs leading-5 text-ink-400" numberOfLines={2}>
          {item.body}
        </Text>
        <Text className="mt-1 font-mono text-[11px] text-ink-500">
          {formatRelative(item.createdAt, nowLabel)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Compact relative age of an ISO timestamp: the localized "now", then `5m` /
 * `3h` / `2d`, else a short ISO date. Numeric suffixes are locale-agnostic, so
 * only the "now" label is translated (mirrors the web bell's formatter). */
function formatRelative(iso: string, nowLabel: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return nowLabel;
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toISOString().slice(0, 10);
}
