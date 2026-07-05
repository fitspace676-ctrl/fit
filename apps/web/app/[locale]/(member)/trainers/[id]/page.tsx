import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActiveGymId } from '@/lib/active-gym';
import { fetchTrainer } from '@/lib/trainers';
import { fetchTrainerReviews } from '@/lib/reviews';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { TrainerNotFound } from '@/src/components/trainers/TrainerNotFound';
import { TrainerProfile } from '@/src/components/trainers/TrainerProfile';
import { TrainerReviews } from '@/src/components/trainers/TrainerReviews';
import { TrainerSchedule } from '@/src/components/trainers/TrainerSchedule';

// Astryx migration (T11.13): the detail route shell (back link + column) is
// authored in compiled StyleX over the Fit brand tokens — no Tailwind utilities.

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  back: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    alignSelf: 'flex-start',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  backIcon: {
    height: '1rem',
    width: '1rem',
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
});

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

/**
 * Load one page of a trainer's visible reviews + the live aggregate for the
 * active gym, degrading to an empty result when there is no tenant in scope or a
 * transient failure occurs. Never throws: the Reviews section renders its "no
 * reviews yet" state rather than taking down the page. Mirrors {@link loadTrainer}.
 */
async function loadReviews(id: string) {
  const gymId = await getActiveGymId();
  if (!gymId) {
    return { reviews: [], avgRating: 0, total: 0, page: 1, limit: 10 };
  }
  try {
    return await fetchTrainerReviews({ gymId, id });
  } catch {
    return { reviews: [], avgRating: 0, total: 0, page: 1, limit: 10 };
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

  const [t, trainer, reviews] = await Promise.all([
    getTranslations('trainers'),
    loadTrainer(id),
    loadReviews(id),
  ]);

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/trainers" {...stylex.props(styles.back)}>
        <Icon name="chevronLeft" {...stylex.props(styles.backIcon)} sw={2} />
        {t('detail.back')}
      </Link>

      {trainer ? (
        <div {...stylex.props(styles.detail)}>
          <TrainerProfile
            trainer={trainer}
            avgRating={reviews.avgRating}
            reviewCount={reviews.total}
          />
          <TrainerSchedule schedule={trainer.schedule} />
          <TrainerReviews
            reviews={reviews.reviews}
            avgRating={reviews.avgRating}
            total={reviews.total}
          />
        </div>
      ) : (
        <TrainerNotFound />
      )}
    </div>
  );
}
