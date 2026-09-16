// The icon dictionary — 24×24 stroke path data, keyed by name.
//
// ===========================================================================
// WHERE EVERY VALUE ON THIS PAGE CAME FROM (decision D6).
//
//   NAMES  come from `packages/ui-web/src/icon.tsx`. One icon vocabulary
//          across web and mobile: `<Icon name="bolt" />` must mean the same
//          glyph on both surfaces, so mobile does not get to invent a name web
//          already spends, nor spend a web name on a different drawing.
//
//   PATHS  come from the artboards in `forma-core-app/.workstation/design/`.
//          Those are the "Lime Block" redraws (2026-08-18): the whole set was
//          re-cut lighter and larger on the 24 grid for a 1.9 stroke, and the
//          web dictionary still carries the pre-repaint draw at 2.1. Where an
//          artboard redraws a glyph, the artboard wins. Where it does not, the
//          web path stands — same vocabulary, older cut.
//
// This file DUPLICATES roughly 4KB of path strings that also exist in
// `@fit/ui-web`, and that is the intended trade rather than an oversight.
// `@fit/ui-web` is a DOM + StyleX package: `icon.tsx` alone imports
// `SVGProps` from react and returns an `<svg>`, and the package's entry pulls
// `@stylexjs/stylex` and `@astryxdesign/core` behind it. Importing it from
// React Native would drag a web renderer into the mobile bundle to reach a
// string constant. Instead the strings are copied and
// `scripts/check-design-tokens.ts` assertion 5 diffs the two dictionaries in
// CI, so the copy cannot drift silently — see {@link ICON_WEB_DIVERGENCE}.
// ===========================================================================

/**
 * Every glyph, as one `d` attribute on a 24×24 grid.
 *
 * One `<Path>` per icon, always. Multi-subpath glyphs concatenate their
 * subpaths into a single `d` (`…Z` then `M…`) rather than emitting several
 * `<Path>` elements, because `react-native-svg` mounts a real native view per
 * element and a five-element icon inside a 60-row list is 300 views.
 */
export const ICON_PATHS = {
  // -------------------------------------------------------------------------
  // Navigation & structure. All five tab glyphs are artboard redraws — they
  // appear in the floating capsule on 6/6 screens, so they are the most-seen
  // shapes in the product.
  // -------------------------------------------------------------------------
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h4v-6h3v6h4a1 1 0 0 0 1-1V9.5',
  calendar:
    'M7 3v3M17 3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6Z',
  bag: 'M6 8h12l1 12.5H5L6 8ZM9 8V6a3 3 0 0 1 6 0v2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
  qr: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2.5v2.5H14V14ZM20 14v6h-3.5M17 20h-.5',

  // -------------------------------------------------------------------------
  // Chevrons and arrows.
  //
  // READ THIS BEFORE ADDING ONE. The artboards call their diagonal-out glyph
  // `arrow`; the web dictionary calls its RIGHT-POINTING glyph `arrow`. They
  // are different drawings under one name, which is exactly how a wrong icon
  // ships silently — a screen written against the web vocabulary asks for
  // `arrow`, gets a diagonal, and nobody notices because both are arrows. So
  // the diagonal ships here as `arrowUpRight` and `arrow` keeps web's meaning
  // and web's data.
  //
  // `chevronDown` and `chevronUp` are the artboard's `chevron` ROTATED, not
  // web's chevrons: the artboard chevron spans y 5→19 and web's spans 6→18, so
  // taking one from each source puts two visibly different chevron sizes in
  // the same list row (a right-chevron on the row, a down-chevron on the
  // section header above it). Rotating one glyph keeps the family one size.
  // Down = (x,y) → (24−y, x) applied to the artboard chevron; Up is its mirror.
  // -------------------------------------------------------------------------
  chevronLeft: 'M15 5 8 12l7 7',
  chevronRight: 'm9 5 7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronUp: 'M5 15l7-7 7 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowUpRight: 'M7 17 17 7M9 7h8v8',

  // -------------------------------------------------------------------------
  // Actions.
  // -------------------------------------------------------------------------
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 12.5 4.5 4.5L19 7',
  x: 'm6 6 12 12M18 6 6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  trash:
    'M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 5v6h-6',
  share: 'M12 15V4m0 0L8 8m4-4 4 4M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14',
  copy: 'M9 9V6.5A1.5 1.5 0 0 1 10.5 5h7A1.5 1.5 0 0 1 19 6.5v7a1.5 1.5 0 0 1-1.5 1.5H15M6.5 9h7A1.5 1.5 0 0 1 15 10.5v7A1.5 1.5 0 0 1 13.5 19h-7A1.5 1.5 0 0 1 5 17.5v-7A1.5 1.5 0 0 1 6.5 9Z',
  download: 'M12 3v12M7 11l5 4 5-4M5 21h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout:
    'M15 8V6a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 18v-2M10 12h10m0 0-3-3m3 3-3 3',

  // -------------------------------------------------------------------------
  // Classes, training, gym.
  // -------------------------------------------------------------------------
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.2 2',
  dumbbell: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  bolt: 'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3Z',
  flame: 'M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5.8-2.8.8-2.8S8.5 10 9.5 10c1.2 0 .8-4.5 2.5-7Z',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  users:
    'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 20.5a7 7 0 0 1 14 0M16.5 5.2a3.6 3.6 0 0 1 0 6.6M18 14.6a6 6 0 0 1 4 5.9',
  ticket:
    'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM14 6v12',
  target:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  calendarPlus: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v6M21 17h-6M18 14v6',

  // -------------------------------------------------------------------------
  // Achievements. `award` and `medal` are BOTH shipped and are NOT the same
  // glyph: `award` is web's (a 6r disc, ribbon tails to y=22), `medal` is the
  // profile artboard's achievement tile (a 5r disc, shorter tails). They sit on
  // different screens and the artboard set carries only the second, so
  // collapsing them would silently repaint the achievements row.
  // -------------------------------------------------------------------------
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8.5 13.5 7 22l5-3 5 3-1.5-8.5',
  medal: 'M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM8.5 14 7 21l5-2.5L17 21l-1.5-7',
  star: 'm12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',

  // -------------------------------------------------------------------------
  // Commerce & billing.
  // -------------------------------------------------------------------------
  card: 'M3 8.5h18M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z',
  tag: 'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9ZM7.5 7.5h.01',
  briefcase:
    'M4 8h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
  grid: 'M4 4h7v7H4V4ZM13 4h7v7h-7V4ZM4 13h7v7H4v-7ZM13 13h7v7h-7v-7Z',

  // -------------------------------------------------------------------------
  // Account, comms, settings.
  //
  // `settings` KEEPS WEB'S SLIDERS and does not take the gallery's gear — the
  // one place this file deliberately declines a redraw. Web's own note gives
  // the reason and it applies harder here: the classic eight-notch gear is
  // ~20 curve segments packed into 24×24, and at the 16–19px these icons
  // actually render at on a phone the notches collapse into a scribble. Two
  // tracks with handles survive the downscale. No artboard uses this glyph, so
  // the conflict is gallery-vs-web, not gallery-vs-artboard, and the
  // artboards-win rule does not reach it.
  // -------------------------------------------------------------------------
  bell: 'M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10ZM10 19a2 2 0 0 0 4 0',
  settings:
    'M4 7h9M17 7h3M4 17h3M11 17h9M15 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM9 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  message: 'M21 12a8 8 0 0 1-11.4 7.2L3 21l1.8-6.6A8 8 0 1 1 21 12Z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3 7l9 6 9-6',
  phone:
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.9 2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.9.7 2 2 0 0 1 1.7 2Z',
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9.5h17M3.5 14.5h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  camera:
    'M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3ZM9 12l2 2 4-4',
  lock: 'M6 10V8a6 6 0 1 1 12 0v2M5 10h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
  info: 'M12 8h.01M11 12h1v4h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff:
    'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.4 5.2A9.3 9.3 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.2M6.1 6.1A16.8 16.8 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 3-.5',

  // -------------------------------------------------------------------------
  // Appearance & session. `pause` is the membership-freeze glyph, not a media
  // control — the profile artboard uses it for "pause my payments".
  // -------------------------------------------------------------------------
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  pause: 'M9.5 5v14M14.5 5v14',
  apple:
    'M16.5 12.5c0-2.5 2-3.3 2-3.3-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.8.8-3.6.8-.7 0-1.9-.8-3.1-.8-1.6 0-3 .9-3.9 2.4-1.6 2.9-.4 7.1 1.2 9.4.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.5-.8.9-1.6 1.1-2.4-2.9-1.1-3-4.3-3-4.4ZM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.8-1.3Z',
  google:
    'M21 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7.1ZM12 21c2.4 0 4.5-.8 6-2.2l-3.1-2.4c-.8.6-1.9.9-2.9.9-2.3 0-4.2-1.5-4.9-3.6H3.9v2.5A9 9 0 0 0 12 21ZM7.1 13.7a5.4 5.4 0 0 1 0-3.4V7.8H3.9a9 9 0 0 0 0 8.4l3.2-2.5ZM12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 3.9 7.8l3.2 2.5C7.8 8.1 9.7 6.6 12 6.6Z',
} as const;

/** Every glyph this package can draw. */
export type IconName = keyof typeof ICON_PATHS;

/** The glyph names, sorted, for the drift guard and the kit gallery. */
export const ICON_NAMES = Object.keys(ICON_PATHS).sort() as readonly IconName[];

// ===========================================================================
// THE DRIFT LEDGER.
//
// `scripts/check-design-tokens.ts` assertion 5 diffs this dictionary against
// `packages/ui-web/src/icon.tsx`. Strict `d` equality on every shared name is
// NOT the assertion, and could not be: decision D6 puts artboard path data
// under web names, and the artboards redrew most of the set for the August
// repaint, so a strict check would fail on ~24 names on the day it was written
// and be deleted within the week.
//
// What the guard asserts instead is that the SET of divergences is exactly the
// set recorded below. That catches the defect the check exists for — a name
// quietly coming to mean a different glyph on the two surfaces — because a new
// divergence, or a divergence that has silently gone away, fails CI and forces
// someone to write a reason on a line. `arrow` is the worked example: had
// mobile taken the artboards' diagonal under that name, `arrow` would have
// needed an entry here, and writing the reason is where you notice you are
// about to ship two different arrows.
//
// Adding an entry is cheap; adding one WITHOUT a reason that survives review
// is the thing the ledger is trying to make awkward.
// ===========================================================================

/**
 * Shared names whose `d` deliberately differs from `@fit/ui-web`'s, and why.
 *
 * Keys must be names present in BOTH dictionaries. The guard fails on a key
 * that no longer diverges, on a key web no longer has, and on a divergence
 * that is not listed here.
 */
export const ICON_WEB_DIVERGENCE: Readonly<Record<string, string>> = {
  // The August "Lime Block" redraw: re-cut on the 24 grid for a 1.9 stroke,
  // lighter and a touch larger than the 2.1-stroke web draw. Web keeps the
  // older cut until it is repainted; both are the same glyph.
  home: 'Lime Block redraw — artboard mobile-home-v2.tsx',
  calendar: 'Lime Block redraw — artboard mobile-home-v2.tsx',
  bag: 'Lime Block redraw — artboard mobile-home-v2.tsx',
  user: 'Lime Block redraw — artboard mobile-home-v2.tsx',
  qr: 'Lime Block redraw — artboard mobile-home-v2.tsx',
  bell: 'Lime Block redraw — artboard mobile-home-v2.tsx',
  bolt: 'Lime Block redraw — artboard mobile-home-v2.tsx',
  clock: 'Lime Block redraw — artboard mobile-class-detail.tsx',
  pin: 'Lime Block redraw — artboard mobile-class-detail.tsx',
  users: 'Lime Block redraw — artboard mobile-class-detail.tsx',
  check: 'Lime Block redraw — artboard mobile-classes.tsx',
  filter: 'Lime Block redraw — artboard mobile-classes.tsx',
  trash: 'Lime Block redraw — artboard mobile-shop.tsx',
  sun: 'Lime Block redraw — artboard mobile-qr.tsx',
  card: 'Lime Block redraw — artboard mobile-profile.tsx',
  dumbbell: 'Lime Block redraw — artboard mobile-profile.tsx',
  moon: 'Lime Block redraw — artboard mobile-profile.tsx',
  logout: 'Lime Block redraw — artboard mobile-profile.tsx',
  flame: 'Lime Block redraw — artboard mobile-profile.tsx',
  search: 'Lime Block redraw — gallery design-system.tsx',
  star: 'Lime Block redraw — gallery design-system.tsx',

  // Notation only: `m6 6 12 12` (relative) vs web's `M6 6l12 12` (absolute)
  // draw the identical two strokes. Recorded rather than "fixed" so the ledger
  // stays a complete account of every textual difference; if web is ever
  // repainted this entry is the one that should disappear first.
  x: 'Identical geometry — artboard writes the first stroke as a relative moveto',

  // The chevron family, kept one size. See the note beside the definitions:
  // web spans y 6→18 and the artboard spans 5→19, so `chevronRight` (artboard)
  // beside `chevronDown` (web) would put two chevron sizes in one list row.
  // Down and Up are the artboard's right-chevron rotated ±90° about (12,12).
  chevronLeft: 'Lime Block redraw — artboard mobile-class-detail.tsx (`back`)',
  chevronRight: 'Lime Block redraw — artboard mobile-classes.tsx (`chevron`)',
  chevronDown: 'Artboard chevron rotated 90° CW, to keep the chevron family one size',
  chevronUp: 'Artboard chevron rotated 90° CCW, to keep the chevron family one size',
};

/**
 * Names this package ships that `@fit/ui-web` does not, and why each is here.
 *
 * The guard fails on a mobile-only name missing from this map, which is what
 * stops the vocabularies forking by accretion: a new mobile glyph has to be
 * declared as new, and the entry is the prompt to add it to web when web needs
 * it too.
 */
export const ICON_MOBILE_ONLY: Readonly<Record<string, string>> = {
  arrowUpRight:
    "The artboards' diagonal-out arrow. NOT named `arrow`: web's `arrow` is a " +
    'right-pointing glyph, and one name over two drawings is how a wrong icon ships.',
  refresh: 'QR pass — rotate the member code. Artboards mobile-qr.tsx, mobile-home-v2.tsx.',
  share: 'Class detail — share an occurrence. Artboard mobile-class-detail.tsx.',
  copy: 'QR pass — copy the member ID. Artboard mobile-qr.tsx.',
  globe: 'Profile — language row. Artboard mobile-profile.tsx.',
  pause: 'Profile — freeze the membership. Artboard mobile-profile.tsx.',
  medal: 'Profile — achievement tiles. Artboard mobile-profile.tsx.',
};
