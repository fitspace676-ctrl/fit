// @fit/astryx-theme — FormaCore "Lime Block", the member-portal brand.
//
// The second Astryx theme in this package. `fitTheme` (Aurora-glass, electric
// indigo) still dresses the admin console; this one dresses everything served by
// `apps/web` — the member portal plus the login/checkout pages that sit outside
// it. Two themes, one package: Astryx scopes each build to its own
// `[data-astryx-theme="<name>"]`, so the two never collide and repainting the
// portal cannot reach the console.
//
// The direction is the approved one from the design source
// (`forma-core-app/.workstation/design`, artboards `web-member-*` + `moodboard`):
//
//   Charcoal ink canvas · monochrome + exactly one lime · giant cropped mono
//   numerals · no gradients, no glow, no photographic decoration.
//
// THE ONE DELIBERATE DEPARTURE FROM THE ARTBOARDS. The design's signature
// silhouette is an octagon — every corner cut on the diagonal via `clip-path`,
// in six sizes (7/9/11/14/22/30px). We ship the same silhouette family as
// BORDER RADII instead. That is a product decision, not a drift: the design's
// own moodboard already sanctions a rounded ladder (`rounded-[26px] · ბარათი`,
// `rounded-[32px] · ბლოკი`) beside the cut one, and radii buy back things the
// clip-path costs — real borders (a cut corner slices a border open, which is
// why the artboards had to ship border-less checkboxes), real focus rings, and
// `overflow` that clips children instead of fighting them. The ladder below maps
// each cut step to the radius that reads at the same weight.
//
// Token values are `[light, dark]` tuples (compiled to CSS `light-dark()`) or a
// single string when the value is mode-independent.

import { defineTheme, type TokenValue } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/**
 * The ink ramp — a WARM charcoal neutral (hue drifts green-grey, not blue).
 * This is the whole palette apart from the lime and the one red; every surface,
 * border, text stop and "categorical" hue below resolves to a step on it.
 */
const ink = {
  50: '#F7F7F6',
  100: '#EEEEED',
  200: '#DCDCDA',
  300: '#BABAB7',
  400: '#8F8F8B',
  500: '#6C6C68',
  600: '#53534F',
  700: '#3E3E3B',
  800: '#2B2B29',
  900: '#1E1E1C',
  950: '#131312',
} as const;

/**
 * The lime — the product's only chromatic voice. `300` is the block colour that
 * carries the membership, the primary action and a confirmed booking; the deeper
 * stops exist so lime-on-light text stays legible (300 on white is ~1.3:1).
 */
const brand = {
  100: '#F6FCC9',
  200: '#EFF9A2',
  300: '#E4F26A',
  400: '#D6E844',
  500: '#C2D625',
  700: '#7D8C1B',
  800: '#63701D',
  950: '#2C330A',
} as const;

/**
 * Every categorical ramp Astryx offers, flattened onto the ink ramp.
 *
 * The direction allows one colour. Astryx's neutral base ships ten named hues
 * (red/orange/yellow/…/gray) that components reach for via `tone="purple"` and
 * friends — left at their defaults, one stray `tone` prop silently reintroduces
 * a colour the design spent its whole budget removing. Collapsing them here
 * makes that impossible by construction: a wrong `tone` renders as a neutral
 * chip rather than a magenta one. Red is the exception and is set explicitly
 * below — it is the one functional colour the direction keeps.
 */
const neutralised = Object.fromEntries(
  ['orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'purple', 'pink', 'gray'].flatMap((hue) => [
    [`--color-background-${hue}`, [ink[100], ink[800]]],
    [`--color-border-${hue}`, [ink[200], ink[700]]],
    [`--color-icon-${hue}`, [ink[600], ink[300]]],
    [`--color-text-${hue}`, [ink[700], ink[200]]],
  ]),
) as Record<string, [string, string]>;

/**
 * The FormaCore surfaces, as CSS custom properties Astryx has no slot for.
 *
 * They live in the theme rather than in a stylesheet so both modes stay in ONE
 * place: `astryx theme build` compiles each `[light, dark]` pair to
 * `light-dark()` exactly like a first-party token (verified in
 * `dist/formacore.css`). What it does not do is widen `TokenName`, which is a
 * closed union of Astryx's own tokens — so these have to arrive as a SPREAD
 * rather than as literal keys, which is what gets them past the excess-property
 * check without an assertion. `satisfies` still holds every value to a valid
 * `TokenValue`, so a typo'd colour is caught here.
 */
const fcTokens = {
  // =========================================================================
  // FormaCore surfaces (`--fc-*`) — the recurring materials the artboards use
  // that Astryx's contract has no slot for. They live here rather than as
  // literals in each screen so the vocabulary stays one edit wide.
  //
  // The inversion in `tile` is deliberate and is the direction's main depth
  // trick: inside a panel, an inset tile goes DARKER than its parent in dark
  // mode (ink-950 inside ink-900 — the page colour punched back through) and
  // LIGHTER in light mode (ink-50 inside white, with a hairline). Both read as
  // "recessed" without a shadow, which the direction reserves for floating
  // chrome.
  // =========================================================================
  '--fc-tile': [ink[50], ink[950]],
  '--fc-tile-border': [ink[200], 'transparent'],
  '--fc-tile-hover': [ink[100], ink[800]],

  // "Quiet" — a filled but voiceless chip: spots-left counts, WAITLIST and
  // FROZEN states, the product monogram. Reads as information, never as an
  // action, and never competes with the lime.
  '--fc-quiet': [ink[200], ink[800]],
  '--fc-on-quiet': [ink[700], ink[200]],

  // "Ghost" — a secondary control (cancel, close, dismiss). One step quieter
  // than `quiet` so the two can sit in the same row without ambiguity.
  '--fc-ghost': [ink[100], ink[800]],
  '--fc-on-ghost': [ink[600], ink[300]],

  // The BOOKED state: a lime the eye reads as "already done" rather than
  // "press me" — tinted fill, deep lime text, lime hairline. Distinct from the
  // solid `--color-accent` CTA that offers the action in the first place.
  '--fc-booked': [brand[100], brand[950]],
  '--fc-on-booked': [brand[800], brand[200]],
  '--fc-booked-border': [brand[300], brand[800]],

  // Sticky header: the canvas at 95% behind a small blur, so content scrolling
  // under it stays sensed but never legible. This is the artboards' one
  // translucent surface — not glassmorphism, just a scroll affordance.
  '--fc-header': ['rgba(238, 238, 237, 0.95)', 'rgba(19, 19, 18, 0.95)'],
  // Header icon buttons and fields sit ON that surface, so they take the
  // opposite step: white in light, the panel colour in dark.
  '--fc-control': ['#FFFFFF', ink[900]],
  '--fc-avatar-ring': [ink[200], ink[700]],

  // The floating nav capsule's surface: the panel colour at 72%, read through a
  // backdrop blur. It is the one glass surface in the product — the direction
  // otherwise bans it — and it earns the exception by being the only element
  // that permanently covers content: opaque, it punched a hole through whatever
  // it floated over. Translucent, the page stays legible underneath as context
  // while the capsule keeps its own edge.
  '--fc-glass': ['rgba(255, 255, 255, 0.72)', 'rgba(30, 30, 28, 0.72)'],
  '--fc-glass-border': ['rgba(19, 19, 18, 0.10)', 'rgba(255, 255, 255, 0.12)'],

  // =========================================================================
  // Interaction. Both are mode-INDEPENDENT for the same reason `--color-accent`
  // is: the lime does not move between themes, so neither may the states drawn
  // on top of it.
  // =========================================================================

  // Hover for anything filled with `--color-accent`. One step UP the ramp
  // (brand-200), not down: the lime is already the brightest thing on a charcoal
  // canvas, and darkening it on hover reads as "disabled" rather than "live".
  //
  // This exists because the shop authored `var(--color-accent-hover)` — a token
  // no theme defines. An undefined custom property with no fallback is invalid
  // at computed-value time, so `background-color` fell back to its INITIAL value
  // (`transparent`) and the lime buttons went see-through on hover. The sign-in
  // submit had already hardcoded `#EFF9A2` for the same state; this is that
  // value, named, so the two cannot drift.
  '--fc-accent-hover': brand[200],

  // The focus ring, as one value every control shares. Authored here rather than
  // per component so a keyboard user meets exactly one ring in the product, and
  // so it can never be half-applied: `:focus-visible` sets this box-shadow and
  // nothing else. 40% keeps it visible on both the lime fills and the charcoal
  // panels without becoming a second border.
  '--fc-focus-ring': '0 0 0 3px color-mix(in srgb, var(--color-accent) 40%, transparent)',
} satisfies Record<`--fc-${string}`, TokenValue>;

export const formacoreTheme = defineTheme({
  name: 'formacore',

  // Neutral supplies the whole token contract (type scale, motion durations,
  // shadow rubric, dark-mode rules); we repaint the slots that carry identity.
  extends: neutralTheme,

  // Noto Sans Georgian is the type system — one family for body AND display, so
  // Georgian and Latin sit on the same skeleton at every weight (Manrope/Archivo
  // had no Georgian coverage and fell back mid-page). JetBrains Mono carries the
  // numerals, which the direction treats as the primary visual accent. Loading
  // is the consumer's job: apps/web/app/[locale]/layout.tsx exposes these as
  // `--font-*` via next/font.
  typography: {
    scale: { base: 16, ratio: 1.2 },
    body: {
      family: 'var(--font-noto-georgian)',
      fallbacks: '"Noto Sans Georgian", Inter, system-ui, -apple-system, sans-serif',
    },
    heading: {
      family: 'var(--font-noto-georgian)',
      fallbacks: '"Noto Sans Georgian", Inter, system-ui, sans-serif',
      // The artboards set headings at the top of the ramp — the login hero and
      // the "PREMIUM" block are 800/900, not 600.
      weights: { 1: 'black', 2: 'extrabold', 3: 'extrabold', 4: 'bold' },
    },
    code: {
      family: 'var(--font-jetbrains)',
      fallbacks: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    },
  },

  tokens: {
    // =========================================================================
    // Canvas & surfaces. Dark is the design's home mode: an ink-950 page with
    // ink-900 cards — one step of separation, no border needed. Light inverts
    // to an ink-100 page with WHITE cards, so the card still reads as the lifted
    // surface. Neither mode uses a gradient or a glass blur.
    // =========================================================================
    '--color-background-body': [ink[100], ink[950]],
    '--color-background-surface': ['#FFFFFF', ink[900]],
    '--color-background-card': ['#FFFFFF', ink[900]],
    '--color-background-popover': ['#FFFFFF', ink[900]],
    '--color-background-muted': [ink[50], ink[800]],
    '--color-neutral': [ink[100], ink[800]],
    '--color-skeleton': [ink[200], ink[800]],

    // =========================================================================
    // The lime. Identical in both modes — this is the point of the direction:
    // the membership block is the same colour whichever theme you are in, and
    // everything around it changes instead. Text on lime is always ink-950;
    // white on lime is ~1.5:1 and unreadable, so `--color-on-accent` is the one
    // token that must never be flipped back to white.
    //
    // `text-accent` / `icon-accent` are NOT the block colour — they are lime
    // used as ink (links, active labels), so light mode drops DOWN the ramp for
    // contrast on white and dark mode lifts to 300 on charcoal.
    //
    // The light stop is 800, not 700. 700 was chosen as "the stop that is legible
    // on white" but measures 3.72:1 — under the 4.5:1 AA floor, and these are
    // ordinary 13–14px links (the "view all" row, product prices, the checkout's
    // marked clauses), none of which qualify as large text. 800 is 5.43:1 and is
    // the first stop on the ramp that actually clears it. Dark mode was never at
    // risk: 300 on ink-900 is 13.7:1.
    // =========================================================================
    '--color-accent': brand[300],
    '--color-accent-muted': [brand[100], brand[950]],
    '--color-on-accent': ink[950],
    '--color-text-accent': [brand[800], brand[300]],
    '--color-icon-accent': [brand[800], brand[300]],

    // =========================================================================
    // Text & icon ladders — three stops each, no more. The direction leans on
    // weight and size for hierarchy, not on a dozen greys.
    // =========================================================================
    '--color-text-primary': [ink[950], '#FFFFFF'],
    '--color-text-secondary': [ink[600], ink[400]],
    '--color-text-disabled': [ink[400], ink[600]],
    '--color-icon-primary': [ink[950], '#FFFFFF'],
    '--color-icon-secondary': [ink[600], ink[400]],
    '--color-icon-disabled': [ink[300], ink[700]],
    '--color-on-dark': '#FFFFFF',
    '--color-on-light': ink[950],

    // =========================================================================
    // Borders. Dark mode borders are nearly invisible on purpose — separation
    // there comes from the surface step (950 → 900), and a visible border on top
    // of it reads as a second, competing edge.
    // =========================================================================
    '--color-border': [ink[200], ink[800]],
    '--color-border-emphasized': [ink[300], ink[700]],

    // =========================================================================
    // Status. The direction reduces sentiment to three signals:
    //
    //   ACTIVE / ATTENDED / confirmed → lime     (mapped onto `success`)
    //   WAITLIST / FROZEN / pending   → ink      (mapped onto `warning`)
    //   payment failed / destructive  → red      (the one surviving colour)
    //
    // `success` is therefore lime rather than green, and `warning` is a neutral
    // rather than amber. That is deliberate: a green "ACTIVE" pill and a lime
    // membership block in the same viewport is the exact colour-soup the
    // direction removes. Light mode takes the 500 stop so lime-as-a-fill keeps
    // its contrast against white; dark mode takes 300.
    // =========================================================================
    '--color-success': [brand[500], brand[300]],
    '--color-success-muted': [brand[100], brand[950]],
    '--color-on-success': ink[950],

    '--color-warning': [ink[500], ink[400]],
    '--color-warning-muted': [ink[100], ink[800]],
    '--color-on-warning': '#FFFFFF',

    '--color-error': ['#D92D20', '#F97066'],
    '--color-error-muted': ['#FEE4E2', '#4E1410'],
    '--color-on-error': '#FFFFFF',

    // Red stays a real hue — it is the functional exception, so its categorical
    // ramp keeps its colour while the other nine are flattened above.
    '--color-background-red': ['#FEF3F2', '#4E1410'],
    '--color-border-red': ['#FECDCA', '#912018'],
    '--color-icon-red': ['#D92D20', '#FDA29B'],
    '--color-text-red': ['#B42318', '#FECDCA'],
    ...neutralised,

    // =========================================================================
    // Radii — the cut-corner ladder, rounded. Each step is the radius that reads
    // at the same visual weight as the `clip-path` inset it replaces:
    //
    //   CUT_XS     7px  → inner      10px   badges, chips, inline markers
    //   CUT_MD    11px  → element    14px   buttons, inputs, segmented controls
    //   CUT_PANEL 22px  → container  26px   cards, panels, list rows
    //   CUT_LG    30px  → page       32px   hero blocks (membership, login)
    //
    // The two large steps are the moodboard's own `rounded-[26px]` / `[32px]`.
    // =========================================================================
    '--radius-none': '0',
    '--radius-inner': '0.625rem',
    '--radius-element': '0.875rem',
    '--radius-container': '1.625rem',
    '--radius-page': '2rem',
    '--radius-full': '9999px',

    // Elevation belongs to floating things only (the mobile tab bar, popovers,
    // menus) — cards sit flat on the canvas. Warming the shadow colour keeps a
    // lifted white card from going blue-grey against the charcoal page.
    '--color-shadow': ['rgba(19, 19, 18, 0.16)', 'rgba(0, 0, 0, 0.6)'],

    ...fcTokens,
  },

  components: {
    // Buttons take the `element` step (14px) rather than Astryx's default, and
    // sit a little taller than the fit theme's — the artboards' controls are
    // 48px at `lg`, which is also the tap target the mobile screens assume.
    button: {
      base: { borderRadius: '0.875rem', fontWeight: '600' },
      'size:sm': { height: '2.25rem', paddingInline: '0.875rem' },
      'size:md': { height: '2.75rem', paddingInline: '1.125rem' },
      'size:lg': { height: '3rem', paddingInline: '1.375rem' },
    },
  },
});

export default formacoreTheme;
