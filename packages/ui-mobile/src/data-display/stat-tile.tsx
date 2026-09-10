import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { Mono, Text } from '../primitives/text';
import type { MonoVariant } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import { spacing, type SpacingStep } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// THE HEADLINE NUMBER.
//
// Four appearances across four artboards, and they are the same idea drawn at
// four scales:
//
//   default   mobile-home-v2.tsx:276   rounded-[26px] bg-ink-900 p-4
//                                      label 11/600 ABOVE, mono 30/700
//   default   mobile-home-v2.tsx:284   ditto, plus a `/3` suffix and a row of
//     + suffix                         pips hung on the right
//   default   mobile-class-detail:166  rounded-[26px] bg-ink-900 p-5, `/24`
//     + suffix                         suffix and a right-hand caption
//   compact   mobile-profile.tsx:257   rounded-[22px] bg-ink-900 p-4
//                                      mono 28/700, label 10/600 BELOW
//   mini      mobile-qr.tsx:238        no shell, right-aligned,
//                                      mono 22/700 lime, label 9/600 BELOW
//
// ---------------------------------------------------------------------------
// THREE THINGS HERE ARE DECISIONS, NOT TRANSCRIPTION.
//
// 1. THE TILE IS ONE ACCESSIBILITY NODE. Left as two `<Text>` nodes, VoiceOver
//    reads "18" and then, as a separate unrelated stop, "day streak" — and it
//    reads the first one DIGIT BY DIGIT, because the value is a monospace,
//    tabular run and nothing in the string says it is a quantity. So the root
//    carries one composed label and every child is `accessible={false}`.
//
// 2. THE LABEL'S POSITION IS A PROP. Home puts it above the number; profile and
//    the QR pass put it below. Both readings are in the shipped comps, so this
//    component cannot pick one — it defaults per variant and lets the screen
//    say otherwise.
//
// 3. `withSuffix` IS NOT A FOURTH SHELL. The plan's brief names four variants,
//    but the two home counters are byte-identical shells: `rounded-[26px]
//    bg-ink-900 p-4`, label above, mono 30. The only difference is that one of
//    them has a `/3` after the number and a row of pips beside it. Those are
//    `suffix` and `trailing` — two optional props on `default` — not a second
//    copy of the same geometry that can drift from it.
// ---------------------------------------------------------------------------
// ===========================================================================

/** Which of the three shells. See the header for `withSuffix`. */
export type StatTileVariant = 'default' | 'compact' | 'mini';

/** Above the number, or below it. The artboards do both. */
export type StatTileLabelPosition = 'above' | 'below';

interface VariantSpec {
  /** `null` = no shell at all: no fill, no radius, no padding. */
  shell: { radius: number; padding: SpacingStep } | null;
  value: MonoVariant;
  /** The mono ladder has no 28 or 22 step; see `MONO_SIZE`. */
  valueSize: number;
  valueColor: ColorRole;
  /** The small-caps role the label is set in. */
  label: 'label' | 'micro';
  /** The suffix's step, scaled to the value it trails. */
  suffix: MonoVariant;
  /** Space between the label and the value, whichever is on top. */
  gap: SpacingStep;
  /**
   * `mini` is right-aligned inside the QR pass's member strip and shrinks to
   * its content; the two shelled variants STRETCH, which is what lets the
   * value row's `space-between` push `trailing` to the far edge.
   */
  align: 'stretch' | 'flex-end';
  defaultLabelPosition: StatTileLabelPosition;
}

/**
 * The four artboard readings, as data.
 *
 * ---------------------------------------------------------------------------
 * WHY `valueSize` IS A NUMBER AND NOT ANOTHER ROLE.
 *
 * The artboards set the mono value at 30 (home, class detail), 28 (profile)
 * and 22 (the QR pass). WP-1's mono ladder has 30, 17, 15, 13, 12 and 10 —
 * it deliberately folded every size with a single occurrence, on the grounds
 * that "a role with a single call site is a literal wearing a name"
 * (`src/tokens/typography.ts`).
 *
 * So the SIZE is overridden here and everything else — the JetBrains Mono Bold
 * face, the zero tracking, the tabular figures — still comes from
 * `monoDisplay`. `lineHeight` is set equal to `fontSize` because every one of
 * these is `leading-none` on the artboards, and that tight leading is what
 * makes the number read as a slab rather than a line of text. It is safe to
 * do here and NOT on the sans roles: these carry numerals only, so there is no
 * Georgian descender to clip.
 * ---------------------------------------------------------------------------
 */
const VARIANTS = {
  default: {
    shell: { radius: 26, padding: 4 },
    value: 'monoDisplay',
    valueSize: 30,
    valueColor: 'textPrimary',
    label: 'label',
    suffix: 'monoBody',
    gap: 3,
    align: 'stretch',
    defaultLabelPosition: 'above',
  },
  compact: {
    shell: { radius: 22, padding: 4 },
    value: 'monoDisplay',
    valueSize: 28,
    valueColor: 'textPrimary',
    label: 'micro',
    suffix: 'monoBody',
    gap: 2.5,
    align: 'stretch',
    defaultLabelPosition: 'below',
  },
  mini: {
    shell: null,
    value: 'monoDisplay',
    valueSize: 22,
    valueColor: 'textAccent',
    label: 'micro',
    suffix: 'monoSmall',
    gap: 1,
    align: 'flex-end',
    defaultLabelPosition: 'below',
  },
} as const satisfies Record<StatTileVariant, VariantSpec>;

/** `leading-none` on a numeral-only run. See the note on {@link VARIANTS}. */
function monoSize(size: number) {
  return { fontSize: size, lineHeight: size };
}

export interface StatTileProps {
  /**
   * The small-caps caption — "დღის სერია", "სულ ვიზიტი". Required: this is
   * copy, and package rule 1 says copy is always the caller's.
   */
  label: string;

  /**
   * The figure, already formatted. Formatting needs the locale and the
   * minor-unit convention, both of which are app state.
   */
  value: string;

  /**
   * A smaller, muted trailer set in the same face — the `/3` of "2/3", the
   * `/24` of "20/24". Folded into the spoken label, so it is never read as a
   * separate fragment.
   */
  suffix?: string;

  /**
   * A right-aligned adornment on the value's baseline: the home screen's row
   * of PT-credit pips, class detail's "4 ადგილი დარჩა".
   *
   * Whatever goes here is INSIDE a single accessibility node, so it must not
   * announce itself — pass `accessible={false}`, or fold what it says into
   * {@link accessibilityLabel}.
   */
  trailing?: ReactNode;

  /** Default `'default'`. */
  variant?: StatTileVariant;

  /** Defaults per variant: above on `default`, below on `compact` and `mini`. */
  labelPosition?: StatTileLabelPosition;

  /**
   * Overrides the spoken form. The default is `"${label}: ${value}${suffix}"`,
   * which is a join of two strings the caller already supplied rather than
   * copy this package invented — but "18: day streak" is not always the best
   * sentence, so a screen can say it better.
   */
  accessibilityLabel?: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * A headline metric: a big mono number and a small-caps caption.
 *
 * Not pressable in any artboard, and not pressable here. Three of these sit
 * side by side on the profile screen at 1/3 width each; making them buttons
 * would put three 100pt targets on a screen where nothing happens when you
 * press them.
 */
export function StatTile({
  label,
  value,
  suffix,
  trailing,
  variant = 'default',
  labelPosition,
  accessibilityLabel,
  testID,
  style,
  className,
}: StatTileProps) {
  const colors = useThemeColors();
  const spec: VariantSpec = VARIANTS[variant];
  const position = labelPosition ?? spec.defaultLabelPosition;

  const spoken = accessibilityLabel ?? `${label}: ${value}${suffix ?? ''}`;

  const caption = (
    <Text
      variant={spec.label}
      color="textSecondary"
      {...DECORATIVE}
      align={spec.align === 'flex-end' ? 'right' : undefined}
      style={position === 'above' ? null : { marginTop: spacing[spec.gap] }}
    >
      {label}
    </Text>
  );

  const figure = (
    <View
      {...DECORATIVE}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        // The value row owns the gap when the label is on top, so the two
        // orders cannot drift apart by a point.
        ...(position === 'above' ? { marginTop: spacing[spec.gap] } : null),
      }}
    >
      <Mono
        variant={spec.value}
        color={spec.valueColor}
        accessible={false}
        style={monoSize(spec.valueSize)}
      >
        {value}
        {suffix ? (
          <Mono variant={spec.suffix} color="textSecondary" accessible={false}>
            {suffix}
          </Mono>
        ) : null}
      </Mono>
      {trailing ? (
        // `mb-1` on the artboard: the pips sit on the numeral's baseline, not
        // on the descender line the flex box measures to.
        <View {...DECORATIVE} style={{ marginBottom: spacing[1] }}>
          {trailing}
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={[
        { alignItems: spec.align },
        spec.shell
          ? {
              backgroundColor: colors.backgroundCard,
              // No fixed side: the tile is content-sized, so it grows to fit
              // and an over-radius cannot arise.
              borderRadius: clampRadiusTo(spec.shell.radius),
              padding: spacing[spec.shell.padding],
            }
          : null,
        style,
      ]}
      className={className}
    >
      {position === 'above' ? caption : null}
      {figure}
      {position === 'below' ? caption : null}
    </View>
  );
}
