// Confirming — and paying for — one personal-training slot.
//
// ===========================================================================
// THE AUTH-SOFT BOUNDARY IS THIS BUTTON, AND NOTHING ABOVE IT.
//
// `/services/[id]` is `'auth-soft'` in `ROUTE_POLICY`: the screen renders to a
// signed-out visitor — the service, the price, the free slots, all of it — and
// only the confirming action prompts, returning through `?next=`. That is the
// deleted app's `/login` bounce corrected at the right layer, and it is why
// this component takes `signedIn` rather than reading a session and hiding
// itself.
//
// ---------------------------------------------------------------------------
// `SESSION_TAKEN` IS A REAL RACE AND IS HANDLED SEPARATELY FROM EVERY OTHER
// FAILURE.
//
// The claim is a conditional `updateMany({ where: { id, status: OPEN } })`;
// `count === 0` means someone else pressed first, and the API answers
// `409 SESSION_TAKEN`. Between rendering a week of slots and tapping one, that
// is not a corner case — it is the normal outcome of two members wanting the
// same 19:00.
//
// So it is the ONE error that closes the sheet: the slot the member is looking
// at no longer exists, and leaving a dead confirm button under a red banner
// asks them to retry something that can never succeed. The handler surfaces
// the sentence as a toast, invalidates the slot list so the taken time
// disappears, and returns them to the calendar to pick another. Every OTHER
// failure keeps the sheet open with the message inline, because for those
// (`SESSION_PAST` aside) pressing again is a legitimate next move.
//
// ---------------------------------------------------------------------------
// THERE IS NO CANCEL AFFORDANCE ANYWHERE IN THIS STACK, AND THAT IS THE API,
// NOT AN OMISSION. `admin/service-sessions/:id/cancel` is `ClassWrite`; a
// member can book a session and cannot release one. Plan §7 records it. A
// button here would be a button with no endpoint behind it.
// ===========================================================================

import { useCallback, useMemo, useState } from 'react';
import type { Locale } from '@fit/i18n';
import type { ServiceSlot } from '@fit/types';
import { Alert, ConfirmSheet } from '@fit/ui-mobile';

import { formatDayLong, formatTimeRange } from './date-format';
import { formatMoney } from './money';
import { ApiError } from '../../lib/http/api-error';
import type { MessageKey } from '../../lib/i18n/keys';
import type { I18nContextValue } from '../../providers/I18nProvider';

/**
 * The catalogue key for a failed booking, from the envelope's `code`.
 *
 * Branching on `code`, never on the HTTP status: `SESSION_TAKEN` and
 * `SESSION_PAST` are BOTH `409`, and the two need different sentences. The
 * API's own filter documents the code as "decoupled from the HTTP status so the
 * wire contract stays stable", which is exactly the promise this relies on.
 */
export function bookingErrorKey(error: unknown): MessageKey {
  if (!ApiError.is(error)) return 'services.booking.errors.generic';
  switch (error.code) {
    case 'SESSION_TAKEN':
      return 'services.booking.errors.taken';
    case 'SESSION_PAST':
      return 'services.booking.errors.past';
    case 'NOT_A_MEMBER':
    case 'MEMBER_SESSION_REQUIRED':
    case 'UNAUTHENTICATED':
      return 'services.booking.errors.notMember';
    default:
      return 'services.booking.errors.generic';
  }
}

/** Did another member take this slot first? The one error that closes the sheet. */
export function isSlotTaken(error: unknown): boolean {
  return ApiError.is(error) && error.code === 'SESSION_TAKEN';
}

export interface BookingSheetProps {
  /** The slot being confirmed, or `null` when the sheet is closed. */
  slot: ServiceSlot | null;
  locale: Locale;
  /** Signed in? Drives which action the confirm button performs. */
  signedIn: boolean;
  /** A booking is in flight. */
  busy: boolean;
  /** The last failure, or `null`. `SESSION_TAKEN` never reaches here. */
  error: unknown;
  onClose: () => void;
  onConfirm: (slot: ServiceSlot) => void;
  onSignIn: () => void;
  /** The screen's `t`, threaded in so this file holds no provider of its own. */
  t: I18nContextValue['t'];
}

/**
 * The confirmation sheet for one slot.
 *
 * `ConfirmSheet` is deliberately the whole thing: it already owns the modal,
 * the scrim, `accessibilityViewIsModal`, the Android hardware back, the busy
 * state that SWALLOWS a second press (so a double tap cannot raise two
 * invoices) and the 44pt floors. A hand-rolled sheet here would be the second
 * design system the plan exists to prevent.
 */
export function BookingSheet({
  slot,
  locale,
  signedIn,
  busy,
  error,
  onClose,
  onConfirm,
  onSignIn,
  t,
}: BookingSheetProps) {
  const message = error === null || error === undefined ? null : t(bookingErrorKey(error));

  const recap = useMemo(() => {
    if (slot === null) return { title: '', lines: [] as string[] };
    return {
      title:
        slot.serviceType === 'PERSONAL_TRAINING'
          ? t('services.booking.ptTitle', { staff: slot.staffName })
          : slot.serviceName,
      lines: [
        formatDayLong(locale, slot.startsAt),
        `${formatTimeRange(locale, slot.startsAt, slot.endsAt)} · ${t('services.booking.minutes', {
          count: slot.durationMinutes,
        })}`,
        slot.staffName,
        formatMoney(slot.priceMinor, slot.currency, locale),
      ],
    };
  }, [slot, locale, t]);

  const confirm = useCallback(() => {
    if (slot === null) return;
    if (signedIn) onConfirm(slot);
    else onSignIn();
  }, [slot, signedIn, onConfirm, onSignIn]);

  return (
    <ConfirmSheet
      open={slot !== null}
      onClose={onClose}
      onConfirm={confirm}
      // The question is the slot itself, named.
      title={recap.title}
      recapTitle={recap.title}
      recapLines={recap.lines}
      // "Booking issues an invoice for the session price. Pay at the front desk
      // before the session." — the one thing a member must know BEFORE
      // confirming, because confirming raises a real charge.
      note={t('services.booking.invoiceHint')}
      noteIcon="info"
      confirmLabel={signedIn ? t('services.booking.book') : t('services.booking.signInToBook')}
      busyLabel={t('services.booking.booking')}
      busy={busy}
      cancelLabel={t('services.booking.cancel')}
      // TODO(i18n): no namespace-neutral "Close" exists. `classes.modal.close`
      // is real, translated copy ("Close" / "დახურვა"); `common.close` is one
      // of the six shared-chrome keys the plan lists as owed.
      closeAccessibilityLabel={t('classes.modal.close')}
      testID="booking-sheet"
    >
      {message !== null ? (
        <Alert tone="danger" title={message} live testID="booking-error" />
      ) : null}
    </ConfirmSheet>
  );
}

/**
 * The sheet's own transient state, kept here so the screen holds one value.
 *
 * `Sheet` is SINGLE-INSTANCE PER SCREEN (two overlapping `Modal`s flash black
 * on iOS), which is why the open slot and the error live together: there is one
 * sheet, so there is one state.
 */
export function useBookingSheetState() {
  const [slot, setSlot] = useState<ServiceSlot | null>(null);
  const [error, setError] = useState<unknown>(null);

  const open = useCallback((next: ServiceSlot) => {
    setSlot(next);
    setError(null);
  }, []);

  const close = useCallback(() => {
    setSlot(null);
    setError(null);
  }, []);

  return { slot, error, open, close, setError };
}
