import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { PublicReview } from '@fit/types';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11.13): the reviews section is rebuilt on the Astryx `Card`
// over the Fit brand theme, with the aggregate header, the star glyphs, and each
// review row authored in compiled StyleX (`var(--color-*)`) — no Tailwind
// utilities and no formacore Aurora-glass primitives.

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  emptySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  heading: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  empty: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '1.5rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  headRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  summaryValue: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  reviewCard: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  reviewHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  date: {
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  comment: {
    marginTop: '0.5rem',
    marginBottom: 0,
    whiteSpace: 'pre-line',
    fontSize: '0.875rem',
    lineHeight: 1.65,
    color: 'var(--color-text-secondary)',
  },
  author: {
    marginTop: '0.5rem',
    marginBottom: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  stars: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.125rem',
  },
  star: {
    height: '1rem',
    width: '1rem',
  },
  starFilled: {
    color: 'var(--color-icon-yellow)',
    fill: 'var(--color-icon-yellow)',
  },
  starEmpty: {
    color: 'var(--color-border-emphasized)',
    fill: 'var(--color-background-muted)',
  },
});

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
      <section aria-labelledby="trainer-reviews-heading" {...stylex.props(styles.emptySection)}>
        <h2 id="trainer-reviews-heading" {...stylex.props(styles.heading)}>
          {t('detail.reviews.title')}
        </h2>
        <p {...stylex.props(styles.empty)}>{t('detail.reviews.empty')}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="trainer-reviews-heading" {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.headRow)}>
        <h2 id="trainer-reviews-heading" {...stylex.props(styles.heading)}>
          {t('detail.reviews.title')}
        </h2>
        <p {...stylex.props(styles.summary)}>
          <Stars
            rating={avgRating}
            label={t('detail.reviews.ratingLabel', { rating: avgRating })}
          />
          <span {...stylex.props(styles.summaryValue)}>{avgRating.toFixed(1)}</span>
          <span>{t('detail.reviews.count', { count: total })}</span>
        </p>
      </div>

      <ul {...stylex.props(styles.list)}>
        {reviews.map((review) => (
          <li key={review.id}>
            <Card variant="default" padding={0} xstyle={styles.reviewCard}>
              <div {...stylex.props(styles.reviewHead)}>
                <Stars
                  rating={review.rating}
                  label={t('detail.reviews.ratingLabel', { rating: review.rating })}
                />
                <span {...stylex.props(styles.date)}>
                  {new Date(review.createdAt).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              {review.comment && <p {...stylex.props(styles.comment)}>{review.comment}</p>}
              <p {...stylex.props(styles.author)}>{review.authorName}</p>
            </Card>
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
    <span role="img" aria-label={label} {...stylex.props(styles.stars)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          {...stylex.props(styles.star, star <= filled ? styles.starFilled : styles.starEmpty)}
          sw={1.5}
        />
      ))}
    </span>
  );
}
