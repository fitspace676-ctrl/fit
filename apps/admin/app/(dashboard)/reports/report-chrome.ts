// @fit/admin — the Reports screens' shared visual vocabulary.
//
// Reports is an operational console screen, not a marketing page, and it is
// styled like one: hairlines and negative space carry the structure, boxes are
// spent only where elevation means something, numerals are mono and tabular so
// columns of figures line up, and exactly ONE accent (`--color-accent`) appears
// anywhere on the screen.
//
// That is a deliberate reversal. The screen used to be two near-identical grids
// of bordered cards, each card carrying a tinted icon chip in a DIFFERENT hue
// (green / blue / indigo / amber), and each grid leaving empty cells because
// seven and four items do not fill a three-column grid. Four accents and two
// holes is what made it read as templated.
//
//   • `cardSurface` — Astryx `Card`'s own default chrome, for a card-scale
//     surface that has to be a `<Link>` rather than the `<div>` `Card` renders.
//     Kept token-for-token in step with `@astryxdesign/core/Card`.
//
//   • `cardHeading` / `cardCaption` — the console's heading scale, taken from
//     the dashboard's `overview/revenue-card.tsx` so Reports and the dashboard
//     title their sections identically.
//
//   • `num` — mono, tabular figures. Every count and measurement on the screen
//     uses it, so digits share a column width and a row of them scans.
//
//   • `notice` / `alert` — the inline permission and API-failure messages,
//     previously duplicated byte-for-byte between the hub and the drill-down
//     page. They stay on the INNER radius scale on purpose: they are message
//     boxes at an empty state's rank, not cards.
//
// A plain module with no `'use client'` — the hub's server component imports
// these alongside the client views. StyleX compiles them away either way.

import * as stylex from '@stylexjs/stylex';

export const chrome = stylex.create({
  /**
   * Astryx `Card`'s default chrome, for a card-scale surface that cannot be a
   * `Card`. Mirrors `@astryxdesign/core/Card`: `--radius-container`,
   * `--color-background-card`, and the solid `--color-border-emphasized`.
   */
  cardSurface: {
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-card)',
  },

  /**
   * A heading that titles a section or a card — the console's single treatment
   * for that rank, matching the dashboard's `sectionLabel`. Small and quiet by
   * design: on an operational screen the figures carry the weight, not the
   * labels above them.
   */
  cardHeading: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },

  /** The mono caption under a {@link cardHeading}, as on the dashboard's revenue card. */
  cardCaption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },

  /**
   * Mono, tabular figures. Applied to every count on the screen so a column of
   * numbers shares one digit width instead of shifting per glyph.
   */
  num: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },

  /** The inline "you do not have permission" box shown in place of a report. */
  notice: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },

  /** The inline "could not reach the FormaCore API" box. */
  alert: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});
