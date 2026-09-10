import { View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Text } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// AN ACHIEVEMENT, EARNED OR NOT.
//
// `mobile-profile.tsx:281-297` — a horizontal rail of five:
//
//   w-[112px] rounded-[22px] p-4, centred
//   earned    bg-white   text-ink-950   circle h-11 w-11 bg-ink-950 text-brand-300
//   unearned  bg-ink-900 text-ink-500   circle h-11 w-11 bg-ink-800 text-ink-600
//   20px glyph, then mt-3  12 / 600, leading-tight
//
// ---------------------------------------------------------------------------
// THE COLOUR SWAP IS THE ONLY CUE, SO IT NEEDS AN `accessibilityValue`.
//
// Earned and unearned differ by nothing but their fill. There is no badge, no
// checkmark, no strikethrough and no second glyph — a screen reader walking
// this rail hears five identical announcements, and a member who cannot
// distinguish the two greys hears the same thing they see. So the state has to
// be spoken, and the word for it is copy: "earned" / "locked" in the viewer's
// language, which this package does not have. Hence `statusLabel`, required.
//
// It is surfaced as `accessibilityValue.text` rather than glued onto the label
// because a VALUE is what it is: the tile's name does not change when the
// achievement is won, only its state does — and a label that flips between
// "10 visits" and "10 visits, earned" is a label the user cannot search for.
//
// ---------------------------------------------------------------------------
// THE WHITE IS MODE-INDEPENDENT. Same trade, same reasoning, as
// `DurationBadge` — see the note in that file. `onDark`/`onLight` are fixed in
// both maps, which is exactly the artboard; v1 is dark-only (decision Q5).
// ---------------------------------------------------------------------------
// ===========================================================================

/** `w-[112px]`. Fixed, because these sit in a horizontal rail. */
const WIDTH = 112;

/** `h-11 w-11`. */
const PLATE = 44;

/** `h-5 w-5` inside the plate. */
const PLATE_GLYPH = 20;

/**
 * The two states, as data.
 *
 * `textDisabled` is ink-600 in dark: the artboard's `text-ink-600` glyph
 * exactly, and one ramp step quieter than the `text-ink-500` it uses for the
 * unearned label. Taken deliberately — the label and the glyph inside an
 * unearned tile should be the same colour, and the quieter of the two readings
 * is the one that keeps a locked achievement from competing with an earned one
 * in the same rail.
 */
const STATES = {
  earned: { tile: 'onDark', text: 'onLight', plate: 'onAccent', glyph: 'accent' },
  locked: { tile: 'backgroundCard', text: 'textDisabled', plate: 'quiet', glyph: 'textDisabled' },
} as const satisfies Record<
  string,
  { tile: ColorRole; text: ColorRole; plate: ColorRole; glyph: ColorRole }
>;

export interface AchievementTileProps {
  /** The achievement's name — "10 ვიზიტი". Required; copy is the caller's. */
  label: string;

  /**
   * REQUIRED. The spoken state — "earned" / "locked", in the viewer's
   * language. See the header: the colour swap is the only other cue there is.
   */
  statusLabel: string;

  /** Default `false`. */
  earned?: boolean;

  /** The glyph in the round plate. Decorative; `label` carries the meaning. */
  icon?: IconName;

  /** Overrides the spoken name, which defaults to {@link label}. */
  accessibilityLabel?: string;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** One badge in the profile's achievement rail. */
export function AchievementTile({
  label,
  statusLabel,
  earned = false,
  icon,
  accessibilityLabel,
  testID,
  style,
  className,
}: AchievementTileProps) {
  const colors = useThemeColors();
  const state = earned ? STATES.earned : STATES.locked;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={{ text: statusLabel }}
      style={[
        {
          width: WIDTH,
          alignItems: 'center',
          borderRadius: clampRadiusTo(22),
          padding: spacing[4],
          backgroundColor: colors[state.tile],
        },
        style,
      ]}
      className={className}
    >
      <View
        {...DECORATIVE}
        style={{
          width: PLATE,
          height: PLATE,
          borderRadius: PLATE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors[state.plate],
        }}
      >
        {icon ? <Icon name={icon} color={colors[state.glyph]} size={PLATE_GLYPH} /> : null}
      </View>

      {/*
        `text-[12px] font-semibold leading-tight`. `caption` is the 12px role;
        only the weight is raised, and only because `caption` rides the system
        sans (`sansFamily('500')` is `undefined`) so raising it selects a real
        face rather than double-bolding a bundled one.
      */}
      <Text
        variant="caption"
        color={state.text}
        align="center"
        numberOfLines={2}
        {...DECORATIVE}
        style={{ marginTop: spacing[3], fontWeight: '600' }}
      >
        {label}
      </Text>
    </View>
  );
}
