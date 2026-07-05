import { Pressable, Text, View } from 'react-native';
import type { ClassInstanceCard } from '@fit/types';
import { useI18n } from '../../providers/I18nProvider';
import { formatTime } from '../../lib/classes';

/** The caller's own relationship to an occurrence, deciding the card's CTA pill. */
export type ClassBookingState = 'idle' | 'booked' | 'waitlisted' | 'full';

export interface ScheduleClassCardProps {
  instance: ClassInstanceCard;
  /** Whether the signed-in member already holds / is queued for this occurrence. */
  bookingState: ClassBookingState;
  /** Called with the occurrence id when the card (or its CTA) is tapped. */
  onPress: (id: string) => void;
}

/** Whole-minutes duration between two ISO instants (0 when unparseable / inverted). */
function durationMinutes(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return ms > 0 ? Math.round(ms / 60_000) : 0;
}

/**
 * One class occurrence as a formacore "Aurora Glass" schedule row (T7.3,
 * member-classes-mobile artboard): a frosted card with the start time + length,
 * a category-coloured rail, the title, a trainer · room subline, a live
 * occupancy meter, and a category chip beside a state-aware CTA pill
 * (Book / Booked / Waitlisted / Waitlist). The pill mirrors the caller's own
 * booking state — the actual book / cancel action lives on the class-detail
 * screen (T7.4), so the whole card (pill included) deep-links there rather than
 * duplicating the mutation. Dark-only, matching the redesigned home tab (T7.2).
 */
export function ScheduleClassCard({ instance, bookingState, onPress }: ScheduleClassCardProps) {
  const { t, locale } = useI18n();

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const pct =
    instance.capacity > 0
      ? Math.min(Math.round((instance.bookedCount / instance.capacity) * 100), 100)
      : 0;
  const meterTone =
    pct >= 100
      ? 'bg-danger-500'
      : pct > 85
        ? 'bg-warning-500'
        : pct > 60
          ? 'bg-accent-500'
          : 'bg-success-500';
  const minutes = durationMinutes(instance.startsAt, instance.endsAt);
  const subtitle = [instance.trainerName, instance.locationName].filter(Boolean).join(' · ');
  const color = instance.color || '#9184F1';

  return (
    <Pressable
      testID="class-card"
      accessibilityRole="button"
      onPress={() => onPress(instance.id)}
      className="overflow-hidden rounded-card border border-white/10 bg-white/5 p-3.5 active:bg-white/10"
    >
      <View className="absolute inset-x-0 top-0 h-px bg-white/10" />

      <View className="flex-row items-center gap-3">
        <View className="w-12 items-center">
          <Text
            className="font-mono text-sm font-bold text-white"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatTime(instance.startsAt, locale)}
          </Text>
          {minutes > 0 ? (
            <Text className="font-mono text-[10px] text-ink-500">
              {t('member.classes.minutes', { count: minutes })}
            </Text>
          ) : null}
        </View>

        <View className="h-11 w-1 rounded-full" style={{ backgroundColor: color }} />

        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-white" numberOfLines={1}>
            {instance.title}
          </Text>
          {subtitle ? (
            <Text className="mt-1 text-xs text-ink-400" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {/* occupancy */}
      <View className="mt-3 flex-row items-center gap-2.5">
        <Text
          className={`text-[11px] font-semibold ${
            bookingState === 'full' ? 'text-warning-300' : 'text-ink-400'
          }`}
        >
          {bookingState === 'full'
            ? t('member.classes.full')
            : t('member.classes.spotsLeft', { count: spotsLeft })}
        </Text>
        <View className="h-1.5 flex-1 overflow-hidden rounded-pill bg-white/10">
          <View className={`h-full rounded-pill ${meterTone}`} style={{ width: `${pct}%` }} />
        </View>
        <Text
          className="font-mono text-[11px] text-ink-500"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {instance.bookedCount}/{instance.capacity}
        </Text>
      </View>

      {/* category chip + state CTA */}
      <View className="mt-3 flex-row items-center gap-2">
        {instance.category ? (
          <View
            className="flex-row items-center gap-1.5 rounded-pill border px-2.5 py-1"
            style={{ backgroundColor: `${color}1F`, borderColor: `${color}3D` }}
          >
            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
            <Text className="text-[11px] font-semibold text-white">{instance.category}</Text>
          </View>
        ) : null}

        <View className="ml-auto">
          <CtaPill state={bookingState} label={ctaLabel(bookingState, t)} />
        </View>
      </View>
    </Pressable>
  );
}

/** The CTA label for a booking state, from the shared catalogue. */
function ctaLabel(state: ClassBookingState, t: (key: string) => string): string {
  switch (state) {
    case 'booked':
      return t('member.classes.booked');
    case 'waitlisted':
      return t('member.classes.waitlisted');
    case 'full':
      return t('member.classes.waitlist');
    default:
      return t('member.classes.book');
  }
}

/** The pill on the right of a schedule card, tinted by booking state. */
function CtaPill({ state, label }: { state: ClassBookingState; label: string }) {
  const tone =
    state === 'booked'
      ? 'bg-success-600'
      : state === 'waitlisted'
        ? 'bg-warning-500'
        : state === 'full'
          ? 'bg-warning-500'
          : 'bg-brand-600';
  return (
    <View className={`h-9 justify-center rounded-btn px-5 ${tone}`}>
      <Text className="text-xs font-bold text-white">{label}</Text>
    </View>
  );
}
