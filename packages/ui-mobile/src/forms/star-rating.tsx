import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { interactiveA11y } from '../internal/a11y';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { Icon } from '../primitives/icon/icon';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// A STAR RATING THE MEMBER SETS. The write-side twin of the read-only star row
// the trainer profile draws.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A PACKAGE COMPONENT AND NOT FIVE `Pressable`s IN A SCREEN.
//
// The a11y contract is the whole component, and it is the part a screen gets
// wrong. Five tappable glyphs with no names announce "star, star, star, star,
// star" and there is no way to tell which one is chosen, or what the current
// rating even is — the exact failure the trainer's read-only row documents in
// `components/trainers/trainer-reviews.tsx` and answers with one label over
// the whole run. An INPUT cannot take that shortcut: it has to be operable,
// not just legible.
//
// ---------------------------------------------------------------------------
// `adjustable` PLUS FIVE LABELLED BUTTONS — both, exactly as `QtyStepper` does.
//
// VoiceOver's increment/decrement is a swipe up/down on a focused element and
// exists only for `accessibilityRole="adjustable"` with `accessibilityActions`.
// Switch Control and keyboard-style navigation have no such gesture; they move
// element to element, so each star must also be reachable and named. The
// container therefore declares the role, the value and the actions but does
// NOT set `accessible` — setting it would absorb the children and take the
// per-star targets away from switch users.
//
// The container's `accessibilityValue.text` is what a screen reader SAYS. It
// is a required prop and not derived here, because "4 out of 5 stars" is copy
// and the package ships none — and because the unrated state needs a different
// sentence ("no rating chosen yet"), which no number can express.
//
// ---------------------------------------------------------------------------
// THE GLYPH IS ONE STAR, AND THE RATING IS CARRIED BY COLOUR.
//
// The icon dictionary has a single `star` with no filled variant (see
// `ICON_PATHS`). Colour is not information a screen reader can reach, which is
// why every star also reports `accessibilityState.selected` — the announcement
// and the paint say the same thing through two different channels.
// ===========================================================================

/** The tap target for one star. `hitSlopFor(36)` is 4, which lands on 44. */
const STAR_TARGET = 36;

/** The glyph inside that target. */
const STAR_GLYPH = 26;

/** Ratings are integers 1–5 — `reviewRatingSchema`, and the DB CHECK under it. */
export const STAR_MIN = 1;
export const STAR_MAX = 5;

/** `0` is "nothing chosen yet", which is not a rating any API accepts. */
export const STAR_UNRATED = 0;

export interface StarRatingLabels {
  /**
   * The accessible name of the CONTROL — "your rating" — not of the number.
   * The number is announced from `accessibilityValue`, which is what makes the
   * swipe gesture say something after it moves rather than staying silent.
   */
  value: string;
  /**
   * The whole spoken value for a rating: `(4) => "4 out of 5 stars"`. A
   * function rather than a string so the caller's catalogue owns the sentence
   * and its plural, which the package cannot.
   */
  valueText: (rating: number) => string;
  /** Spoken value while {@link StarRatingProps.value} is {@link STAR_UNRATED}. */
  empty: string;
  /** The nth star's own button name: `(3) => "3 stars"`. */
  star: (rating: number) => string;
  /** Optional hint, announced after the control's name. */
  hint?: string;
}

export interface StarRatingProps {
  /** `1`–`5`, or {@link STAR_UNRATED} for "not chosen yet". */
  value: number;
  onChange: (value: number) => void;
  /**
   * Every accessible name, from the caller's catalogue. Required — package
   * rule 1, and an unnamed rating control is unusable rather than merely
   * unpolished.
   */
  labels: StarRatingLabels;
  disabled?: boolean;
  /** Forwarded to the root; each star takes `${testID}-${n}`. */
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** Every star position, low to high. */
const STARS: readonly number[] = [1, 2, 3, 4, 5];

interface StarProps {
  index: number;
  filled: boolean;
  disabled: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}

function Star({ index, filled, disabled, accessibilityLabel, onPress, testID }: StarProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlopFor(STAR_TARGET)}
      testID={testID}
      android_ripple={{ color: colors.focusRing, borderless: true, radius: STAR_TARGET / 2 }}
      {...interactiveA11y({ accessibilityLabel }, { disabled, selected: filled })}
      style={{
        width: STAR_TARGET,
        height: STAR_TARGET,
        minHeight: STAR_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Decorative by default — `Icon` applies the hide-subtree flags itself,
          so the star announces through its `Pressable`'s label and not twice. */}
      <Icon
        name="star"
        size={STAR_GLYPH}
        color={
          disabled
            ? colors.iconDisabled
            : filled
              ? pressed
                ? colors.accentHover
                : colors.iconAccent
              : colors.iconDisabled
        }
        // A key on a decorative glyph would be pointless; the index is here so
        // the paint and the announcement can never disagree about which star
        // this is.
        testID={testID ? `${testID}-glyph-${String(index)}` : undefined}
      />
    </Pressable>
  );
}

/** A 1–5 star rating input. */
export function StarRating({
  value,
  onChange,
  labels,
  disabled = false,
  testID,
  style,
  className,
}: StarRatingProps) {
  const rated = value >= STAR_MIN && value <= STAR_MAX;

  function step(delta: number): void {
    if (disabled) return;
    if (!rated) {
      // From unrated, an increment lands on the floor and a decrement is a
      // no-op — stepping "down" out of nothing has no meaning, and wrapping to
      // five would set a rating the member never chose.
      if (delta > 0) onChange(STAR_MIN);
      return;
    }
    const next = Math.min(STAR_MAX, Math.max(STAR_MIN, value + delta));
    if (next !== value) onChange(next);
  }

  return (
    <View
      testID={testID}
      {...interactiveA11y(
        {
          accessibilityLabel: labels.value,
          accessibilityRole: 'adjustable',
          ...(labels.hint === undefined ? {} : { accessibilityHint: labels.hint }),
        },
        { disabled },
      )}
      accessibilityValue={{
        min: STAR_MIN,
        max: STAR_MAX,
        // `now` outside `[min, max]` is announced wrong on iOS, so the unrated
        // state reports the floor and says so in `text` instead.
        now: rated ? value : STAR_MIN,
        text: rated ? labels.valueText(value) : labels.empty,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') step(1);
        if (event.nativeEvent.actionName === 'decrement') step(-1);
      }}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: spacing[1], alignSelf: 'flex-start' },
        style,
      ]}
      className={className}
    >
      {STARS.map((star) => (
        <Star
          key={star}
          index={star}
          filled={rated && star <= value}
          disabled={disabled}
          accessibilityLabel={labels.star(star)}
          onPress={() => {
            if (!disabled) onChange(star);
          }}
          testID={testID ? `${testID}-${String(star)}` : undefined}
        />
      ))}
    </View>
  );
}
