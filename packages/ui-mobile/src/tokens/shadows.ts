// Elevation — four steps, in RN's shadow vocabulary.
//
// ===========================================================================
// ELEVATION BELONGS TO FLOATING THINGS ONLY.
//
// The moodboard is explicit ("Elevation — მხოლოდ მცურავს", elevation is for
// floating things): cards sit FLAT on the canvas and separate by surface step
// (ink-950 page → ink-900 card), not by shadow. The only permanently elevated
// element in the product is the floating nav capsule. If you are reaching for
// `shadows.card` on a list item, the answer is almost certainly `tile` or a
// hairline border instead.
//
// THE FOUR STEPS are the moodboard's own elevation board — `xs`, `card`, `pop`,
// `float` — and their values come from the compiled web theme
// (`packages/astryx-theme/dist/formacore.css`, `--shadow-low/med/high`).
//
// COLLAPSING A TWO-LAYER WEB SHADOW TO ONE RN SHADOW.
//
// Each web step is three layers: a tight KEY shadow, a wide AMBIENT shadow, and
// an inset rim light. RN gives a view exactly one shadow — `shadowOffset` /
// `shadowRadius` / `shadowOpacity` on iOS, a single `elevation` on Android — so
// each step here collapses to its AMBIENT layer, the wide soft one. That is the
// right layer to keep: the ambient is what reads as "this is floating above the
// page"; the key layer only sharpens the contact edge, and on a charcoal canvas
// at 40-70% opacity it is not separately visible. `xs` is the exception — it IS
// the key layer of `--shadow-low`, because a step below "card" has no ambient
// layer of its own to keep.
//
// THE INSET RIM LIGHT HAS NO RN EQUIVALENT. `inset 0 0 0 1px rgba(255,255,255,
// 0.08-0.15)` is what stops a dark floating surface from dissolving into a dark
// page — the shadow alone gives it no edge. RN has no inset shadow and no
// second shadow, so on dark surfaces that rim becomes a HAIRLINE BORDER:
// `borderWidth: 1` with `colors.glassBorder` (white at 12%), which is the same
// value the web rim uses at the `med` step. Components that float
// (`FloatingTabBar`, `Sheet`, `Popover`) must set that border, not just the
// shadow; the shadow without the rim is the "floating black rectangle on a
// black page" look.
// ===========================================================================

import { ink } from '../palette';

/**
 * Pure black, deliberately NOT a palette member.
 *
 * A shadow is not a surface, so it does not take a surface colour. The warm
 * ink-950 the light mode casts keeps a lifted white card from going blue-grey
 * against the charcoal page; in dark mode the canvas is already ink-950 and a
 * warm shadow on it is invisible, so the cast goes to true black — which is
 * what the web theme does too (`light-dark(rgba(19,19,18,…), rgba(0,0,0,…))`).
 */
const SHADOW_BLACK = '#000000';

/** One elevation step, ready to spread into a `View`'s style. */
export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android. RN ignores the `shadow*` fields there and reads only this. */
  elevation: number;
}

/** The geometry of each step. Colour and opacity are applied per mode below. */
const STEPS = {
  /** Barely lifted: a chip that has left the surface, a pressed pill. */
  xs: { offset: 2, radius: 4, elevation: 1, light: 0.06, dark: 0.25 },
  /** A card that genuinely floats — rare; most cards should be flat. */
  card: { offset: 4, radius: 8, elevation: 2, light: 0.1, dark: 0.4 },
  /** A popover or menu, above the page but anchored to something in it. */
  pop: { offset: 4, radius: 12, elevation: 6, light: 0.1, dark: 0.5 },
  /** The floating nav capsule and the sheet — the top of the stack. */
  float: { offset: 12, radius: 24, elevation: 12, light: 0.15, dark: 0.7 },
} as const;

/** A named elevation step. */
export type ShadowName = keyof typeof STEPS;

/** Every step name, for the guard, the spec and the kit gallery. */
export const SHADOW_NAMES = ['xs', 'card', 'pop', 'float'] as const;

/** The resolved four-step scale for one mode. */
export type Shadows = Readonly<Record<ShadowName, ShadowStyle>>;

function resolve(isDark: boolean): Shadows {
  const out: Record<string, ShadowStyle> = {};
  for (const [name, s] of Object.entries(STEPS)) {
    out[name] = {
      shadowColor: isDark ? SHADOW_BLACK : ink[950],
      shadowOffset: { width: 0, height: s.offset },
      shadowOpacity: isDark ? s.dark : s.light,
      shadowRadius: s.radius,
      elevation: s.elevation,
    };
  }
  return out as Shadows;
}

/** Resolved once per mode — see the note in `semantic.ts` about identity. */
export const lightShadows: Shadows = resolve(false);
export const darkShadows: Shadows = resolve(true);

/** The four-step elevation scale for a mode. Referentially stable. */
export function shadowsFor(isDark: boolean): Shadows {
  return isDark ? darkShadows : lightShadows;
}
