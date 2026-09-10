// @fit/mobile — the trainer's portrait block, shared by the profile screen and
// the class-detail sheet.
//
// ===========================================================================
// TWO SURFACES, ONE BLOCK.
//
// `/trainers/:id` drew this inline: a 96pt portrait, the headline beside it,
// and the rating pill under the headline once the reviews have loaded. The
// class-detail trainer sheet is the second caller, and a second inline copy is
// how the avatar size, the ring and the gap drift apart between the two places
// a member meets the same coach.
//
// THE NAME IS NOT DRAWN HERE. Both callers already name the trainer directly
// above the block — the profile screen in its `AppBar` title, the sheet in its
// own title — so the name arrives only as the monogram's source. An avatar that
// announced it would say it twice, which is `Avatar`'s own default and the
// reason this passes no `accessibilityLabel`.
//
// THE RATING IS A PROP, NOT A QUERY. The profile screen loads `GET
// /trainers/:id/reviews` for its reviews section and has the aggregate already;
// the sheet deliberately does not, because a bottom sheet that opens on a
// trainer's name does not need a second round trip to render. So the pill is
// whatever the caller hands over, formatted — this component fetches nothing.
// ===========================================================================

import { View } from 'react-native';
import { Avatar, Pill, Text, spacing } from '@fit/ui-mobile';

import { trainerInitials } from './trainer-filters';

/** The hero portrait. Web draws 96; the artboards' largest avatar is 96 too. */
export const TRAINER_HERO_AVATAR = 96;

/** The rating pill, pre-formatted — see the header. */
export interface TrainerHeroRating {
  /** The formatted figure, e.g. `formatRating(4.75)` → `"4.8"`. */
  readonly text: string;
  /** Spoken instead of the digits — "4.8 out of 5 stars". */
  readonly accessibilityLabel: string;
}

export interface TrainerHeroProps {
  /** The trainer's name. Drawn only as the monogram fallback. */
  name: string;

  /** The short role line beside the portrait. `''` renders nothing. */
  headline: string;

  /** The portrait, or `null` for the monogram. */
  avatarUrl: string | null;

  /** Omit where the reviews are not loaded. */
  rating?: TrainerHeroRating | null;

  /** Default {@link TRAINER_HERO_AVATAR}. */
  size?: number;
}

/** A trainer's portrait, headline and rating — the top of both surfaces. */
export function TrainerHero({
  name,
  headline,
  avatarUrl,
  rating = null,
  size = TRAINER_HERO_AVATAR,
}: TrainerHeroProps) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}
      testID="trainer-hero"
    >
      <Avatar
        size={size}
        initials={trainerInitials(name)}
        {...(avatarUrl === null || avatarUrl === '' ? {} : { source: { uri: avatarUrl } })}
        // Decorative: the name is stated directly above this block by both
        // callers, so labelling the portrait would announce it twice.
      />
      <View style={{ flex: 1, gap: spacing[1.5] }}>
        {headline === '' ? null : (
          <Text variant="body" color="textSecondary" testID="trainer-headline">
            {headline}
          </Text>
        )}
        {rating === null ? null : (
          <Pill
            tone="quiet"
            icon="star"
            tabular
            accessibilityLabel={rating.accessibilityLabel}
            testID="trainer-rating"
          >
            {rating.text}
          </Pill>
        )}
      </View>
    </View>
  );
}
