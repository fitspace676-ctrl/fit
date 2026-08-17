import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { classCalendarViewSchema, DEFAULT_CLASS_VIEW } from '@fit/types';
import { getActiveGymId, getActiveGymTimezone } from '@/lib/active-gym';
import { ButtonLink } from '@/src/components/ui/kit';
import { ClassesBrowser } from '@/src/components/classes/ClassesBrowser';
import { parseFilters } from '@/src/components/classes/class-filters';

// Astryx migration (T11), now on the portal kit: the page shell (heading + subtitle) is authored in
// compiled StyleX over the Fit brand tokens — no Tailwind utilities. The
// interactive schedule lives in the client `ClassesBrowser` below.
//
// The head is the portal's standard one — eyebrow, title, subtitle, and the way
// onward on the same line — so this screen reads as a sibling of the membership
// and bookings boards rather than as a page from another product. It used to
// carry a bare title over a subtitle and nothing else, which is also why the
// only route from the schedule back to your own bookings was the bottom nav.

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
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
  subtitle: {
    margin: 0,
    marginTop: '0.375rem',
    maxWidth: '52ch',
    fontSize: '0.9375rem',
    color: 'var(--color-text-secondary)',
  },
});

export const metadata: Metadata = {
  title: 'Classes — Fit',
  description: 'Browse the class schedule and book your next session.',
};

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and show the empty state on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

/** Raw search params the classes page reads (all optional, all strings). */
interface ClassesSearchParams {
  view?: string;
  week?: string;
  class?: string;
  type?: string;
  trainer?: string;
  location?: string;
  time?: string;
}

/**
 * Public classes page. A Server Component that resolves the active gym and the
 * initial view/week/selection from the URL, then hands off to the client
 * {@link ClassesBrowser}, which owns the calendar, the week fetches, and the
 * detail drawer. Reachable signed-out (see the web middleware's public paths):
 * the booking CTA is the only auth gate.
 */
export default async function ClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ClassesSearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, gymId, timeZone] = await Promise.all([
    getTranslations('classes'),
    getActiveGymId(),
    getActiveGymTimezone(),
  ]);

  const view = classCalendarViewSchema.safeParse(sp.view).data ?? DEFAULT_CLASS_VIEW;
  const filters = parseFilters(sp);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>{t('eyebrow')}</p>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
        <ButtonLink
          href="/member/account/bookings"
          variant="secondary"
          size="card"
          label={t('myBookings')}
        />
      </header>

      <ClassesBrowser
        timeZone={timeZone}
        gymId={gymId}
        initialView={view}
        initialWeek={sp.week ?? ''}
        initialClassId={sp.class}
        initialFilters={filters}
      />
    </div>
  );
}
