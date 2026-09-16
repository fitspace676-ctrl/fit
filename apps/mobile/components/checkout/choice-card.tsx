// @fit/mobile — the join funnel's one-of-many card.
//
// ===========================================================================
// WHY THIS IS NOT `ProductRow`, `ListRow` OR `Segmented`.
//
// Steps 1 and 2 both ask the same question — pick exactly one of these — and
// the design system has three near-misses for it, each missing the same thing:
//
//   * `ListRow` and `ProductRow` have no SELECTED state. A row that is chosen
//     looks identical to one that is not, and a chosen-ness signalled only by a
//     trailing pill is a second announcement inside a labelled control.
//   * `Segmented` has one `disabled` for the whole group and equal-width
//     options, so it cannot carry a plan name, a price and a feature list.
//
// More importantly, none of the three announces as a RADIO. A single-select
// group of pressables that report `accessibilityRole="button"` gives a screen
// reader no way to say which one is chosen, and "Selected" as a visible pill is
// exactly the "information that has no text at all" failure WP-8a's header
// warns about. So this is one component with `accessibilityRole="radio"` and
// `accessibilityState.checked`, which is the platform's own vocabulary for the
// question being asked.
//
// It ships no copy of its own: every string, including the composed accessible
// name, arrives as a prop — the same rule `@fit/ui-mobile` holds itself to.
// ===========================================================================

import {
  Icon,
  Money,
  Mono,
  Pill,
  Surface,
  Text,
  radii,
  spacing,
  useThemeColors,
} from '@fit/ui-mobile';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

export interface ChoiceCardProps {
  /** The plan / branch name. */
  title: string;
  /**
   * A branch's photograph, and the reason this prop is `string | null | undefined`
   * rather than `string | undefined`.
   *
   * A BRANCH IS A PLACE, so its card leads with a picture of it — `apps/web`'s
   * `locationCard` does exactly this, and `LocationSummary.photoUrl` has been on
   * `GET /catalogue` all along. A PLAN is not a place and has no picture, so:
   *
   *   `undefined`  no thumbnail at all — the plan cards, unchanged.
   *   `null`       a thumbnail is drawn, showing the monogram fallback. A branch
   *                with no photo yet must not leave a hole where the other
   *                branches have a picture.
   *   a URL        the photograph, `cover`-fitted.
   *
   * The fallback is the branch's own initial rather than one map pin repeated
   * down the list — web's `locationInitial` grammar, and the shop's.
   */
  photoUrl?: string | null;
  /** One supporting line — an address, a billing cadence, a session count. */
  meta?: string;
  /** Longer prose under the meta line. */
  description?: string;
  /**
   * The price, ALREADY FORMATTED for the locale and currency. Formatting needs
   * `useMoney()`, which needs the locale, which this component must not know.
   */
  price?: string;
  /** The spoken form — "89 lari", not "eight nine comma zero zero lari sign". */
  priceAccessibilityLabel?: string;
  /** A suffix hung off the price — "/ mo". */
  priceSuffix?: string;
  /** The "Most popular" flag. */
  badge?: string;
  /** Bullet lines under the price. */
  features?: readonly string[];
  selected: boolean;
  onPress: () => void;
  /**
   * The whole card's spoken name. REQUIRED, because the visible content is up
   * to six separate runs of text and a reader that stops on each of them reads
   * a price digit by digit in the middle of a plan name.
   */
  accessibilityLabel: string;
  /** Announced after the name — the feature list, usually. */
  accessibilityHint?: string;
  testID: string;
}

/** The artboard's tile radius (`CUT_TILE`), which is a literal pass-through. */
const TILE_RADIUS = 22;

/** Web's `locationThumb` aspect, verbatim — a 16:9 band across the card's top. */
const PHOTO_ASPECT = 16 / 9;

/** `locationInitial`'s 1.875rem, in points. */
const MONOGRAM_SIZE = 30;

/**
 * The monogram for a branch with no photograph.
 *
 * The first character, NOT `toUpperCase()`d — which is where this parts company
 * with web. Unicode 11 gave Mkhedruli an uppercase mapping to MTAVRULI, so
 * `'ვ'.toUpperCase()` is `'Ვ'`: a display alphabet, not an emphasised letter.
 * `day-cell.tsx` and the login screen's join note both turn casing off for the
 * same reason. Latin branch names are already capitalised, so nothing is lost.
 */
function monogramOf(title: string): string {
  return title.trim().charAt(0);
}

/**
 * One option in a single-select group.
 *
 * The check mark is drawn in addition to the border and fill change, not
 * instead of them: on the lime-on-charcoal palette the selected border is a
 * hue shift a colour-blind buyer may not see, and `accessibilityState.checked`
 * is invisible to everyone who is not using a screen reader.
 */
export function ChoiceCard({
  title,
  photoUrl,
  meta,
  description,
  price,
  priceAccessibilityLabel,
  priceSuffix,
  badge,
  features,
  selected,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ChoiceCardProps) {
  const colors = useThemeColors();
  // A dead R2 URL must degrade to the monogram, not to an empty band. Keyed by
  // the url so a later, working photo is retried rather than permanently
  // suppressed — `class-card.tsx`'s `failedCover` does the same.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  const hasPhoto = photoUrl !== undefined;
  // The 2pt selected border would otherwise shift the content by 1pt and make
  // the whole list twitch as the selection moves.
  const pad = selected ? spacing[5] - 1 : spacing[5];
  const showImage = photoUrl !== undefined && photoUrl !== null && photoUrl !== failedPhoto;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // The card is one accessibility node, so nothing inside it may announce.
      accessible
    >
      <Surface
        tone="card"
        radius={TILE_RADIUS}
        border
        style={{
          borderColor: selected ? colors.accent : colors.border,
          borderWidth: selected ? 2 : 1,
          // A photographed card pads its BODY instead, so the picture can bleed
          // to the card's own edges the way web's `locationCard` does. The clip
          // is what rounds the photo's top corners.
          padding: hasPhoto ? 0 : pad,
          ...(hasPhoto ? { overflow: 'hidden' as const } : {}),
        }}
      >
        {hasPhoto ? (
          <View
            testID={`${testID}-photo`}
            style={{
              width: '100%',
              aspectRatio: PHOTO_ASPECT,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: colors.quiet,
            }}
          >
            {showImage ? (
              <Image
                testID={`${testID}-photo-image`}
                source={{ uri: photoUrl }}
                resizeMode="cover"
                onError={() => {
                  setFailedPhoto(photoUrl);
                }}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <Mono
                variant="monoLarge"
                color="textSecondary"
                testID={`${testID}-photo-initial`}
                style={{ fontSize: MONOGRAM_SIZE, lineHeight: MONOGRAM_SIZE }}
              >
                {monogramOf(title)}
              </Mono>
            )}
          </View>
        ) : null}

        <View style={{ gap: spacing[2], ...(hasPhoto ? { padding: pad } : {}) }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
            <View style={{ flex: 1, gap: spacing[1] }}>
              {badge === undefined ? null : (
                <View style={{ flexDirection: 'row' }}>
                  <Pill tone="accent" size="sm">
                    {badge}
                  </Pill>
                </View>
              )}
              <Text variant="bodyLarge" color="textPrimary">
                {title}
              </Text>
              {meta === undefined || meta === '' ? null : (
                <Text variant="caption" color="textSecondary">
                  {meta}
                </Text>
              )}
            </View>

            {/* The check plate. `radii.full` on a fixed 28pt side is a circle,
                which is the one place in this design a full capsule is right —
                it is a state marker, not a surface. */}
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.accent : 'transparent',
                borderWidth: selected ? 0 : 1,
                borderColor: colors.borderEmphasized,
              }}
            >
              {selected ? <Icon name="check" size={16} color="onAccent" /> : null}
            </View>
          </View>

          {description === undefined || description === '' ? null : (
            <Text variant="bodySmall" color="textSecondary">
              {description}
            </Text>
          )}

          {price === undefined ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[1] }}>
              <Money
                variant="monoLarge"
                color="textPrimary"
                accessibilityLabel={priceAccessibilityLabel ?? price}
              >
                {price}
              </Money>
              {priceSuffix === undefined ? null : (
                <Text variant="caption" color="textSecondary">
                  {priceSuffix}
                </Text>
              )}
            </View>
          )}

          {features === undefined || features.length === 0
            ? null
            : features.map((feature) => (
                <View
                  key={feature}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
                >
                  <Icon name="check" size={14} color="iconAccent" />
                  <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>
                    {feature}
                  </Text>
                </View>
              ))}
        </View>
      </Surface>
    </Pressable>
  );
}
