import { useTranslations } from 'next-intl';
import type { TrainerDetail } from '@fit/types';

export interface TrainerProfileProps {
  trainer: TrainerDetail;
}

/**
 * The profile header of a trainer's detail page: avatar (or an initials
 * placeholder when there's no photo), name + headline, the full (untruncated)
 * bio, and the specialty / location facets the index card only summarised.
 * Purely presentational — the page owns the layout and the data fetch.
 */
export function TrainerProfile({ trainer }: TrainerProfileProps) {
  const t = useTranslations('trainers');

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        {trainer.avatarUrl ? (
          <img
            src={trainer.avatarUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-700"
          >
            {initials(trainer.name)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">{trainer.name}</h1>
          {trainer.headline && <p className="text-sm text-slate-500">{trainer.headline}</p>}
        </div>
      </div>

      {trainer.bio && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{trainer.bio}</p>
      )}

      {trainer.specialties.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('detail.specialties')}
          </h2>
          <ul aria-label={t('detail.specialties')} className="flex flex-wrap gap-1.5">
            {trainer.specialties.map((specialty) => (
              <li
                key={specialty}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
              >
                {specialty}
              </li>
            ))}
          </ul>
        </div>
      )}

      {trainer.locationNames.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('detail.locations')}
          </h2>
          <p className="text-sm text-slate-600">{trainer.locationNames.join(' · ')}</p>
        </div>
      )}
    </section>
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
