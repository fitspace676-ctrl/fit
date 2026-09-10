import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE, interactiveA11y } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { Mono, Text } from '../primitives/text';
import { spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

// ===========================================================================
// ONE DAY IN THE WEEK STRIP.
//
// `mobile-classes.tsx:249-274` — seven of these across the top of the classes
// screen:
//
//   h-[76px] w-[50px] rounded-[22px], flex-col, gap-1, centred
//   selected  bg-brand-300 text-ink-950
//   idle      bg-ink-900   text-ink-300   (pressed: bg-ink-800)
//   weekday   11 / 600, plainly set
//   date      mono 19 / 700, leading-none
//   dot       h-1.5 w-1.5 — transparent · ink-950 when selected · ink-600
//
// ---------------------------------------------------------------------------
// `accessibilityLabel` IS REQUIRED, AND IT MUST SPELL THE DATE OUT.
//
// What is on screen is "ხუთ", "6" and a dot. Read aloud that is "khut, six" —
// an abbreviation a screen reader will spell, a bare numeral with no month, and
// then silence, because the dot is a `<View>` with no text in it at all. And
// the dot is not decoration: it is the ONLY thing that says whether the day has
// any classes, which is the single fact a member is scanning this strip for.
//
// So the whole sentence is a required prop — "Thursday 6, 4 classes" — because
// the month, the language, the plural rule and the count are all app
// knowledge. There is no correct default for this component to fall back to,
// which is exactly why it is not optional.
//
// ---------------------------------------------------------------------------
// THE DOT IS ALWAYS RENDERED, AND TRANSPARENT WHEN THE DAY IS EMPTY.
//
// The artboard does the same (`bg-transparent`), and it matters: the cell
// centres its three children in a fixed 76pt box, so dropping the dot on empty
// days would shift the weekday and the date up by 10pt on those days only, and
// the strip would visibly jitter as the week changed. It is inside the cell's
// single accessibility node, so it announces nothing either way — the count is
// in `accessibilityLabel`.
// ---------------------------------------------------------------------------
// ===========================================================================

const WIDTH = 50;
const HEIGHT = 76;

/**
 * The cell's width, exported.
 *
 * `ScrollRail`'s `scrollToIndex` cannot measure a child it was not told about
 * — that is the trade for not being a `FlatList` — so the week strip has to
 * hand it the cell width. Re-typing `50` at the call site is exactly the drift
 * this package exists to prevent: change `WIDTH` here and a literal there
 * silently starts centring on the wrong cell.
 */
export const DAY_CELL_WIDTH = WIDTH;

/** `h-1.5 w-1.5`. */
const DOT = 6;

/** The mono ladder has no 19 step; see the note in `stat-tile.tsx`. */
const DATE_SIZE = 19;

export interface DayCellProps {
  /** The abbreviated weekday — "ხუთ". Copy, so it is the caller's. */
  weekday: string;

  /** The day of the month, already formatted — "6". */
  date: string;

  /**
   * REQUIRED. The whole spoken sentence — "Thursday 6, 4 classes". See the
   * header: nothing on screen can be composed into this.
   */
  accessibilityLabel: string;

  /**
   * Does the day have any classes? Drives the dot, and nothing else.
   * The COUNT belongs in {@link accessibilityLabel}.
   */
  hasClasses?: boolean;

  /** Reflected as `accessibilityState.selected`, never as a changed label. */
  selected?: boolean;

  onPress?: () => void;

  disabled?: boolean;

  /**
   * Forwarded to the root node. The dot is reachable as `${testID}-dot`, so a
   * test can assert the one piece of information that has no text.
   */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** A day in the classes screen's week strip. */
export function DayCell({
  weekday,
  date,
  accessibilityLabel,
  hasClasses = false,
  selected = false,
  onPress,
  disabled = false,
  testID,
  style,
  className,
}: DayCellProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  // Press feedback as a BACKGROUND STEP along the same ramp, never opacity:
  // idle `ink-900 → ink-800` is the artboard's own `hover:`, and selected
  // `brand-300 → brand-200` is the step the design uses on every other lime
  // control. A lime at 70% over warm charcoal reads as olive, not as a dimmer
  // lime — see `internal/use-pressed.ts`.
  const background = selected
    ? pressed
      ? colors.accentHover
      : colors.accent
    : pressed
      ? colors.tilePressed
      : colors.backgroundCard;

  // `disabled` has to be VISIBLE, not only unpressable. The classes rail never
  // disables a cell — every week has a schedule — but the join funnel's
  // start-date strip does: the gym's `startDatePolicy` puts a hard window round
  // what a buyer may pick, and days outside it are drawn so the buyer can see
  // that Monday exists and is not on offer. Left undimmed, that is a cell that
  // looks pressable, does nothing, and says nothing about why.
  //
  // `textDisabled` is the package's own answer everywhere else — `Chip`,
  // `Segmented`, `ListRow`, `ProductRow`, `QtyStepper` and `TextField` all
  // reach for it — rather than an opacity fade, which on this palette dims a
  // lime to olive instead of to a paler lime.
  const foreground = disabled ? 'textDisabled' : selected ? 'onAccent' : 'onGhost';

  const dotColor = !hasClasses ? 'transparent' : selected ? colors.onAccent : colors.textDisabled;

  const content = (
    <>
      {/*
        `text-[11px] font-semibold`, plainly set. `label` is the only 11px role
        and it is small-caps: uppercase plus 0.12em. Both switches are turned
        off here — the tracking is wrong at this width, and the uppercase would
        silently render an English "Thu" as "THU", transforming the caller's
        copy. Same trade `Pill` documents.
      */}
      <Text
        variant="label"
        color={foreground}
        {...DECORATIVE}
        style={{ textTransform: 'none', letterSpacing: 0 }}
      >
        {weekday}
      </Text>
      <Mono
        variant="monoLarge"
        color={foreground}
        {...DECORATIVE}
        style={{ fontSize: DATE_SIZE, lineHeight: DATE_SIZE }}
      >
        {date}
      </Mono>
      <View
        testID={testID === undefined ? undefined : `${testID}-dot`}
        {...DECORATIVE}
        style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: dotColor }}
      />
    </>
  );

  const cellStyle: ViewStyle = {
    width: WIDTH,
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    borderRadius: clampRadiusTo(22, WIDTH),
    backgroundColor: background,
  };

  if (onPress === undefined) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        style={[cellStyle, style]}
        className={className}
      >
        {content}
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
      // 50 × 76 already clears the floor, so this resolves to zero on every
      // side today. It is applied anyway, from the shorter side, so that a
      // later change to WIDTH cannot quietly drop the cell under 44.
      hitSlop={hitSlopFor(Math.min(WIDTH, HEIGHT))}
      {...interactiveA11y({ accessibilityLabel }, { disabled, selected })}
      style={[cellStyle, style]}
      className={className}
    >
      {content}
    </Pressable>
  );
}
