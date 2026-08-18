'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@/src/components/ui/kit';
import { useTranslations } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';
import { ClassBookingModal } from './ClassBookingModal';

// The detail page's booking CTA — now the same door as the schedule's.
//
// It used to run its own flow: a `BookingActionButton` that fired the server
// action straight from the page and reported the outcome as a toast, while the
// calendar booked the same class through a side sheet. Two shapes, two outcomes,
// one act. This is a plain button that opens {@link ClassBookingModal}, so the
// booking flow is one object no matter where a member starts it — and the detail
// page inherits the modal's confirmation, waitlist position and inline errors,
// none of which it previously had.

const styles = stylex.create({
  wrap: {
    display: 'grid',
  },
});

export interface ClassBookingCtaProps {
  /** The occurrence being booked — passed straight to the modal. */
  instance: ClassInstanceCard;
  /** Whether every seat is taken (the CTA then offers the waitlist). */
  isFull: boolean;
  /**
   * The gym's IANA zone. Times inside the modal are read in it rather than in
   * the viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/**
 * Opens the booking modal for this class. Rendered as a client island so the
 * rest of the detail page stays a Server Component; the modal itself resolves
 * the session and gates the action (see {@link ClassBookingModal}).
 */
export function ClassBookingCta({ instance, isFull, timeZone }: ClassBookingCtaProps) {
  const t = useTranslations('classes');
  const [open, setOpen] = useState(false);

  return (
    <div {...stylex.props(styles.wrap)}>
      <Button
        variant="primary"
        size="page"
        fullWidth
        label={isFull ? t('detail.booking.joinWaitlist') : t('detail.booking.book')}
        onClick={() => setOpen(true)}
      />
      <ClassBookingModal
        instance={open ? instance : null}
        onClose={() => setOpen(false)}
        timeZone={timeZone}
      />
    </div>
  );
}
