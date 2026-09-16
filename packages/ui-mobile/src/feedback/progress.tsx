import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { resolveColor } from '../primitives/icon/icon';
import type { ColorValue } from '../primitives/icon/types';
import { Mono } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import { useThemeColors } from '../tokens/theme';

import {
  PIP_COUNT,
  PIP_GAP,
  PIP_HEIGHT,
  PIP_WIDTH,
  PROGRESS_BAR_HEIGHT,
  RING_RADIUS,
  RING_SIZE,
  RING_STROKE,
  RING_TRACK_OPACITY,
  RING_VIEWBOX,
  clampToRange,
  occupancyPercent,
  occupancyTone,
  progressFraction,
  progressPercent,
  ringDashArray,
  type OccupancyTone,
} from './feedback-metrics';

// ===========================================================================
// FOUR WAYS OF DRAWING ONE NUMBER, AND ONE A11Y CONTRACT ACROSS ALL FOUR.
//
// A bar, a ring, three pips and the occupancy meter that wraps the bar. Every
// one of them is `accessibilityRole="progressbar"` with an
// `accessibilityValue` of `{min, max, now}`, and every one of them clamps
// `now` into its own range before announcing it — see `clampToRange` in
// `feedback-metrics.ts` for why an unclamped `now` is a bug that is invisible
// on screen and wrong in both screen readers.
//
// ---------------------------------------------------------------------------
// GALLERY vs ARTBOARD, TWICE, AND THE ARTBOARDS WIN BOTH.
//
//   TRACK HEIGHT. `design-system.tsx:191` draws the occupancy track at `h-1`
//   (4). Both shipping artboards draw it at `h-2` (8) —
//   `mobile-class-detail.tsx:177` and `mobile-profile.tsx:203`. The gallery
//   predates the August "Lime Block" repaint, so 8 wins, and it is the default
//   rather than a magic literal (`PROGRESS_BAR_HEIGHT`).
//
//   THE FILL RAMP. The gallery's `Occupancy` and the class-detail artboard
//   agree on `bg-danger-500 / bg-ink-400 / bg-brand-300`, so there is no
//   conflict in the RULE — only in the height. The three colours arrive here
//   as semantic roles, and the danger arm therefore resolves to WP-1's `error`
//   (danger-400 in dark mode) rather than to a literal `danger-500`. That is
//   the token layer's decision, made once, and `Button`'s `destructive`
//   variant already resolves the identical conflict the identical way; two
//   different reds for "over capacity" and "delete this" would be worse than
//   one red that is one ramp step off the comp.
// ---------------------------------------------------------------------------

/** The four fills a bar can take. */
export type ProgressTone = OccupancyTone | 'onAccent';

/**
 * Tone -> [track, fill].
 *
 * `onAccent` is the membership block's bar (`mobile-profile.tsx:203`): the bar
 * is drawn ON the lime, so its track is ink at 15% and its fill is solid ink.
 * The track is the only literal colour in this file — see `ON_LIME_TRACK`.
 */
const TONES = {
  accent: { track: 'backgroundMuted', fill: 'accent' },
  ink: { track: 'backgroundMuted', fill: 'iconSecondary' },
  danger: { track: 'backgroundMuted', fill: 'error' },
  onAccent: { track: null, fill: 'onAccent' },
} as const satisfies Record<ProgressTone, { track: ColorRole | null; fill: ColorRole }>;

/**
 * `bg-ink-950/15`, written out.
 *
 * THE ONE LITERAL COLOUR IN THIS FILE, and it is the same exception
 * `forms/button.tsx` makes for `onAccentQuiet`, for the same reason: this
 * track only ever sits ON the lime block, and the lime block is
 * mode-independent (`accent` is `brand-300` in both arms of the semantic map).
 * A role would resolve differently in light mode and repaint a surface that
 * does not change.
 *
 * It is NOT in `RGBA_ALLOWLIST` — that list guards `tokens/semantic.ts`, and
 * a hole punched in it would weaken the drift guard for every role. A
 * component-level literal with the artboard line number next to it is the
 * smaller cost.
 */
const ON_LIME_TRACK = 'rgba(19, 19, 18, 0.15)';

export interface ProgressBarProps {
  /** Where the bar is. Clamped into `[min, max]` for both paint and speech. */
  value: number;
  /** Default 0. */
  min?: number;
  /** Default 100. */
  max?: number;
  /** Default `'accent'`. */
  tone?: ProgressTone;
  /** Default 8 — `h-2`, which is what both artboards draw. */
  height?: number;
  /**
   * REQUIRED. Package rule 1: no component ships copy. A bar with no name is
   * announced by iOS as "42 percent" of nothing at all.
   */
  accessibilityLabel: string;
  /**
   * What the screen reader says INSTEAD of the raw percentage — "14 of 20
   * booked". Optional, because the percentage is usually the right thing.
   */
  accessibilityValueText?: string;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * A horizontal track with a filled portion.
 *
 * `overflow: 'hidden'` on the track plus a capsule radius on BOTH track and
 * fill: the fill needs its own radius so that a 3%-wide fill is a lozenge
 * rather than a clipped sliver, and the track needs `overflow` so a fill
 * rounded at both ends does not poke past the right-hand cap.
 */
export function ProgressBar({
  value,
  min = 0,
  max = 100,
  tone = 'accent',
  height = PROGRESS_BAR_HEIGHT,
  accessibilityLabel,
  accessibilityValueText,
  testID,
  style,
  className,
}: ProgressBarProps) {
  const colors = useThemeColors();
  const spec = TONES[tone];
  const now = clampToRange(value, min, max);
  const fraction = progressFraction(value, min, max);
  const radius = clampRadiusTo('full', height);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min,
        max,
        now,
        ...(accessibilityValueText ? { text: accessibilityValueText } : {}),
      }}
      style={[
        {
          height,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: spec.track ? colors[spec.track] : ON_LIME_TRACK,
        },
        style,
      ]}
      className={className}
    >
      <View
        {...DECORATIVE}
        style={{
          // A percentage rather than a measured width: the bar's own width is
          // whatever its parent gives it, and measuring it would cost a frame
          // of "empty bar" on every mount.
          width: `${fraction * 100}%`,
          height: '100%',
          borderRadius: radius,
          backgroundColor: colors[spec.fill],
        }}
      />
    </View>
  );
}

export interface OccupancyMeterProps {
  booked: number;
  capacity: number;
  /** Default 8. */
  height?: number;
  /** REQUIRED. "Spaces", "Booked" — the caller's word for what is filling up. */
  accessibilityLabel: string;
  /** "14 of 20 booked". Strongly recommended: 70% is not what a member asks. */
  accessibilityValueText?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/**
 * A {@link ProgressBar} whose tone is decided by {@link occupancyTone}.
 *
 * This exists so that no screen ever writes the thresholds down. Three
 * artboards draw this meter and each one restated the rule inline; restating
 * it a fourth time in a screen is how the boundary drifts.
 */
export function OccupancyMeter({
  booked,
  capacity,
  height,
  accessibilityLabel,
  accessibilityValueText,
  testID,
  style,
  className,
}: OccupancyMeterProps) {
  return (
    <ProgressBar
      value={occupancyPercent(booked, capacity)}
      tone={occupancyTone(booked, capacity)}
      height={height}
      accessibilityLabel={accessibilityLabel}
      accessibilityValueText={accessibilityValueText}
      testID={testID}
      style={style}
      className={className}
    />
  );
}

export interface ProgressRingProps {
  value: number;
  /** Default 0. */
  min?: number;
  /** Default 100. */
  max?: number;
  /** Rendered edge length. Default 56 — the artboards' `h-14 w-14`. */
  size?: number;
  /**
   * Arc, track and centred figure, all three. Default `'accent'`.
   *
   * ONE colour, not three: the artboard's ring is drawn in `currentColor`
   * throughout and separates the arc from the track with opacity alone
   * (`mobile-home-v2.tsx:59-92`). That is what lets the same ring sit on a
   * charcoal card in lime and on the lime block in ink without a second set of
   * props.
   */
  color?: ColorValue;
  /** Draw the percentage in the middle. Default true. */
  showValue?: boolean;
  /** REQUIRED. */
  accessibilityLabel: string;
  /** Spoken instead of the percentage — "22 of 30 days left". */
  accessibilityValueText?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/**
 * The billing-period donut.
 *
 * ---------------------------------------------------------------------------
 * THE FIGURE IN THE MIDDLE IS AN RN `<Mono>`, NOT AN SVG `<text>`.
 *
 * The artboard draws it as `<text class="font-mono text-[11px]">` inside the
 * 48-unit viewBox, which the browser then scales with the SVG. Ported
 * literally that is wrong twice over: `react-native-svg`'s `Text` does not
 * pick up a bundled family without being handed `fontFamily` explicitly (the
 * Android rule in `tokens/fonts.ts`), and 11 SVG units scaled by 56/48 is
 * 12.8 real points — a size that is on nobody's scale.
 *
 * Overlaying a real `<Mono variant="monoSmall">` (13/700, tabular) gives the
 * token layer's own nearest step at its true rendered size, gets the bundled
 * JetBrains face for free, and scales with the user's text-size setting, which
 * an SVG glyph does not.
 * ---------------------------------------------------------------------------
 */
export function ProgressRing({
  value,
  min = 0,
  max = 100,
  size = RING_SIZE,
  color = 'accent',
  showValue = true,
  accessibilityLabel,
  accessibilityValueText,
  testID,
  style,
  className,
}: ProgressRingProps) {
  const colors = useThemeColors();
  const stroke = resolveColor(color, colors);
  const now = clampToRange(value, min, max);
  const [dash, circumference] = ringDashArray(progressFraction(value, min, max));
  const percent = progressPercent(value, min, max);
  const centre = RING_VIEWBOX / 2;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min,
        max,
        now,
        ...(accessibilityValueText ? { text: accessibilityValueText } : {}),
      }}
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      className={className}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`}>
        <Circle
          cx={centre}
          cy={centre}
          r={RING_RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={RING_STROKE}
          opacity={RING_TRACK_OPACITY}
        />
        <Circle
          cx={centre}
          cy={centre}
          r={RING_RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          // Twelve o'clock, not three. Without this the arc starts on the
          // right-hand side and a 25%-full ring reads as three-quarters empty
          // in the wrong quadrant.
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      </Svg>
      {showValue ? (
        <View {...DECORATIVE} style={{ position: 'absolute' }}>
          <Mono variant="monoSmall" color={color}>{`${percent}%`}</Mono>
        </View>
      ) : null}
    </View>
  );
}

export interface PipsProps {
  /** How many segments are lit. Clamped into `[0, total]`. */
  filled: number;
  /** Default 3 — the PT-credit strip. */
  total?: number;
  /** The lit segment. Default `'textPrimary'` (white on the artboard). */
  color?: ColorValue;
  /** The unlit segment. Default `'borderEmphasized'` (`ink-700`). */
  emptyColor?: ColorValue;
  /** REQUIRED. "PT credits" — the pips themselves say nothing. */
  accessibilityLabel: string;
  /** "2 of 3 used". */
  accessibilityValueText?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/**
 * A discrete count, drawn as segments — `mobile-home-v2.tsx:291-294`.
 *
 * A bar would be wrong here and the artboard knows it: two of three PT credits
 * is not "67% of a continuous quantity", it is two things out of three, and a
 * member counts the lit blocks. `accessibilityValue` therefore announces
 * `{min: 0, max: total, now: filled}` rather than a percentage.
 */
export function Pips({
  filled,
  total = PIP_COUNT,
  color = 'textPrimary',
  emptyColor = 'borderEmphasized',
  accessibilityLabel,
  accessibilityValueText,
  testID,
  style,
  className,
}: PipsProps) {
  const colors = useThemeColors();
  const count = Number.isFinite(total) && total > 0 ? Math.floor(total) : PIP_COUNT;
  const now = clampToRange(filled, 0, count);
  const lit = resolveColor(color, colors);
  const unlit = resolveColor(emptyColor, colors);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: count,
        now,
        ...(accessibilityValueText ? { text: accessibilityValueText } : {}),
      }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: PIP_GAP }, style]}
      className={className}
    >
      {Array.from({ length: count }, (_unused, index) => (
        <View
          key={index}
          {...DECORATIVE}
          style={{
            width: PIP_WIDTH,
            height: PIP_HEIGHT,
            borderRadius: clampRadiusTo('full', PIP_HEIGHT),
            backgroundColor: index < now ? lit : unlit,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The occupancy tone as a semantic role, for a screen that needs to colour
 * something OTHER than a bar with it — the "3 spots left" line beside the
 * meter on `mobile-class-detail.tsx:172`, for instance.
 *
 * Exported so that the one mapping from tone to role lives here, next to the
 * bar that uses it, rather than being re-guessed at the call site.
 *
 * `textAccent`, NOT `accent`, and the difference only shows in light mode.
 * `accent` is the BLOCK lime — brand-300 in both maps, because the membership
 * card is the same colour whichever theme you are in. As ink on a light card
 * that is 1.22:1: "6 spots left" was legible in dark and all but invisible in
 * light (`/classes/<id>`, 2026-09-09). `textAccent` is the role that exists for
 * exactly this — lime used as ink, which light drops to brand-800 (5.43:1 on
 * white) and dark leaves at brand-300. So in dark mode this is the same pixel
 * value it always was; see `tokens/semantic.ts:112`.
 */
export const OCCUPANCY_TONE_ROLE = {
  accent: 'textAccent',
  ink: 'iconSecondary',
  danger: 'error',
} as const satisfies Record<OccupancyTone, ColorRole>;
