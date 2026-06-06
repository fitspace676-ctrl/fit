import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { ClassInstanceDetail } from '@fit/types';
import { useI18n, useTheme } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useClassInstance } from '../../../hooks/useClassInstance';
import { useMemberBookings } from '../../../hooks/useMemberBookings';
import { ClassBookingActions } from '../../../components/classes/ClassBookingActions';
import { ClassInstanceNotFound, formatTime } from '../../../lib/classes';
import { findLiveBooking } from '../../../lib/bookings';

/**
 * Class detail — target of the `fit://classes/:instanceId` deep link and the tap
 * target of every calendar card (T6.4). Loads one occurrence's full detail
 * (`GET /class-instances/:id`) and the caller's own bookings (`GET /me/bookings`)
 * so it can render the Book / Waitlist / Cancel action in the right state.
 *
 * Degrades cleanly: a spinner while loading, a dedicated "class not found" state
 * for a `404` (a stale deep link to a removed occurrence), a retryable error for
 * anything transient, and — for a canceled / completed occurrence — a status
 * banner with the booking action withheld. Colours come from `useTheme()`, so
 * the screen tracks system dark mode like the rest of the app.
 */
export default function ClassDetailScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const detail = useClassInstance(gymId, instanceId);
  const bookings = useMemberBookings(gymId);

  const liveBooking = findLiveBooking(bookings.data ?? [], instanceId ?? '');
  const isNotFound = detail.error instanceof ClassInstanceNotFound;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, gap: 16 }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        hitSlop={8}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
          ‹ {t('classes.detail.back')}
        </Text>
      </Pressable>

      {detail.isLoading ? (
        <View style={{ paddingVertical: 64, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('classes.loading')}</Text>
        </View>
      ) : isNotFound ? (
        <View style={{ paddingVertical: 56, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
            {t('classes.detail.notFound.title')}
          </Text>
          <Text
            style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}
          >
            {t('classes.detail.notFound.subtitle')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              {t('classes.detail.notFound.action')}
            </Text>
          </Pressable>
        </View>
      ) : detail.isError ? (
        <View style={{ paddingVertical: 56, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
            {t('classes.error')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void detail.refetch()}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              {t('classes.retry')}
            </Text>
          </Pressable>
        </View>
      ) : detail.data ? (
        <ClassDetailBody
          instance={detail.data}
          gymId={gymId}
          liveBooking={liveBooking}
          bookingsLoading={bookings.isLoading}
          locale={locale}
          colors={colors}
          t={t}
        />
      ) : null}
    </ScrollView>
  );
}

interface Colors {
  background: string;
  surface: string;
  primary: string;
  onPrimary: string;
  text: string;
  textMuted: string;
  border: string;
}

/** The loaded occurrence's body: category, title/date, status banner (when not
 * scheduled), description, the detail rows, the capacity bar, and the booking
 * action (only for a scheduled occurrence). */
function ClassDetailBody({
  instance,
  gymId,
  liveBooking,
  bookingsLoading,
  locale,
  colors,
  t,
}: {
  instance: ClassInstanceDetail;
  gymId: string | null;
  liveBooking: ReturnType<typeof findLiveBooking>;
  bookingsLoading: boolean;
  locale: string;
  colors: Colors;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;
  const bookedPct =
    instance.capacity > 0 ? Math.min((instance.bookedCount / instance.capacity) * 100, 100) : 0;
  const isScheduled = instance.status === 'SCHEDULED';

  return (
    <View style={{ gap: 16 }}>
      {/* Category */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          accessible={false}
          style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: instance.color }}
        />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {instance.category}
        </Text>
      </View>

      {/* Title + date */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text }}>
          {instance.title}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>
          {new Date(instance.startsAt).toLocaleDateString(locale, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {/* Lifecycle banner for a non-scheduled (canceled / completed) occurrence */}
      {!isScheduled ? (
        <View
          accessibilityRole="alert"
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
            {instance.status === 'CANCELED'
              ? t('classes.detail.status.canceled')
              : t('classes.detail.status.completed')}
          </Text>
        </View>
      ) : null}

      {/* Description */}
      {instance.description ? (
        <Text style={{ fontSize: 14, lineHeight: 21, color: colors.textMuted }}>
          {instance.description}
        </Text>
      ) : null}

      {/* Detail rows */}
      <View
        style={{
          gap: 12,
          paddingVertical: 16,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        <DetailRow label={t('classes.detail.time')} colors={colors}>
          {formatTime(instance.startsAt, locale)} – {formatTime(instance.endsAt, locale)}
        </DetailRow>
        <DetailRow label={t('classes.detail.duration')} colors={colors}>
          {t('classes.detail.minutes', { count: instance.durationMinutes })}
        </DetailRow>
        {instance.trainerName ? (
          <DetailRow label={t('classes.detail.trainer')} colors={colors}>
            {instance.trainerName}
          </DetailRow>
        ) : null}
        {instance.locationName ? (
          <DetailRow label={t('classes.detail.location')} colors={colors}>
            {instance.locationName}
          </DetailRow>
        ) : null}
        {instance.room ? (
          <DetailRow label={t('classes.detail.room')} colors={colors}>
            {instance.room}
          </DetailRow>
        ) : null}
      </View>

      {/* Capacity */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
            {t('classes.detail.capacity')}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>
            {instance.bookedCount} / {instance.capacity}
          </Text>
        </View>
        <View
          style={{
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            backgroundColor: colors.border,
          }}
        >
          <View
            style={{
              width: `${bookedPct}%`,
              height: '100%',
              borderRadius: 4,
              backgroundColor: isFull ? '#dc2626' : colors.primary,
            }}
          />
        </View>
        <Text style={{ fontSize: 12, color: isFull ? '#dc2626' : colors.textMuted }}>
          {isFull
            ? t('classes.card.full')
            : t(spotsLeft === 1 ? 'classes.card.spotsLeftOne' : 'classes.card.spotsLeftOther', {
                count: spotsLeft,
              })}
        </Text>
      </View>

      {/* Booking action — only for a still-bookable (scheduled) occurrence */}
      {isScheduled ? (
        <View style={{ paddingTop: 4 }}>
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

/** A labelled row in the occurrence's detail list (label left, value right). */
function DetailRow({
  label,
  colors,
  children,
}: {
  label: string;
  colors: Colors;
  children: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
      <Text style={{ fontSize: 14, color: colors.textMuted }}>{label}</Text>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
          flexShrink: 1,
          textAlign: 'right',
        }}
      >
        {children}
      </Text>
    </View>
  );
}
