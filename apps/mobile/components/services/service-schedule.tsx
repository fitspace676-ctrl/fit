// "When it runs" — a service's recurrence, and the dates it next falls on.
//
// Ported from `apps/web/src/components/services/ServiceScheduleTable.tsx`.
// Namespace `services.schedule` throughout (D10: services read the top-level
// `services` family — there is no `member.services`).
//
// TWO BRANCHES, AND THE FIRST ONE IS THE COMMON CASE FOR PERSONAL TRAINING.
// `schedule` is `null` on a PT service whose slots come from the trainer's own
// calendar rather than from a recurrence — so the honest answer is
// `byAppointment` ("Sessions are booked one by one with the trainer…"), not an
// empty table. A CUSTOM service always has a schedule; the API requires it.
//
// `startTime` is rendered RAW. It is a wall-clock `HH:MM` the gym typed, not an
// instant, so there is nothing to convert and converting it would be wrong —
// see the header of `schedule-occurrences.ts`.

import { View } from 'react-native';
import type { ServiceSchedule } from '@fit/types';
import { Text, spacing } from '@fit/ui-mobile';

import { formatCalendarDate, formatCalendarDayHeading } from './date-format';
import { todayLocal, upcomingOccurrences } from './schedule-occurrences';
import { useI18n } from '../../providers/I18nProvider';

export interface ServiceScheduleProps {
  schedule: ServiceSchedule | null;
  /** `YYYY-MM-DD` in the device's calendar. Injected so tests can pin it. */
  today?: string;
  testID?: string;
}

/** The recurrence sentence plus the next dates, or the by-appointment note. */
export function ServiceScheduleBlock({ schedule, today, testID }: ServiceScheduleProps) {
  const { t, locale } = useI18n();

  if (schedule === null) {
    return (
      <View style={{ gap: spacing[1] }} testID={testID ?? 'service-schedule'}>
        <Text variant="caption" color="textSecondary">
          {t('services.schedule.byAppointment')}
        </Text>
      </View>
    );
  }

  const day = today ?? todayLocal();
  const rows = upcomingOccurrences(schedule, day);

  const repeats =
    schedule.freq === 'WEEKLY'
      ? t('services.schedule.weekly', {
          // Ordered by the catalogue's own MO→SU list rather than by the order
          // the gym happened to tick the boxes in.
          days: schedule.weekdays
            .map((weekday) => t(`services.schedule.weekday.${weekday}`))
            .join(', '),
        })
      : schedule.freq === 'DAILY'
        ? t('services.schedule.daily')
        : t('services.schedule.once', {
            date: formatCalendarDate(locale, schedule.startDate),
          });

  const until =
    schedule.until !== null
      ? t('services.schedule.until', {
          date: formatCalendarDate(locale, schedule.until),
        })
      : null;

  // ` · ` is web's own composition for this line. Punctuation, not copy.
  const summary = [repeats, schedule.startTime, until].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: spacing[2] }} testID={testID ?? 'service-schedule'}>
      <Text variant="caption" color="textSecondary" testID="service-schedule-summary">
        {summary}
      </Text>

      {rows.length === 0 ? (
        <Text variant="caption" color="textSecondary" testID="service-schedule-none">
          {t('services.schedule.noUpcoming')}
        </Text>
      ) : (
        <View style={{ gap: spacing[1] }} testID="service-schedule-rows">
          {rows.map((row) => (
            <View
              key={`${row.date}-${row.time}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] }}
              // ONE accessibility node: "Thu, Aug 6" and "19:00" read as two
              // unrelated stops otherwise, and the time is meaningless without
              // the day it belongs to.
              accessible
              accessibilityLabel={`${formatCalendarDayHeading(locale, row.date)} ${row.time}`}
              testID={`service-schedule-row-${row.date}`}
            >
              <Text variant="caption" color="textSecondary">
                {formatCalendarDayHeading(locale, row.date)}
              </Text>
              <Text variant="caption" color="textPrimary">
                {row.time}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
