import { useTranslations } from 'next-intl';
import type { TrainerDetail } from '@fit/types';
import { Avatar, Badge, buttonClasses, Card, Icon } from '@/src/components/ui';

export interface TrainerProfileProps {
  trainer: TrainerDetail;
  /** Aggregate review rating (0–5) and count, surfaced as a header badge. */
  avgRating?: number;
  reviewCount?: number;
}

/**
 * The profile header of a trainer's detail page: avatar (or a Dicebear initials
 * fallback when there's no photo), name + headline, the full (untruncated) bio,
 * the specialty / location facets the index card only summarised, and a primary
 * action linking to the trainer's upcoming sessions. Purely presentational — the
 * page owns the layout and the data fetch.
 */
export function TrainerProfile({ trainer, avgRating = 0, reviewCount = 0 }: TrainerProfileProps) {
  const t = useTranslations('trainers');

  return (
    <Card glow className="p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(135deg,#7C3AED,#EC4899)] opacity-[0.08] dark:opacity-20"
      />

      <section className="relative flex flex-col gap-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar
            src={avatarSrc(trainer.avatarUrl, trainer.name)}
            ring
            size="h-20 w-20 sm:h-24 sm:w-24"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
                {trainer.name}
              </h1>
              {reviewCount > 0 && (
                <Badge tone="warning" icon="star">
                  {avgRating.toFixed(1)}
                </Badge>
              )}
            </div>
            {trainer.headline && (
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{trainer.headline}</p>
            )}
          </div>
          <a
            href="#trainer-schedule-heading"
            className={buttonClasses('primary', 'md', 'shrink-0')}
          >
            <Icon name="calendarPlus" className="h-4 w-4" sw={2} />
            {t('detail.schedule.title')}
          </a>
        </div>

        {trainer.bio && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            {trainer.bio}
          </p>
        )}

        {trainer.specialties.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              {t('detail.specialties')}
            </h2>
            <ul aria-label={t('detail.specialties')} className="flex flex-wrap gap-1.5">
              {trainer.specialties.map((specialty) => (
                <li key={specialty}>
                  <Badge tone="brand">{specialty}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {trainer.locationNames.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              {t('detail.locations')}
            </h2>
            <p className="flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-300">
              <Icon name="pin" className="h-4 w-4 shrink-0 text-ink-400" sw={2} />
              {trainer.locationNames.join(' · ')}
            </p>
          </div>
        )}
      </section>
    </Card>
  );
}

/**
 * The avatar URL to render, falling back to a Dicebear initials avatar seeded by
 * the trainer's name when no photo is set.
 */
function avatarSrc(url: string | null | undefined, name: string): string {
  return url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;
}
