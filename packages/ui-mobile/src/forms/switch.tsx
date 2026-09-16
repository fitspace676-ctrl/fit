import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE, interactiveA11y } from '../internal/a11y';
import { hitSlopFor } from '../internal/hit-slop';
import { Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';
import type { ThemeColors } from '../tokens/semantic';

// ===========================================================================
// THE SETTING THAT SAVES ON CHANGE.
//
// `accessibilityRole="switch"`, not `"checkbox"`. A checkbox is announced as
// "will be applied when you submit"; a switch as "is on". Everything this
// control governs in the product — push preferences, class reminders — takes
// effect the moment it moves, so the switch is the honest one. Same reasoning,
// same choice, as `packages/ui-kit/src/switch.tsx`.
// ===========================================================================

/** The artboards' geometry: `h-7 w-12` track, `h-5 w-5` knob, `left-1`→`left-6`. */
const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const KNOB = 20;
const KNOB_INSET = 4;
/** 48 − 20 − 2 × 4. The knob travels exactly the space it does not occupy. */
const KNOB_TRAVEL = TRACK_WIDTH - KNOB - 2 * KNOB_INSET;

/**
 * ON IS LIME TRACK + INK KNOB.
 *
 * `design-system.tsx:493` still draws a WHITE knob on a `brand-500` track;
 * that gallery predates the August "Lime Block" repaint and the artboard wins
 * — `mobile-profile.tsx:118-124` is `bg-brand-300` with `bg-ink-950`, and it
 * is the only mobile comp that contains a switch at all.
 *
 * A white knob on `brand-300` is also the weaker of the two: white on this
 * lime measures about 1.5:1, so the knob's edge would be defined only by its
 * drop shadow. Ink-950 on brand-300 is the same pairing every other lime
 * surface in the product uses.
 */
const ON = { track: 'accent', knob: 'onAccent' } as const;

/** `bg-ink-700` track, `bg-ink-400` knob — the artboard's off state. */
const OFF = { track: 'borderEmphasized', knob: 'textSecondary' } as const;

/** How long the knob takes. Short enough to feel like a toggle, not a slide. */
const DURATION = 160;

interface TrackProps {
  checked: boolean;
  disabled: boolean;
  colors: ThemeColors;
}

/**
 * The visual only — no role, no label, out of the accessibility tree.
 *
 * Split out because it is drawn in two places with two completely different
 * accessibility stories: alone in {@link Switch}, where it IS the control, and
 * inside {@link SwitchRow}, where the ROW is the control and a second
 * announcing element beside the label would make the row read twice.
 */
function Track({ checked, disabled, colors }: TrackProps) {
  const spec = checked ? ON : OFF;

  // `useRef` seeded from the initial value, so a switch that mounts already-on
  // does not animate itself on from the left on first paint.
  const progress = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: checked ? 1 : 0,
      duration: DURATION,
      easing: Easing.out(Easing.quad),
      // `translateX` is one of the transforms the native driver supports, so
      // the knob keeps moving while JS is busy — which, on a settings screen
      // that fires a mutation on change, is precisely when it is moving.
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [checked, progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, KNOB_TRAVEL] });

  return (
    <View
      {...DECORATIVE}
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
        // The colour is NOT animated. `backgroundColor` cannot run on the
        // native driver, so animating it would drag the knob back onto the JS
        // thread with it; a 160ms colour cross-fade is not worth that trade.
        backgroundColor: disabled ? colors.neutral : colors[spec.track],
        justifyContent: 'center',
        paddingHorizontal: KNOB_INSET,
      }}
    >
      <Animated.View
        style={{
          width: KNOB,
          height: KNOB,
          borderRadius: KNOB / 2,
          backgroundColor: disabled ? colors.iconDisabled : colors[spec.knob],
          transform: [{ translateX }],
        }}
      />
    </View>
  );
}

export interface SwitchProps {
  /**
   * The accessible name. REQUIRED — an unlabelled switch announces only "on",
   * which is on of what.
   */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Longer supporting text, announced after the label. */
  accessibilityHint?: string;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * The bare track, as its own control.
 *
 * Use it only where the row around it is NOT pressable — a switch inside a
 * table cell that already has its own tap action, for instance. For a settings
 * row, reach for {@link SwitchRow}: a 48 × 28 track is 28pt tall, and even
 * with the slop this component applies, a target that small next to a label
 * the user is looking at is the wrong shape for a thumb.
 */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  accessibilityHint,
  testID,
  style,
  className,
}: SwitchProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => {
        onChange(!checked);
      }}
      disabled={disabled}
      // 28pt tall — 8pt of slop each side brings it to 44. As everywhere in
      // this package the component pays it; there is no `hitSlop` prop.
      hitSlop={hitSlopFor(TRACK_HEIGHT)}
      testID={testID}
      {...interactiveA11y(
        { accessibilityLabel: label, accessibilityHint, accessibilityRole: 'switch' },
        { disabled },
      )}
      // `checked` is what a switch reflects; `interactiveA11y` covers
      // disabled/selected/busy/expanded and deliberately does not know about
      // it, so it is merged here. Spread AFTER, so it wins.
      accessibilityState={{ disabled, checked }}
      // The root carries the track's own box rather than wrapping it loosely:
      // `hitSlop` is measured from the PRESSABLE's frame, so a zero-height
      // root would give a 44pt-tall slop around nothing.
      style={[
        {
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          minHeight: TRACK_HEIGHT,
          alignSelf: 'flex-start',
        },
        style,
      ]}
      className={className}
    >
      <Track checked={checked} disabled={disabled} colors={colors} />
    </Pressable>
  );
}

export interface SwitchRowProps extends SwitchProps {
  /**
   * Supporting copy under the label on what the setting does. Up to
   * {@link descriptionLines} lines.
   *
   * WAS ONE TRUNCATING LINE. Three of the four notification-settings toggles
   * lost their description to an ellipsis in Georgian — and a description is
   * the only thing on the row that says what the member is turning off, so
   * truncating it removes the reason the row exists. `minHeight` is a floor,
   * so a one-line description still measures one line and nothing moves on the
   * rows that were already fine. See `ListRowProps.hint`, which had the same
   * defect for the same reason.
   */
  description?: string;

  /** How many lines {@link description} may take. Default **2**. */
  descriptionLines?: number;
  /**
   * Keep {@link SwitchProps.label} as the accessible name without drawing it —
   * for a row whose surrounding copy already names the setting. Mirrors
   * ui-kit's `hideLabel`.
   */
  hideLabel?: boolean;
}

/**
 * Label, optional description, and the track — and THE WHOLE ROW IS THE TARGET.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ROW, AND NOT THE TRACK.
 *
 * The track is 48 × 28. That is under the 44pt floor on one axis, it sits hard
 * against the right gutter, and it is the smallest thing on a screen made of
 * 68pt-tall rows. Every one of those is a reason a thumb misses it — and a
 * missed tap on a settings row is not a no-op, it is a user pressing again
 * harder and then wondering whether the setting saved.
 *
 * Making the row the control fixes all three at once, and it is what the
 * platform conventions do. It also removes the double-announcement problem for
 * free: the label is INSIDE the control, so it is announced as the control's
 * name rather than as a separate text node before it.
 *
 * `hitSlopFor` is deliberately NOT applied here. The row is already ~68pt tall
 * and rows stack directly on top of one another in a `divide-y` list, so slop
 * would extend each row's target into its neighbour's and make the boundary
 * between two adjacent settings ambiguous.
 * ---------------------------------------------------------------------------
 */
export function SwitchRow({
  label,
  description,
  descriptionLines = 2,
  hideLabel = false,
  checked,
  onChange,
  disabled = false,
  accessibilityHint,
  testID,
  style,
  className,
}: SwitchRowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => {
        onChange(!checked);
      }}
      disabled={disabled}
      testID={testID}
      android_ripple={{ color: colors.focusRing }}
      {...interactiveA11y(
        {
          accessibilityLabel: label,
          // The description is supporting copy about the setting, which is
          // exactly what a hint is for — announced after the name and the
          // state, and skippable in VoiceOver's settings.
          accessibilityHint: accessibilityHint ?? description,
          accessibilityRole: 'switch',
        },
        { disabled },
      )}
      accessibilityState={{ disabled, checked }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[4],
          // `px-4 py-3.5` on the artboard — the row lives inside a card that
          // supplies no padding of its own, so the row carries it.
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3.5],
          // Two 21pt lines plus 28pt of padding is 70; a label-only row is 49.
          // Both clear the floor without slop — see the header.
          minHeight: 56,
        },
        style,
      ]}
      className={className}
    >
      <View style={{ flex: 1, minWidth: 0 }} accessible={false}>
        {hideLabel ? null : (
          <Text color={disabled ? 'textDisabled' : 'textPrimary'} accessible={false}>
            {label}
          </Text>
        )}
        {description ? (
          <Text
            variant="caption"
            // ================================================================
            // THE DESCRIPTION DOES NOT DIM. ONLY THE LABEL DOES.
            //
            // `textDisabled` is ink-600, which measures 2.16:1 on the ink-900
            // card. WCAG exempts disabled controls from 1.4.3, so this was not
            // a conformance failure — it was worse than one. On the
            // notification-settings screen the four category rows are disabled
            // BY THE MASTER SWITCH, and the descriptions under them are what
            // the member reads to decide whether to turn that master switch on.
            // Dimming them removed the explanation at exactly the moment it was
            // being consulted.
            //
            // The general rule, not a special case for one screen: `disabled`
            // is a fact about the CONTROL. The label is the control's name, so
            // it dims and says "off-limits"; the track greys and says it too.
            // The description is prose ABOUT the control, and prose that
            // explains why something is unavailable has to stay readable while
            // it is unavailable. `textSecondary` is ink-400 — 5.14:1, and still
            // quieter than the label above it.
            // ================================================================
            color="textSecondary"
            numberOfLines={descriptionLines}
            accessible={false}
            style={{ marginTop: spacing[0.5] }}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <Track checked={checked} disabled={disabled} colors={colors} />
    </Pressable>
  );
}
