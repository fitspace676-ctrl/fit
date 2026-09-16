// The text primitives. THIS FILE IS THE CENTRE OF THE PACKAGE.
//
// ===========================================================================
// WHY THIS EXISTS, IN ONE PARAGRAPH.
//
// The previous `@fit/ui-mobile` shipped eight components and had ZERO
// consumers. The root cause was not the eight components; it was the one that
// was missing. React Native's `<Text>` inherits nothing — no font, no size, no
// colour, no tracking crosses a component boundary — so the moment a screen
// rendered a string it hand-wrote `{fontSize, fontWeight, color,
// letterSpacing}`. And a screen that is already hand-writing its type has
// nothing left to gain from importing someone else's `Card`: the wrapper saves
// it four lines out of forty. So the screens grew a local kit, the local kit
// grew a second tab bar, and the repo shipped two design systems.
//
// The fix is that every string in the app goes through this file. Once it
// does, a screen cannot express type at all without the token layer, and there
// is no path back to a local kit.
// ===========================================================================

import type { ReactNode } from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { spokenAs } from '../internal/a11y';
import { resolveColor } from './icon/icon';
import type { ColorValue } from './icon/types';
import { tabularNums, type as typeRoles, type TypeRole } from '../tokens/typography';
import { useThemeColors } from '../tokens/theme';

/**
 * The token layer's `tabularNums`, widened to a mutable `TextStyle`.
 *
 * `tokens/typography.ts` freezes it (`['tabular-nums'] as const`) so the drift
 * spec can assert on it, and React Native's `TextStyle.fontVariant` is a
 * MUTABLE array type — so the token cannot be spread into a style directly.
 * Copied once at module load rather than per render: an inline
 * `{ fontVariant: [...] }` would be a new object on every pass and defeat
 * `React.memo` on every parent of every number in the app.
 */
const TABULAR: TextStyle = { fontVariant: [...tabularNums.fontVariant] };

/** Which step of the type scale. */
export type TextVariant = TypeRole;

/** The mono half of the scale — everything `Mono` and `Money` may take. */
export type MonoVariant = Extract<TypeRole, `mono${string}`>;

type BaseTextProps = Omit<RNTextProps, 'style'> & {
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<TextStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
  children?: ReactNode;
};

export interface TextProps extends BaseTextProps {
  /** A step on the type scale. Default `'body'` (15 / 600 / 21). */
  variant?: TextVariant;
  /** A semantic role name, or a literal colour. Default `'textPrimary'`. */
  color?: ColorValue;
  align?: TextStyle['textAlign'];
}

/**
 * Every string in the app, eventually.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE TOKEN LAYER GIVES THIS COMPONENT THAT A SCREEN CANNOT GIVE ITSELF.
 *
 * `letterSpacing` and `lineHeight` arrive as ABSOLUTE POINTS, because React
 * Native has no `em`. A screen hand-porting `tracking-[-0.025em]` from the
 * artboards has to do the multiplication itself, at every size, and will
 * eventually round one of them differently — which is invisible in review and
 * visible in a stack of headings.
 *
 * More sharply: every role carries an explicit `lineHeight`. Georgian text at
 * 20px and above CLIPS its ascenders and descenders on Android when
 * `lineHeight` is left to the platform, because the fallback metrics are
 * computed from a Latin font that has never seen a ღ. That is the single
 * highest-severity typographic bug this product can ship — it is invisible on
 * the simulator most people develop on — and it cannot recur while every
 * string comes through here.
 * ---------------------------------------------------------------------------
 */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  className,
  children,
  ...rest
}: TextProps) {
  const colors = useThemeColors();
  return (
    <RNText
      {...rest}
      style={[
        typeRoles[variant],
        { color: resolveColor(color, colors) },
        align ? { textAlign: align } : null,
        style,
      ]}
      className={className}
    >
      {children}
    </RNText>
  );
}

/**
 * Heading levels, and the type role each defaults to.
 *
 * Read off the artboards rather than invented: a screen title and a class-card
 * title are both `text-[24px] font-extrabold` (→ `heading`), a section header
 * is `text-[20px] font-extrabold` (→ `section`), and the one 34px setting in
 * the whole set is the membership block's plan name (→ `display`). The two
 * scale steps no artboard uses as a heading — `title` (28) and `subheading`
 * (22) — are deliberately not on this ladder; they are still reachable through
 * the `variant` override, which is what an override is for.
 */
const HEADING_VARIANT = {
  1: 'display',
  2: 'heading',
  3: 'section',
  4: 'subtitle',
  5: 'bodyLarge',
} as const satisfies Record<number, TypeRole>;

export type HeadingLevel = keyof typeof HEADING_VARIANT;

export interface HeadingProps extends Omit<TextProps, 'variant'> {
  /** Default 2 — the artboards' screen-title and card-title size. */
  level?: HeadingLevel;
  /** Override the level's default type role without changing the a11y level. */
  variant?: TextVariant;
}

/**
 * A heading. Sets `accessibilityRole="header"`, which is the whole point.
 *
 * A screen reader user navigates by headings; a screen whose "headings" are
 * `<Text>` with a bigger `fontSize` has none, and rotor navigation lands the
 * user at the top of the page every time. There is no visual difference
 * between this and `<Text variant="heading">`, which is exactly why it has to
 * be a separate component: the correct thing must be the easy thing, or the
 * `accessibilityRole` never gets typed.
 */
export function Heading({ level = 2, variant, ...rest }: HeadingProps) {
  return <Text accessibilityRole="header" variant={variant ?? HEADING_VARIANT[level]} {...rest} />;
}

/** The three small-caps steps. */
export type EyebrowSize = 'micro' | 'label' | 'eyebrow';

const EYEBROW_VARIANT = {
  micro: 'micro',
  label: 'label',
  eyebrow: 'eyebrow',
} as const satisfies Record<EyebrowSize, TypeRole>;

export interface EyebrowProps extends Omit<TextProps, 'variant'> {
  /** Default `'label'` — 11px / 0.12em, the artboards' most common eyebrow. */
  size?: EyebrowSize;
}

/**
 * The small-caps connective tissue: category names, section kickers, the
 * `წევრის ID` above a member code.
 *
 * All three sizes carry `textTransform: 'uppercase'` from the token layer.
 * That is a no-op for Georgian, which is unicameral, and correct for the Latin
 * and numeric strings that appear beside it — which is why the artboards can
 * use one treatment for both scripts.
 */
export function Eyebrow({ size = 'label', color = 'textSecondary', ...rest }: EyebrowProps) {
  return <Text variant={EYEBROW_VARIANT[size]} color={color} {...rest} />;
}

export interface MonoProps extends Omit<TextProps, 'variant'> {
  /** Default `'monoBody'` (15 / 700). */
  variant?: MonoVariant;
  /**
   * What a screen reader should say INSTEAD of the glyphs. Optional here and
   * required on {@link Money}; see the note on this component.
   */
  accessibilityLabel?: string;
}

/**
 * Monospace, tabular figures.
 *
 * `fontVariant: ['tabular-nums']` is not decoration. Every number in this
 * design sits in a column that updates — a countdown, a spots-left count, a
 * running cart total — and proportional figures make the whole row jitter one
 * or two points on each change, which reads as the layout being unstable.
 *
 * `accessibilityLabel` is offered because VoiceOver reads a monospace,
 * tabular run character by character: `FC-4821` becomes "F C hyphen four eight
 * two one". For an identifier that is arguably correct, so this is optional
 * here — but for a quantity it is not, which is why {@link Money} makes it
 * required.
 */
export function Mono({ variant = 'monoBody', accessibilityLabel, style, ...rest }: MonoProps) {
  return (
    <Text variant={variant} {...spokenAs(accessibilityLabel)} style={[TABULAR, style]} {...rest} />
  );
}

export interface MoneyProps extends Omit<MonoProps, 'accessibilityLabel' | 'children'> {
  /**
   * The formatted amount, already in the viewer's locale and currency.
   *
   * Formatting is NOT this package's job and cannot be: it needs the locale,
   * the currency, and the minor-unit convention, all of which are app state,
   * and the plan bans `Intl` outright on this platform (`WP-16`). The screen
   * formats; this component sets it.
   */
  children: string;
  /**
   * REQUIRED. The spoken form — "89 lari", not "eight nine full stop zero
   * zero lari sign".
   *
   * This is copy, and package rule 1 says every label, including every
   * `accessibilityLabel`, is a required prop. It is required specifically here
   * rather than on `Mono` because a price is the one number a user will ask
   * their screen reader to read back before spending money.
   */
  accessibilityLabel: string;
}

/** A price. See {@link MoneyProps} for why both of its props are required. */
export function Money({ children, ...rest }: MoneyProps) {
  return <Mono {...rest}>{children}</Mono>;
}
