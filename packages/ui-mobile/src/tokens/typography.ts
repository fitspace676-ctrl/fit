// Typography — the type roles, as ready-to-spread RN text styles.
//
// ===========================================================================
// EVERYTHING HERE IS ABSOLUTE PX. RN HAS NO `em`.
//
// The artboards author tracking and leading relatively — `tracking-[0.14em]`,
// `tracking-tight` (-0.025em), `leading-none` (1.0), `leading-relaxed` (1.625).
// React Native's `letterSpacing` and `lineHeight` are POINTS. Passing 0.14
// through unconverted gives a fourteen-hundredth of the intended tracking and
// looks like nothing happened; passing 1.625 as a lineHeight gives a 1.6pt line
// box and the text disappears. Both mistakes are silent. So every relative
// value from the artboards is multiplied out here, once, by {@link em}, and the
// roles below are the only place a size and its tracking meet.
//
// EVERY ROLE HAS AN EXPLICIT lineHeight. This is not tidiness. On Android an RN
// `<Text>` with no `lineHeight` uses the font's own metrics, and Noto Sans
// Georgian's ascent/descent are tighter than the glyphs it actually draws:
// Georgian descenders (ჟ ღ ჯ ც ძ ყ ფ ქ) get clipped at the bottom of the line
// box, worst at display sizes. The old app hit this on every screen title.
//
// AND THAT IS WHY `leading-none` DOES NOT PORT AS 1.0 ON THE SANS ROLES.
// The artboards set `leading-none` on the big headings, which is correct for a
// browser rendering Latin at 34px. Ported literally it clips Georgian on
// Android. The sans display roles below therefore sit at ~1.10-1.18 — the
// tightest ratio that still clears the descender on the deepest Georgian glyph
// at that size. The MONO roles keep 1.0-1.07, because they only ever carry
// numerals, and the direction's signature move (the giant time cropped off the
// edge of the class block) depends on that leading being tight.
// ===========================================================================

import { monoFamily, sansFamily, type FontWeightValue } from './fonts';

/**
 * A text style, structurally compatible with RN's `TextStyle`.
 *
 * Declared locally rather than imported from `react-native` on purpose: it
 * keeps this module (and everything that imports it) runnable under Vitest,
 * which is the test-strategy boundary — Vitest for anything that does not
 * import `react-native`, jest-expo only for render tests.
 */
export interface TypeStyle {
  fontSize: number;
  /** Always set. See the header. */
  lineHeight: number;
  /** Always set, in points, already multiplied out of `em`. */
  letterSpacing: number;
  /** A bundled family name, or omitted to ride the system sans. */
  fontFamily?: string;
  /** Set ONLY when `fontFamily` is omitted — see below. */
  fontWeight?: FontWeightValue;
  textTransform?: 'uppercase';
}

/**
 * Convert an `em` tracking value to points at a given size, to 2dp.
 *
 * `em(11, 0.12)` → 1.32. Exported so a one-off in a screen can be derived the
 * same way rather than eyeballed.
 */
export function em(fontSize: number, value: number): number {
  return Math.round(fontSize * value * 100) / 100;
}

/** Tailwind's tracking scale, as the artboards use it. */
const TRACK_TIGHT = -0.025;
const TRACK_LABEL = 0.12;
const TRACK_EYEBROW = 0.14;
const TRACK_MICRO = 0.1;

/**
 * Build a role.
 *
 * THE `fontFamily` / `fontWeight` RULE, in one place. RN does not synthesise
 * weights for a custom family on Android (see `fonts.ts`), so a bundled face is
 * selected BY NAME and `fontWeight` must be left off — setting both gives a
 * double-bolded face on iOS and the wrong face on Android. The system sans is
 * the opposite: no `fontFamily`, and `fontWeight` does its normal job.
 *
 * Encoding that here means no component and no screen ever has to remember it.
 */
function role(
  family: 'sans' | 'mono',
  fontSize: number,
  weight: FontWeightValue,
  lineHeight: number,
  tracking = 0,
  uppercase = false,
): TypeStyle {
  const fontFamily = family === 'mono' ? monoFamily(weight) : sansFamily(weight);
  return {
    fontSize,
    lineHeight,
    letterSpacing: em(fontSize, tracking),
    ...(fontFamily ? { fontFamily } : { fontWeight: weight }),
    ...(uppercase ? { textTransform: 'uppercase' as const } : {}),
  };
}

/**
 * The type roles.
 *
 * Sizes are the ones the six mobile artboards actually use, counted rather than
 * invented: 33×12px, 25×13px, 24×11px, 23×15px, 12×14px, 8×22px, 8×20px,
 * 6×10px, 5×28px, 5×24px, 4×30px, 3×34px, 3×17px, 3×16px. Everything below one
 * occurrence (9px, 19px, 26px, 18px) was folded into its neighbour — a role
 * with a single call site is a literal wearing a name.
 */
export const type = {
  // ---- Display. `font-extrabold` + `tracking-tight`, the direction's voice. --
  /** 34px. Screen heroes: the login headline, the "PREMIUM" block. */
  display: role('sans', 34, '800', 38, TRACK_TIGHT),
  /** 28px. The largest in-page block title. */
  title: role('sans', 28, '800', 32, TRACK_TIGHT),
  /** 24px. Screen titles, membership plan names. */
  heading: role('sans', 24, '800', 28, TRACK_TIGHT),
  /** 22px. Card headlines — the most common big type on the artboards. */
  subheading: role('sans', 22, '800', 26, TRACK_TIGHT),
  /** 20px. Section headers. */
  section: role('sans', 20, '800', 24, TRACK_TIGHT),

  // ---- Body. System sans; `fontWeight` carries the weight. -------------------
  /** 17px / 700. A list row's primary line, a sheet title. */
  subtitle: role('sans', 17, '700', 22),
  /** 16px / 700. A row title one step down from `subtitle`. */
  bodyLarge: role('sans', 16, '700', 22),
  /** 15px / 600. The default emphasised body line. */
  body: role('sans', 15, '600', 21),
  /** 15px / 400. Running prose at body size. */
  bodyRegular: role('sans', 15, '400', 21),
  /** 13px / 400. Secondary copy — `leading-relaxed` on the artboards. */
  bodySmall: role('sans', 13, '400', 21),
  /** 12px / 500. Metadata, timestamps, helper text. */
  caption: role('sans', 12, '500', 16),

  // ---- Eyebrows. Uppercase + wide tracking; never sentence case. ------------
  /** 11px / 600 / 0.12em uppercase. The workhorse eyebrow (12 artboard uses). */
  label: role('sans', 11, '600', 14, TRACK_LABEL, true),
  /** 12px / 600 / 0.14em uppercase. The wider eyebrow on lime blocks. */
  eyebrow: role('sans', 12, '600', 16, TRACK_EYEBROW, true),
  /** 10px / 600 / 0.10em uppercase. Tab labels, the smallest legible eyebrow. */
  micro: role('sans', 10, '600', 13, TRACK_MICRO, true),

  // ---- Mono. Numerals only. Tight leading is the point. ---------------------
  /** 30px / 700. The giant cropped numeral — the direction's signature. */
  monoDisplay: role('mono', 30, '700', 30),
  /** 17px / 700. A prominent figure: a price, a class time in a row. */
  monoLarge: role('mono', 17, '700', 18),
  /** 15px / 700. Money in a pill, a quantity in a stepper. */
  monoBody: role('mono', 15, '700', 16),
  /** 13px / 700. Inline figures beside body text. */
  monoSmall: role('mono', 13, '700', 14),
  /** 12px / 400. Dense tabular figures — the one unbolded mono role. */
  monoCaption: role('mono', 12, '400', 14),
  /** 10px / 700. The cart-badge count, a spot figure inside a 20px circle. */
  monoMicro: role('mono', 10, '700', 12),
} as const satisfies Record<string, TypeStyle>;

/** A named type role. */
export type TypeRole = keyof typeof type;

/** Every role name, for the guard, the spec and the kit gallery. */
export const TYPE_ROLES = Object.keys(type) as readonly TypeRole[];

/**
 * `tabular-nums` in RN.
 *
 * Spread alongside a mono role wherever a figure updates in place — a countdown,
 * an occupancy count, a quantity — or the number jitters as its glyph widths
 * change. 34 nodes across the artboards carry `tabular-nums`; JetBrains Mono is
 * already monospaced, so this matters most on the SANS roles that show figures.
 */
export const tabularNums = { fontVariant: ['tabular-nums'] as const };
