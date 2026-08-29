// @fit/web — the tenant's colours, translated into the portal's own tokens.
//
// A gym picks two colours under Settings → Member portal (falling through to its
// brand when it has not), and `gymPortalTheme` resolves them into a
// {@link GymPortalTheme}. This module is the other half: turning those two hexes
// into the CSS custom properties the FormaCore ("Lime Block") theme already
// reads, so every screen re-themes without a single component knowing a gym
// colour exists. The alternative — threading a colour prop through forty
// components — is how a design system stops being one.
//
// NOTHING IS REPAINTED UNTIL A GYM ASKS. The feature is the ABILITY to change
// the portal's colours, not a restyle applied to everyone on deploy, so a colour
// the gym never chose overrides nothing and `formacore.css` renders Lime Block
// exactly as it does today. {@link chosenPortalColors} is where "never chose" is
// worked out, and it is worth reading before the rest of this file.
//
// WHICH TOKENS, AND WHY THOSE. `@fit/astryx-theme`'s compiled `formacore.css`
// defines the whole palette; only the ACCENT RAMP is a brand decision. The rest
// (surfaces, text, borders, the success/error semantics) is the product's own
// legibility system and a gym has no business repainting it — a red "success"
// because the gym's brand is red would be a bug wearing a setting. So:
//
//   `primaryColor` drives the accent as a FILL — `--color-accent` and everything
//   that pairs with it (`--color-on-accent`, the hover, the muted tint, the
//   "booked" pill). In this app the token is used as `backgroundColor` or
//   `borderColor` in nearly every one of its ~70 call sites, so one flat hex is
//   the honest shape for it; what has to move per theme is the ink ON it and the
//   tints beside it.
//
//   `accentColor` drives the accent as INK — `--color-text-accent` and
//   `--color-icon-accent`, the accent used as type on the page surface. That is
//   the one place the pair can genuinely differ without inventing a parallel
//   token system: a primary block with a secondary highlight is what "primary +
//   accent" means, and the theme already keeps these as separate tokens (lime
//   fill, darkened lime type) precisely because a fill colour and a text colour
//   have different jobs. A second colour too close to body copy to READ as an
//   accent hands that job back to the primary — see {@link accentTypeSource}.
//
// LEGIBILITY WINS OVER FIDELITY. The portal ships a light and a dark skin and a
// working toggle between them, so a single hex has to survive both. Two of the
// three failure modes are silent: a dark brand as accent TYPE vanishes on the
// dark canvas, and a light brand as accent type vanishes on the light one. Every
// value below that lands on a surface is therefore contrast-corrected per theme
// — its LIGHTNESS moved, in HSL, until it clears WCAG AA against that theme's
// canvas — and emitted as `light-dark(<light>, <dark>)` rather than as one
// colour. The gym's hue and saturation are preserved; its lightness is not, when
// keeping it would mean text nobody can read. See {@link readableOn} for why the
// correction moves lightness rather than blending toward white, which is the
// version that quietly turns a brand into grey.
//
// `light-dark()` is the right mechanism here rather than a second `.dark` rule
// because `formacore.css` already states the entire palette that way, resolving
// against the `color-scheme` Astryx's `<Theme>` wrapper sets from the portal's
// own toggle. Emitting the same construct means the override rides the existing
// switch instead of racing it.

import type { GymPortalTheme, GymPublicBrand } from '@fit/types';

/**
 * CSS custom properties, ready to spread into an inline `style`. Keyed by the
 * property name so the key itself documents what is being overridden.
 */
export type PortalThemeVars = Record<`--${string}`, string>;

/** An sRGB colour, 0–255 per channel. */
interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The theme's two poles — the ink it writes in (`#131312`) and its paper. */
const INK: Rgb = { r: 0x13, g: 0x13, b: 0x12 };
const PAPER: Rgb = { r: 0xff, g: 0xff, b: 0xff };

/**
 * The surfaces accent TYPE is read on, per theme — `--color-background-surface`
 * from `formacore.css`. The light value is the harder of the two light surfaces
 * (`#FFFFFF` cards over the `#EEEEED` body) and the dark value the harder of the
 * two dark ones (`#1E1E1C` cards over the `#131312` body), so a value corrected
 * against these stays legible on either.
 */
const LIGHT_SURFACE: Rgb = PAPER;
const DARK_SURFACE: Rgb = { r: 0x1e, g: 0x1e, b: 0x1c };

/** WCAG AA for body text. Anything a member has to READ is held to this. */
const TEXT_CONTRAST = 4.5;

/** WCAG AA for large text and UI boundaries — borders, glyphs, outlines. */
const EDGE_CONTRAST = 3;

/**
 * What `--color-text-primary` resolves to per canvas: the theme writes body copy
 * in its ink on the light skin and in its paper on the dark one.
 */
const LIGHT_BODY_TEXT: Rgb = INK;
const DARK_BODY_TEXT: Rgb = PAPER;

/**
 * How far accent type has to sit from body copy before it reads as an accent.
 *
 * Low on purpose — this is not a legibility bar, it is a "did the colour survive
 * at all" bar. Anything under it and the accent is body copy wearing a token
 * name, which is a real regression rather than a subtle one: the sign-in screen's
 * "forgot your password?" link stops looking like a link.
 */
const ACCENT_DISTINCTION = 1.6;

/** How far one correction step moves a colour toward the pole it is heading to. */
const CORRECTION_STEP = 0.04;

const HEX = /^#([0-9a-fA-F]{6})$/;

/** `#4f46e5` → channels, or `null` for anything that is not a six-digit hex. */
function parseHex(value: string): Rgb | null {
  const digits = HEX.exec(value.trim())?.[1];
  if (digits === undefined) return null;
  const n = Number.parseInt(digits, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number): string =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** `weight` of `a` over `b`, channel-wise in sRGB. */
function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  const w = Math.min(1, Math.max(0, weight));
  return {
    r: a.r * w + b.r * (1 - w),
    g: a.g * w + b.g * (1 - w),
    b: a.b * w + b.b * (1 - w),
  };
}

/** WCAG relative luminance — the perceptual lightness contrast is measured on. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours, 1 (identical) to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** An HSL colour: hue in degrees, saturation and lightness 0–1. */
interface Hsl {
  h: number;
  s: number;
  l: number;
}

function toHsl({ r, g, b }: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const span = max - min;
  if (span === 0) return { h: 0, s: 0, l };
  const s = span / (1 - Math.abs(2 * l - 1));
  const h =
    max === rn
      ? 60 * (((gn - bn) / span + 6) % 6)
      : max === gn
        ? 60 * ((bn - rn) / span + 2)
        : 60 * ((rn - gn) / span + 4);
  return { h, s, l };
}

function toRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * `color` made legible on `background` by moving its LIGHTNESS, and only that.
 *
 * Hue and saturation are held fixed on purpose. The obvious implementation —
 * mixing the colour toward white on the dark skin — is what makes a brand stop
 * looking like itself: blending the platform's own `#0f172a` toward paper until
 * it clears AA produces `#828690`, an unsaturated grey a member reads as
 * ordinary secondary text rather than as an accent, so the gym's colour arrives
 * having been thrown away. Raising the same colour's lightness in HSL instead
 * gives a pale slate BLUE — still the gym's hue, now legible, and still visibly
 * an accent. That distinction matters most exactly where the default lands.
 *
 * Direction follows the background: darker on a light surface, lighter on a dark
 * one. A colour that already clears the ratio comes back untouched, which is the
 * common case for a brand picked to be read. If lightness alone cannot get there
 * — a fully saturated yellow on white never clears 4.5:1 at any lightness — the
 * theme's own pole is returned, because a legible near-black beats an on-brand
 * colour nobody can read.
 */
function readableOn(color: Rgb, background: Rgb, minimum: number): Rgb {
  if (contrastRatio(color, background) >= minimum) return color;
  const backgroundIsLight = luminance(background) > 0.45;
  const base = toHsl(color);
  const steps = Math.ceil(1 / CORRECTION_STEP);
  for (let step = 1; step <= steps; step += 1) {
    const shift = step * CORRECTION_STEP;
    const l = backgroundIsLight ? base.l - shift : base.l + shift;
    if (l < 0 || l > 1) break;
    const candidate = toRgb({ ...base, l });
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return backgroundIsLight ? INK : PAPER;
}

/**
 * The ink to write ON a fill of `color` — the theme's near-black or its white,
 * whichever the eye can actually read. Never an in-between: `--color-on-accent`
 * carries button labels, and a half-mixed grey on a saturated block is the one
 * result worse than either pole.
 */
function inkOn(color: Rgb): Rgb {
  return contrastRatio(color, INK) >= contrastRatio(color, PAPER) ? INK : PAPER;
}

/** One value per theme, collapsed to a plain colour when both agree. */
function lightDark(light: string, dark: string): string {
  return light === dark ? light : `light-dark(${light}, ${dark})`;
}

/**
 * Which portal colours the gym actually CHOSE.
 *
 * `null` on a colour means "never chosen" — the gym has not opened Settings →
 * Member portal, or left that field alone — and the portal keeps the shipped
 * palette for it. See {@link chosenPortalColors} for how that is detected from a
 * response that has already resolved the nulls away.
 */
export interface PortalColorChoice {
  primaryColor: string | null;
  accentColor: string | null;
}

/**
 * Recover "did the gym choose this?" from the resolved theme, by comparing it
 * against the brand it would have inherited from.
 *
 * `gymPortalTheme` resolves a `null` portal colour to the brand's before the
 * value crosses the wire, so the API hands us two colours with no record of
 * which were set. The tenant lookup returns the brand alongside it, and the
 * resolution rule is exactly `memberPortal.x ?? brand.y` — so a portal colour
 * equal to the brand colour it falls through to is, by construction, one the gym
 * never set. That matters because the brand's own defaults were written for
 * INVOICES AND RECEIPTS, not for this surface: honouring them here would repaint
 * every existing tenant's portal in the platform indigo on deploy, which is a
 * regression dressed as a feature. A gym gets its colours on this screen because
 * it asked for them, not because a default leaked across.
 *
 * The comparison is case-insensitive, so `#4F46E5` and `#4f46e5` are one colour
 * rather than two.
 *
 * THE ONE DEGENERATE CASE: a gym that deliberately sets a portal colour to the
 * identical value its brand already carries reads as unset and keeps the shipped
 * palette. That is indistinguishable from inheritance by construction — the two
 * states produce byte-identical responses — and the rendered result differs only
 * for that exact pair. The alternative, guessing by comparing against hardcoded
 * platform defaults, is worse: it would misread every gym that deliberately
 * picked the platform's own indigo, and it would rot the moment those defaults
 * change.
 *
 * A missing brand (the lookup allows `brand: null`) means nothing can be
 * compared, so nothing is claimed as chosen — the conservative answer, which
 * leaves the portal exactly as it renders today.
 */
export function chosenPortalColors(
  portal: GymPortalTheme,
  brand: Pick<GymPublicBrand, 'primaryColor' | 'secondaryColor'> | null,
): PortalColorChoice {
  const inherited = (value: string, from: string | undefined): string | null =>
    from === undefined || value.trim().toLowerCase() === from.trim().toLowerCase() ? null : value;
  return {
    primaryColor: brand ? inherited(portal.primaryColor, brand.primaryColor) : null,
    // `accentColor` falls through to the brand's SECONDARY colour — see
    // `gymPortalTheme`, which is the resolution this undoes.
    accentColor: brand ? inherited(portal.accentColor, brand.secondaryColor) : null,
  };
}

/**
 * The custom-property overrides for the colours a gym actually chose.
 *
 * PER COLOUR, not all-or-nothing. A gym that set only `primaryColor` gets the
 * fill ramp repainted and keeps the shipped accent type; one that set only
 * `accentColor` gets the reverse. What you change is what changes, and what you
 * left alone still looks like the product you bought — which is the whole point
 * of gating this, and the reason an unconfigured gym gets an empty map and the
 * Lime Block palette `formacore.css` already renders.
 *
 * A colour that is not a six-digit hex is treated as unchosen for the same
 * reason: the stored schema guarantees the shape, so that only happens against
 * an API old enough not to send the field, and painting half a palette from a
 * value we could not read would be worse than painting none.
 */
export function portalThemeVars(choice: PortalColorChoice): PortalThemeVars {
  const primary = choice.primaryColor === null ? null : parseHex(choice.primaryColor);
  const accent = choice.accentColor === null ? null : parseHex(choice.accentColor);
  const vars: PortalThemeVars = {};

  if (primary) {
    // The tint the theme pairs with accent type — a wash of the brand on the
    // canvas, not a second fill. Light mode washes toward paper, dark toward
    // ink, at the weights `--color-accent-muted` uses for the lime it replaces.
    const mutedLight = mix(primary, PAPER, 0.14);
    const mutedDark = mix(primary, INK, 0.22);
    const muted = lightDark(toHex(mutedLight), toHex(mutedDark));

    // Accent as a FILL. One hex in both themes: the token is a background in
    // almost every consumer, and the ink on it moves instead.
    vars['--color-accent'] = toHex(primary);
    vars['--color-on-accent'] = toHex(inkOn(primary));
    // Hover lightens, as the lime's own `#EFF9A2` does — a darker,
    // pressed-looking state on a block the direction already draws dark reads
    // as broken.
    vars['--fc-accent-hover'] = toHex(mix(PAPER, primary, 0.15));
    vars['--color-accent-muted'] = muted;
    // The "booked" pill is the accent ramp under another name: the muted tint,
    // accent type on it, an accent edge. Its type is corrected against ITS OWN
    // background rather than the canvas, because that is what it sits on.
    vars['--fc-booked'] = muted;
    vars['--fc-on-booked'] = lightDark(
      toHex(readableOn(primary, mutedLight, TEXT_CONTRAST)),
      toHex(readableOn(primary, mutedDark, TEXT_CONTRAST)),
    );
    vars['--fc-booked-border'] = lightDark(
      toHex(readableOn(primary, LIGHT_SURFACE, EDGE_CONTRAST)),
      toHex(readableOn(primary, DARK_SURFACE, EDGE_CONTRAST)),
    );
    // `--fc-focus-ring` is deliberately absent: `formacore.css` already derives
    // it from `var(--color-accent)`, so it follows this override on its own.
  }

  const typeSource = accentTypeSource(accent, primary);
  if (typeSource) {
    // Accent as TYPE, corrected per canvas — see the module docstring.
    const typeAccent = lightDark(
      toHex(readableOn(typeSource, LIGHT_SURFACE, TEXT_CONTRAST)),
      toHex(readableOn(typeSource, DARK_SURFACE, TEXT_CONTRAST)),
    );
    vars['--color-text-accent'] = typeAccent;
    vars['--color-icon-accent'] = typeAccent;
  }

  return vars;
}

/**
 * Which colour the accent TYPE ramp is corrected from, or `null` to leave the
 * shipped one alone.
 *
 * An unchosen `accentColor` yields `null` even when a primary was chosen: the
 * gym changed the fill and said nothing about the type, so the type stays as
 * shipped. A chosen one is used — unless it cannot function as an accent at all,
 * meaning that once made legible it is indistinguishable from body copy (a
 * near-black, most often). Then every link and accented figure would render as
 * plain dark text, which looks less like a themed portal than like a broken one,
 * so the job passes to `primaryColor` if the gym chose one — the accent behaving
 * as the shipped lime does, one hue as both fill and type — and otherwise back
 * to the theme's own. The check runs against BOTH canvases and both must pass,
 * so an accent cannot be a link on one skin and body copy on the other.
 */
function accentTypeSource(accent: Rgb | null, primary: Rgb | null): Rgb | null {
  if (!accent) return null;
  const readsAsAccent =
    contrastRatio(readableOn(accent, LIGHT_SURFACE, TEXT_CONTRAST), LIGHT_BODY_TEXT) >=
      ACCENT_DISTINCTION &&
    contrastRatio(readableOn(accent, DARK_SURFACE, TEXT_CONTRAST), DARK_BODY_TEXT) >=
      ACCENT_DISTINCTION;
  return readsAsAccent ? accent : primary;
}

/**
 * The two theme surfaces and the poles, exported for the spec so it asserts the
 * contrast the portal actually renders rather than numbers of its own.
 */
export const PORTAL_SURFACES = { LIGHT_SURFACE, DARK_SURFACE, INK, PAPER } as const;

/** `#RRGGBB` → channels, for the spec's contrast assertions. Returns `null` otherwise. */
export const parsePortalHex = parseHex;
