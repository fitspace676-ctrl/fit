import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Mono, Text } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import type { SurfaceRadius } from '../tokens/radii';
import { layout, spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

/**
 * The five pill tones, read off the artboards.
 *
 *   quiet     bg-ink-800  text-ink-200                        `12 დარჩა`
 *   accent    bg-brand-300 text-ink-950                       the cart total
 *   onAccent  bg-ink-950  text-brand-300                      on a lime block
 *   booked    bg-brand-950 text-brand-200 ring-brand-800      the BOOKED state
 *   danger    backgroundRed textRed borderRed                 a failed payment
 *
 * `booked` is the one worth pausing on: it is a lime the eye reads as "already
 * done" rather than "press me", which is a different job from the solid
 * `accent` that offered the action in the first place. The two sit in the same
 * row on the classes screen, so they cannot be the same colour.
 */
const TONES = {
  quiet: { bg: 'quiet', fg: 'onQuiet', border: null },
  accent: { bg: 'accent', fg: 'onAccent', border: null },
  onAccent: { bg: 'onAccent', fg: 'accent', border: null },
  booked: { bg: 'booked', fg: 'onBooked', border: 'bookedBorder' },
  danger: { bg: 'backgroundRed', fg: 'textRed', border: 'borderRed' },
  outline: { bg: null, fg: 'textSecondary', border: 'border' },
} as const satisfies Record<
  string,
  { bg: ColorRole | null; fg: ColorRole; border: ColorRole | null }
>;

export type PillTone = keyof typeof TONES;
export type PillSize = 'sm' | 'md';

/**
 * The two pill sizes.
 *
 * A NOTE ON THE TYPE, BECAUSE IT IS A CHOICE AND NOT A TRANSCRIPTION. The
 * artboards' pill text is 11px (`px-3 py-1`) and 12px (`px-3 py-1.5`), neither
 * uppercase and neither tracked. WP-1's scale has both sizes — `label` (11) and
 * `caption` (12) — but `label` is a SMALL-CAPS role: it carries
 * `textTransform: 'uppercase'` and 0.12em of tracking, because that is what an
 * eyebrow needs. Adding an eleventh sans role for "11px, plainly set" would
 * mean editing `src/tokens/typography.ts`, which is WP-1's file and not this
 * package's to change.
 *
 * So the pill takes the role's SIZE, WEIGHT and LINE HEIGHT — the values that
 * must never drift from the scale — and turns off the two typographic switches
 * the artboards' pills do not use. The override is one line, it is visible, and
 * it is here rather than at twenty call sites.
 */
const SIZES = {
  sm: { variant: 'label', padH: 3, padV: 1, minHeight: 22 },
  md: { variant: 'caption', padH: 3, padV: 1.5, minHeight: 28 },
} as const;

export interface PillProps {
  children: ReactNode;
  /** Default `'quiet'`. */
  tone?: PillTone;
  /** Default `'md'`. */
  size?: PillSize;
  /**
   * Default `'full'` — the capsule the artboards use for status pills. Pass
   * `'inner'` for the squarer chip the classes screen's `CUT_SM` filters use.
   * Whatever is passed is clamped to half the pill's height, so a `'container'`
   * radius on a 22pt pill cannot silently become a capsule.
   */
  radius?: SurfaceRadius;
  /** A leading glyph, drawn in the tone's foreground. Decorative. */
  icon?: IconName;
  /** A leading dot, drawn in the tone's foreground. The gallery's status pill. */
  dot?: boolean;
  /**
   * Set the label in tabular figures. For a pill whose text is a count that
   * updates (`12 დარჩა` → `11 დარჩა`) this stops the pill's width jittering.
   */
  tabular?: boolean;
  /** Replaces the spoken text when the glyphs are not what should be read. */
  accessibilityLabel?: string;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * A status pill: a small, filled, capsule-shaped label.
 *
 * Not interactive, and deliberately so — the artboards' `BOOKED` and
 * `WAITLIST` chips that ARE buttons are buttons, with their own hit area, and
 * they belong to WP-6's `Chip`. A pill that is sometimes pressable is a pill
 * whose touch target is sometimes 22pt.
 */
export function Pill({
  children,
  tone = 'quiet',
  size = 'md',
  radius = 'full',
  icon,
  dot,
  tabular = false,
  accessibilityLabel,
  testID,
  style,
  className,
}: PillProps) {
  const colors = useThemeColors();
  const spec = TONES[tone];
  const dims = SIZES[size];
  const fg = colors[spec.fg];

  // See the note on SIZES: the scale's 11px and 12px steps are small-caps
  // roles, and the artboards' pills are neither uppercase nor tracked.
  const labelOverride = { textTransform: 'none', letterSpacing: 0 } as const;

  return (
    <View
      testID={testID}
      {...(accessibilityLabel ? { accessible: true, accessibilityLabel } : {})}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: spacing[1.5],
          minHeight: dims.minHeight,
          paddingHorizontal: spacing[dims.padH],
          paddingVertical: spacing[dims.padV],
          borderRadius: clampRadiusTo(radius, dims.minHeight),
        },
        spec.bg ? { backgroundColor: colors[spec.bg] } : null,
        spec.border ? { borderWidth: layout.hairline, borderColor: colors[spec.border] } : null,
        style,
      ]}
      className={className}
    >
      {dot ? (
        <View
          {...DECORATIVE}
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }}
        />
      ) : null}
      {icon ? <Icon name={icon} color={fg} size={14} /> : null}
      {tabular ? (
        <Mono variant="monoSmall" color={spec.fg} style={labelOverride} accessible={false}>
          {children}
        </Mono>
      ) : (
        <Text variant={dims.variant} color={spec.fg} style={labelOverride} accessible={false}>
          {children}
        </Text>
      )}
    </View>
  );
}

// ===========================================================================
// Badges.
//
// Both of these are drawn ON TOP of something else — the corner of an
// `IconButton`, a tab, an avatar — so both carry a RING in the colour of the
// surface behind them rather than a gap. A ring is what lets a lime dot stay
// legible over a lime block, which a gap cannot do.
//
// Neither is announced. The count belongs in the parent control's
// `accessibilityLabel` ("notifications, 3 unread"), which the caller writes,
// because a badge that announces "3" on its own tells a screen-reader user
// three of what.
// ===========================================================================

/** What an `IconButton`'s `badge` prop takes. */
export type BadgeSpec = { count: number; max?: number } | { dot: true };

export interface CountBadgeProps {
  count: number;
  /** Counts above this render as `${max}+`. Default 9. */
  max?: number;
  /** The colour BEHIND the badge, drawn as its ring. Default `backgroundBody`. */
  ringColor?: ColorRole;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/** The artboards' count badge: a 20pt lime disc, mono 10/700, ringed. */
export function CountBadge({
  count,
  max = 9,
  ringColor = 'backgroundBody',
  testID,
  style,
  className,
}: CountBadgeProps) {
  const colors = useThemeColors();
  const label = count > max ? `${max}+` : String(count);

  return (
    <View
      testID={testID}
      {...DECORATIVE}
      style={[
        {
          minWidth: 20,
          height: 20,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          // A `9+` is wider than a disc, so the box grows sideways rather than
          // clipping. `minWidth` keeps a single digit circular.
          paddingHorizontal: spacing[1],
          backgroundColor: colors.accent,
          borderWidth: 2,
          borderColor: colors[ringColor],
        },
        style,
      ]}
      className={className}
    >
      <Mono variant="monoMicro" color="onAccent" accessible={false}>
        {label}
      </Mono>
    </View>
  );
}

export interface DotBadgeProps {
  /** The colour BEHIND the badge, drawn as its ring. Default `backgroundSurface`. */
  ringColor?: ColorRole;
  /** Default `'accent'` — the lime "there is something new" marker. */
  color?: ColorRole;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/** The artboards' unread dot: an 8pt lime disc inside a 2pt ring. */
export function DotBadge({
  ringColor = 'backgroundSurface',
  color = 'accent',
  testID,
  style,
  className,
}: DotBadgeProps) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      {...DECORATIVE}
      style={[
        {
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: colors[color],
          borderWidth: 2,
          borderColor: colors[ringColor],
        },
        style,
      ]}
      className={className}
    />
  );
}
