// @fit/mobile — one row of the classes list.
//
// A thin adapter: `ClassInstanceCard` (+ the member's own booking) in, the
// package's `ClassCard` out. Everything visual is the package's; everything in
// here is copy, and it is all `member.classes` (D10).
//
// ---------------------------------------------------------------------------
// THREE THINGS THIS FILE DOES NOT DO, ON PURPOSE.
//
//   1. It does NOT compute `spotsLeft` or `full` to decide the action.
//      `ClassCard` derives both from `capacity` / `bookedCount` and picks among
//      the four labels itself, which is what stops home and classes disagreeing
//      about whether a class can be booked. The screen asks `spotsLeftFor` only
//      to interpolate the COUNT into a sentence, because the sentence is copy.
//
//   2. It does NOT nest a pressable in a pressable. `onOpen` goes to the card's
//      content region and `onAction` to the button beside it; `ClassCard` keeps
//      them siblings so an Android tap on Book cannot also open the class.
//
//   3. It does NOT put the seat count only in the pill. The pill is inside the
//      card's single accessibility node, so the count has to be in
//      `accessibilityLabel` too or a screen-reader user never hears it.
//
// ---------------------------------------------------------------------------
// THE DURATION UNIT IS SPLIT OUT OF A WHOLE SENTENCE.
//
// `DurationBadge` draws a big figure over a small unit, so it needs "45" and
// "min" separately. The catalogue has neither: `member.classes.minutes` is
// `"{count} min"` / `"{count} წთ"`, a complete phrase. Rendering it with an
// empty count and trimming yields exactly the unit in both locales, and the
// full phrase is what the badge announces. Owed: a bare
// `member.classes.minuteUnit`; see the report.

import { ClassCard, spotsLeftFor } from '@fit/ui-mobile';
import type { ClassInstanceCard } from '@fit/types';

import { useI18n } from '../../providers/I18nProvider';
import { NO_BOOKING, type MyBooking } from './my-bookings';
import { durationMinutes, formatTime } from './schedule';

export interface ClassListCardProps {
  instance: ClassInstanceCard;
  /** The member's standing on this class. Defaults to "not booked". */
  booking?: MyBooking;
  /** A write against THIS class is in flight. */
  busy?: boolean;
  /** Open the detail. */
  onOpen: (instance: ClassInstanceCard) => void;
  /** Press the action — book, waitlist or cancel. */
  onAction: (instance: ClassInstanceCard, booking: MyBooking) => void;
  testID?: string;
}

/** One class, as the list draws it. */
export function ClassListCard({
  instance,
  booking = NO_BOOKING,
  busy = false,
  onOpen,
  onAction,
  testID,
}: ClassListCardProps) {
  const { t, locale } = useI18n();

  const minutes = durationMinutes(instance.startsAt, instance.endsAt);
  const time = formatTime(instance.startsAt, locale);
  const meta = [instance.trainerName, instance.locationName]
    .filter((part) => part !== '')
    .join(' · ');

  const spotsLeft = spotsLeftFor(instance.capacity, instance.bookedCount);
  const spotsLeftLabel = t('member.classes.spotsLeft', { count: spotsLeft });
  const fullLabel = t('member.classes.full');

  // The one sentence the card's content region announces. The seat count is in
  // it because the pill that shows it is hidden behind this node.
  const spoken = [
    instance.title,
    instance.category,
    time,
    meta,
    spotsLeft > 0 ? spotsLeftLabel : fullLabel,
  ]
    .filter((part) => part !== '')
    .join(', ');

  return (
    <ClassCard
      testID={testID}
      category={instance.category}
      categoryColor={instance.color}
      title={instance.title}
      // Straight off the wire, nullable, and null for most classes — the card
      // draws today's card when it is. See `ClassCard`'s header.
      coverImageUrl={instance.imageUrl}
      time={time}
      meta={meta}
      duration={{
        value: String(minutes),
        unit: t('member.classes.minutes', { count: '' }).trim(),
        accessibilityLabel: t('member.classes.minutes', { count: minutes }),
      }}
      capacity={instance.capacity}
      bookedCount={instance.bookedCount}
      spotsLeftLabel={spotsLeftLabel}
      fullLabel={fullLabel}
      status={booking.status}
      accessibilityLabel={spoken}
      onPress={() => {
        onOpen(instance);
      }}
      action={{
        onPress: () => {
          onAction(instance, booking);
        },
        bookLabel: t('member.classes.book'),
        joinWaitlistLabel: t('member.classes.waitlist'),
        bookedLabel: t('member.classes.booked'),
        // TODO(i18n): the artboard shows the queue place here ("მოლოდინი · #2")
        // and `member.classes` has no key that takes a position —
        // `classes.detail.booking.waitlistPosition` is the detail's namespace,
        // and D10 puts this screen on `member.classes`. The position IS
        // rendered, on the detail screen, where its key lives.
        waitlistedLabel: t('member.classes.waitlisted'),
        // No `busyLabel`: `Button` keeps the label and adds the busy state, and
        // the only "…ing" strings in the catalogues live in the DETAIL's
        // namespace (`classes.detail.booking.booking` / `.canceling`). The
        // confirm sheet renders those, where they belong.
        busy,
        testID: testID === undefined ? undefined : `${testID}-action`,
      }}
    />
  );
}
