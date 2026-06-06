'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { useSession } from '@/hooks/use-session';

export interface ClassBookingCtaProps {
  /** The occurrence id — used to build the login return path. */
  classId: string;
  /** Whether every seat is taken (the booked CTA is disabled when full). */
  isFull: boolean;
}

/**
 * The class detail page's booking call-to-action, auth-gated like the calendar's
 * {@link import('./ClassDetailDrawer').ClassDetailDrawer}:
 *
 * - a signed-out visitor gets a link to `/login?from=<this detail page>` so they
 *   land back here after signing in;
 * - a signed-in member gets the booking button — a placeholder until the booking
 *   call is wired in T6.4 (Class detail with Book / Waitlist actions), so the
 *   flow is visually complete now and only the handler is deferred.
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
    // Booking is out of scope for T5.9 — the API call is wired in T6.4. Render
    // the CTA so the flow is visually complete; the handler lands with it.
    return (
      <button
        type="button"
        disabled={isFull}
        className="w-full rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isFull ? t('drawer.full') : t('drawer.book')}
      </button>
    );
  }

  // Where login should send the visitor back to: this detail page. next-intl's
  // <Link> prefixes the locale onto `/login`, and the login form validates this
  // same-origin path.
  const from = `/${locale}/classes/${classId}`;
  const loginHref = `/login?from=${encodeURIComponent(from)}`;

  return (
    <Link
      href={loginHref}
      className="block w-full rounded-card bg-brand-600 px-6 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
    >
      {t('drawer.signInToBook')}
    </Link>
  );
}
