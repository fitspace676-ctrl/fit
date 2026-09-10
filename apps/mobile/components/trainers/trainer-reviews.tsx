// A trainer's reviews — and the reason they are their own component.
//
// ===========================================================================
// THE REVIEWS LOAD INDEPENDENTLY OF THE PROFILE, AND A FAILURE HERE MUST NOT
// BLANK THE PAGE.
//
// `GET /trainers/:id` and `GET /trainers/:id/reviews` are two requests. Web
// hides this because both are awaited server-side and the reviews loader
// swallows its own failure into `{ reviews: [], avgRating: 0, total: 0 }` — so
// a broken reviews query silently reads as "no reviews yet", which is a lie
// with a plausible face. On the phone the two are two `useQuery`s, and the
// honest shape is: the profile owns the screen, this section owns its own
// loading / error / empty, and a 500 here costs the member the reviews, not
// the trainer.
//
// COPY: the top-level `trainers.detail.reviews` block. `member.trainers.detail`
// has NO reviews block at all — that is the single gap D10 names ("its detail
// is 5 keys against the top-level's 6"), and this is the fallback D10
// authorises, not a per-string choice.
//
// The rating star row is `role="image"` with the whole sentence as its label
// (`ratingLabel` — "4.8 out of 5 stars" / "4.8 5-დან"): five glyphs announced
// one at a time say "star, star, star, star, star", which is both wrong and
// unusable.
// ===========================================================================

import { View } from 'react-native';
import type { Locale } from '@fit/i18n';
import type { ListTrainerReviewsResponse, PublicReview } from '@fit/types';
import {
  EmptyState,
  Icon,
  SectionHeader,
  Skeleton,
  Text,
  spacing,
  useThemeColors,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../auth/notices';
import { formatMediumDate } from '../services/date-format';

/** The five glyphs a rating is drawn with. */
const STARS = [1, 2, 3, 4, 5] as const;

/** How the average rating is written — one decimal, as web writes it. */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export interface TrainerReviewsSectionProps {
  locale: Locale;
  /** `undefined` until the query answers. */
  data: ListTrainerReviewsResponse | undefined;
  isPending: boolean;
  isError: boolean;
  /** True while the radio is dead — the query is parked, not failed. */
  isOffline: boolean;
  onRetry: () => void;
  copy: {
    title: string;
    empty: string;
    /** Already interpolated with `{count}`. */
    count: string;
    /** `(rating) => string`, so each row can label its own stars. */
    ratingLabel: (rating: number) => string;
    error: string;
    retry: string;
  };
}

/** The reviews block: heading, aggregate, then the page of reviews. */
export function TrainerReviewsSection({
  locale,
  data,
  isPending,
  isError,
  isOffline,
  onRetry,
  copy,
}: TrainerReviewsSectionProps) {
  return (
    <View style={{ gap: spacing[3] }} testID="trainer-reviews">
      <SectionHeader title={copy.title} />

      {isOffline ? (
        // A paused query never resolves, so this skeleton was permanent.
        // TODO(i18n): `common.offline.title` / `common.offline.body`.
        <OfflineNotice testID="trainer-reviews-offline" />
      ) : null}

      {!isOffline && isPending ? (
        <View testID="trainer-reviews-loading" style={{ gap: spacing[2] }}>
          <Skeleton height={72} radius={22} />
          <Skeleton height={72} radius={22} />
        </View>
      ) : null}

      {!isOffline && !isPending && isError ? (
        <EmptyState
          testID="trainer-reviews-error"
          layout="bare"
          icon="info"
          title={copy.error}
          action={{
            label: copy.retry,
            onPress: onRetry,
            variant: 'secondary',
            icon: 'refresh',
            testID: 'trainer-reviews-retry',
          }}
        />
      ) : null}

      {/* Web keys its empty branch on `total === 0`, not `reviews.length` —
          `total` spans every visible review while `reviews` is one page, so a
          member on page 2 of an empty page would otherwise be told there are
          none. Kept. */}
      {!isOffline && !isPending && !isError && (data?.total ?? 0) === 0 ? (
        <Text variant="body" color="textSecondary" testID="trainer-reviews-empty">
          {copy.empty}
        </Text>
      ) : null}

      {!isOffline && !isPending && !isError && data !== undefined && data.total > 0 ? (
        <View style={{ gap: spacing[3] }} testID="trainer-reviews-list">
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
            testID="trainer-reviews-summary"
          >
            <Stars rating={data.avgRating} label={copy.ratingLabel(data.avgRating)} />
            <Text variant="bodyLarge">{formatRating(data.avgRating)}</Text>
            <Text variant="caption" color="textSecondary">
              {copy.count}
            </Text>
          </View>

          {data.reviews.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              locale={locale}
              ratingLabel={copy.ratingLabel(review.rating)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface ReviewRowProps {
  review: PublicReview;
  locale: Locale;
  ratingLabel: string;
}

function ReviewRow({ review, locale, ratingLabel }: ReviewRowProps) {
  return (
    <View style={{ gap: spacing[1] }} testID={`trainer-review-${review.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Stars rating={review.rating} label={ratingLabel} />
        <Text variant="caption" color="textSecondary">
          {formatMediumDate(locale, review.createdAt)}
        </Text>
      </View>
      {review.comment !== null && review.comment !== '' ? (
        <Text variant="body" color="textPrimary">
          {review.comment}
        </Text>
      ) : null}
      <Text variant="caption" color="textSecondary">
        {review.authorName}
      </Text>
    </View>
  );
}

interface StarsProps {
  rating: number;
  /** The WHOLE spoken sentence. Five glyphs cannot be composed into one. */
  label: string;
}

function Stars({ rating, label }: StarsProps) {
  const colors = useThemeColors();
  const filled = Math.round(rating);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: spacing[0.5] }}
    >
      {STARS.map((star) => (
        <Icon
          key={star}
          name="star"
          size={14}
          // The dictionary has one star glyph and no filled variant, so the
          // rating is carried by COLOUR — which is exactly why the row's label
          // is required rather than derived: colour is not information a
          // screen reader can reach.
          color={star <= filled ? colors.iconAccent : colors.iconDisabled}
        />
      ))}
    </View>
  );
}
