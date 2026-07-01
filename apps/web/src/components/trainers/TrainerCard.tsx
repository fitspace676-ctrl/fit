import { useTranslations } from 'next-intl';
import type { TrainerCard as TrainerCardModel } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { Avatar, Badge, Card, Icon } from '@/src/components/ui';

export interface TrainerCardProps {
  trainer: TrainerCardModel;
}

/**
 * One trainer rendered as a card in the index grid: avatar (or a Dicebear
 * initials fallback when there's no photo), name + headline, a truncated bio, and
 * the specialty chips. The whole card links to the trainer's detail page (T3.7).
 * Purely presentational — the grid owns layout and the filter state lives a
 * level up.
 */
export function TrainerCard({ trainer }: TrainerCardProps) {
  const t = useTranslations('trainers');

  return (
    <Link
      href={`/trainers/${trainer.id}`}
      className="group block h-full rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-950"
    >
      <Card
        glow
        className="flex h-full flex-col gap-4 p-5 transition-all group-hover:shadow-[0_18px_50px_-18px_rgba(0,0,0,0.28)] dark:group-hover:bg-white/[0.06]"
      >
        <div className="flex items-center gap-4">
          <Avatar src={avatarSrc(trainer.avatarUrl, trainer.name)} ring size="h-14 w-14" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-extrabold tracking-tight text-ink-900 dark:text-white">
              {trainer.name}
            </h2>
            {trainer.headline && (
              <p className="truncate text-sm text-ink-500 dark:text-ink-400">{trainer.headline}</p>
            )}
          </div>
        </div>

        {trainer.bio && (
          <p className="line-clamp-3 text-sm text-ink-600 dark:text-ink-300">{trainer.bio}</p>
        )}

        {trainer.specialties.length > 0 && (
          <ul aria-label={t('card.specialties')} className="flex flex-wrap gap-1.5">
            {trainer.specialties.map((specialty) => (
              <li key={specialty}>
                <Badge tone="brand">{specialty}</Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          {trainer.locationNames.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
              <Icon name="pin" className="h-3.5 w-3.5 shrink-0" sw={2} />
              <span className="truncate">{trainer.locationNames.join(' · ')}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 transition-colors group-hover:bg-brand-500 group-hover:text-white dark:bg-white/10 dark:text-ink-200">
            <Icon name="arrow" className="h-4 w-4" sw={2.2} />
          </span>
        </div>
      </Card>
    </Link>
  );
}

/**
 * The avatar URL to render, falling back to a Dicebear initials avatar seeded by
 * the trainer's name when no photo is set.
 */
function avatarSrc(url: string | null | undefined, name: string): string {
  return url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;
}
