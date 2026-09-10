// A trainer's upcoming sessions, grouped by day.
//
// Ported from `apps/web/src/components/trainers/TrainerSchedule.tsx`. Two
// things carried over deliberately and one changed:
//
//   CARRIED — the empty branch is an early return with the heading STILL
//   RENDERED. "Upcoming sessions / No upcoming sessions scheduled yet" is a
//   section that answers the question; a section that vanishes leaves the
//   member wondering whether it failed to load.
//
//   CARRIED — a `SERVICE` entry is a bookable PT slot and links to
//   `/services/:serviceId`. `kind` defaults to `'CLASS'` and `serviceId` to
//   `null` in the Zod schema, so the link is drawn only when BOTH say so.
//
//   CHANGED — the day key is the DEVICE's zone, not the gym's. Web reads every
//   instant in `getActiveGymTimezone()` via `Intl.DateTimeFormat({timeZone})`;
//   `Intl` is banned in this app (no runtime we ship carries Georgian locale
//   data, and the eslint rule enforces it), and there is no `Intl`-free way to
//   resolve an arbitrary IANA zone. So every time on the phone is the member's
//   own wall clock — which is at least self-consistent, whereas web's
//   `SlotCalendar` mixes gym-zone grouping keys with device-zone column keys
//   and can drop a slot into no column at all. Flagged in C3b's report.

import { Fragment } from 'react';
import { View } from 'react-native';
import type { Locale } from '@fit/i18n';
import type { TrainerScheduleEntry } from '@fit/types';
import { Button, Eyebrow, Icon, SectionHeader, Text, spacing } from '@fit/ui-mobile';

import { formatDayHeading, formatTimeRange, groupByDay } from '../services/date-format';

export interface TrainerScheduleSectionProps {
  locale: Locale;
  schedule: readonly TrainerScheduleEntry[];
  copy: {
    title: string;
    empty: string;
    /** `trainers.detail.schedule.book` — absent from `member.trainers`. */
    book: string;
  };
  /** Open the service a bookable slot belongs to. */
  onOpenService: (serviceId: string) => void;
}

/** The "Upcoming sessions" section — heading, then one block per day. */
export function TrainerScheduleSection({
  locale,
  schedule,
  copy,
  onOpenService,
}: TrainerScheduleSectionProps) {
  const days = groupByDay(schedule, (entry) => entry.startsAt);

  return (
    <View style={{ gap: spacing[3] }} testID="trainer-schedule">
      <SectionHeader title={copy.title} />

      {days.length === 0 ? (
        <Text variant="body" color="textSecondary" testID="trainer-schedule-empty">
          {copy.empty}
        </Text>
      ) : (
        days.map((day) => (
          <Fragment key={day.key}>
            <Eyebrow
              size="eyebrow"
              color="textSecondary"
              testID={`trainer-schedule-day-${day.key}`}
            >
              {formatDayHeading(locale, day.date)}
            </Eyebrow>
            {day.items.map((entry) => (
              <View
                key={entry.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
                testID={`trainer-schedule-entry-${entry.id}`}
              >
                <View style={{ flex: 1, gap: spacing[0.5] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] }}>
                    {/* Decorative: the time is spelled out in the text beside
                        it, so the glyph must not announce itself as well. */}
                    <Icon name="clock" size={14} color="iconSecondary" />
                    <Text variant="caption" color="textSecondary">
                      {formatTimeRange(locale, entry.startsAt, entry.endsAt)}
                    </Text>
                  </View>
                  <Text variant="body" color="textPrimary">
                    {entry.title}
                  </Text>
                  {entry.locationName !== '' ? (
                    <Text variant="caption" color="textSecondary">
                      {entry.locationName}
                    </Text>
                  ) : null}
                </View>

                {entry.kind === 'SERVICE' && entry.serviceId !== null ? (
                  <Button
                    label={copy.book}
                    variant="secondary"
                    size="sm"
                    // The label alone says "Book"; the hint says WHICH — a list
                    // of five identical "Book" buttons is a list of five
                    // identical screen-reader stops.
                    accessibilityHint={entry.title}
                    onPress={() => {
                      onOpenService(entry.serviceId as string);
                    }}
                    testID={`trainer-schedule-book-${entry.id}`}
                  />
                ) : null}
              </View>
            ))}
          </Fragment>
        ))
      )}
    </View>
  );
}
