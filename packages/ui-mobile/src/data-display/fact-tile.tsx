import { View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// A LABELLED FACT, IN A TILE.
//
// `mobile-class-detail.tsx:50-63`, used 2×2 under the occupancy meter:
// trainer, location, duration, room. One shape, four instances, one screen —
// which is exactly the case a component is for, because four hand-rolled
// copies of it is how a screen ends up with four slightly different tiles.
//
//   rounded-[22px] bg-ink-900 p-4
//   h-9 w-9 rounded-full bg-ink-800   +  18px glyph, ink-200
//   mt-3   11 / 600 / 0.12em uppercase, ink-400
//   mt-1.5 15 / 700, white
//
// THE TILE IS ONE ACCESSIBILITY NODE, for the same reason `StatTile` is: a
// 2×2 grid of these is EIGHT stops on the rotor otherwise, alternating between
// a caption and a value with nothing tying the pairs together. One node per
// tile makes it four stops that each say a whole fact.
// ===========================================================================

/** `h-9 w-9` — the artboard's icon plate. */
const PLATE = 36;

/** `h-[18px]` inside it. */
const PLATE_GLYPH = 18;

export interface FactTileProps {
  /**
   * The small-caps caption — "მწვრთნელი", "ლოკაცია". Required: copy is always
   * the caller's.
   */
  label: string;

  /** The fact itself, already formatted — "Sandro K.", "45 წუთი". */
  value: string;

  /** The glyph in the round plate. Decorative; the label carries the meaning. */
  icon?: IconName;

  /**
   * Overrides the spoken form, which defaults to `"${label}: ${value}"`.
   * A join of two caller-supplied strings, not copy this package invented.
   */
  accessibilityLabel?: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** One fact from a class occurrence: an icon, a caption and a value. */
export function FactTile({
  label,
  value,
  icon,
  accessibilityLabel,
  testID,
  style,
  className,
}: FactTileProps) {
  const colors = useThemeColors();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      style={[
        {
          backgroundColor: colors.backgroundCard,
          borderRadius: clampRadiusTo(22),
          padding: spacing[4],
        },
        style,
      ]}
      className={className}
    >
      {icon ? (
        <View
          {...DECORATIVE}
          style={{
            width: PLATE,
            height: PLATE,
            borderRadius: PLATE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.quiet,
          }}
        >
          <Icon name={icon} color={colors.onQuiet} size={PLATE_GLYPH} />
        </View>
      ) : null}

      <Text variant="label" color="textSecondary" {...DECORATIVE} style={{ marginTop: spacing[3] }}>
        {label}
      </Text>

      {/*
        `text-[15px] font-bold`. WP-1's scale has 15/600 (`body`) and 15/400
        (`bodyRegular`) but no 15/700 — so the SIZE, LEADING and TRACKING come
        from the role and only the weight is overridden. Safe here specifically
        because `sansFamily('600')` is `undefined`: `body` rides the system sans
        and carries a real `fontWeight`, so raising it selects the system's own
        bold. On a role that names a bundled face (`subtitle`, `bodyLarge`,
        every heading) the same override would double-bold on iOS and pick the
        wrong face on Android — see the rule in `tokens/typography.ts`.
      */}
      <Text
        variant="body"
        color="textPrimary"
        {...DECORATIVE}
        style={{ marginTop: spacing[1.5], fontWeight: '700' }}
      >
        {value}
      </Text>
    </View>
  );
}
