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
  testID?: string;
}

function SegmentedItem<T extends string>({
  option,
  selected,
  disabled,
  onPress,
  testID,
}: OptionProps<T>) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

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
      hitSlop={hitSlopFor(OPTION_HEIGHT)}
      testID={testID}
      {...interactiveA11y(
        { accessibilityLabel: option.label, accessibilityRole: 'radio' },
        { disabled, selected },
      )}
      style={{
        flex: 1,
        height: OPTION_HEIGHT,
        minHeight: OPTION_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[1.5],
        paddingHorizontal: spacing[3],
        borderRadius: OPTION_HEIGHT / 2,
        // The lime is the only chromatic thing in the control, which is what
        // makes "where am I" readable at a glance.
        ...(selected ? { backgroundColor: colors.accent } : {}),
      }}
    >
      {option.icon ? <Icon name={option.icon} color={foreground} size={GLYPH} /> : null}
      {option.iconOnly ? null : (
        <Text variant="bodySmall" color={foreground} numberOfLines={1} accessible={false}>
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
  testID,
  style,
  className,
}: SegmentedProps<T>) {
  const colors = useThemeColors();

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
          height: TRACK_HEIGHT,
          minHeight: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
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
          onPress={() => {
            onChange(option.value);
          }}
          testID={testID ? `${testID}-${option.value}` : undefined}
        />
      ))}
    </View>
  );
}
