import * as stylex from '@stylexjs/stylex';

/**
 * Control heights for the member portal, applied to Astryx buttons via `xstyle`.
 *
 * WHY THIS EXISTS RATHER THAN LIVING IN THE THEME. `formacoreTheme` declares
 * `components.button` sizes, and exactly one of those declarations reaches the
 * page: `borderRadius`, because Astryx's button reads it back out of a
 * `--_button-radius` custom property. Everything else — height, padding,
 * font-weight — is authored in Astryx's own **StyleX**, which compiles to
 * unlayered classes, and unlayered always outranks the theme's
 * `@layer astryx-theme`. So a themed `size:md` of 2.75rem silently rendered at
 * Astryx's 32px, and the buttons came out visibly smaller than the design.
 *
 * `xstyle` is the supported way through: it is StyleX against StyleX, and the
 * caller's rule wins. These are the sizes the artboards use, named for what they
 * are rather than for a t-shirt letter, so a call site says what it means:
 *
 *   `page`   48px — the one primary action a screen is built around
 *   `block`  44px — an action inside a card or the membership block
 *   `card`   40px — the action on a repeated card (book, add to cart)
 *   `inline` 36px — a quiet action sharing a row with text
 *
 * Nothing below 36px: a 28px control is under the tap target on a phone, and at
 * that height the 14px radius reads as a pill rather than as the family's
 * rounded rectangle — which is what made these look unrelated to the sign-in
 * screen's 56px button in the first place.
 */
export const controlSize = stylex.create({
  page: { height: '3rem', paddingInline: '1.5rem', fontSize: '0.9375rem', fontWeight: 700 },
  block: { height: '2.75rem', paddingInline: '1.25rem', fontSize: '0.875rem', fontWeight: 600 },
  card: { height: '2.5rem', paddingInline: '1rem', fontSize: '0.875rem', fontWeight: 600 },
  inline: { height: '2.25rem', paddingInline: '0.875rem', fontSize: '0.8125rem', fontWeight: 600 },
  /** Stretch a control to its container — pairs with any of the sizes above. */
  full: { width: '100%' },
});

/**
 * The chip silhouette, for Astryx `Badge`.
 *
 * Same story as the heights above: the badge's `border-radius` is baked into
 * Astryx's StyleX as a full pill, and no theme token reaches it. The direction's
 * ladder gives chips the `inner` step, so a status chip is a small rounded
 * rectangle in the same family as the buttons and the tiles — a stadium among
 * rounded rectangles is the shape that made these read as another product's
 * components.
 */
export const chipShape = stylex.create({
  chip: {
    borderRadius: 'var(--radius-inner)',
    height: '1.5rem',
    paddingInline: '0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
  },
});
