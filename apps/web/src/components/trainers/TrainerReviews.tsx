import { useLocale, useTranslations } from 'next-intl';
import type { PublicReview } from '@fit/types';

export interface TrainerReviewsProps {
  /** The visible reviews on the current page (newest first), as the API returns them. */
  reviews: PublicReview[];
  /** Mean star rating across all visible reviews (rounded to one decimal). */
  avgRating: number;
  /** Total number of visible reviews (not just this page). */
  total: number;
}

/**
 * The Reviews section of a trainer's detail page (T5.12) — the placeholder the
 * profile page (T3.7) left for member feedback. Shows the live aggregate (an
 * average-star summary + count) above the individual reviews, each a star
 * rating, the (optional) comment, and the author + date. Renders a friendly
 * empty state when the trainer has no reviews yet — a normal result, not an
 * error. Stateless: the page owns the data fetch and passes the already-ordered,
 * visible-only reviews.
 */
export function TrainerReviews({ reviews, avgRating, total }: TrainerReviewsProps) {
  const t = useTranslations('trainers');
  const locale = useLocale();

  if (total === 0) {
    return (
      <section aria-labelledby="trainer-reviews-heading" className="flex flex-col gap-3">
        <h2 id="trainer-reviews-heading" className="text-lg font-semibold text-slate-900">
          {t('detail.reviews.title')}
        </h2>
        <p className="rounded-card border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center text-sm text-slate-500">
          {t('detail.reviews.empty')}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="trainer-reviews-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trainer-reviews-heading" className="text-lg font-semibold text-slate-900">
          {t('detail.reviews.title')}
        </h2>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Stars
            rating={avgRating}
            label={t('detail.reviews.ratingLabel', { rating: avgRating })}
          />
          <span className="font-semibold tabular-nums text-slate-900">{avgRating.toFixed(1)}</span>
          <span>{t('detail.reviews.count', { count: total })}</span>
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {reviews.map((review) => (
          <li key={review.id} className="rounded-card border border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Stars
                rating={review.rating}
                label={t('detail.reviews.ratingLabel', { rating: review.rating })}
              />
              <span className="shrink-0 text-xs text-slate-400">
                {new Date(review.createdAt).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            {review.comment && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {review.comment}
              </p>
            )}
            <p className="mt-2 text-xs font-medium text-slate-500">{review.authorName}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A five-star rating glyph row — `rating` is rounded to the nearest whole star
 * for the fill. Decorative: the surrounding text carries the numeric value, so
 * the glyphs are `aria-hidden` and the row exposes a single accessible `label`.
 */
function Stars({ rating, label }: { rating: number; label: string }) {
  const filled = Math.round(rating);
  return (
    <span role="img" aria-label={label} className="text-sm leading-none text-amber-500">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          aria-hidden
          className={star <= filled ? 'text-amber-500' : 'text-slate-300'}
        >
          ★
        </span>
      ))}
    </span>
  );
}
