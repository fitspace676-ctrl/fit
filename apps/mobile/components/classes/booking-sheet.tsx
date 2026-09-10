// @fit/mobile — the "are you sure?" sheet, for both classes screens.
//
// `mobile-class-detail.tsx:263-329` drawn with the package's `ConfirmSheet`.
// Everything visual — the scrim, the grabber, the recap card, the two halves of
// the footer, the one red fill in the whole app — belongs to the package; this
// file is the COPY and the state→label table, which is exactly the line the
// package draws (no component in `@fit/ui-mobile` ships a string).
//
// ---------------------------------------------------------------------------
// `title` AND `confirmLabel` ARE THE SAME STRING, AND THAT IS A COPY GAP.
//
// `ConfirmSheet` asks for the question ("Cancel this booking?") and, separately,
// for the confirming verb ("Cancel booking"). The catalogues carry only one of
// the two: `classes.detail.booking.{book,joinWaitlist,cancel,leaveWaitlist}`
// are the four ACTIONS, and neither `classes.modal` (3 keys) nor
// `member.classes` has a question form or a bare "Confirm". So both props take
// the action, which reads correctly and is true — rather than an invented
// Georgian question. Owed: `classes.modal.confirm` plus four question forms;
// see the report.
//
// The note line has the same shape of gap. The artboard writes a cancellation-
// window sentence under the cancel confirmation ("გაუქმების ვადა გაკვეთილამდე
// 2 საათია…"); the only real string near it is `member.actions.errWindowPassed`,
// which is an ERROR after the fact, not an advisory before it — and the window
// length is a per-gym setting this screen has no endpoint for. So the note
// renders only in the case that HAS copy: `classes.detail.booking.fullNote`,
// on a full class.

import { useRef } from 'react';
import { ConfirmSheet, isClassFull } from '@fit/ui-mobile';

import { useI18n } from '../../providers/I18nProvider';
import { formatLongDay, formatTime } from './schedule';
import type { BookingTarget, ClassBooking } from './use-class-booking';

export interface ClassBookingSheetProps {
  /** The flow, from `useClassBooking()`. */
  booking: ClassBooking;
  testID?: string;
}

/**
 * The booking / cancellation confirmation.
 *
 * ONE PER SCREEN, which is what `Sheet`'s single-instance rule requires — the
 * flow holds a single `target`, so two of these can never overlap.
 */
export function ClassBookingSheet({
  booking,
  testID = 'class-booking-confirm',
}: ClassBookingSheetProps) {
  const { t, locale } = useI18n();

  // `Sheet` keeps its `Modal` mounted through the EXIT animation, which it can
  // only do if this component keeps rendering while `open` is false. Unmounting
  // the moment `target` clears would cut the animation and, on iOS, flash the
  // panel out of existence. So the last target survives the close.
  const shown = useRef<BookingTarget | null>(null);
  if (booking.target !== null) shown.current = booking.target;
  const target = shown.current;
  if (target === null) return null;

  const full = isClassFull(target.capacity, target.bookedCount);
  const booked = target.status === 'BOOKED';
  const waitlisted = target.status === 'WAITLIST';

  const action = waitlisted
    ? t('classes.detail.booking.leaveWaitlist')
    : booked
      ? t('classes.detail.booking.cancel')
      : full
        ? t('classes.detail.booking.joinWaitlist')
        : t('classes.detail.booking.book');

  const when = `${formatLongDay(target.startsAt, locale)} · ${formatTime(target.startsAt, locale)}`;
  const who = [target.trainerName, target.locationName].filter((part) => part !== '').join(' · ');

  return (
    <ConfirmSheet
      testID={testID}
      open={booking.target !== null}
      onClose={booking.dismiss}
      onConfirm={booking.confirm}
      title={action}
      confirmLabel={action}
      cancelLabel={t('classes.modal.close')}
      closeAccessibilityLabel={t('classes.modal.close')}
      recapTitle={target.title}
      recapLines={who === '' ? [when] : [when, who]}
      {...(!booked && !waitlisted && full
        ? { note: t('classes.detail.booking.fullNote'), noteIcon: 'bolt' as const }
        : {})}
      destructive={booked || waitlisted}
      busy={booking.busy}
      busyLabel={
        target.status === null
          ? t('classes.detail.booking.booking')
          : t('classes.detail.booking.canceling')
      }
    />
  );
}
