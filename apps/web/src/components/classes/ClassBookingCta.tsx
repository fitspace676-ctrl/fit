'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';
import { buttonClasses } from '@/src/components/ui';
import { BookingActionButton } from '@/src/components/member/booking-action-button';

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
 * - a signed-out visitor gets a link to `/login?from=<this detail page>` so they
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
      <BookingActionButton
        classId={classId}
        action="book"
        label={isFull ? t('drawer.full') : t('drawer.book')}
        v="primary"
        size="lg"
        className="w-full"
      />
    );
  }

  // Where login should send the visitor back to: this detail page. next-intl's
  // <Link> prefixes the locale onto `/login`, and the login form validates this
  // same-origin path.
  const from = `/${locale}/classes/${classId}`;
  const loginHref = `/login?from=${encodeURIComponent(from)}`;

  return (
    <Link href={loginHref} className={buttonClasses('primary', 'lg', 'w-full')}>
      {t('drawer.signInToBook')}
    </Link>
  );
}
