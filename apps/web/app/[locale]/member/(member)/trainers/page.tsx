import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchMyGoals } from '@/lib/goals';
import { TrainersBrowser } from '@/src/components/trainers/TrainersBrowser';
import { parseFilters } from '@/src/components/trainers/trainer-filters';
import { GoalsCard } from '@/src/components/member/goals/goals-card';

// Astryx migration (T11), now on the portal kit: the page shell (heading + subtitle) is authored in
// compiled StyleX over the Fit brand tokens — no Tailwind utilities. The
// interactive roster lives in the client `TrainersBrowser` below; the member-only
// `GoalsCard` keeps its own (not-yet-migrated) styling during coexistence.

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

export const metadata: Metadata = {
  title: 'Trainers — Fit',
  description: 'Meet the trainers and find the right coach for you.',
};

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and show the empty state on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

/** Raw search params the trainers page reads (all optional, all strings). */
interface TrainersSearchParams {
  specialty?: string;
  location?: string;
  q?: string;
}

/**
 * Public trainers index. A Server Component that resolves the active gym and the
 * initial filters from the URL, then hands off to the client
 * {@link TrainersBrowser}, which owns the roster fetch, the filter cards, and the
 * card grid. Reachable signed-out (see the web middleware's public paths) — the
 * page is pure discovery, no auth gate.
 */
export default async function TrainersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<TrainersSearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, gymId, session] = await Promise.all([
    getTranslations('trainers'),
    getActiveGymId(),
    getServerSession(),
  ]);

  // The "Your goals" card is member-only; signed-out visitors just see the roster.
  const goals = session ? await fetchMyGoals().catch(() => []) : [];
  const filters = parseFilters(sp);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      {session ? <GoalsCard initialGoals={goals} /> : null}

      <TrainersBrowser gymId={gymId} initialFilters={filters} />
    </div>
  );
}
