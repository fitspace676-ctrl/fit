import type { Metadata } from 'next';
import { getActiveGymTimezone } from '@/lib/active-gym';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { fetchMyServiceSessions } from '@/lib/my-service-sessions';
import { MySessions } from '@/src/components/services/MySessions';
import { Link } from '@/src/i18n/navigation';
import { ButtonLink } from '@/src/components/ui/kit';
import { BookingHistory } from '@/src/components/account/BookingHistory';

/**
 * Render per request, never at build: the booking list is the signed-in
 * member's own data, read from their `accessToken` cookie, so a prerendered
 * shell would have no session to read.
 */
export const dynamic = 'force-dynamic';

// Astryx migration (T11), now on the portal kit: the member "My bookings" board is rebuilt on the
// Astryx design system over the FormaCore theme — the header, the
// upcoming/past segmented control, the cards and the cancel confirm dialog are
// all authored in compiled StyleX (`var(--color-*)` / `var(--font-family-*)`)
// and the portal kit, no Tailwind utilities and no formacore Aurora-glass.
// The data fetch and split-by-start logic are unchanged.

const styles = stylex.create({
  // The board runs the full width of the member shell (1180px), like every
  // other account screen. It used to cap itself at 48rem, which left a third of
  // the canvas empty on a laptop and made the page read as broken rather than
  // as spacious — the shell already owns the measure, so a second, narrower cap
  // here was the only thing making this screen the odd one out.
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    width: '100%',
  },
  // Title block and the way out, on one line — the same head the membership
  // screen draws. Someone landing on an empty board needs the door to the class
  // list without hunting for it, so the CTA is part of the header rather than
  // buried in whichever empty state happens to be showing.
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  eyebrow: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    color: 'var(--color-text-secondary)',
  },
  title: {
    margin: 0,
    marginTop: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  sessions: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' },
  sessionsHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  sessionsTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  sessionsGroup: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-text-secondary)',
  },
  sessionsLink: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    textDecoration: { default: 'none', ':hover': 'underline' },
  },
  sessionsEmpty: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  subtitle: {
    margin: 0,
    marginTop: '0.375rem',
    maxWidth: '52ch',
    fontSize: '0.9375rem',
    color: 'var(--color-text-secondary)',
  },
});

interface AccountBookingsParams {
  locale: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<AccountBookingsParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'account.bookings' });
  return { title: `${t('title')} - FormaCore` };
}

/**
 * Member panel — "My bookings" (T5.10). A Server Component that loads the
 * signed-in member's booking history and renders it split into upcoming / past.
 * The route is auth-gated by the web middleware (every non-public path requires a
 * session), so reaching this page implies a member session; the data fetch
 * forwards that session's token and degrades to an empty history if it is
 * somehow absent.
 */
export default async function AccountBookingsPage({
  params,
}: {
  params: Promise<AccountBookingsParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, entries, sessions, timeZone] = await Promise.all([
    getTranslations('account.bookings'),
    fetchMemberBookings({ scope: 'all' }),
    fetchMyServiceSessions().catch(() => []),
    getActiveGymTimezone(),
  ]);

  // Service sessions (personal training and the like) live beside the class
  // bookings: booked-and-ahead first, everything else as history.
  const now = Date.now();
  const upcomingSessions = sessions.filter(
    (s) => s.status === 'BOOKED' && new Date(s.startsAt).getTime() >= now,
  );
  const pastSessions = sessions
    .filter((s) => !upcomingSessions.includes(s))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>{t('eyebrow')}</p>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
        <ButtonLink
          href="/member/classes"
          variant="primary"
          size="card"
          label={t('empty.action')}
        />
      </header>

      <BookingHistory timeZone={timeZone} entries={entries} now={now} />

      <section {...stylex.props(styles.sessions)}>
        <div {...stylex.props(styles.sessionsHead)}>
          <div>
            <h2 {...stylex.props(styles.sessionsTitle)}>{t('sessions.title')}</h2>
            <p {...stylex.props(styles.subtitle)}>{t('sessions.subtitle')}</p>
          </div>
          <Link href="/member/services" {...stylex.props(styles.sessionsLink)}>
            {t('sessions.action')}
          </Link>
        </div>
        {sessions.length === 0 ? (
          <p {...stylex.props(styles.sessionsEmpty)}>{t('sessions.empty')}</p>
        ) : (
          <>
            <h3 {...stylex.props(styles.sessionsGroup)}>
              {t('sessions.upcoming')} ({upcomingSessions.length})
            </h3>
            {upcomingSessions.length === 0 ? (
              <p {...stylex.props(styles.sessionsEmpty)}>{t('sessions.noUpcoming')}</p>
            ) : (
              <MySessions sessions={upcomingSessions} timeZone={timeZone} />
            )}
            {pastSessions.length > 0 ? (
              <>
                <h3 {...stylex.props(styles.sessionsGroup)}>{t('sessions.past')}</h3>
                <MySessions sessions={pastSessions} timeZone={timeZone} />
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
