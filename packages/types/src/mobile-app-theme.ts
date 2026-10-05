// The mobile app's accent, derived from the one colour a gym picks.
//
// The app's theme (`packages/ui-mobile/src/tokens/semantic.ts`) names a dozen
// accent roles — the fill, the ink on it, the pressed state, the tint, accent
// type, the booked pill, the focus ring. A gym chooses ONE hex; this module
// turns it into every one of those roles, once per mode, with the same
// lightness-only correction `portal-theme.ts` applies on the member site.
//
// LEGIBILITY WINS OVER FIDELITY, as on the portal:
//
//   * The FILL clears 3:1 (WCAG 1.4.11) against both of its mode's surfaces, so
//     a yellow button does not dissolve into the light canvas and a navy one into
//     the dark. A colour that already clears it is used exactly as chosen.
//   * The LABEL on the fill is white, the theme's ink, or — for the narrow band
//     of mid-tones neither reaches — pure black: always at least 4.5:1.
//   * Accent TYPE (links, active labels, icons) clears 4.5:1 on its surfaces.
//
// Pure and dependency-free, so the API, the console preview and the app all
// compute the same answer and the spec pins it.

import { PORTAL_SURFACES, contrastRatio, portalColorMath } from './portal-theme';

const { parseHex, toHex, mix, readableOn } = portalColorMath;
const { INK, PAPER } = PORTAL_SURFACES;
type Rgb = NonNullable<ReturnType<typeof parseHex>>;

const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** WCAG AA for text. Every label and every accented word is held to it. */
export const MOBILE_ACCENT_TEXT_CONTRAST = 4.5;
/** WCAG 1.4.11 for a control's fill against the surface it sits on. */
export const MOBILE_ACCENT_FILL_CONTRAST = 3;

/**
 * The surfaces of the app, per mode (`semantic.ts`: `backgroundBody` and
 * `backgroundCard`). Each colour is corrected against the HARDER of its mode's
 * two: a dark colour on the light ink-100 page, a light one on the dark ink-900
 * card.
 */
export const MOBILE_APP_SURFACES = {
  light: { body: '#EEEEED', card: '#FFFFFF' },
  dark: { body: '#131312', card: '#1E1E1C' },
} as const;

const LIGHT_BODY = parseHex(MOBILE_APP_SURFACES.light.body) as Rgb;
const DARK_CARD = parseHex(MOBILE_APP_SURFACES.dark.card) as Rgb;

/**
 * The text colour for a label on a fill of `hex` — `#FFFFFF`, `#131312` (the
 * theme's ink) or `#000000` — chosen so the pair measures at least 4.5:1.
 *
 * White wins when it clears the bar, then the ink. When neither does (a
 * saturated mid-tone; the ink is a hair lighter than black), pure black always
 * does: a fill white fails on has luminance above ~0.18, and black on that
 * measures over 4.6:1. `null` for anything that is not a six-digit hex.
 */
export function readableTextOn(hex: string): string | null {
  const fill = parseHex(hex);
  if (!fill) return null;
  return toHex(readableLabel(fill));
}

function readableLabel(fill: Rgb): Rgb {
  if (contrastRatio(fill, PAPER) >= MOBILE_ACCENT_TEXT_CONTRAST) return PAPER;
  if (contrastRatio(fill, INK) >= MOBILE_ACCENT_TEXT_CONTRAST) return INK;
  return BLACK;
}

/** The accent roles of `semantic.ts` a gym colour replaces, in one mode. */
export interface MobileAccentRoles {
  accent: string;
  accentHover: string;
  accentMuted: string;
  onAccent: string;
  textAccent: string;
  iconAccent: string;
  success: string;
  successMuted: string;
  onSuccess: string;
  booked: string;
  onBooked: string;
  bookedBorder: string;
  focusRing: string;
}

export interface MobileAccentPalette {
  light: MobileAccentRoles;
  dark: MobileAccentRoles;
}

/**
 * `readableOn`, landed on a whole `#RRGGBB`. The correction stops at the first
 * step past the bar, so rounding the channels could drop it back under; a
 * colour that has to move aims a hair higher instead.
 */
function legible(color: Rgb, background: Rgb, minimum: number): Rgb {
  if (contrastRatio(color, background) >= minimum) return color;
  return parseHex(toHex(readableOn(color, background, minimum + 0.05))) as Rgb;
}

function rolesFor(primary: Rgb, surface: Rgb, tint: Rgb): MobileAccentRoles {
  const muted = parseHex(toHex(tint)) as Rgb;
  const fill = legible(primary, surface, MOBILE_ACCENT_FILL_CONTRAST);
  const type = toHex(legible(primary, surface, MOBILE_ACCENT_TEXT_CONTRAST));
  const label = toHex(readableLabel(fill));
  const ring = (v: number): number => Math.round(Math.min(255, Math.max(0, v)));
  return {
    accent: toHex(fill),
    // Lighter when pressed, as the shipped `brand[400]` over `brand[500]` is.
    accentHover: toHex(mix(PAPER, fill, 0.15)),
    accentMuted: toHex(muted),
    onAccent: label,
    textAccent: type,
    iconAccent: type,
    success: toHex(fill),
    successMuted: toHex(muted),
    onSuccess: label,
    booked: toHex(muted),
    onBooked: toHex(legible(primary, muted, MOBILE_ACCENT_TEXT_CONTRAST)),
    bookedBorder: toHex(fill),
    focusRing: `rgba(${ring(fill.r)}, ${ring(fill.g)}, ${ring(fill.b)}, 0.40)`,
  };
}

/**
 * Every accent role for both modes, or `null` when `hex` is not a colour — the
 * app then keeps its built-in theme.
 */
export function mobileAccentPalette(hex: string | null | undefined): MobileAccentPalette | null {
  const primary = typeof hex === 'string' ? parseHex(hex) : null;
  if (!primary) return null;
  return {
    // The tints are the portal's weights: a wash toward paper in light, toward
    // the ink in dark.
    light: rolesFor(primary, LIGHT_BODY, mix(primary, PAPER, 0.14)),
    dark: rolesFor(primary, DARK_CARD, mix(primary, INK, 0.22)),
  };
}
