import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { interactiveA11y } from '../internal/a11y';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { CountBadge, DotBadge, type BadgeSpec } from '../feedback/pill';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import type { ColorRole } from '../tokens/semantic';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// THE MOST-USED ELEMENT IN THE DESIGN.
//
// ~20 instances across 6 of 6 artboards: the notification bell, the filter
// button, the QR brightness toggle, every sheet's close, the qty stepper's
// plus and minus, the "add to cart" plus, the copy-member-ID button, the
// chevron on every menu row. If one component in this package has to be right,
// it is this one — a bug here is a bug on every screen.
// ===========================================================================

/**
 * The five plates, each read off the artboards.
 *
 * `bg` / `fg` are the resting pair; `pressedBg` / `pressedFg` are the pressed
 * one. Every `hover:` class in the artboards becomes a pressed BACKGROUND
 * step — never an opacity fade; see `internal/use-pressed.ts` for why that
 * distinction is load-bearing on this palette.
 *
 *   surface   44   bg-ink-900 text-ink-200   hover:bg-ink-800   header buttons
 *   accent    44   bg-brand-300 text-ink-950 hover:bg-brand-200 primary action
 *   quiet     40   bg-ink-800 text-ink-300   hover:text-white   sheet close
 *   ghost     36   (no fill)  text-ink-300   hover:bg-ink-700   qty stepper −
 *   onAccent  40   bg-ink-950 text-brand-300                    on a lime block
 *
 * `accent` is `brand-300` on `ink-950` text, NOT `brand-500` on white. The
 * gallery (`design-system.tsx`) still shows the latter; it predates the August
 * "Lime Block" repaint and the artboards win. All six artboards agree.
 */
const VARIANTS = {
  surface: {
    size: 44,
    bg: 'control',
    fg: 'onQuiet',
    pressedBg: 'tilePressed',
    pressedFg: 'textPrimary',
  },
  accent: {
    size: 44,
    bg: 'accent',
    fg: 'onAccent',
    pressedBg: 'accentHover',
    pressedFg: 'onAccent',
  },
  quiet: {
    size: 40,
    bg: 'quiet',
    fg: 'onGhost',
    pressedBg: 'borderEmphasized',
    pressedFg: 'textPrimary',
  },
  ghost: {
    size: 36,
    bg: null,
    fg: 'onGhost',
    pressedBg: 'borderEmphasized',
    pressedFg: 'textPrimary',
  },
  onAccent: {
    size: 40,
    bg: 'onAccent',
    fg: 'accent',
    pressedBg: 'backgroundCard',
    pressedFg: 'accentHover',
  },
} as const satisfies Record<
  string,
  {
    size: number;
    bg: ColorRole | null;
    fg: ColorRole;
    pressedBg: ColorRole;
    pressedFg: ColorRole;
  }
>;

export type IconButtonVariant = keyof typeof VARIANTS;

/**
 * The glyph size for a given plate, from the artboards: 19 on the 44s, 18 on
 * the 40s, 16 on the 36s. Expressed as a function of the plate rather than a
 * per-variant constant so an explicit `size` override scales the glyph too —
 * the shop artboard's 36px `accent` stepper button is exactly that case.
 */
function glyphSize(size: number): number {
  if (size >= 44) return 19;
  if (size >= 40) return 18;
  return 16;
}

/**
 * The Android ripple for a round plate.
 *
 * `borderless: true` because the plate IS a circle: Android's default bounded
 * ripple is drawn as the view's RECTANGLE, so a round button flashes a square
 * behind itself on every tap. `radius` has to be given too — a borderless
 * ripple with no radius expands well past the control it belongs to.
 *
 * Exported so it can be asserted directly. React Native strips `android_ripple`
 * from the rendered tree on every other platform, and the render suite runs
 * under `jest-expo`'s iOS default, so a test that reached for the prop on the
 * host node would find nothing and pass by accident on the day the config was
 * deleted.
 */
export function iconButtonRipple(
  size: number,
  color: string,
): { color: string; borderless: true; radius: number } {
  return { color, borderless: true, radius: size / 2 };
}

export interface IconButtonProps {
  icon: IconName;

  /**
   * REQUIRED. Package rule 1: no component ships copy, and an icon-only
   * control is meaningless to a screen reader without one. Typed as a plain
   * `string`, so omitting it is a compile error rather than a silent
   * `undefined` that only shows up with VoiceOver on.
   */
  accessibilityLabel: string;

  onPress: () => void;

  /** Default `'surface'`. */
  variant?: IconButtonVariant;

  /**
   * Override the variant's plate size. The glyph and the hit slop both follow
   * it, so an override cannot break the touch-target floor.
   */
  size?: number;

  /**
   * A toggle's on-state. Reflected to the screen reader through
   * `accessibilityState.selected`, never through a changed label — a control
   * whose label flips between "mute" and "unmute" is a control the user cannot
   * search for.
   *
   * Visually: the artboards disagree with each other here, and both readings
   * are kept. `mobile-classes.tsx` shows an active filter button as the accent
   * pair (lime plate, ink glyph); `mobile-qr.tsx` shows the active brightness
   * toggle as its INVERSE (ink-950 plate, lime glyph). They are the same idea
   * applied to different grounds — the second is the one that survives on a
   * plate that is already lime — so `selected` takes the accent pair for the
   * neutral variants and the inverse for the two that are already accented.
   */
  selected?: boolean;

  disabled?: boolean;

  /**
   * A count or a dot, drawn on the top-right corner.
   *
   * The badge ESCAPES the button's bounds (the artboards offset it by −2), so
   * this component must never set `overflow: 'hidden'` on its root: the fill
   * is clipped by `borderRadius` alone, which rounds it without clipping
   * anything that sticks out. Setting `overflow: 'hidden'` to "round the
   * corners properly" is the change that silently deletes every badge.
   */
  badge?: BadgeSpec;

  /**
   * The colour the badge's ring is drawn in — the SURFACE THE BUTTON SITS ON,
   * not the button. The ring exists to punch a gap between the badge and
   * whatever is behind it, so it has to match the ground: `backgroundBody` for
   * a button on the page (the default, and what both artboards that show a
   * count badge do), `backgroundCard` for one on a card.
   */
  badgeRingColor?: ColorRole;

  /**
   * Forwarded to the root node. The smoke suite drives the app by `testID`;
   * a component that swallows it gets re-implemented locally by the first
   * person who needs a selector.
   */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** A round, icon-only control. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  size,
  selected,
  disabled = false,
  badge,
  badgeRingColor = 'backgroundBody',
  testID,
  style,
  className,
}: IconButtonProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  const spec = VARIANTS[variant];
  const plate = size ?? spec.size;

  // The a11y bug most likely to ship from this file, closed here rather than
  // documented for call sites. `quiet` (40) and `ghost` (36) are BELOW the 44pt
  // minimum by design — a 36px circle is the right silhouette in a dense row —
  // so the component pays the difference itself. There is deliberately no
  // `hitSlop` prop: a prop is a thing a call site can forget.
  const hitSlop = hitSlopFor(plate);

  // See `IconButtonProps.selected`.
  const inverseSelected = variant === 'accent' || variant === 'onAccent';
  const selectedBg: ColorRole = inverseSelected ? 'onAccent' : 'accent';
  const selectedFg: ColorRole = inverseSelected ? 'accent' : 'onAccent';

  const background = selected
    ? colors[selectedBg]
    : pressed
      ? colors[spec.pressedBg]
      : spec.bg
        ? colors[spec.bg]
        : undefined;

  const foreground = disabled
    ? colors.iconDisabled
    : selected
      ? colors[selectedFg]
      : pressed
        ? colors[spec.pressedFg]
        : colors[spec.fg];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      testID={testID}
      android_ripple={iconButtonRipple(plate, colors.focusRing)}
      {...interactiveA11y(
        { accessibilityLabel },
        { disabled, ...(selected === undefined ? {} : { selected }) },
      )}
      style={[
        {
          width: plate,
          height: plate,
          // A circle. NOT `overflow: 'hidden'` — see `IconButtonProps.badge`.
          borderRadius: plate / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        background === undefined ? null : { backgroundColor: background },
        disabled ? { opacity: 0.4 } : null,
        style,
      ]}
      className={className}
    >
      <Icon name={icon} color={foreground} size={glyphSize(plate)} />
      {badge ? (
        'dot' in badge ? (
          // The dot sits INSIDE the plate (the artboards put it at `right-2.5
          // top-2.5`, ringed in the button's own fill) because it marks the
          // control rather than counting anything hidden behind it.
          <View style={{ position: 'absolute', top: 8, right: 8 }}>
            <DotBadge ringColor={spec.bg ?? badgeRingColor} />
          </View>
        ) : (
          // The count ESCAPES the plate (`-right-0.5 -top-0.5`), which is why
          // this component must never set `overflow: 'hidden'`.
          <View style={{ position: 'absolute', top: -2, right: -2 }}>
            <CountBadge count={badge.count} max={badge.max} ringColor={badgeRingColor} />
          </View>
        )
      ) : null}
    </Pressable>
  );
}
