import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { interactiveA11y } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import { hitSlopFor } from '../internal/hit-slop';
import { usePressed } from '../internal/use-pressed';
import { Icon } from '../primitives/icon/icon';
import type { IconName } from '../primitives/icon/paths';
import { Spinner } from '../primitives/spinner';
import { Text } from '../primitives/text';
import { sansFamily } from '../tokens/fonts';
import type { SurfaceRadius } from '../tokens/radii';
import type { ColorRole } from '../tokens/semantic';
import { layout, spacing } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';
import { type as typeRoles, type TypeRole } from '../tokens/typography';

// ===========================================================================
// THE TEXT BUTTON. `IconButton` is its icon-only sibling and already shipped;
// this is everything with a label on it.
//
// PROP NAMES MIRROR `packages/ui-kit/src/button.tsx`, deliberately — `label`,
// `variant`, `icon`, `fullWidth`, `disabled`, the same six variant names in
// the same order. A member-facing feature is built twice, once for the portal
// and once for the phone, usually in the same week; two components that do the
// same job under different prop names is a tax paid on every one of those.
//
// TWO NAMES DIVERGE, both because the platform forced it:
//
//   ui-kit `size: 'door'|'page'|'block'|'card'|'inline'`  →  `'sm'|'md'|'lg'`
//     Web named its sizes for the job (a 56px door, a 36px inline). The mobile
//     artboards only ever draw three heights — 29, 44 and 52 — and mapping
//     three onto five would leave two names with no comp behind them.
//
//   ui-kit `loading: boolean`                             →  `busy` + `busyLabel`
//     `busy` is what the platform calls it (`accessibilityState.busy`), and
//     the mobile control needs a SECOND string web does not: web's spinner
//     replaces the label with an animation the screen reader ignores, while
//     RN's `Spinner` requires an `accessibilityLabel` by package rule 1.
// ===========================================================================

/**
 * The six fills, in ui-kit's order.
 *
 * `pressed*` are the pressed pair. Every `hover:` class in the artboards
 * becomes a pressed BACKGROUND STEP, never an opacity fade — see
 * `internal/use-pressed.ts` for why that is load-bearing on this palette (a
 * translucent lime over warm charcoal goes olive).
 *
 *   primary        bg-brand-300 text-ink-950   hover:bg-brand-200   the CTA
 *   secondary      bg-ink-800   text-ink-200   hover:bg-ink-700     "clear"
 *   ghost          —            text-ink-300   hover:bg-ink-700     dismiss
 *   destructive    error fill,  onError text                        delete
 *   onAccent       bg-ink-950   text-brand-300                      on lime
 *   onAccentQuiet  ink @ 10%    text-ink-950                        on lime
 *
 * PRIMARY IS `brand-300` ON `ink-950`, NOT `brand-500` ON WHITE. The gallery
 * (`design-system.tsx:130`) still shows the latter; it predates the August
 * "Lime Block" repaint and the artboards win — all six agree, across nine
 * separate primary buttons. `IconButton` resolved the identical conflict the
 * same way, so the two controls cannot disagree.
 */
const VARIANTS = {
  primary: {
    bg: 'accent',
    fg: 'onAccent',
    pressedBg: 'accentHover',
    pressedFg: 'onAccent',
  },
  secondary: {
    bg: 'quiet',
    fg: 'onQuiet',
    pressedBg: 'borderEmphasized',
    pressedFg: 'textPrimary',
  },
  ghost: {
    bg: null,
    fg: 'onGhost',
    pressedBg: 'borderEmphasized',
    pressedFg: 'textPrimary',
  },
  destructive: {
    bg: 'error',
    fg: 'onError',
    // One step LIGHTER under the finger, the same direction `accent` goes:
    // darkening a fill on a charcoal canvas reads as "disabled", not "live".
    pressedBg: 'iconRed',
    pressedFg: 'onError',
  },
  onAccent: {
    bg: 'onAccent',
    fg: 'accent',
    pressedBg: 'backgroundCard',
    pressedFg: 'accentHover',
  },
  onAccentQuiet: {
    // See ON_ACCENT_QUIET below — this variant's fill is a literal, not a role.
    bg: null,
    fg: 'onAccent',
    pressedBg: 'onAccent',
    pressedFg: 'onAccent',
  },
} as const satisfies Record<
  string,
  { bg: ColorRole | null; fg: ColorRole; pressedBg: ColorRole; pressedFg: ColorRole }
>;

export type ButtonVariant = keyof typeof VARIANTS;

/**
 * `onAccentQuiet`'s wash, as literals.
 *
 * THE ONE PLACE IN THIS FILE THAT IS NOT A ROLE, and it is the same exception
 * `packages/ui-kit/src/button.tsx` makes for the same variant, for the same
 * reason: this button only ever sits ON the lime block, and the lime block is
 * mode-independent (`accent` is `brand-300` in both arms of the semantic map).
 * A role would resolve differently in light mode and repaint a surface that
 * does not change. Both values are members of `RGBA_ALLOWLIST` in
 * `tokens/semantic.ts`, so the drift guard still recognises them.
 */
const ON_ACCENT_QUIET = {
  bg: 'rgba(19, 19, 18, 0.10)',
  pressedBg: 'rgba(19, 19, 18, 0.16)',
  /**
   * THE EDGE, WHICH THE ARTBOARDS DO NOT DRAW AND THE CONTRAST FLOOR REQUIRES.
   *
   * A 10% ink wash on brand-300 measures **1.23:1**. WCAG 1.4.11 asks 3:1 for
   * the boundary of a user-interface component, and this is not a decorative
   * case: on the Membership card the freeze button is the card's ONLY action,
   * and at 1.23:1 it barely reads as a control at all — it reads as a slightly
   * darker patch of lime.
   *
   * Deepening the FILL to reach 3:1 would need ~48% ink, which is a different
   * button: a dark plate on lime, not the quiet wash the direction drew. The
   * boundary is what the criterion is about, so the boundary is what gets the
   * contrast. 55% ink over brand-300 measures **3.89:1** — margin over the
   * floor, and a 1pt hairline rather than a heavy outline.
   *
   * Mode-independent for the same reason the fill is: `accent` is `brand-300`
   * in both arms of the semantic map, so this surface never changes.
   */
  border: 'rgba(19, 19, 18, 0.55)',
} as const;

/**
 * DISABLED KEEPS THE SILHOUETTE.
 *
 * `ink-700` fill, `ink-400` text — not an opacity dim. The reason is the same
 * one that governs the pressed state: a translucent lime over warm charcoal
 * does not read as "a dimmer lime", it reads as a muddy olive, and the one
 * colour the product owns goes off-brand for as long as the form is
 * incomplete. A flat neutral fill says "not yet" without spending the accent.
 *
 * Expressed as roles rather than as `ink[700]` / `ink[400]` so light mode gets
 * the mirrored pair (ink-300 fill / ink-600 text) for free.
 */
const DISABLED = { bg: 'borderEmphasized', fg: 'textSecondary' } as const satisfies {
  bg: ColorRole;
  fg: ColorRole;
};

/** The three heights the artboards draw, and nothing else. */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Size → geometry.
 *
 * `height` and `padH` are transcribed: `h-[52px] px-8` on the class-detail
 * book button and the classes sheet's confirm, `h-[52px] px-7` on the shop's
 * variant CTA. `md` at 44 is the artboards' in-card action height (`h-11`),
 * and `sm` at 29 is the inline chip-sized action — the only one under the 44pt
 * floor, and therefore the only one that needs `hitSlopFor` (which it gets
 * automatically; there is deliberately no `hitSlop` prop for a call site to
 * forget).
 *
 * `radius` follows the CUT_* table in `tokens/radii.ts`: CUT_MD → `element`
 * (14) for the two large sizes, CUT_SM → `inner` (10) for `sm`. It matters at
 * `sm`: `clampRadiusTo(14, 29)` is `min(14, 14)` = 14, which on a 29pt box is
 * a full capsule and loses the octagonal silhouette entirely.
 */
const SIZES = {
  sm: { height: 29, padH: spacing[3.5], gap: spacing[1.5], glyph: 14, radius: 'inner' },
  md: { height: 44, padH: spacing[5], gap: spacing[2], glyph: 18, radius: 'element' },
  lg: { height: 52, padH: spacing[7], gap: spacing[2], glyph: 18, radius: 'element' },
} as const satisfies Record<
  ButtonSize,
  { height: number; padH: number; gap: number; glyph: number; radius: SurfaceRadius }
>;

/**
 * The label's type, per size.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT SIMPLY `<Text variant="body">`.
 *
 * The artboards set every primary button at `text-[15px] font-bold` — 15px at
 * weight 700. WP-1's scale has 15px at 400 (`bodyRegular`) and at 600 (`body`)
 * and nothing at 700, because `typography.ts` counted the sizes the artboards
 * use and folded single-occurrence roles into their neighbours.
 *
 * Overriding `fontWeight: '700'` on the `body` role would be wrong in a way
 * that is invisible on iOS and broken on Android: `body` rides the SYSTEM sans
 * (no `fontFamily`), and 700 has to select the BUNDLED `NotoSansGeorgian-Bold`
 * by name, because RN does not synthesise weights for a custom family on
 * Android and Roboto's own bold is visibly lighter than the direction's
 * headline weight (decision Q4). Setting both `fontFamily` and `fontWeight`
 * double-bolds on iOS.
 *
 * So the size/leading/tracking come from the scale — the three values that
 * must never drift — and the FACE is selected through `sansFamily`, which is
 * the token layer's own exported answer to "which family is weight w". Six
 * lines, in one place, rather than the same mistake at every call site.
 * ---------------------------------------------------------------------------
 */
function labelStyle(variant: TypeRole, weight: '500' | '600' | '700'): TextStyle {
  const role = typeRoles[variant];
  const family = sansFamily(weight);
  return {
    fontSize: role.fontSize,
    lineHeight: role.lineHeight,
    letterSpacing: role.letterSpacing,
    // Exactly one of the two, never both. See the header.
    ...(family ? { fontFamily: family, fontWeight: undefined } : { fontWeight: weight }),
  };
}

const LABEL_TYPE: Record<ButtonSize, TextStyle> = {
  // 12/600 on a 29pt control. `caption` is the 12px step; its 500 is one notch
  // light for a control label, and 600 is still a system face so there is no
  // family to select.
  sm: labelStyle('caption', '600'),
  // 15/700 — the artboards' button text, at both large sizes.
  md: labelStyle('body', '700'),
  lg: labelStyle('body', '700'),
};

export interface ButtonProps {
  /**
   * REQUIRED, and it is also the accessible name. Package rule 1: the package
   * ships no copy, so the string is the caller's — and typing it as a plain
   * `string` makes an unlabelled button a compile error.
   */
  label: string;

  onPress: () => void;

  /**
   * Rendered INSTEAD of `label`, which then serves only as the accessible
   * name. Mirrors ui-kit. Use it for a label that needs mixed type — a price
   * in `Money` beside a word — not to smuggle a second control inside.
   */
  children?: ReactNode;

  /** Default `'secondary'`, mirroring ui-kit: the loud fill is opt-in. */
  variant?: ButtonVariant;

  /** Default `'md'` (44) — ui-kit's default is its 40pt `card`, the same job. */
  size?: ButtonSize;

  /** A glyph before the label, drawn in the variant's foreground. */
  icon?: IconName;

  /** A glyph after the label — a chevron, a direction. */
  endIcon?: IconName;

  /** Stretch to the container's width. The artboards' `w-full` CTA. */
  fullWidth?: boolean;

  /**
   * An action is in flight.
   *
   * `busy` IS NOT `disabled`, and the difference is the whole reason both
   * props exist. A disabled button says "you cannot do this"; a busy one says
   * "you already did, and I am working on it". So a busy button KEEPS ITS
   * FILL — a primary that greys out the instant it is pressed reads as a
   * rejection — swaps its label for a `Spinner` and {@link busyLabel}, and
   * reports `accessibilityState={{ busy: true, disabled: false }}`.
   *
   * A second press is swallowed in the handler rather than by passing
   * `disabled` to the `Pressable`: RN's `Pressable` overwrites
   * `accessibilityState.disabled` from its own `disabled` prop, so using it
   * here would make the control announce itself as disabled and the
   * distinction above would exist only in the comment.
   */
  busy?: boolean;

  /**
   * What the button says, and what the spinner announces, while `busy`.
   *
   * Defaults to {@link label}. That is not the package shipping copy — it is
   * reusing a string the caller already supplied, and it means a button that
   * has not thought about its loading state still announces something true
   * rather than nothing.
   */
  busyLabel?: string;

  disabled?: boolean;

  /** Override the size's rung. Clamped to half the height, so `sm` cannot
   *  silently become a capsule. */
  radius?: SurfaceRadius;

  /** Longer supporting text, announced after the label. */
  accessibilityHint?: string;

  /** Forwarded to the root node — Maestro's only handle. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** The design's text button. */
export function Button({
  label,
  onPress,
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  endIcon,
  fullWidth = false,
  busy = false,
  busyLabel,
  disabled = false,
  radius,
  accessibilityHint,
  testID,
  style,
  className,
}: ButtonProps) {
  const colors = useThemeColors();
  const { pressed, onPressIn, onPressOut } = usePressed();

  const spec = VARIANTS[variant];
  const dims = SIZES[size];

  // `sm` is 29pt tall, which is under the floor. The component pays the
  // difference; there is no `hitSlop` prop, because a prop is a thing a call
  // site can forget. `md` and `lg` get `{0,0,0,0}` and cost nothing.
  const hitSlop = hitSlopFor(dims.height);

  const inert = disabled || busy;
  const quietWash = variant === 'onAccentQuiet';

  const background = disabled
    ? colors[DISABLED.bg]
    : pressed && !busy
      ? quietWash
        ? ON_ACCENT_QUIET.pressedBg
        : colors[spec.pressedBg]
      : quietWash
        ? ON_ACCENT_QUIET.bg
        : spec.bg
          ? colors[spec.bg]
          : undefined;

  const foreground = disabled
    ? colors[DISABLED.fg]
    : pressed && !busy
      ? colors[spec.pressedFg]
      : colors[spec.fg];

  const text = busy ? (busyLabel ?? label) : label;

  return (
    <Pressable
      onPress={() => {
        // Swallowed here rather than by `disabled` — see `ButtonProps.busy`.
        if (inert) return;
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      // NOT `disabled || busy`: `Pressable` writes its own `disabled` into
      // `accessibilityState` and would overwrite the `false` that `busy`
      // depends on.
      disabled={disabled}
      hitSlop={hitSlop}
      testID={testID}
      android_ripple={{ color: colors.focusRing }}
      {...interactiveA11y({ accessibilityLabel: label, accessibilityHint }, { disabled, busy })}
      style={[
        {
          height: dims.height,
          minHeight: dims.height,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: dims.gap,
          paddingHorizontal: dims.padH,
          borderRadius: clampRadiusTo(radius ?? dims.radius, dims.height),
          // `flexShrink: 0` — a button in a row with a long label beside it
          // must not be squeezed below its designed width; the label truncates
          // instead (see `numberOfLines` below).
          flexShrink: 0,
        },
        fullWidth ? { alignSelf: 'stretch', width: '100%' } : null,
        background === undefined ? null : { backgroundColor: background },
        // The one variant that carries a border, and only while it is live:
        // `disabled` swaps in the neutral `ink-700` plate, which already has a
        // boundary against the lime and would read as a live outline if it
        // kept this one. See `ON_ACCENT_QUIET.border`.
        quietWash && !disabled
          ? { borderWidth: layout.hairline, borderColor: ON_ACCENT_QUIET.border }
          : null,
        style,
      ]}
      className={className}
    >
      {busy ? (
        <Spinner size={dims.glyph} color={foreground} accessibilityLabel={busyLabel ?? label} />
      ) : icon ? (
        <Icon name={icon} color={foreground} size={dims.glyph} />
      ) : null}

      {children ? (
        // The caller's own composition. It is inside the labelled control, so
        // it must not announce itself on top of the label.
        <View accessible={false}>{children}</View>
      ) : (
        <Text
          color={foreground}
          style={LABEL_TYPE[size]}
          numberOfLines={1}
          accessible={false}
          // The label is centred by the row, so a truncated one truncates at
          // the end rather than the middle.
          ellipsizeMode="tail"
        >
          {text}
        </Text>
      )}

      {endIcon && !busy ? <Icon name={endIcon} color={foreground} size={dims.glyph} /> : null}
    </Pressable>
  );
}
