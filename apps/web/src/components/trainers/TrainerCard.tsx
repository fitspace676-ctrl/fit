import { useTranslations } from 'next-intl';
import type { TrainerCard as TrainerCardModel } from '@fit/types';
import { Link } from '@/src/i18n/navigation';

export interface TrainerCardProps {
  trainer: TrainerCardModel;
}

/**
 * One trainer rendered as a card in the index grid: avatar (or an initials
 * placeholder when there's no photo), name + headline, a truncated bio, and the
 * specialty chips. The whole card links to the trainer's detail page (T3.7).
 * Purely presentational — the grid owns layout and the filter state lives a
 * level up.
 */
export function TrainerCard({ trainer }: TrainerCardProps) {
  const t = useTranslations('trainers');

  return (
    <Link
      href={`/trainers/${trainer.id}`}
      className="flex h-full flex-col gap-4 rounded-card border border-slate-200 bg-white p-5 transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-center gap-4">
        {trainer.avatarUrl ? (
          <img
            src={trainer.avatarUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700"
          >
            {initials(trainer.name)}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">{trainer.name}</h2>
          {trainer.headline && (
            <p className="truncate text-sm text-slate-500">{trainer.headline}</p>
          )}
        </div>
      </div>

      {trainer.bio && <p className="line-clamp-3 text-sm text-slate-600">{trainer.bio}</p>}

      {trainer.specialties.length > 0 && (
        <ul aria-label={t('card.specialties')} className="flex flex-wrap gap-1.5">
          {trainer.specialties.map((specialty) => (
            <li
              key={specialty}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
            >
              {specialty}
            </li>
          ))}
        </ul>
      )}

      {trainer.locationNames.length > 0 && (
        <p className="mt-auto text-xs text-slate-400">{trainer.locationNames.join(' · ')}</p>
      )}
    </Link>
  );
}

/** First letters of the first and last words of a name, upper-cased (max 2). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
