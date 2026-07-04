import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { ClassInstanceDetail } from '@fit/types';
import { useI18n } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useClassInstance } from '../../../hooks/useClassInstance';
import { useMemberBookings } from '../../../hooks/useMemberBookings';
import { ClassBookingActions } from '../../../components/classes/ClassBookingActions';
import { ClassInstanceNotFound, formatTime } from '../../../lib/classes';
import { findLiveBooking } from '../../../lib/bookings';

/**
 * Class detail — target of the `fit://classes/:instanceId` deep link and the tap
 * target of every schedule card (T7.3). Loads one occurrence's full detail
 * (`GET /class-instances/:id`) and the caller's own bookings (`GET /me/bookings`)
 * so it can render the Book / Waitlist / Cancel action in the right state.
 *
 * Restyled to the formacore "Aurora Glass" dark identity (T7.4,
 * member-classdetail-mobile artboard): a near-black `ink-950` canvas, a frosted
 * glass back button, a category-tinted hero (chip · title · date/time), a live
 * occupancy meter, the details as a glass card of labelled rows, and the booking
 * CTA pinned to the bottom of the scroll. Dark-only, matching the redesigned
 * schedule (T7.3) and home (T7.2) tabs — it no longer tracks the system theme.
 *
 * Degrades cleanly: a spinner while loading, a dedicated "class not found" state
 * for a `404` (a stale deep link to a removed occurrence), a retryable error for
 * anything transient, and — for a canceled / completed occurrence — a status
 * banner with the booking action withheld.
 */
export default function ClassDetailScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const detail = useClassInstance(gymId, instanceId);
  const bookings = useMemberBookings(gymId);

  const liveBooking = findLiveBooking(bookings.data ?? [], instanceId ?? '');
  const isNotFound = detail.error instanceof ClassInstanceNotFound;

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }} className="px-5 pb-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 flex-row items-center gap-1.5 self-start rounded-btn border border-white/10 bg-white/5 pl-2.5 pr-4 active:bg-white/10"
        >
          <Text className="text-lg font-bold text-ink-300">‹</Text>
          <Text className="text-[13px] font-semibold text-ink-200">{t('classes.detail.back')}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 28,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        {detail.isLoading ? (
          <View className="items-center gap-3 py-24">
            <ActivityIndicator color="#9184F1" />
            <Text className="text-sm text-ink-400">{t('classes.loading')}</Text>
          </View>
        ) : isNotFound ? (
          <View className="items-center gap-2 py-20">
            <Text className="text-4xl">🔍</Text>
            <Text className="text-lg font-bold text-white">
              {t('classes.detail.notFound.title')}
            </Text>
            <Text className="max-w-[320px] text-center text-sm text-ink-400">
              {t('classes.detail.notFound.subtitle')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              className="mt-2 rounded-btn border border-white/15 bg-white/5 px-5 py-2.5 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">
                {t('classes.detail.notFound.action')}
              </Text>
            </Pressable>
          </View>
        ) : detail.isError ? (
          <View className="items-center gap-3 py-20">
            <Text className="text-center text-sm text-ink-400">{t('classes.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void detail.refetch()}
              className="rounded-btn border border-white/15 bg-white/5 px-5 py-2.5 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">{t('classes.retry')}</Text>
            </Pressable>
          </View>
        ) : detail.data ? (
          <ClassDetailBody
            instance={detail.data}
            gymId={gymId}
            liveBooking={liveBooking}
            bookingsLoading={bookings.isLoading}
            locale={locale}
            t={t}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Occupancy tone (Tailwind bg class) from a filled fraction — matches the
 * schedule card meter (T7.3) so the same class reads the same everywhere. */
function meterTone(pct: number): string {
  if (pct >= 100) return 'bg-danger-500';
  if (pct > 85) return 'bg-warning-500';
  if (pct > 60) return 'bg-accent-500';
  return 'bg-success-500';
}

/** The loaded occurrence's body: category-tinted hero, lifecycle banner (when
 * not scheduled), description, the live occupancy meter, the detail rows, and
 * the booking action (only for a scheduled occurrence). */
function ClassDetailBody({
  instance,
  gymId,
  liveBooking,
  bookingsLoading,
  locale,
  t,
}: {
  instance: ClassInstanceDetail;
  gymId: string | null;
  liveBooking: ReturnType<typeof findLiveBooking>;
  bookingsLoading: boolean;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;
  const pct =
    instance.capacity > 0
      ? Math.min(Math.round((instance.bookedCount / instance.capacity) * 100), 100)
      : 0;
  const isScheduled = instance.status === 'SCHEDULED';
  const color = instance.color || '#9184F1';
  const dateLabel = new Date(instance.startsAt).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeRange = `${formatTime(instance.startsAt, locale)} – ${formatTime(instance.endsAt, locale)}`;

  return (
    <View className="gap-[18px]">
      {/* ---- hero: category chip · title · date/time ---- */}
      <View className="gap-3">
        {instance.category ? (
          <View
            className="flex-row items-center gap-1.5 self-start rounded-pill border px-2.5 py-1"
            style={{ backgroundColor: `${color}1F`, borderColor: `${color}3D` }}
          >
            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-white">
              {instance.category}
            </Text>
          </View>
        ) : null}

        <Text className="text-[28px] font-black leading-tight tracking-tight text-white">
          {instance.title}
        </Text>

        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-ink-300">{dateLabel}</Text>
          <View className="h-1 w-1 rounded-full bg-ink-600" />
          <Text
            className="font-mono text-sm text-ink-300"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {timeRange}
          </Text>
        </View>
      </View>

      {/* ---- lifecycle banner for a canceled / completed occurrence ---- */}
      {!isScheduled ? (
        <View
          accessibilityRole="alert"
          className="overflow-hidden rounded-card border border-white/10 bg-white/5 px-4 py-3.5"
        >
          <View className="absolute inset-x-0 top-0 h-px bg-white/10" />
          <View className="flex-row items-center gap-2">
            <View
              className={`h-1.5 w-1.5 rounded-full ${
                instance.status === 'CANCELED' ? 'bg-danger-400' : 'bg-ink-400'
              }`}
            />
            <Text className="text-sm font-semibold text-white">
              {instance.status === 'CANCELED'
                ? t('classes.detail.status.canceled')
                : t('classes.detail.status.completed')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* ---- what to expect (description) ---- */}
      {instance.description ? (
        <View className="gap-2">
          <Text className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink-400">
            {t('classes.detail.about')}
          </Text>
          <Text className="text-sm leading-[21px] text-ink-300">{instance.description}</Text>
        </View>
      ) : null}

      {/* ---- occupancy meter ---- */}
      <View className="overflow-hidden rounded-card border border-white/10 bg-white/5 p-4">
        <View className="absolute inset-x-0 top-0 h-px bg-white/10" />
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink-400">
            {t('classes.detail.capacity')}
          </Text>
          <Text
            className="font-mono text-[13px] text-ink-300"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {instance.bookedCount}/{instance.capacity}
          </Text>
        </View>
        <View className="mt-2.5 h-2 overflow-hidden rounded-pill bg-white/10">
          <View className={`h-full rounded-pill ${meterTone(pct)}`} style={{ width: `${pct}%` }} />
        </View>
        <Text
          className={`mt-2 text-xs font-semibold ${isFull ? 'text-warning-300' : 'text-ink-400'}`}
        >
          {isFull
            ? t('classes.card.full')
            : t(spotsLeft === 1 ? 'classes.card.spotsLeftOne' : 'classes.card.spotsLeftOther', {
                count: spotsLeft,
              })}
        </Text>
      </View>

      {/* ---- detail rows ---- */}
      <View className="overflow-hidden rounded-card border border-white/10 bg-white/5">
        <DetailRow label={t('classes.detail.time')} first>
          {timeRange}
        </DetailRow>
        <DetailRow label={t('classes.detail.duration')}>
          {t('classes.detail.minutes', { count: instance.durationMinutes })}
        </DetailRow>
        {instance.trainerName ? (
          <DetailRow label={t('classes.detail.trainer')}>{instance.trainerName}</DetailRow>
        ) : null}
        {instance.locationName ? (
          <DetailRow label={t('classes.detail.location')}>{instance.locationName}</DetailRow>
        ) : null}
        {instance.room ? (
          <DetailRow label={t('classes.detail.room')}>{instance.room}</DetailRow>
        ) : null}
      </View>

      {/* ---- booking action — only for a still-bookable (scheduled) occurrence ---- */}
      {isScheduled ? (
        <View className="pt-1">
          <ClassBookingActions
            instance={instance}
            gymId={gymId}
            liveBooking={liveBooking}
            bookingsLoading={bookingsLoading}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A labelled row in the occurrence's detail card (label left, value right).
 * Rows after the first carry a top hairline so the card reads as a divided list. */
function DetailRow({
  label,
  first = false,
  children,
}: {
  label: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <View
      className={`flex-row items-center justify-between gap-4 px-4 py-3.5 ${
        first ? '' : 'border-t border-white/[0.06]'
      }`}
    >
      <Text className="text-sm text-ink-400">{label}</Text>
      <Text className="shrink text-right text-sm font-semibold text-white">{children}</Text>
    </View>
  );
}
