import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE, interactiveA11y } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { Icon, resolveColor } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Text } from '../primitives/text';
import type { ColorValue } from '../primitives/icon/types';
import type { SurfaceRadius } from '../tokens/radii';
import type { ColorRole } from '../tokens/semantic';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// THE FILTER CHIP. `Pill` (WP-5) is its non-interactive twin, and the split is
// deliberate: a pill that is sometimes pressable is a pill whose touch target
// is sometimes 22pt.
//
// Four rails across three artboards: the home schedule's category capsule, the
// classes screen's week strip and category capsule, and the filter sheet's
// trainer and location groups.
// ===========================================================================

/**
 * THE SELECTED FILL LEGITIMATELY DIFFERS BY CONTEXT, so it is a prop.
 *
 *   mobile-home-v2.tsx:319  rail   selected → `bg-white text-ink-950`
 *   mobile-classes.tsx:255  rail   selected → `bg-white text-ink-950`
 *   mobile-classes.tsx:480  sheet  selected → `bg-brand-300 text-ink-950`
 *   mobile-classes.tsx:502  sheet  selected → `bg-brand-300 text-ink-950`
 *
 * This is not the artboards being inconsistent. A filter rail sits on the page
 * with the lime membership block a few hundred points above it, and a lime
 * chip there competes with the one element the direction wants the eye to
 * land on; white is the loudest neutral available and reads as "chosen"
 * without spending the accent. A sheet covers the page — the lime block is not
 * on screen — so the accent is free, and inside a sheet white would be the
 * third light surface in a stack of three.
 *
 * Hard-coding either one puts the wrong chip on half the screens, so the fill
 * is exposed and each rail says which it is.
 */
export type ChipSelectedFill = 'light' | 'accent';

/**
 * The IDLE plate also differs, for the same structural reason: `bg-ink-900` on
 * the page (the card step above the ink-950 canvas) and `bg-ink-800` in a
 * sheet (the card step above the sheet's own ink-900). Same idea, one surface
 * higher.
 */
export type ChipTone = 'surface' | 'quiet';

const SELECTED_FILL = {
  /** `bg-white text-ink-950` — the on-page rails. */
  light: { bg: 'onDark', fg: 'onLight' },
  /** `bg-brand-300 text-ink-950` — inside a sheet. */
  accent: { bg: 'accent', fg: 'onAccent' },
} as const satisfies Record<ChipSelectedFill, { bg: ColorRole; fg: ColorRole }>;

const TONES = {
  surface: { bg: 'backgroundCard', fg: 'onGhost', pressedBg: 'quiet' },
  quiet: { bg: 'quiet', fg: 'onGhost', pressedBg: 'borderEmphasized' },
} as const satisfies Record<ChipTone, { bg: ColorRole; fg: ColorRole; pressedBg: ColorRole }>;

export type ChipSize = 'sm' | 'md';

/**
 * The two heights the artboards draw: `h-11` (44) in a rail, `h-10` (40) in a
 * sheet's wrapping group.
 *
 * `sm` is under the 44pt floor, so it takes `hitSlopFor` — which is safe here
 * in a way it would not be in a vertical list: the sheet's chips wrap with an
 * 8pt gap, and 2pt of slop per side cannot reach a neighbour's centre.
 *
 * Both take the `inner` rung (10), which is CUT_SM in the artboards' own
 * mapping — never `element`, which `clampRadiusTo` would cap at 20 on a 40pt
 * chip and turn into something much closer to a capsule than the design's
 * squared filter chip.
 */
const SIZES = {
  sm: { height: 40, padH: spacing[4], variant: 'bodySmall', glyph: 15 },
  md: { height: 44, padH: spacing[5], variant: 'body', glyph: 16 },
} as const;

/**
 * `bodySmall` is 13 / **400** — running prose — and a chip label is 13 / 600
 * on the artboards (`text-[13px] font-semibold`). The 600 is overridden here
 * rather than a fourth 13px role being added to `typography.ts`, which is
 * WP-1's file.
 *
 * This override is SAFE where the same override on a 700 would not be: the
 * scale's 400/500/600 steps ride the SYSTEM sans and carry `fontWeight` with
 * no `fontFamily`, so raising the weight is exactly what `fontWeight` is for.
 * At 700 the role selects a bundled family by name instead, and setting both
 * double-bolds on iOS and picks the wrong face on Android — which is why
 * `button.tsx` builds its 15/700 label through `sansFamily` rather than like
 * this. `md` needs nothing: `body` is already 15 / 600.
 */
const SM_WEIGHT = { fontWeight: '600' } as const;

export interface ChipProps {
  /** The visible text, and the accessible name. Required — rule 1. */
  label: string;

  onPress: () => void;

  selected?: boolean;

  /** Default `'md'` (44). `'sm'` is 40 and gets its slop automatically. */
  size?: ChipSize;

  /** The idle plate. Default `'surface'` — on the page. Use `'quiet'` in a sheet. */
  tone?: ChipTone;

  /**
   * The selected plate. Default `'light'` — the on-page rails' white chip.
   * Pass `'accent'` inside a sheet. See {@link ChipSelectedFill}.
   */
  selectedFill?: ChipSelectedFill;

  /** A leading glyph, drawn in the chip's foreground. Decorative. */
  icon?: IconName;

  /**
   * A leading dot in an arbitrary colour — the gallery's category chips, where
   * the colour comes from the class type and is therefore data the design
   * system cannot know. Accepts a literal for exactly that reason.
   */
  dot?: ColorValue;

  disabled?: boolean;

  /** Override the rung. Clamped to half the height. */
  radius?: SurfaceRadius;

  /** Longer supporting text, announced after the label. */
  accessibilityHint?: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * A single filter, on or off.
 *
 * `accessibilityRole` stays `'button'` with `accessibilityState.selected`,
 * rather than `'radio'`: three of the four rails in the artboards are genuine
 * radio groups (one category at a time) and one — the classes sheet — is not
 * obviously either, and a `radio` role announces a POSITION ("2 of 6") that is
 * only true if the caller renders the whole group and nothing else. A button
 * that announces "selected" is true in every one of the four, which is the
 * bar for a shared component.
 */
export function Chip({
  label,
  onPress,
  selected = false,
  size = 'md',
  tone = 'surface',
  selectedFill = 'light',
  icon,
  dot,
  disabled = false,
  radius = 'inner',
  accessibilityHint,
  testID,
  style,
  className,
}: ChipProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  const dims = SIZES[size];
  const idle = TONES[tone];
  const on = SELECTED_FILL[selectedFill];

  const background = disabled
    ? colors.borderEmphasized
    : selected
      ? colors[on.bg]
      : pressed
        ? colors[idle.pressedBg]
        : colors[idle.bg];

  const foreground = disabled
    ? colors.textDisabled
    : selected
      ? colors[on.fg]
      : pressed
        ? colors.textPrimary
        : colors[idle.fg];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlopFor(dims.height)}
      testID={testID}
      android_ripple={{ color: colors.focusRing }}
      {...interactiveA11y({ accessibilityLabel: label, accessibilityHint }, { disabled, selected })}
      style={[
        {
          height: dims.height,
          minHeight: dims.height,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[2],
          paddingHorizontal: dims.padH,
          borderRadius: clampRadiusTo(radius, dims.height),
          backgroundColor: background,
          // A chip in a horizontal rail must keep its intrinsic width — the
          // artboards' `shrink-0`. Without it the rail's flex layout squeezes
          // the last chip instead of letting it scroll off.
          flexShrink: 0,
        },
        style,
      ]}
      className={className}
    >
      {dot ? (
        <View
          {...DECORATIVE}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: resolveColor(dot, colors),
          }}
        />
      ) : null}
      {icon ? <Icon name={icon} color={foreground} size={dims.glyph} /> : null}
      <Text
        variant={dims.variant}
        color={foreground}
        numberOfLines={1}
        accessible={false}
        style={size === 'sm' ? SM_WEIGHT : null}
      >
        {label}
      </Text>
    </Pressable>
  );
}
