import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { ClassInstanceCard, MemberBookingHistoryEntry } from '@fit/types';
import { useI18n } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useClassInstances } from '../../../hooks/useClassInstances';
import { useMemberBookings } from '../../../hooks/useMemberBookings';
import {
  ScheduleClassCard,
  type ClassBookingState,
} from '../../../components/classes/ScheduleClassCard';
import { addWeeks, dayKey, isSameDay, startOfWeek, weekDays } from '../../../lib/classes';

/**
 * Classes tab — the formacore "Aurora Glass" schedule (T7.3,
 * member-classes-mobile artboard). A near-black `ink-950` canvas with:
 *
 *   • a top app bar (selected week's month/year eyebrow + a My-bookings button
 *     badged with the member's active booking count),
 *   • a Mon→Sun day strip flanked by week-paging chevrons,
 *   • a horizontally-scrolling type-filter chip row (All + the week's
 *     categories),
 *   • the selected day's sessions grouped into Morning / Afternoon / Evening.
 *
 * One `GET /class-instances` query (keyed on gym + week window) backs the whole
 * week; changing the day or the filter re-slices that cached data without
 * refetching. The caller's own bookings (`GET /me/bookings`) tint each card's
 * CTA (Book / Booked / Waitlisted / Waitlist); the booking mutation itself lives
 * on the class-detail screen (T7.4), so tapping a card deep-links to
 * `/classes/:id`. Dark-only, matching the redesigned home tab (T7.2).
 */
export default function ClassesScreen() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedKey, setSelectedKey] = useState(() =>
    dayKey(defaultSelected(startOfWeek(new Date()))),
  );
  const [filter, setFilter] = useState('__all');

  const { data, isLoading, isError, refetch } = useClassInstances(gymId, weekStart);
  const bookingsQuery = useMemberBookings(gymId, 'all');
  const instances = data ?? [];

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of instances) if (item.category) seen.add(item.category);
    return Array.from(seen);
  }, [instances]);

  // The caller's own booking state per occurrence, so a card can show
  // Booked / Waitlisted rather than a bare Book CTA.
  const bookings: MemberBookingHistoryEntry[] = bookingsQuery.data ?? [];
  const bookedIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) if (b.status === 'BOOKED') set.add(b.classInstance.id);
    return set;
  }, [bookings]);
  const waitlistedIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) if (b.status === 'WAITLIST') set.add(b.classInstance.id);
    return set;
  }, [bookings]);
  const activeBookingCount = bookedIds.size + waitlistedIds.size;

  const dayItems = useMemo(
    () =>
      instances
        .filter((item) => dayKey(new Date(item.startsAt)) === selectedKey)
        .filter((item) => filter === '__all' || item.category === filter)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [instances, selectedKey, filter],
  );
  const periods = useMemo(() => groupByPeriod(dayItems), [dayItems]);

  const bookingStateOf = (item: ClassInstanceCard): ClassBookingState => {
    if (bookedIds.has(item.id)) return 'booked';
    if (waitlistedIds.has(item.id)) return 'waitlisted';
    if (item.bookedCount >= item.capacity) return 'full';
    return 'idle';
  };

  const goToWeek = (next: Date): void => {
    setWeekStart(next);
    setSelectedKey(dayKey(defaultSelected(next)));
  };
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date()));
  const openClass = (id: string): void => router.push(`/classes/${id}`);

  const filterChips = [
    { key: '__all', label: t('member.classes.all') },
    ...categories.map((c) => ({ key: c, label: c })),
  ];

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between px-5 pb-3">
          <View className="min-w-0 flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-500">
              {monthLabel(weekStart, locale)}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="mt-0.5 text-2xl font-extrabold tracking-tight text-white">
                {t('member.classes.title')}
              </Text>
              {!isCurrentWeek ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => goToWeek(startOfWeek(new Date()))}
                  hitSlop={8}
                  className="mt-1 rounded-pill border border-white/10 bg-white/5 px-2.5 py-0.5 active:bg-white/10"
                >
                  <Text className="text-[11px] font-semibold text-brand-300">
                    {t('member.classes.today')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('member.classes.myBookings')}
            onPress={() => router.push('/bookings')}
            className="h-11 w-11 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
          >
            <Text className="text-lg">🗓</Text>
            {activeBookingCount > 0 ? (
              <View className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-ink-950 bg-brand-500 px-1">
                <Text className="text-[10px] font-bold text-white">{activeBookingCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* ---- week strip ---- */}
        <View className="flex-row items-center gap-2 px-5 pb-3">
          <WeekChevron
            label="‹"
            accessibilityLabel={t('member.classes.prevWeek')}
            onPress={() => goToWeek(addWeeks(weekStart, -1))}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            className="flex-1"
          >
            {days.map((day) => {
              const key = dayKey(day);
              const active = key === selectedKey;
              const isToday = isSameDay(day, new Date());
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelectedKey(key)}
                  className={`w-12 items-center gap-0.5 rounded-card py-2 ${
                    active ? 'bg-brand-600' : 'border border-white/10 bg-white/5 active:bg-white/10'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                      active ? 'text-white/80' : 'text-ink-400'
                    }`}
                  >
                    {day.toLocaleDateString(locale, { weekday: 'short' })}
                  </Text>
                  <Text
                    className={`text-lg font-bold leading-none ${active ? 'text-white' : 'text-white'}`}
                  >
                    {day.getDate()}
                  </Text>
                  <View
                    className={`h-1 w-1 rounded-full ${
                      isToday ? (active ? 'bg-white' : 'bg-brand-400') : 'bg-transparent'
                    }`}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
          <WeekChevron
            label="›"
            accessibilityLabel={t('member.classes.nextWeek')}
            onPress={() => goToWeek(addWeeks(weekStart, 1))}
          />
        </View>

        {/* ---- type filter chips ---- */}
        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
          >
            {filterChips.map((chip) => {
              const active = filter === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setFilter(chip.key)}
                  className={`h-9 justify-center rounded-pill px-4 ${
                    active ? 'bg-white' : 'border border-white/10 bg-white/5 active:bg-white/10'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-semibold ${active ? 'text-ink-950' : 'text-ink-300'}`}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* ---- schedule ---- */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View className="items-center gap-3 py-16">
            <ActivityIndicator color="#9184F1" />
            <Text className="text-sm text-ink-400">{t('member.classes.loading')}</Text>
          </View>
        ) : isError ? (
          <View className="items-center gap-3 py-16">
            <Text className="text-center text-sm text-ink-400">{t('member.classes.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              className="rounded-btn border border-white/15 bg-white/5 px-4 py-2 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">{t('member.classes.retry')}</Text>
            </Pressable>
          </View>
        ) : periods.length > 0 ? (
          periods.map((group) => (
            <View key={group.period}>
              <View className="mb-3 flex-row items-center gap-3">
                <Text className="text-sm font-bold uppercase tracking-[1.5px] text-ink-400">
                  {t(`member.classes.periods.${group.period}`)}
                </Text>
                <Text className="font-mono text-[11px] text-ink-600">{group.items.length}</Text>
                <View className="h-px flex-1 bg-white/10" />
              </View>
              <View className="gap-2.5">
                {group.items.map((item) => (
                  <ScheduleClassCard
                    key={item.id}
                    instance={item}
                    bookingState={bookingStateOf(item)}
                    onPress={openClass}
                  />
                ))}
              </View>
            </View>
          ))
        ) : (
          <View className="items-center gap-2 py-16">
            <Text className="text-3xl">🗓</Text>
            <Text className="text-base font-semibold text-white">
              {filter === '__all'
                ? t('member.classes.empty.title')
                : t('member.classes.empty.titleFiltered', { type: filter })}
            </Text>
            <Text className="text-center text-xs text-ink-500">
              {t('member.classes.empty.subtitle')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** The three parts of a day, in schedule order. */
const PERIOD_ORDER = ['morning', 'afternoon', 'evening'] as const;
type Period = (typeof PERIOD_ORDER)[number];

/** One day-part's sessions, in ascending start order. */
interface PeriodGroup {
  period: Period;
  items: ClassInstanceCard[];
}

/** The part of the day an instant falls in (local time): <12 / <17 / else. */
function periodOf(iso: string): Period {
  const hour = new Date(iso).getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Bucket a day's occurrences into Morning / Afternoon / Evening, dropping empties. */
function groupByPeriod(items: ClassInstanceCard[]): PeriodGroup[] {
  return PERIOD_ORDER.map((period) => ({
    period,
    items: items.filter((item) => periodOf(item.startsAt) === period),
  })).filter((group) => group.items.length > 0);
}

/** The day a freshly-selected week defaults to: today when in the week, else Monday. */
function defaultSelected(weekStart: Date): Date {
  const today = new Date();
  return weekDays(weekStart).find((day) => isSameDay(day, today)) ?? weekStart;
}

/** A `Month YYYY` label for the app-bar eyebrow. */
function monthLabel(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** A compact chevron button for paging the week strip forward / back. */
function WeekChevron({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      className="h-11 w-8 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
    >
      <Text className="text-lg font-bold text-ink-300">{label}</Text>
    </Pressable>
  );
}
