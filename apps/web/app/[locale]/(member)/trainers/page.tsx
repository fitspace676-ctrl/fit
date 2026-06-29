import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { TrainersBrowser } from '@/src/components/trainers/TrainersBrowser';
import { parseFilters } from '@/src/components/trainers/trainer-filters';

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

  const [t, gymId] = await Promise.all([getTranslations('trainers'), getActiveGymId()]);

  const filters = parseFilters(sp);

  return (
    <main className="mx-auto w-full max-w-5xl px-gutter py-10">
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <TrainersBrowser gymId={gymId} initialFilters={filters} />
    </main>
  );
}
