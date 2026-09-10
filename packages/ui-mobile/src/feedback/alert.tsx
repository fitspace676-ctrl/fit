import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { clampRadius } from '../internal/clamp-radius';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import type { ColorValue } from '../primitives/icon/types';
import { Text } from '../primitives/text';
import type { ColorRole } from '../tokens/semantic';
import { layout, spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

import { weightedType } from './feedback-metrics';

// ===========================================================================
// THE ADVISORY LAYER: a boxed `Alert` and an unboxed `InlineNote`.
//
// Both say the same kind of thing — "cancellation closes two hours before the
// class", "your plan ends in eight days" — and the artboards draw them
// differently depending on whether the sentence is standing on its own
// (`design-system.tsx:681`, a bordered box on a panel) or hanging under
// something it qualifies (`mobile-class-detail.tsx:296-303`, no shell at all,
// just a lime bolt and a line of muted text).
//
// They are two components rather than one `boxed` prop because the difference
// is not decoration: the boxed one has a TITLE and the inline one cannot,
// since a title inside a borderless run of body text is indistinguishable from
// the paragraph above it.
//
// ---------------------------------------------------------------------------
// THE `alert` ROLE, AND WHY `accessibilityLiveRegion` IS A PROP.
//
// `accessibilityRole="alert"` is always set: it tells the screen reader what
// kind of thing this is when the user navigates onto it. `accessibilityLiveRegion`
// is different — it INTERRUPTS, announcing the node the moment it appears,
// whether or not focus is anywhere near it. On a screen that renders a
// standing advisory ("cancellation closes 2h before"), a live region re-reads
// that sentence on every re-render of the screen, which is unusable.
//
// So the interruption is opt-in and named for the condition the plan states:
// `live` is set when the alert appeared IN RESPONSE TO AN ACTION. The screen
// knows that; the component cannot.
// ---------------------------------------------------------------------------

/** The four advisory tones. */
export type AlertTone = 'info' | 'warning' | 'danger' | 'success';

/**
 * Tone -> fill, border, glyph and type colours.
 *
 * THERE IS NO AMBER IN THIS PALETTE, and `warning` is not a colour here — the
 * token layer maps the `warning` role onto the ink ramp, deliberately, because
 * the direction's only chromatic accents are one lime and one red. So
 * `warning` is drawn as `info` with its contrast turned up: a brighter border
 * and a full-strength glyph, which is exactly what `design-system.tsx:683-685`
 * does (`border-ink-700` against `border-ink-800`).
 */
const TONES = {
  info: {
    background: 'backgroundSurface',
    border: 'border',
    icon: 'iconSecondary',
    title: 'textPrimary',
    body: 'textSecondary',
    defaultIcon: 'info',
  },
  warning: {
    background: 'backgroundSurface',
    border: 'borderEmphasized',
    icon: 'iconPrimary',
    title: 'textPrimary',
    body: 'textSecondary',
    defaultIcon: 'bolt',
  },
  danger: {
    background: 'backgroundRed',
    border: 'borderRed',
    icon: 'iconRed',
    title: 'textRed',
    body: 'textRed',
    defaultIcon: 'info',
  },
  success: {
    background: 'booked',
    border: 'bookedBorder',
    icon: 'accent',
    title: 'onBooked',
    body: 'onBooked',
    defaultIcon: 'check',
  },
} as const satisfies Record<
  AlertTone,
  {
    background: ColorRole;
    border: ColorRole;
    icon: ColorRole;
    title: ColorRole;
    body: ColorRole;
    defaultIcon: IconName;
  }
>;

/** The glyph size in both components — `h-4 w-4` on every artboard advisory. */
export const ADVISORY_ICON_SIZE = spacing[4];

/**
 * The 2pt the glyph is nudged down by, to sit on the first line's x-height.
 *
 * `mt-0.5` on the artboards. It is optical, not structural: `alignItems:
 * 'flex-start'` puts the 16pt glyph's TOP against the 18pt line box's top,
 * which leaves the glyph visibly high.
 */
const ICON_OPTICAL_NUDGE = spacing[0.5];

export interface AlertProps {
  /**
   * REQUIRED. Package rule 1 — the component ships no copy, and an advisory
   * with no sentence in it is not an advisory.
   */
  title: string;
  /** The supporting line under the title. */
  body?: string;
  /** Default `'info'`. */
  tone?: AlertTone;
  /** Overrides the tone's own glyph. */
  icon?: IconName;
  /**
   * Announce this the moment it appears, interrupting whatever is being read.
   *
   * Set it when the alert is the RESULT OF AN ACTION ("that card was
   * declined"). Leave it off for a standing advisory, which would otherwise be
   * re-announced on every re-render of the screen around it.
   */
  live?: boolean;
  /** Anything richer than a `body` line — a button, a second paragraph. */
  children?: ReactNode;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** A bordered advisory box: glyph, title, supporting line. */
export function Alert({
  title,
  body,
  tone = 'info',
  icon,
  live = false,
  children,
  testID,
  style,
  className,
}: AlertProps) {
  const colors = useThemeColors();
  const spec = TONES[tone];

  return (
    <View
      testID={testID}
      // GROUPED INTO ONE NODE — but only while there is nothing to press
      // inside it. `accessible` on a container collapses its whole subtree
      // into a single element, which is exactly right for a glyph + title +
      // body (they are one sentence, and announcing them as three is how an
      // advisory becomes three separate swipes) and exactly wrong the moment
      // `children` holds a button, because a collapsed subtree has no
      // focusable descendants and the button becomes unreachable.
      accessible={children ? undefined : true}
      accessibilityRole="alert"
      {...(live ? { accessibilityLiveRegion: 'polite' as const } : {})}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing[3],
          // 26 — `container`, the panel rung. An advisory is a small card, and
          // giving it its own literal would be a seventh rung on a six-rung
          // ladder.
          borderRadius: clampRadius('container'),
          padding: spacing[3.5],
          borderWidth: layout.hairline,
          backgroundColor: colors[spec.background],
          borderColor: colors[spec.border],
        },
        style,
      ]}
      className={className}
    >
      <Icon
        name={icon ?? spec.defaultIcon}
        color={spec.icon}
        size={ADVISORY_ICON_SIZE}
        style={{ marginTop: ICON_OPTICAL_NUDGE }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* 13/600 and 12/400 — two pairings the scale does not carry. See
            `weightedType` for why the weight moves and nothing else does. */}
        <Text color={spec.title} style={weightedType('bodySmall', '600')}>
          {title}
        </Text>
        {body ? (
          <Text
            color={spec.body}
            style={[weightedType('caption', '400'), { marginTop: spacing[0.5] }]}
          >
            {body}
          </Text>
        ) : null}
        {children ? <View style={{ marginTop: spacing[2.5] }}>{children}</View> : null}
      </View>
    </View>
  );
}

export interface InlineNoteProps {
  /** REQUIRED. The sentence itself. */
  children: ReactNode;
  /** Default `'bolt'` — the artboards' own advisory glyph. */
  icon?: IconName;
  /** Default `'accent'`. The lime bolt is the whole visual signal here. */
  iconColor?: ColorValue;
  /** Default `'textSecondary'`. */
  color?: ColorValue;
  /** See {@link AlertProps.live}. */
  live?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/**
 * A shell-less advisory: a lime glyph and a line of muted text.
 *
 * Transcribed from `mobile-class-detail.tsx:296-303` — `items-start gap-2`, a
 * 16pt `bolt` in `brand-300`, and 13/400 `leading-relaxed` in `ink-400`, which
 * is `bodySmall` exactly, so nothing here needs re-weighting.
 */
export function InlineNote({
  children,
  icon = 'bolt',
  iconColor = 'accent',
  color = 'textSecondary',
  live = false,
  testID,
  style,
  className,
}: InlineNoteProps) {
  return (
    <View
      testID={testID}
      // One node: the glyph is decorative and the line is the whole message.
      accessible
      accessibilityRole="alert"
      {...(live ? { accessibilityLiveRegion: 'polite' as const } : {})}
      style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }, style]}
      className={className}
    >
      <Icon
        name={icon}
        color={iconColor}
        size={ADVISORY_ICON_SIZE}
        style={{ marginTop: ICON_OPTICAL_NUDGE }}
      />
      <Text variant="bodySmall" color={color} style={{ flex: 1, minWidth: 0 }}>
        {children}
      </Text>
    </View>
  );
}
