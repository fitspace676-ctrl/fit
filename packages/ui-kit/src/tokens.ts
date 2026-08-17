import * as stylex from '@stylexjs/stylex';

/**
 * The member portal's shared style fragments — the vocabulary every kit
 * component is assembled from.
 *
 * WHY A KIT AT ALL. The portal used to render Astryx's components dressed in
 * FormaCore tokens, while the sign-in and checkout screens rendered a
 * hand-authored set (`auth-form-kit`). Same palette, two different objects: a
 * 52px field with a 10px uppercase micro-label at the door, an Astryx input with
 * its own label slot and rhythm inside; a 56px lime submit there, a 32px Astryx
 * button here that every call site then had to override back up to 40 with
 * `xstyle={controlSize.card}`. The two never read as one product. This module is
 * the auth screens' vocabulary promoted to the whole portal, so there is exactly
 * one field, one button ladder and one focus ring behind every screen.
 *
 * These are exported `stylex.create` results, composed by the components via
 * `stylex.props(...)`. That is load-bearing and was verified against the built
 * bundle: the compiled export carries real class names (`{ page: { kZKoxP:
 * "x1pizb70", …, $$css: true } }`), so a fragment defined here reaches the page
 * from any importing module. (`auth-form-kit`'s docstring claims the opposite —
 * that an exported `stylex.create` arrives `undefined` — which is not true of
 * this app's current SWC/StyleX setup; `controlSize` had already been crossing
 * module boundaries for the whole portal.)
 */

/**
 * The control ladder, named for the job rather than a t-shirt letter, so a call
 * site says what it means. These are the artboards' own heights:
 *
 *   `door`   56px — the single action a whole screen exists to collect
 *                   (sign in, pay, confirm). One per screen, at most.
 *   `page`   48px — the primary action a page is built around.
 *   `block`  44px — an action inside a card or the membership block.
 *   `card`   40px — the action on a repeated card (book, add to cart).
 *   `inline` 36px — a quiet action sharing a row with text.
 *
 * Nothing below 36px: that is the floor for a comfortable tap target, and under
 * it the 14px `element` radius starts reading as a pill rather than as the
 * family's rounded rectangle.
 *
 * These replace `controlSize` + an Astryx `size` prop. Astryx's own ladder is
 * 28/32/36px, so every call site had to pass BOTH a `size` and an `xstyle`
 * override to reach a designed height; here the size prop simply is the height.
 */
export const control = stylex.create({
  door: { height: '3.5rem', paddingInline: '1.75rem', fontSize: '1rem', fontWeight: 700 },
  page: { height: '3rem', paddingInline: '1.5rem', fontSize: '0.9375rem', fontWeight: 700 },
  block: { height: '2.75rem', paddingInline: '1.25rem', fontSize: '0.875rem', fontWeight: 600 },
  card: { height: '2.5rem', paddingInline: '1rem', fontSize: '0.875rem', fontWeight: 600 },
  inline: { height: '2.25rem', paddingInline: '0.875rem', fontSize: '0.8125rem', fontWeight: 600 },
});

/** Square controls (icon-only) — the ladder above with the padding removed. */
export const controlSquare = stylex.create({
  door: { width: '3.5rem', paddingInline: 0 },
  page: { width: '3rem', paddingInline: 0 },
  block: { width: '2.75rem', paddingInline: 0 },
  card: { width: '2.5rem', paddingInline: 0 },
  inline: { width: '2.25rem', paddingInline: 0 },
});

/** Stretch a control to its container — pairs with any size. */
export const stretch = stylex.create({
  full: { width: '100%' },
});

/**
 * The handful of spacing decisions that belong to the system rather than to one
 * screen — kept here so they cannot drift apart between the screens that share
 * them.
 */
export const spacing = stylex.create({
  /**
   * The extra air above a form's submit. A form is a column at one rhythm and
   * then the action, and without the step the button reads as one more field.
   */
  formAction: { marginTop: '0.75rem' },
});

/**
 * The one focus ring in the product.
 *
 * `outline: none` is paired with the ring in the SAME fragment on purpose: the
 * two must never be applied separately, or a control ends up with the native
 * outline suppressed and nothing in its place. Every interactive element in the
 * kit composes `focus.ring`, which is the whole a11y story — the portal
 * previously left 27 of its 32 interactive files on the browser default, which
 * works but paints a system-blue ring on a monochrome charcoal design.
 *
 * `:focus-visible`, not `:focus`: a mouse click on a button should not leave a
 * ring behind, and a keyboard tab must.
 */
export const focus = stylex.create({
  ring: {
    outline: 'none',
    boxShadow: { default: null, ':focus-visible': 'var(--fc-focus-ring)' },
  },
  /**
   * For controls that already own their `box-shadow` (the avatar's lime ring,
   * a card's elevation). Composing `focus.ring` there would overwrite the resting
   * shadow, so these draw the ring with `outline` instead — same colour, same
   * 3px, offset out so it clears the control's own edge.
   */
  outlineRing: {
    outline: {
      default: 'none',
      ':focus-visible': '3px solid color-mix(in srgb, var(--color-accent) 55%, transparent)',
    },
    outlineOffset: '2px',
  },
});

/**
 * The recurring surfaces, as fragments rather than as literals repeated per
 * screen. Each maps to a `--fc-*` token pair whose light/dark values are decided
 * once in the theme.
 */
export const surface = stylex.create({
  /** A lifted panel — white on light, ink-900 on dark. The default card. */
  card: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-card)',
  },
  /**
   * A recessed inset — DARKER than its parent in dark mode, lighter in light.
   * The direction's depth trick: reads as sunken without a shadow. This is the
   * field's background and the tile's, which is what makes a form field look
   * like it belongs to the same system as the stat tiles beside it.
   */
  tile: {
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--fc-tile)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
  },
  /** A filled but voiceless chip — counts, WAITLIST, FROZEN. Never an action. */
  quiet: {
    backgroundColor: 'var(--fc-quiet)',
    color: 'var(--fc-on-quiet)',
  },
  /** One step quieter than `quiet` — cancel, close, dismiss. */
  ghost: {
    backgroundColor: 'var(--fc-ghost)',
    color: 'var(--fc-on-ghost)',
  },
});

/**
 * The type ramp, as fragments. The direction leans on weight and size for
 * hierarchy rather than on a dozen greys, so there are few of these on purpose.
 */
export const text = stylex.create({
  /** Section and card headings — top of the weight ramp, cropped tight. */
  heading: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    lineHeight: 1.1,
    color: 'var(--color-text-primary)',
  },
  /**
   * The 10px uppercase micro-label. It sits over every field, every stat and
   * every eyebrow in the product — one of the direction's most recognisable
   * marks, and the reason a form on the dashboard reads as the same object as
   * the form at the door.
   */
  micro: {
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--color-text-secondary)',
  },
  /**
   * Numerals are mono everywhere in this product — ids, prices, counts, clock
   * times. `tabular-nums` so a column of them does not jitter as values change.
   */
  numeral: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  secondary: {
    color: 'var(--color-text-secondary)',
  },
});
