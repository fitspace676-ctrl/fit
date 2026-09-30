import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { interactiveA11y } from '../internal/a11y';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// A SINGLE CHOICE AMONG A FEW, ALL OF THEM VISIBLE.
//
// ---------------------------------------------------------------------------
// THIS COMPONENT HAS NO MOBILE ARTBOARD CONSUMER, AND THAT SHAPED IT.
//
// Not one of the six mobile comps contains a segmented control. It appears in
// `design-system.tsx:427` — the gallery — and nowhere else, and the gallery
// predates the August "Lime Block" repaint: it draws an `ink-950` track with an
// `ink-800` selected segment and an 8px radius, which is the pre-repaint
// vocabulary (the repaint moved every "which one am I on" cue onto the lime).
//
// So the visual comes from the post-repaint web control,
// `packages/ui-kit/src/segmented.tsx` — a capsule track on
// `background-muted` with the selected option in `accent`/`on-accent` — and
// the prop names come from there too, verbatim. Where the two sources
// disagree, the repainted one wins for the same reason the artboards beat the
// gallery elsewhere: it is the newer statement of the same direction.
//
// Kept deliberately minimal. A component with no comp behind it should not
// grow features on speculation; when a screen finally needs one, it will bring
// the comp with it.
// ---------------------------------------------------------------------------
//
// TWO DELIBERATE DEPARTURES FROM ui-kit, both forced by the platform:
//
//   · ui-kit's option is 2rem (32) tall inside 0.25rem of padding — a 40pt
//     control. That is under the 44pt floor on a touch screen, so the option
//     here is 36 and the track is 44. Each option still takes `hitSlopFor`,
//     which is 4 at 36.
//   · ui-kit implements a ROVING TABINDEX, so Tab enters the group at the
//     current value and Tab again leaves it. React Native has no tab order to
//     rove; the equivalent is `radiogroup` + `radio` roles, which is what
//     VoiceOver and TalkBack use to announce "2 of 3".
// ===========================================================================

/** The track's own padding. */
const PAD = spacing[1];

/** The option's height, and therefore the track's, at `PAD` × 2 more. */
const OPTION_HEIGHT = 36;

const TRACK_HEIGHT = OPTION_HEIGHT + 2 * PAD;

const GLYPH = 16;

/**
 * The two-line option: `spacing[16]` (64) for the track, as the join funnel's
 * package tabs draw it, so "სავარჯიშო პაკეტები" wraps instead of being cut.
 */
const TALL_TRACK_HEIGHT = spacing[16];
const TALL_OPTION_HEIGHT = TALL_TRACK_HEIGHT - 2 * PAD;
const TALL_OPTION_RADIUS = 22;
const TALL_TRACK_RADIUS = TALL_OPTION_RADIUS + PAD;

export interface SegmentedOption<T extends string> {
  value: T;
  /** The visible text, or the accessible name when `iconOnly` is set. */
  label: string;
  icon?: IconName;
  /** Show the icon alone, with `label` as the accessible name. */
  iconOnly?: boolean;
}

export interface SegmentedProps<T extends string> {
  /** The accessible name for the group as a whole. Required — rule 1. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  disabled?: boolean;
  /**
   * How many lines an option's label may take. Default `1`, the 44pt capsule.
   * `2` draws the 64pt track and wraps a long label onto a second line rather
   * than truncating it — for Georgian labels that do not fit a third of 350pt.
   */
  labelLines?: 1 | 2;
  /** Forwarded to the root; each option takes `${testID}-${option.value}`. */
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

interface OptionProps<T extends string> {
  option: SegmentedOption<T>;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  labelLines: 1 | 2;
  testID?: string;
}

function SegmentedItem<T extends string>({
  option,
  selected,
  disabled,
  onPress,
  labelLines,
  testID,
}: OptionProps<T>) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();
  const tall = labelLines > 1;
  const height = tall ? TALL_OPTION_HEIGHT : OPTION_HEIGHT;

  const foreground = disabled
    ? colors.textDisabled
    : selected
      ? colors.onAccent
      : pressed
        ? colors.textPrimary
        : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlopFor(height)}
      testID={testID}
      {...interactiveA11y(
        { accessibilityLabel: option.label, accessibilityRole: 'radio' },
        { disabled, selected },
      )}
      style={{
        flex: 1,
        height,
        minHeight: height,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[1.5],
        paddingHorizontal: tall ? spacing[2] : spacing[3],
        borderRadius: tall ? TALL_OPTION_RADIUS : OPTION_HEIGHT / 2,
        // The lime is the only chromatic thing in the control, which is what
        // makes "where am I" readable at a glance.
        ...(selected ? { backgroundColor: colors.accent } : {}),
      }}
    >
      {option.icon ? <Icon name={option.icon} color={foreground} size={GLYPH} /> : null}
      {option.iconOnly ? null : (
        <Text
          variant="bodySmall"
          color={foreground}
          numberOfLines={labelLines}
          align={tall ? 'center' : undefined}
          accessible={false}
          style={tall ? { flexShrink: 1 } : null}
        >
          {option.label}
        </Text>
      )}
    </Pressable>
  );
}

/** The segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
  labelLines = 1,
  testID,
  style,
  className,
}: SegmentedProps<T>) {
  const colors = useThemeColors();
  const tall = labelLines > 1;
  const trackHeight = tall ? TALL_TRACK_HEIGHT : TRACK_HEIGHT;

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[0.5],
          padding: PAD,
          height: trackHeight,
          minHeight: trackHeight,
          borderRadius: tall ? TALL_TRACK_RADIUS : TRACK_HEIGHT / 2,
          backgroundColor: colors.backgroundMuted,
        },
        style,
      ]}
      className={className}
    >
      {options.map((option) => (
        <SegmentedItem
          key={option.value}
          option={option}
          selected={option.value === value}
          disabled={disabled}
          labelLines={labelLines}
          onPress={() => {
            onChange(option.value);
          }}
          testID={testID ? `${testID}-${option.value}` : undefined}
        />
      ))}
    </View>
  );
}
