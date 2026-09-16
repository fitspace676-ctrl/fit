// @fit/mobile — "when do you start?", answered on a week strip.
//
// ===========================================================================
// WHY THE CLASSES SCREEN'S CONTROL AND NOT A TEXT BOX.
//
// This field used to be a masked `dd.mm.yyyy` entry (`date-mask.ts`), for the
// reason that file still states: mobile has no native date picker, and adding
// one means a native module and a new EAS dev-client build for everyone.
//
// That reasoning is sound and the conclusion was still wrong here, because the
// app already had a date picker — `app/(tabs)/classes/index.tsx` has been
// shipping one since WP-8: two chevrons around a `ScrollRail` of `DayCell`s.
// It is not native, it needs no new dependency, and a member has already used
// it to find the class they are joining for. So the join funnel was asking a
// buyer to TYPE eight digits, on a number pad, to answer a question the same
// app answers with one tap two screens away.
//
// The difference between the two uses is the WINDOW. The classes rail is
// unbounded — any week has a schedule. This one is bounded by the gym's
// `startDatePolicy`, so days outside `[min, max]` are drawn but not pressable
// (`DayCell.disabled`), and the chevrons stop at the weeks the window reaches.
// A control that offers a day the API would refuse is the exact defect
// `startDateBounds` exists to prevent, and disabling is better than hiding:
// the buyer can SEE that Thursday exists and is not on offer.
//
// ---------------------------------------------------------------------------
// THE STATE CONTRACT IS UNCHANGED.
//
// `JoinState.startDate` is still `YYYY-MM-DD` or `''`, still unseeded (an
// untouched field must read as unanswered), and `startDateAccepted` is still
// the only thing that judges it. Only the way a buyer says it has changed.
// ===========================================================================

import {
  DAY_CELL_WIDTH,
  DayCell,
  Eyebrow,
  IconButton,
  ScrollRail,
  Text,
  spacing,
} from '@fit/ui-mobile';
import type { GymStartDatePolicy } from '@fit/types';
import { useState } from 'react';
import { View } from 'react-native';

import {
  DAYS_IN_WEEK,
  addDays,
  dayKey,
  dayOfMonth,
  formatLongDate,
  formatMonth,
  formatWeekdayShort,
  isSameDay,
  startOfWeek,
  weekDays,
} from '../classes/schedule';
import { dayFromIso, startDateWindow } from './start-date';
import { useI18n } from '../../providers/I18nProvider';

export interface StartDateFieldProps {
  /** The chosen day, `YYYY-MM-DD`, or `''` while unanswered. */
  value: string;
  /** Called with the pressed day as `YYYY-MM-DD`. */
  onChange: (iso: string) => void;
  /**
   * The gym's window. `null` when the catalogue has not said — the strip then
   * bounds nothing, exactly as the text box accepted anything, and
   * `startDateAccepted` still refuses the step. A dead control would be worse
   * than a permissive one.
   */
  policy: GymStartDatePolicy | null;
  /** Today on the device, `YYYY-MM-DD`. See `start-date.ts` for whose clock. */
  today: string;
  /** The field's label. Copy is the caller's, as everywhere else. */
  label: string;
  /** The window said out loud — `startDateHintKey`'s sentence. */
  hint?: string;
  /** Paint the field as refused. */
  invalid: boolean;
  disabled: boolean;
  testID: string;
}

/** The membership's start day, picked off a week of the calendar. */
export function StartDateField({
  value,
  onChange,
  policy,
  today,
  label,
  hint,
  invalid,
  disabled,
  testID,
}: StartDateFieldProps) {
  const { t, locale } = useI18n();

  const bounds = policy === null ? null : startDateWindow(policy, today);
  const selected = dayFromIso(value);
  const todayDay = dayFromIso(today);

  // Open on the buyer's own answer if they have one, else on this week. Not
  // derived from `value` on every render: the buyer may page away from the week
  // holding their selection, and snapping back under them would make the
  // chevrons feel broken.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(selected ?? todayDay ?? new Date()));

  const days = weekDays(weekStart);

  /** Is `day` inside the gym's window? */
  const offered = (day: Date): boolean => {
    if (bounds === null) return true;
    const key = dayKey(day);
    // ISO days compare correctly as strings, which is why `startDateBounds`
    // returns them rather than `Date`s.
    return key >= bounds.min && key <= bounds.max;
  };

  // The chevrons stop where the window does. Without this the buyer can page
  // into March 2027 and find seven dead cells with nothing saying why.
  const canStepBack = bounds === null || dayKey(addDays(weekStart, -1)) >= bounds.min;
  const canStepForward = bounds === null || dayKey(addDays(weekStart, DAYS_IN_WEEK)) <= bounds.max;

  const stepWeek = (weeks: number): void => {
    setWeekStart(startOfWeek(addDays(weekStart, weeks * DAYS_IN_WEEK)));
  };

  /**
   * Which cell the rail centres on.
   *
   * `-1` — which `ScrollRail` reads as "index 0, do not scroll" — when the
   * selection is not in the week on screen. That is the honest answer: there is
   * no cell to bring into view.
   */
  const selectedIndex = days.findIndex((day) => selected !== null && isSameDay(day, selected));

  return (
    <View style={{ gap: spacing[2] }} testID={testID}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing[3],
        }}
      >
        {/* The same micro-label every `TextField` on this step draws, so the
            replaced control still reads as one field in the column. */}
        <Eyebrow size="micro" color="textSecondary" accessible={false}>
          {label}
        </Eyebrow>
        <Text variant="caption" color="textSecondary" testID={`${testID}-month`}>
          {formatMonth(weekStart, locale)}
        </Text>
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'center' }}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('checkout.details.calendar.previousWeek')}
          variant="surface"
          disabled={disabled || !canStepBack}
          onPress={() => {
            stepWeek(-1);
          }}
          testID={`${testID}-prev-week`}
        />
        <ScrollRail
          testID={`${testID}-week`}
          style={{ flexGrow: 1, flexShrink: 1 }}
          edgePadding={spacing[2]}
          scrollToIndex={selectedIndex}
          itemWidth={DAY_CELL_WIDTH}
        >
          {days.map((day) => {
            const key = dayKey(day);
            const available = offered(day);
            return (
              <DayCell
                key={key}
                weekday={formatWeekdayShort(day, locale)}
                date={dayOfMonth(day)}
                selected={selected !== null && isSameDay(day, selected)}
                disabled={disabled || !available}
                // Nothing on the cell says which day of which month it is, that
                // it is today, or that it is out of the window — so the whole
                // sentence is spelled out, as `DayCell` requires.
                accessibilityLabel={[
                  todayDay !== null && isSameDay(day, todayDay)
                    ? t('checkout.details.calendar.today')
                    : null,
                  formatLongDate(day, locale),
                  available ? null : t('checkout.details.calendar.unavailable'),
                ]
                  .filter((part): part is string => part !== null)
                  .join(', ')}
                onPress={() => {
                  onChange(key);
                }}
                testID={`${testID}-day-${key}`}
              />
            );
          })}
        </ScrollRail>
        <IconButton
          icon="chevronRight"
          accessibilityLabel={t('checkout.details.calendar.nextWeek')}
          variant="surface"
          disabled={disabled || !canStepForward}
          onPress={() => {
            stepWeek(1);
          }}
          testID={`${testID}-next-week`}
        />
      </View>

      {hint === undefined ? null : (
        <Text
          variant="caption"
          // The strip has no border to turn red, so the window sentence is what
          // carries the refusal — which is right anyway: "you have not picked a
          // day" and "pick one in this window" are the same message.
          color={invalid ? 'error' : 'textSecondary'}
          testID={`${testID}-hint`}
          {...(invalid
            ? { accessibilityLiveRegion: 'polite' as const, accessibilityRole: 'alert' as const }
            : {})}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}
