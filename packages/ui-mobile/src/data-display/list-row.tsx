import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE, interactiveA11y } from '../internal/a11y';
import { usePressed } from '../internal/use-pressed';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Text } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// THE GROUPED LIST ROW.
//
// `mobile-profile.tsx:62-104` (`MenuRow`) — eleven instances on that screen:
// billing, personal training, trainers, notifications, appearance, language,
// sign out. `px-4 py-3.5`, a 40pt round plate, a title, an optional hint, an
// optional trailing value, a 16pt chevron.
//
// ---------------------------------------------------------------------------
// THE ROW HAS NO RADIUS AND NO BORDER, AND THAT IS THE WHOLE POINT.
//
// The artboard groups rows inside `overflow-hidden rounded-[26px] bg-ink-900`
// with `divide-y divide-ink-800` between them. So the CARD owns the corners and
// the fill, the DIVIDERS own the separation, and the row owns neither. A row
// that drew its own 26pt corners would round the inside of every join in the
// group and the stack would read as six loose cards instead of one panel.
//
// Compose it as:
//
//   <Surface tone="card" radius="container" style={{ overflow: 'hidden' }}>
//     <ListRow … /><Divider /><ListRow … />
//   </Surface>
//
// ---------------------------------------------------------------------------
// GALLERY vs ARTBOARD — the artboard wins, per the porting rule.
//
//   design-system.tsx:351   36pt SQUARED plate (`rounded-btn`) WITH a border,
//                           title 15/500, hint ink-500, no `px`, no value slot
//   mobile-profile.tsx:62   40pt ROUND plate, no border, title 15/600,
//                           hint ink-400, `px-4`, a value slot
//
// The gallery predates the August "Lime Block" repaint. Everything above is
// taken from the artboard.
//
// ---------------------------------------------------------------------------
// OVERLAP, RESOLVED. `src/forms/option-row.tsx` was the same artboard element
// under a different name: the rebuild plan mistakenly assigned this comp twice,
// once to WP-6 as `OptionRow` and once to WP-8a as `ListRow`. WP-8a spotted the
// fork and matched its colours to the other so the two could not diverge while
// both existed; `OptionRow` has since been deleted and this is the one row.
//
// `OptionRow` was originally specified as a RADIO GROUP (the freeze-duration
// picker, the wrapped filter chip groups) and was built as a menu row instead —
// correctly, since that is what the artboard shows at `mobile-profile.tsx:62`.
// The radio-group need is served by `Segmented` (equal-width) and by `Chip` in
// a wrapping layout (filters); if you came here looking for `OptionRow`, one of
// those two is what you want.
// ===========================================================================

/** `h-10 w-10` — the artboard's icon plate. */
const PLATE = 40;

/** `h-[18px]` inside the plate. */
const PLATE_GLYPH = 18;

/** `h-4` — the trailing chevron. */
const CHEVRON = 16;

export interface ListRowProps {
  /**
   * The row's visible title and, unless {@link accessibilityLabel} says
   * otherwise, its accessible name. Required — copy is always the caller's.
   */
  title: string;

  /**
   * Optional. A row without `onPress` is NOT a button: it announces as text,
   * draws no chevron and takes no press feedback, rather than looking
   * pressable and doing nothing.
   */
  onPress?: () => void;

  /** The glyph in the round plate. */
  icon?: IconName;

  /**
   * A supporting line under the title. Up to {@link hintLines} lines.
   *
   * ==========================================================================
   * IT WAS ONE TRUNCATING LINE, AND IN GEORGIAN THAT MEANT NO LINE AT ALL.
   *
   * Three of the eight Profile menu rows and three of the four
   * notification-settings toggles lost their subtitle to an ellipsis — every
   * one of them a sentence written to tell the member what the row DOES, which
   * is the only reason a hint exists. The row is already 68pt tall against a
   * 44pt floor and the title above it is one line, so the second line costs
   * nothing on the rows that need it and nothing at all on the rows that do
   * not: `minHeight` is a floor, and a one-line hint still measures one line.
   *
   * The title stays at one line on purpose — it is the row's NAME, it is what
   * `accessibilityLabel` falls back to, and a wrapping name in a stack of ten
   * rows destroys the rhythm the list is built on. The hint is prose; prose
   * wraps.
   * ==========================================================================
   */
  hint?: string;

  /** How many lines {@link hint} may take. Default **2**. */
  hintLines?: number;

  /** A value hung on the right, before the chevron — "ქართული", "v1.4.0". */
  value?: string;

  /**
   * The destructive treatment: red plate wash, red glyph, red title.
   * `mobile-profile` uses it for sign-out and for nothing else, which is the
   * point — a red row among ten neutral ones is a warning; two red rows is a
   * colour scheme.
   */
  danger?: boolean;

  /**
   * Anything else on the right, drawn before the chevron.
   *
   * Whatever goes here is INSIDE a labelled control, so it must not announce
   * itself: pass `accessible={false}`, or fold what it says into
   * {@link accessibilityLabel}.
   */
  trailing?: ReactNode;

  /** Force the chevron on or off. Defaults to "on when `onPress` is given". */
  chevron?: boolean;

  disabled?: boolean;

  /**
   * Overrides the spoken name. Optional, and that is not a hole in rule 1:
   * `title` is already a required, caller-supplied string and deriving the
   * accessible name from the visible one is the correct default.
   */
  accessibilityLabel?: string;

  /** Defaults to {@link hint}. */
  accessibilityHint?: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** A row in a settings list or a menu. Group them inside a `Surface`. */
export function ListRow({
  title,
  onPress,
  icon,
  hint,
  hintLines = 2,
  value,
  danger = false,
  trailing,
  chevron,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  className,
}: ListRowProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  const pressable = onPress !== undefined && !disabled;
  const showChevron = chevron ?? onPress !== undefined;

  // Inside a pressable row the ROW is the accessibility node, so every child
  // has to be out of the tree — and `accessible={false}` alone is not enough:
  // Android needs `importantForAccessibility`, which is why `DECORATIVE` sets
  // all three flags. A row with no `onPress` is not a control, so its text
  // announces normally instead of being silently unreachable.
  const inner = pressable ? DECORATIVE : {};

  // ---------------------------------------------------------------------------
  // THE DANGER PAIR, AND WHY IT IS NOT `danger-500/15`.
  //
  // The artboard washes the plate with `bg-danger-500/15` — a 15% red over
  // `ink-900`. React Native would composite that correctly, but a literal
  // `rgba(239, 68, 68, 0.15)` in a component is a colour the drift guard can no
  // longer see, and it has no light-mode arm at all (15% red over WHITE is a
  // pink the design has never signed off).
  //
  // `errorMuted` is the shipped role for exactly this plate and resolves to
  // `danger-950` in dark — which is precisely what `design-system.tsx:372`
  // draws for the same row (`bg-danger-950`) — and to `danger-100` in light.
  // Slightly more saturated than a 15% wash on a charcoal ground, and correct
  // in both modes instead of one.
  //
  // `error` is `danger-400` in dark: the artboard's `text-danger-400`, exactly.
  // ---------------------------------------------------------------------------
  const titleColor: ColorRole = disabled ? 'textDisabled' : danger ? 'error' : 'textPrimary';
  const plateBg: ColorRole = danger ? 'errorMuted' : 'quiet';
  const plateFg: ColorRole = danger ? 'error' : 'onQuiet';

  const body = (
    <>
      {icon ? (
        <View
          {...DECORATIVE}
          style={{
            width: PLATE,
            height: PLATE,
            borderRadius: PLATE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors[plateBg],
          }}
        >
          <Icon
            name={icon}
            color={disabled ? colors.iconDisabled : colors[plateFg]}
            size={PLATE_GLYPH}
          />
        </View>
      ) : null}

      <View {...inner} style={{ flex: 1, minWidth: 0 }}>
        <Text color={titleColor} numberOfLines={1}>
          {title}
        </Text>
        {hint ? (
          <Text
            variant="caption"
            color={disabled ? 'textDisabled' : 'textSecondary'}
            numberOfLines={hintLines}
            style={{ marginTop: spacing[0.5] }}
          >
            {hint}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text
          variant="bodySmall"
          color={disabled ? 'textDisabled' : 'textSecondary'}
          numberOfLines={1}
          {...inner}
        >
          {value}
        </Text>
      ) : null}

      {trailing}

      {/*
        `iconDisabled` is ink-700 in dark; the artboard draws ink-600. One ramp
        step quieter, taken deliberately: the chevron is an affordance, not
        information, and this matches `OptionRow` so the two rows cannot render
        a different chevron while both exist.
      */}
      {showChevron ? <Icon name="chevronRight" color={colors.iconDisabled} size={CHEVRON} /> : null}
    </>
  );

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3.5],
    // 40pt plate + 28pt of padding = 68. Well over the 44pt floor with no slop,
    // which is correct for rows that stack directly against one another: slop
    // here would blur the boundary between two adjacent settings.
    minHeight: PLATE + 2 * spacing[3.5],
  };

  if (!pressable) {
    return (
      <View testID={testID} style={[rowStyle, style]} className={className}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      {...interactiveA11y(
        {
          accessibilityLabel: accessibilityLabel ?? title,
          accessibilityHint: accessibilityHint ?? hint,
        },
        { disabled },
      )}
      style={[
        rowStyle,
        // Press feedback is a BACKGROUND STEP, never an opacity fade — the
        // artboard's `hover:bg-ink-800` on an `ink-900` panel. See
        // `internal/use-pressed.ts` for why opacity is banned on this palette.
        pressed ? { backgroundColor: colors.tilePressed } : null,
        style,
      ]}
      className={className}
    >
      {body}
    </Pressable>
  );
}
