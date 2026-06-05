import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { fetchTrainer } from '@/lib/trainers';
import { Link } from '@/src/i18n/navigation';
import { TrainerNotFound } from '@/src/components/trainers/TrainerNotFound';
import { TrainerProfile } from '@/src/components/trainers/TrainerProfile';
import { TrainerSchedule } from '@/src/components/trainers/TrainerSchedule';

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and 404 every trainer on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

interface TrainerDetailParams {
  locale: string;
  id: string;
}

/**
 * Load one trainer for the active gym, or `null` when there is no tenant in
 * scope / the id is unknown / a transient failure occurs. Never throws: like
 * `getActiveGymId`, the detail page degrades to its "not found" state rather
 * than an error screen. Next memoises the underlying `fetch`, so calling this
 * from both `generateMetadata` and the page costs a single round-trip.
 */
async function loadTrainer(id: string) {
  const gymId = await getActiveGymId();
  if (!gymId) {
    return null;
  }
  try {
    return await fetchTrainer({ gymId, id });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<TrainerDetailParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const trainer = await loadTrainer(id);
  return {
    title: trainer ? `${trainer.name} — Fit` : 'Trainer — Fit',
    description: trainer?.headline || 'Meet the trainer and see their schedule.',
  };
}

/**
 * Public trainer detail page. A Server Component that resolves the active gym,
 * loads the trainer's profile + schedule, and renders them — or a branded
 * "not found" state when the id resolves to no trainer for this gym. Reachable
 * signed-out (see the web middleware's public paths): pure discovery, no auth
 * gate.
 */
export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<TrainerDetailParams>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [t, trainer] = await Promise.all([getTranslations('trainers'), loadTrainer(id)]);

  return (
    <main className="mx-auto w-full max-w-3xl px-gutter py-10">
      <Link
        href="/trainers"
        className="mb-8 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <span aria-hidden>←</span>
        {t('detail.back')}
      </Link>

      {trainer ? (
        <div className="flex flex-col gap-10">
          <TrainerProfile trainer={trainer} />
          <TrainerSchedule schedule={trainer.schedule} />
        </div>
      ) : (
        <TrainerNotFound />
      )}
    </main>
  );
}
