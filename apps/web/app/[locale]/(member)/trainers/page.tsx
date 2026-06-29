import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchMyGoals } from '@/lib/goals';
import { TrainersBrowser } from '@/src/components/trainers/TrainersBrowser';
import { parseFilters } from '@/src/components/trainers/trainer-filters';
import { GoalsCard } from '@/src/components/member/goals/goals-card';

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
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      {session ? <GoalsCard initialGoals={goals} /> : null}

      <TrainersBrowser gymId={gymId} initialFilters={filters} />
    </div>
  );
}
