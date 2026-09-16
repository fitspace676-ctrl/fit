// The week of free slots a member can book — `GET /service-sessions`.
//
// Ported from `apps/web/src/components/services/SlotCalendar.tsx`, with one
// structural change and one bug NOT ported.
//
// ===========================================================================
// THE CHANGE: A DAY STRIP, NOT SEVEN COLUMNS.
//
// Web draws seven `<section>`s side by side (1 / 2 / 4 columns). On a 390pt
// phone that is either seven columns two characters wide or seven stacked
// sections the member scrolls past. The artboards' own answer to "a week" is a
// day strip, and `DayCell` exists in the package for it — so the strip picks a
// day and the slots for THAT day are listed beneath it. Same data, same
// window, same request.
//
// THE BUG NOT PORTED. Web groups slots by `zonedDayKey(slot.startsAt, gymZone)`
// but keys its columns from `day.getFullYear()/getMonth()/getDate()` — the
// DEVICE's zone. On a phone in a different zone from the gym the two disagree
// and a slot lands in no column at all, silently. Here every key on both sides
// comes from `localDayKey`, one function, so they cannot diverge. The cost is
// that times are the member's wall clock rather than the gym's — unavoidable
// while `Intl` is banned (no runtime we ship has Georgian locale data, and
// there is no `Intl`-free way to resolve an arbitrary IANA zone). Flagged in
// C3b's report.
//
// ---------------------------------------------------------------------------
// THE TOOLBAR STAYS VISIBLE IN EVERY STATE, ERROR INCLUDED — web's rule, kept.
// A member who lands on a failed week must be able to step to another one; a
// toolbar that disappears with the grid traps them on the broken week.
// ===========================================================================

import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceSlot } from '@fit/types';
import {
  Button,
  DayCell,
  EmptyState,
  IconButton,
  ScrollRail,
  Skeleton,
  Text,
  spacing,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../auth/notices';
import {
  addDays,
  formatDayHeading,
  formatDayLong,
  formatDayOfMonth,
  formatTime,
  formatWeekdayShort,
  localDayKey,
  startOfWeek,
  weekDays,
  weekWindow,
  WEEK_DAYS,
} from './date-format';
import { serviceSlotsQueryOptions } from '../../hooks/queries/useServices';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';

export interface SlotCalendarProps {
  /** The resolved tenant, or `null` while it is still unknown. */
  gymId: string | null;
  serviceId: string;
  /** A slot was tapped — the detail screen opens the confirmation sheet. */
  onPickSlot: (slot: ServiceSlot) => void;
  /** Pins "now" in tests. Production passes nothing. */
  now?: Date;
}

/** The week of free slots, its navigation, and the selected day's times. */
export function SlotCalendar({ gymId, serviceId, onPickSlot, now }: SlotCalendarProps) {
  const { t, plural, locale } = useI18n();
  const queryClient = useQueryClient();

  const [week, setWeek] = useState<Date>(() => startOfWeek(now ?? new Date()));
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const range = useMemo(() => weekWindow(week), [week]);
  const slots = useQuery(serviceSlotsQueryOptions(gymId, { serviceId, ...range }));

  const days = useMemo(() => weekDays(week), [week]);
  const dayKeys = useMemo(() => days.map((day) => localDayKey(day)), [days]);

  const byDay = useMemo(() => {
    const map = new Map<string, ServiceSlot[]>();
    for (const slot of slots.data?.slots ?? []) {
      const key = localDayKey(slot.startsAt);
      const list = map.get(key);
      if (list) list.push(slot);
      else map.set(key, [slot]);
    }
    // The API orders by `startsAt ASC, id ASC`, but nothing in the contract
    // says so — one unsorted response would draw 19:00 above 08:00.
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    }
    return map;
  }, [slots.data]);

  const todayKey = localDayKey(now ?? new Date());
  // Derived rather than stored, so stepping to another week cannot leave a
  // selection pointing at a day that is no longer on screen. No effect, no
  // reset, no window where the two disagree.
  const activeKey =
    pickedKey !== null && dayKeys.includes(pickedKey)
      ? pickedKey
      : dayKeys.includes(todayKey)
        ? todayKey
        : (dayKeys[0] ?? '');

  const activeSlots = byDay.get(activeKey) ?? [];

  const step = useCallback((weeks: number) => {
    setWeek((current) => addDays(current, weeks * WEEK_DAYS));
    setPickedKey(null);
  }, []);

  const goToThisWeek = useCallback(() => {
    setWeek(startOfWeek(new Date()));
    setPickedKey(null);
  }, []);

  const retry = useCallback(() => {
    if (gymId === null) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.serviceSlots(gymId, serviceId, { from: range.from, to: range.to }),
    });
  }, [gymId, queryClient, serviceId, range.from, range.to]);

  const offline = slots.isPending && slots.fetchStatus === 'paused';
  const loading = slots.isPending && !offline && gymId !== null;

  const weekLabel = `${formatDayHeading(locale, week)} – ${formatDayHeading(
    locale,
    addDays(week, WEEK_DAYS - 1),
  )}`;

  return (
    <View style={{ gap: spacing[3] }} testID="slot-calendar">
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
        testID="slot-calendar-toolbar"
      >
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('services.calendar.previousWeek')}
          onPress={() => {
            step(-1);
          }}
          testID="slot-calendar-prev"
        />
        <IconButton
          icon="chevronRight"
          accessibilityLabel={t('services.calendar.nextWeek')}
          onPress={() => {
            step(1);
          }}
          testID="slot-calendar-next"
        />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {weekLabel}
        </Text>
        <Button
          label={t('services.calendar.today')}
          variant="secondary"
          size="sm"
          onPress={goToThisWeek}
          testID="slot-calendar-today"
        />
      </View>

      <ScrollRail gap={2} testID="slot-calendar-days">
        {days.map((day, index) => {
          const key = dayKeys[index] ?? '';
          const count = byDay.get(key)?.length ?? 0;
          return (
            <DayCell
              key={key}
              weekday={formatWeekdayShort(locale, day)}
              date={formatDayOfMonth(day)}
              hasClasses={count > 0}
              selected={key === activeKey}
              // THE WHOLE SPOKEN SENTENCE. The dot is the only thing on the
              // cell that says whether the day has anything, and a dot is not
              // something a screen reader can read.
              //
              // `training.packages.sessionsOne/Other` is the plural pair the
              // catalogues carry for a count of PT sessions — and a free slot
              // IS a service session (`/service-sessions` is the endpoint), so
              // this is a borrow within the same noun rather than an invented
              // string. A dedicated `services.calendar.slotCount` would read
              // better; it is owed, not authored here.
              accessibilityLabel={`${formatDayLong(locale, day)}, ${
                count === 0
                  ? t('services.calendar.noSlots')
                  : plural('training.packages.sessions', count)
              }`}
              onPress={() => {
                setPickedKey(key);
              }}
              testID={`slot-day-${key}`}
            />
          );
        })}
      </ScrollRail>

      {offline ? (
        // A paused slot query never resolves — a skeleton would sit here for the
        // rest of the session promising times that are not coming.
        // TODO(i18n): `common.offline.title` / `common.offline.body`.
        <OfflineNotice testID="slot-calendar-offline" />
      ) : null}

      {!offline && loading ? (
        <View testID="slot-calendar-loading" style={{ gap: spacing[2] }}>
          <Skeleton height={44} radius={22} />
          <Skeleton height={44} radius={22} />
        </View>
      ) : null}

      {!offline && !loading && slots.isError ? (
        <EmptyState
          testID="slot-calendar-error"
          layout="bare"
          icon="info"
          title={t('services.calendar.error')}
          action={{
            label: t('services.calendar.retry'),
            onPress: retry,
            variant: 'secondary',
            icon: 'refresh',
            testID: 'slot-calendar-retry',
          }}
        />
      ) : null}

      {!offline && !loading && !slots.isError && activeSlots.length === 0 ? (
        <Text variant="body" color="textSecondary" testID="slot-calendar-empty">
          {t('services.calendar.noSlots')}
        </Text>
      ) : null}

      {!offline && !loading && !slots.isError && activeSlots.length > 0 ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}
          testID="slot-calendar-slots"
        >
          {activeSlots.map((slot) => (
            <Button
              key={slot.id}
              label={formatTime(locale, slot.startsAt)}
              variant="secondary"
              size="md"
              // The visible label is a bare time, which on its own says nothing
              // about what tapping does. The hint carries the verb.
              accessibilityHint={t('services.booking.book')}
              onPress={() => {
                onPickSlot(slot);
              }}
              testID={`slot-${slot.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
