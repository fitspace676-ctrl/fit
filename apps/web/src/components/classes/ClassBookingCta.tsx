'use client';

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { BookingActionButton } from '@/src/components/member/booking-action-button';

// Astryx migration (T11.12): the booking CTA renders the Astryx `<Button>` (via
// the brand-themed `BookingActionButton` for the signed-in server action, or a
// link Button for the signed-out redirect). A grid wrapper stretches the button
// to full width without any Tailwind utility.

const styles = stylex.create({
  fullBtnWrap: {
    display: 'grid',
  },
  fullBtn: {
    width: '100%',
  },
});

export interface ClassBookingCtaProps {
  /** The occurrence id — used to build the login return path. */
  classId: string;
  /** Whether every seat is taken (the booked CTA still allows joining the waitlist). */
  isFull: boolean;
}

/**
 * The class detail page's booking call-to-action, auth-gated like the calendar's
 * {@link import('./ClassDetailDrawer').ClassDetailDrawer}:
 *
 * - a signed-out visitor gets a link to `/member/login?from=<this detail page>` so they
 *   land back here after signing in;
 * - a signed-in member gets the real booking button ({@link BookingActionButton}),
 *   which runs the server action and refreshes the seat counts. When the class is
 *   full the action joins the waitlist, so the button stays enabled.
 *
 * Rendered as a client island so the rest of the detail page stays a static
 * Server Component (the session is only knowable client-side — see
 * {@link useSession}).
 */
export function ClassBookingCta({ classId, isFull }: ClassBookingCtaProps) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const { user } = useSession();

  if (user) {
    return (
      <div {...stylex.props(styles.fullBtnWrap)}>
        <BookingActionButton
          classId={classId}
          action="book"
          label={isFull ? t('drawer.full') : t('drawer.book')}
          v="primary"
          size="lg"
        />
      </div>
    );
  }

  // Where login should send the visitor back to: this detail page. next-intl's
  // <Link> prefixes the locale onto `/member/login`, and the login form validates this
  // same-origin path.
  const from = `/${locale}/member/classes/${classId}`;
  const loginHref = `/member/login?from=${encodeURIComponent(from)}`;

  return (
    <Button
      as={Link}
      href={loginHref}
      variant="primary"
      size="lg"
      label={t('drawer.signInToBook')}
      xstyle={styles.fullBtn}
    />
  );
}
