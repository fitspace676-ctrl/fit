import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { interactiveA11y } from '../internal/a11y';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Mono } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// A COUNT, WITH A MINUS AND A PLUS.
//
// Two instances, both in `mobile-shop.tsx`: the product row's stepper (36pt
// buttons) and the cart sheet's (32pt). The lime is on the PLUS alone —
// increment is the action the shop wants, and painting both arrows would spend
// the accent on a pair of glyphs rather than on a direction. Same call as
// `packages/ui-kit/src/stepper.tsx`, and the prop names mirror it.
//
// WHAT THIS COMPONENT DOES NOT DO: at `value === 0` the artboard replaces the
// whole stepper with a single round "add to cart" button
// (`mobile-shop.tsx:200-211`). That swap is the SCREEN's — it changes which
// control exists, not how this one looks, and a component that renders itself
// as a different component is a component nobody can reason about.
// ===========================================================================

/**
 * The two sizes, transcribed.
 *
 *   md   `h-9 w-9` buttons, `h-4 w-4` glyphs, `text-[15px]` count   product row
 *   sm   `h-8 w-8` buttons, `h-3.5` glyphs,   `text-[14px]` count   cart sheet
 *
 * The container is `rounded-pill bg-ink-800 p-1` in both, so its height is the
 * button plus 8: 44 at `md` — exactly the floor, with no slop needed — and 40
 * at `sm`. The BUTTONS are under the floor at both sizes and take
 * `hitSlopFor` individually.
 *
 * The count's width is fixed (`w-5` = 20) so the control does not reflow as
 * the number crosses from 9 to 10 — which, combined with `Mono`'s tabular
 * figures, is what keeps the whole product row from shifting under the thumb
 * that is pressing it.
 */
const SIZES = {
  sm: { button: 32, glyph: 14, variant: 'monoSmall', countWidth: 20 },
  md: { button: 36, glyph: 16, variant: 'monoBody', countWidth: 20 },
} as const;

export type QtyStepperSize = keyof typeof SIZES;

/** The container's padding — `p-1` — and the gap between its three children. */
const PAD = spacing[1];

interface StepButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
  size: number;
  glyph: number;
  /** `true` for the plus: the lime one. */
  accent: boolean;
  testID?: string;
}

/**
 * One end of the stepper.
 *
 * Individually accessible, with its own label, because Switch Control and
 * keyboard-style navigation move element to element and cannot perform the
 * `adjustable` increment that VoiceOver's swipe does. A stepper whose only
 * accessible element is the group is unusable with a switch.
 */
function StepButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled,
  size,
  glyph,
  accent,
  testID,
}: StepButtonProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  const bg: ColorRole | null = accent ? 'accent' : null;
  const pressedBg: ColorRole = accent ? 'accentHover' : 'borderEmphasized';
  const fg: ColorRole = accent ? 'onAccent' : 'onGhost';

  const background = disabled
    ? accent
      ? colors.borderEmphasized
      : undefined
    : pressed
      ? colors[pressedBg]
      : bg
        ? colors[bg]
        : undefined;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      // 36 → 4pt of slop, 32 → 6pt. Both land on exactly 44.
      hitSlop={hitSlopFor(size)}
      testID={testID}
      android_ripple={{ color: colors.focusRing, borderless: true, radius: size / 2 }}
      {...interactiveA11y({ accessibilityLabel }, { disabled })}
      style={[
        {
          width: size,
          height: size,
          minHeight: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        background === undefined ? null : { backgroundColor: background },
      ]}
    >
      <Icon
        name={icon}
        color={
          disabled ? colors.iconDisabled : pressed && !accent ? colors.textPrimary : colors[fg]
        }
        size={glyph}
      />
    </Pressable>
  );
}

export interface QtyStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Default 0. The end is DISABLED rather than hidden, so the control keeps
   *  its width and the row does not reflow at a boundary. */
  min?: number;
  max?: number;
  /** Default `'md'` (36pt buttons). */
  size?: QtyStepperSize;
  /**
   * The three accessible names, from the caller's catalogue. Required —
   * package rule 1, and an unlabelled `+` is the least guessable control in
   * any app.
   *
   * `value` names the GROUP ("quantity"), not the number: the number itself is
   * announced from `accessibilityValue`, which is what makes the swipe
   * gesture say "3" after it moves rather than staying silent.
   */
  labels: { decrease: string; increase: string; value: string };
  /**
   * Replaces the minus glyph with a bin when the value is at `min + 1`, so one
   * more press removes the line rather than stepping to a quantity of zero.
   * The cart's case. Mirrors ui-kit.
   */
  removeAtMin?: boolean;
  disabled?: boolean;
  /** Forwarded to the root; the two buttons take `${testID}-decrease` and
   *  `${testID}-increase`, which is what a Maestro flow needs to press them. */
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** The shop's quantity control. */
export function QtyStepper({
  value,
  onChange,
  min = 0,
  max,
  size = 'md',
  labels,
  removeAtMin = false,
  disabled = false,
  testID,
  style,
  className,
}: QtyStepperProps) {
  const colors = useThemeColors();
  const dims = SIZES[size];

  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  const decrease = () => {
    if (disabled || atMin) return;
    onChange(value - 1);
  };
  const increase = () => {
    if (disabled || atMax) return;
    onChange(value + 1);
  };

  return (
    <View
      testID={testID}
      // ======================================================================
      // `adjustable` PLUS TWO LABELLED BUTTONS — both, on purpose.
      //
      // VoiceOver's increment/decrement is a SWIPE UP/DOWN on a focused
      // element, and it only exists for `accessibilityRole="adjustable"` with
      // `accessibilityActions`. Switch Control and keyboard navigation have no
      // such gesture and move element to element instead, so they need the two
      // buttons to be reachable and named.
      //
      // The two are in mild tension — `accessible` on this container would
      // absorb the children — so this container declares its role, its value
      // and its actions but does NOT set `accessible`, leaving the buttons
      // individually focusable. VoiceOver users get the labelled buttons;
      // Android's TalkBack, which honours a role on a non-accessible
      // container, gets the group semantics as well.
      // ======================================================================
      {...interactiveA11y(
        { accessibilityLabel: labels.value, accessibilityRole: 'adjustable' },
        { disabled },
      )}
      accessibilityValue={{
        min,
        ...(max === undefined ? {} : { max }),
        now: value,
        // `text` is what a screen reader SAYS. Without it VoiceOver reads a
        // percentage derived from min/now/max, which for a cart quantity is
        // nonsense ("50 percent" for 1 of 2).
        text: String(value),
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') increase();
        if (event.nativeEvent.actionName === 'decrement') decrease();
      }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: PAD,
          padding: PAD,
          height: dims.button + 2 * PAD,
          minHeight: dims.button + 2 * PAD,
          // A capsule. `radii.full` clamped by RN to half the shorter side.
          borderRadius: (dims.button + 2 * PAD) / 2,
          backgroundColor: colors.quiet,
          flexShrink: 0,
        },
        style,
      ]}
      className={className}
    >
      <StepButton
        icon={removeAtMin && value === min + 1 ? 'trash' : 'minus'}
        accessibilityLabel={labels.decrease}
        onPress={decrease}
        disabled={disabled || atMin}
        size={dims.button}
        glyph={dims.glyph}
        accent={false}
        testID={testID ? `${testID}-decrease` : undefined}
      />

      <Mono
        variant={dims.variant}
        color={disabled ? 'textDisabled' : 'textPrimary'}
        align="center"
        accessible={false}
        style={{ width: dims.countWidth }}
      >
        {String(value)}
      </Mono>

      <StepButton
        icon="plus"
        accessibilityLabel={labels.increase}
        onPress={increase}
        disabled={disabled || atMax}
        size={dims.button}
        glyph={dims.glyph}
        accent
        testID={testID ? `${testID}-increase` : undefined}
      />
    </View>
  );
}
