import { View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { Mono, Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// THE DURATION DISC.
//
// `mobile-home-v2.tsx:352` — the white circle in the top-right of every class
// block on the home screen:
//
//   h-16 w-16 rounded-full bg-white text-ink-950
//   mono 17 / 700, leading-none
//   mt-0.5  10 / 600  "წთ"
//
// ---------------------------------------------------------------------------
// ONE NODE, ONE LABEL, AND THE LABEL IS A REQUIRED PROP.
//
// Left alone this announces as "45" and then "წთ" — two stops, the first read
// digit by digit because it is a tabular monospace run and nothing in the
// string says it is a quantity. Composed here it would be worse: "45 წთ" is an
// abbreviation, and every screen reader on both platforms will spell it. The
// sentence a member should hear is "45 minutes", in their language, which is
// copy — so the caller writes it and this component only sets the glyphs.
//
// `unit` is a prop for the same reason. "წთ" is Georgian copy; an English
// build says "min" and a Russian one says "мин".
//
// ---------------------------------------------------------------------------
// THE WHITE IS MODE-INDEPENDENT, DELIBERATELY.
//
// `onDark` is white in both maps and `onLight` is ink-950 in both, so this disc
// is a fixed white plate exactly as the artboard draws it — the same treatment
// the token layer already gives the lime block ("identical in both modes — that
// is the point of the direction"). v1 is dark-only (decision Q5) and all six
// artboards are dark, so there is no light comp to invert against; the honest
// thing is to ship the artboard's colours and say so rather than invent an
// inversion nobody has approved. If light mode is ever designed, this disc
// needs a border on a white card — that is the one thing to revisit here.
// ---------------------------------------------------------------------------
// ===========================================================================

/** `h-16 w-16`. */
const SIZE = 64;

export interface DurationBadgeProps {
  /**
   * The number, already formatted — "45". A string rather than a number
   * because the digits are the caller's to localise.
   */
  value: string;

  /** The unit, e.g. "წთ". Copy, so it is the caller's. */
  unit: string;

  /**
   * REQUIRED. The whole spoken sentence — "45 minutes". See the header: there
   * is no way to compose this correctly from `value` and `unit`.
   */
  accessibilityLabel: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** A class's length, as a white disc. */
export function DurationBadge({
  value,
  unit,
  accessibilityLabel,
  testID,
  style,
  className,
}: DurationBadgeProps) {
  const colors = useThemeColors();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: SIZE,
          height: SIZE,
          // `clampRadiusTo('full', 64)` → 32. The clamp is not decoration: RN
          // does not scale an over-large radius the way CSS does.
          borderRadius: clampRadiusTo('full', SIZE),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.onDark,
        },
        style,
      ]}
      className={className}
    >
      <Mono variant="monoLarge" color="onLight" {...DECORATIVE}>
        {value}
      </Mono>
      {/*
        `text-[10px] font-semibold`, plainly set. WP-1's only 10px role is
        `micro`, which is small-caps — uppercase plus 0.10em of tracking. The
        tracking is wrong for a two-glyph unit and the uppercase is worse than
        wrong: it is a no-op for Georgian but would silently render an English
        "min" as "MIN", i.e. this component would be transforming the caller's
        copy. Both switches are turned off, exactly as `Pill` does.
      */}
      <Text
        variant="micro"
        color="onLight"
        {...DECORATIVE}
        style={{ marginTop: spacing[0.5], textTransform: 'none', letterSpacing: 0 }}
      >
        {unit}
      </Text>
    </View>
  );
}
