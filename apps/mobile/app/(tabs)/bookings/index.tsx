import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { useI18n, useTheme } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useMemberBookings } from '../../../hooks/useMemberBookings';
import { BookingCard } from '../../../components/bookings/BookingCard';

/**
 * My Bookings tab (T6.5) — the signed-in member's bookings split into
 * **Upcoming** (occurrences that have not started, soonest first) and **Past**
 * (already started, most recent first). One `GET /me/bookings` read (scope `all`,
 * cached by TanStack Query) backs both sections; the split is by the occurrence's
 * start, not the booking status — a canceled booking for a future class still
 * sits under Upcoming with its "Canceled" pill, which reads more naturally than
 * burying it among finished classes.
 *
 * Each card deep-links to the class detail (`/classes/:id`), the same target as
 * the calendar, so the member can re-open the booking action from here (and a
 * cancel there invalidates this query, so the list re-syncs). Degrades cleanly:
 * a spinner while loading, a retryable error, and a single empty state pointing
 * back at the schedule when the member has never booked. Pull-to-refresh
 * revalidates. Colours come from `useTheme()`, so the screen tracks system dark
 * mode like the rest of the app.
 */
export default function BookingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const { data, isLoading, isError, refetch, isFetching } = useMemberBookings(gymId, 'all');
  const entries = useMemo(() => data ?? [], [data]);

  const { upcoming, past } = useMemo(() => splitByStart(entries), [entries]);

  const openClass = (instanceId: string): void => {
    router.push(`/classes/${instanceId}`);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => void refetch()}
          tintColor={colors.textMuted}
        />
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
          {t('account.bookings.title')}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>
          {t('account.bookings.subtitle')}
        </Text>
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 64, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.textMuted }}>
            {t('account.bookings.loading')}
          </Text>
        </View>
      ) : isError ? (
        <View style={{ paddingVertical: 56, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
            {t('account.bookings.error')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refetch()}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              {t('account.bookings.retry')}
            </Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <View style={{ paddingVertical: 56, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
            {t('account.bookings.empty.title')}
          </Text>
          <Text
            style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}
          >
            {t('account.bookings.empty.subtitle')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/classes')}
            style={{
              marginTop: 8,
              borderRadius: 10,
              backgroundColor: colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onPrimary }}>
              {t('account.bookings.empty.action')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 24 }}>
          <BookingSection
            title={t('account.bookings.upcoming')}
            entries={upcoming}
            emptyText={t('account.bookings.noUpcoming')}
            colors={colors}
            onOpen={openClass}
          />
          {past.length > 0 ? (
            <BookingSection
              title={t('account.bookings.past')}
              entries={past}
              colors={colors}
              onOpen={openClass}
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

interface Colors {
  text: string;
  textMuted: string;
}

/** One titled list section. Renders its `emptyText` (when given) instead of an
 * empty list so the Upcoming heading never sits above nothing. */
function BookingSection({
  title,
  entries,
  emptyText,
  colors,
  onOpen,
}: {
  title: string;
  entries: MemberBookingHistoryEntry[];
  emptyText?: string;
  colors: Colors;
  onOpen: (instanceId: string) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {title}
      </Text>
      {entries.length === 0 ? (
        emptyText ? (
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{emptyText}</Text>
        ) : null
      ) : (
        <View style={{ gap: 8 }}>
          {entries.map((entry) => (
            <BookingCard key={entry.bookingId} entry={entry} onPress={onOpen} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Split the member's bookings into Upcoming (occurrence not yet started, soonest
 * first) and Past (already started, most recent first) by the occurrence's start.
 * The API already orders the `all` slice most-recent-first, but the upcoming
 * section reads better soonest-first, so each side is re-sorted explicitly. */
function splitByStart(entries: MemberBookingHistoryEntry[]): {
  upcoming: MemberBookingHistoryEntry[];
  past: MemberBookingHistoryEntry[];
} {
  const now = Date.now();
  const upcoming: MemberBookingHistoryEntry[] = [];
  const past: MemberBookingHistoryEntry[] = [];
  for (const entry of entries) {
    if (new Date(entry.classInstance.startsAt).getTime() >= now) {
      upcoming.push(entry);
    } else {
      past.push(entry);
    }
  }
  upcoming.sort(byStart('asc'));
  past.sort(byStart('desc'));
  return { upcoming, past };
}

/** Comparator on the occurrence start, in the given direction. */
function byStart(direction: 'asc' | 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return (a: MemberBookingHistoryEntry, b: MemberBookingHistoryEntry): number =>
    sign *
    (new Date(a.classInstance.startsAt).getTime() - new Date(b.classInstance.startsAt).getTime());
}
