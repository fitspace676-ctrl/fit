// The drift guard, mirrored as a unit test (WP-2).
//
// `scripts/check-design-tokens.ts` is the CI gate. This file asserts the SAME
// things one layer earlier, so `pnpm --filter @fit/ui-mobile test` fails on a
// bad token before the push does — the guard catches drift, this catches it
// while you still have the file open.
//
// NOTHING HERE IMPORTS `react-native`. That is the test strategy's one hard
// boundary, and it is why this spec reaches for the leaf modules
// (`../palette`, `./semantic`, `./radii`, …) rather than `./index`, whose
// `./theme` export pulls in React and `useColorScheme`. Keep it that way: the
// day this file needs a renderer is the day it stops being able to run in the
// fast suite.
//
// It also does NOT import `./fonts` for its asset map — `fontAssetMap()`
// `require()`s six `.ttf` binaries that are deliberately not in the repo (see
// `assets/fonts/README.md`). The pure parts of that module are safe and are
// exercised below.

import { describe, expect, it } from 'vitest';

import designTokens from '../../../../forma-core-app/.workstation/design/_design/tokens.json';
// The Tailwind preset is plain ESM with no declaration file, on purpose: it is
// a config, its consumer is Tailwind, and giving it a `.d.mts` would imply an
// API other code should import. The spec reads it as data and narrows every
// access below, so `any` here costs nothing.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- no declaration file by design; see above.
import presetConfig from '../../tailwind.preset.mjs';
import { palette, RETIRED_RAMPS, RAMP_NAMES, RAMP_STOPS, isPaletteValue } from '../palette';
import { fontFamilies, monoFamily, sansFamily, FONT_FILES } from './fonts';
import { CUT_TO_RADIUS, RADIUS_NAMES, clampRadius, radii } from './radii';
import { COLOR_ROLES, RGBA_ALLOWLIST, colorTuples, darkColors, themeColors } from './semantic';
import { SHADOW_NAMES, shadowsFor } from './shadows';
import { layout, spacing } from './spacing';
import { TYPE_ROLES, em, type } from './typography';

/**
 * The design source's raw ramps.
 *
 * STALE FOR EVERYTHING ELSE. `tokens.json` has NO light mode and STILL SHIPS
 * the six ramps the direction retired (`accent`, `iris`, `success`, `warning`,
 * `info`, `flame` — `accent`/`iris` in it are byte-identical copies of ink). It
 * is authoritative for brand/ink/danger stop values and nothing more; the
 * semantic light+dark layer comes from `packages/astryx-theme/src/
 * formacoreTheme.ts` (decision D1). If you are here because the asymmetry
 * bothers you: do not "fix" it by re-adding `success`.
 */
const designColors = designTokens.colors as unknown as Record<string, Record<string, string>>;

const presetColors = (presetConfig as { theme?: { colors?: Record<string, unknown> } }).theme
  ?.colors as Record<string, unknown>;

const hex = (v: string) => v.toUpperCase();

describe('1 — the shipped palette matches the design source', () => {
  it.each(RAMP_NAMES)('%s has the design’s 11 stops, byte for byte', (name) => {
    const expected = designColors[name];
    expect(expected).toBeDefined();

    const shipped = palette[name] as unknown as Record<string, string>;
    expect(
      Object.keys(shipped)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([...RAMP_STOPS]);

    for (const stop of RAMP_STOPS) {
      expect(hex(shipped[stop] as string)).toBe(hex(expected?.[stop] as string));
    }
  });

  it('ships three ramps plus white and transparent — that is the whole palette', () => {
    expect(Object.keys(palette).sort()).toEqual(['brand', 'danger', 'ink', 'transparent', 'white']);
  });

  it('has exactly one literal source: palette.ts restates no hex of its own', () => {
    // The preset and the runtime must resolve to the SAME object graph. If
    // somebody re-types the ramps in either place this fails, which is the one
    // failure mode the last package had no test for.
    expect(presetColors['brand']).toBe(palette.brand);
    expect(presetColors['ink']).toBe(palette.ink);
    expect(presetColors['danger']).toBe(palette.danger);
  });
});

describe('2 — retired ramps are absent', () => {
  const retired = Object.keys(RETIRED_RAMPS);

  it('names all six retirements with a replacement', () => {
    expect(retired.sort()).toEqual(['accent', 'flame', 'info', 'iris', 'success', 'warning']);
    expect(RETIRED_RAMPS['success']).toBe('brand'); // ACTIVE / ATTENDED is lime.
    expect(RETIRED_RAMPS['warning']).toBe('ink'); // WAITLIST / FROZEN is neutral.
  });

  it.each(retired)('%s is not in the shipped palette', (name) => {
    expect(name in palette).toBe(false);
  });

  it.each(retired)('%s is not a Tailwind colour — `bg-%s-500` must not compile', (name) => {
    expect(name in presetColors).toBe(false);
  });

  it('the preset REPLACES theme.colors rather than extending it', () => {
    // This is what makes a retired ramp a build error rather than a silent
    // neutral: Tailwind's own defaults and the base preset's `brand` are gone,
    // so only these five keys generate classes.
    expect(Object.keys(presetColors).sort()).toEqual([
      'brand',
      'danger',
      'ink',
      'transparent',
      'white',
    ]);
  });
});

describe('3 — the shared Tailwind base config carries the design brand', () => {
  // The full assertion lives in `scripts/check-design-tokens.ts`, which can
  // import the `.mjs` config directly. Here we assert the value it must equal,
  // so a repaint that lands in the design source but not in the palette fails
  // in both places.
  it('brand-300 is the lime block colour', () => {
    expect(hex(palette.brand[300])).toBe(hex(designColors['brand']?.['300'] as string));
    expect(hex(palette.brand[300])).toBe('#E4F26A');
  });
});

describe('4 — every semantic value resolves to something nameable', () => {
  it('has a complete light map and a complete dark map', () => {
    expect(COLOR_ROLES.length).toBe(Object.keys(colorTuples).length);
    expect(Object.keys(themeColors(false))).toEqual([...COLOR_ROLES]);
    expect(Object.keys(themeColors(true))).toEqual([...COLOR_ROLES]);
  });

  it.each(COLOR_ROLES)('%s is a palette member or an allowlisted rgba, in both modes', (role) => {
    for (const value of colorTuples[role]) {
      const ok = isPaletteValue(value) || RGBA_ALLOWLIST.has(value);
      expect(`${role}: ${value} → ${ok}`).toBe(`${role}: ${value} → true`);
    }
  });

  it('keeps the rgba allowlist small — every entry is a hole in the guard', () => {
    expect(RGBA_ALLOWLIST.size).toBeLessThanOrEqual(12);
  });

  it('the translucent surfaces in the preset come from the same allowlist', () => {
    const extend = (
      presetConfig as {
        theme?: {
          extend?: {
            backgroundColor?: Record<string, string>;
            borderColor?: Record<string, string>;
          };
        };
      }
    ).theme?.extend;
    for (const value of Object.values(extend?.backgroundColor ?? {})) {
      expect(RGBA_ALLOWLIST.has(value)).toBe(true);
    }
    for (const value of Object.values(extend?.borderColor ?? {})) {
      expect(RGBA_ALLOWLIST.has(value)).toBe(true);
    }
  });

  it('never flips text-on-lime to white — it is ~1.5:1 and unreadable', () => {
    expect(colorTuples.onAccent).toEqual([palette.ink[950], palette.ink[950]]);
  });

  it('keeps the lime identical in both modes — the block does not change theme', () => {
    expect(colorTuples.accent[0]).toBe(colorTuples.accent[1]);
  });

  // =========================================================================
  // THE COVER SCRIM IS ARITHMETIC, NOT TASTE.
  //
  // A class card can be drawn over a photograph (`ClassCard`'s `coverImageUrl`),
  // and a photograph can be any colour — so the worst case is a white one, and
  // over white the SCRIM is the background every run of text on that card is
  // read against. These four assertions are the reason the scrim is 72% and
  // the reason the muted text stop is promoted to ink-200 over it; lower
  // either and this fails with the number it would have shipped.
  //
  // sRGB relative luminance and the WCAG 2.x ratio, written out because the
  // one implementation in the repo lives in `apps/web` and this package must
  // not import an app.
  // =========================================================================
  const rgb = (value: string): [number, number, number] => {
    const h = value.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  };
  const luminance = (c: [number, number, number]): number => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: [number, number, number], b: [number, number, number]): number => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  /** `scrim` composited over a pure-white photograph — the worst case. */
  const overWhite = (scrim: string): [number, number, number] => {
    const parsed = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(scrim);
    if (!parsed) throw new Error(`not an rgba(): ${scrim}`);
    const alpha = Number(parsed[4]);
    return [1, 2, 3].map((i) => Number(parsed[i]) * alpha + 255 * (1 - alpha)) as [
      number,
      number,
      number,
    ];
  };

  const WORST_CASE = overWhite(colorTuples.coverScrim[1]);
  /** WCAG AA for body text. The card's meta line is 13px; nothing here is large-scale. */
  const AA = 4.5;

  it('keeps a class title legible over a cover on the brightest possible photo', () => {
    expect(contrast(rgb(colorTuples.onDark[1]), WORST_CASE)).toBeGreaterThanOrEqual(7);
  });

  it('keeps the PROMOTED muted stop legible there too', () => {
    expect(contrast(rgb(colorTuples.onCoverMuted[1]), WORST_CASE)).toBeGreaterThanOrEqual(AA);
  });

  it('records why the promotion exists — textSecondary cannot survive a cover', () => {
    // Both modes' secondary stops fail over the scrim, which is the whole
    // argument for `onCoverMuted`. If this ever passes, the promotion can go.
    expect(contrast(rgb(colorTuples.textSecondary[1]), WORST_CASE)).toBeLessThan(AA);
    expect(contrast(rgb(colorTuples.textSecondary[0]), WORST_CASE)).toBeLessThan(AA);
  });

  it('holds when the pressed state swaps in the heavier sheet scrim', () => {
    const pressedCase = overWhite(colorTuples.scrim[1]);
    expect(contrast(rgb(colorTuples.onDark[1]), pressedCase)).toBeGreaterThanOrEqual(7);
    expect(contrast(rgb(colorTuples.onCoverMuted[1]), pressedCase)).toBeGreaterThanOrEqual(AA);
  });

  it('is mode-independent, like every other colour that sits on a photo', () => {
    expect(colorTuples.coverScrim[0]).toBe(colorTuples.coverScrim[1]);
    expect(colorTuples.onCoverMuted[0]).toBe(colorTuples.onCoverMuted[1]);
  });

  it('resolves both modes to stable references so useTheme() can be memoised', () => {
    expect(themeColors(true)).toBe(themeColors(true));
    expect(themeColors(true)).toBe(darkColors);
    expect(themeColors(true)).not.toBe(themeColors(false));
  });
});

// ===========================================================================
// 5 — the icon-dictionary diff is NOT implemented. `src/primitives/icon.tsx`
// does not exist yet; WP-5 builds it. See the matching TODO block in
// `scripts/check-design-tokens.ts` for what it should assert when it lands.
// ===========================================================================

describe('radii — the ladder and its escape hatch (Q3)', () => {
  it('ships six named steps and no seventh', () => {
    expect(Object.keys(radii)).toEqual([...RADIUS_NAMES]);
    expect(RADIUS_NAMES).toHaveLength(6);
  });

  it('maps every CUT_* inset the artboards use onto a real rung', () => {
    expect(Object.keys(CUT_TO_RADIUS)).toEqual([
      'CUT_XS',
      'CUT_SM',
      'CUT_MD',
      'CUT_TILE',
      'CUT_PANEL',
      'CUT_LG',
    ]);
    for (const { radius } of Object.values(CUT_TO_RADIUS)) {
      expect(RADIUS_NAMES).toContain(radius);
    }
    // The two the moodboard names directly.
    expect(radii[CUT_TO_RADIUS.CUT_PANEL.radius]).toBe(26);
    expect(radii[CUT_TO_RADIUS.CUT_LG.radius]).toBe(32);
  });

  it('passes literal artboard radii through instead of snapping them', () => {
    for (const value of [18, 20, 22, 28, 30]) {
      expect(clampRadius(value)).toBe(value);
    }
  });

  it('resolves names, clamps numbers, and never returns something RN rejects', () => {
    expect(clampRadius('container')).toBe(26);
    expect(clampRadius(-4)).toBe(0);
    expect(clampRadius(1e9)).toBe(radii.full);
    expect(clampRadius(13.6)).toBe(14);
    expect(clampRadius(Number.NaN)).toBe(0);
    expect(clampRadius(undefined)).toBe(0);
    expect(clampRadius(null)).toBe(0);
  });

  it('agrees with the Tailwind preset rung for rung', () => {
    const presetRadii = (presetConfig as { theme?: { borderRadius?: Record<string, string> } })
      .theme?.borderRadius as Record<string, string>;
    for (const name of RADIUS_NAMES) {
      expect(presetRadii[name]).toBe(`${radii[name]}px`);
    }
    // The artboards' own class names, aliased so a ported screen reads the way
    // it was authored.
    expect(presetRadii['card']).toBe(presetRadii['container']);
    expect(presetRadii['block']).toBe(presetRadii['page']);
    expect(presetRadii['pill']).toBe(presetRadii['full']);
    expect(presetRadii['btn']).toBe(presetRadii['element']);
    expect(presetRadii['field']).toBe(presetRadii['element']);
    expect(presetRadii['chip']).toBe(presetRadii['inner']);
  });
});

describe('typography — absolute px, always (RN has no em)', () => {
  it('multiplies em tracking out to points', () => {
    expect(em(11, 0.12)).toBe(1.32);
    expect(em(12, 0.14)).toBe(1.68);
    expect(em(34, -0.025)).toBe(-0.85);
  });

  it.each(TYPE_ROLES)('%s has an absolute lineHeight and letterSpacing', (role) => {
    const style = type[role];
    expect(Number.isFinite(style.lineHeight)).toBe(true);
    expect(Number.isFinite(style.letterSpacing)).toBe(true);
    // A relative lineHeight (1.05, 1.625) is the classic port bug: RN reads it
    // as 1.05 POINTS and the text collapses to an invisible line.
    expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
  });

  it('never leaves Georgian display type on the font’s own metrics', () => {
    // ≥20px sans with a 1.0 ratio clips Georgian descenders on Android. The
    // artboards' `leading-none` deliberately does NOT port literally.
    for (const role of TYPE_ROLES) {
      const style = type[role];
      const isMono =
        typeof style.fontFamily === 'string' && style.fontFamily.startsWith('JetBrains');
      if (isMono || style.fontSize < 20) continue;
      expect(style.lineHeight / style.fontSize).toBeGreaterThan(1.05);
    }
  });

  it('sets fontFamily XOR fontWeight — RN does not synthesise custom-family weights', () => {
    for (const role of TYPE_ROLES) {
      const style = type[role];
      const hasFamily = style.fontFamily !== undefined;
      const hasWeight = style.fontWeight !== undefined;
      expect(`${role}: ${hasFamily} ${hasWeight}`).toBe(`${role}: ${hasFamily} ${!hasFamily}`);
    }
  });

  it('agrees with the Tailwind preset on every size it names', () => {
    const presetSizes = (
      presetConfig as {
        theme?: {
          fontSize?: Record<string, [string, { lineHeight: string; letterSpacing: string }]>;
        };
      }
    ).theme?.fontSize as Record<string, [string, { lineHeight: string; letterSpacing: string }]>;
    const pairs: Array<[string, keyof typeof type]> = [
      ['display', 'display'],
      ['title', 'title'],
      ['heading', 'heading'],
      ['subheading', 'subheading'],
      ['section', 'section'],
      ['subtitle', 'subtitle'],
      ['body-lg', 'bodyLarge'],
      // `body` and `bodyRegular` differ only in weight, which Tailwind's
      // `fontSize` does not carry — one utility, two RN roles.
      ['body', 'body'],
      ['body', 'bodyRegular'],
      ['body-sm', 'bodySmall'],
      ['caption', 'caption'],
      ['label', 'label'],
      ['eyebrow', 'eyebrow'],
      ['micro', 'micro'],
      ['mono-display', 'monoDisplay'],
      ['mono-lg', 'monoLarge'],
      ['mono-body', 'monoBody'],
      ['mono-sm', 'monoSmall'],
      ['mono-caption', 'monoCaption'],
      ['mono-micro', 'monoMicro'],
    ];
    // Every role must appear — a role with no `text-*` class is a role a
    // class-authored screen cannot reach, which is how a local kit starts.
    expect(pairs.map(([, role]) => role).sort()).toEqual([...TYPE_ROLES].sort());
    for (const [className, role] of pairs) {
      const [size, rest] = presetSizes[className] as [
        string,
        { lineHeight: string; letterSpacing: string },
      ];
      expect(size).toBe(`${type[role].fontSize}px`);
      expect(rest.lineHeight).toBe(`${type[role].lineHeight}px`);
      expect(rest.letterSpacing).toBe(`${type[role].letterSpacing}px`);
    }
  });
});

describe('fonts — one registered family per weight (Q4)', () => {
  it('registers four mono faces and two Georgian heading faces', () => {
    expect(Object.values(fontFamilies)).toHaveLength(6);
    expect(Object.keys(FONT_FILES).sort()).toEqual(Object.values(fontFamilies).sort());
  });

  it('names every file it expects a human to drop in', () => {
    for (const file of Object.values(FONT_FILES)) expect(file).toMatch(/\.ttf$/);
  });

  it('resolves mono at every weight, because every mono weight is bundled', () => {
    expect(monoFamily('400')).toBe(fontFamilies.mono400);
    expect(monoFamily('700')).toBe(fontFamilies.mono700);
  });

  it('leaves sans body weights on the system font and bundles only 700/800', () => {
    expect(sansFamily('400')).toBeUndefined();
    expect(sansFamily('600')).toBeUndefined();
    expect(sansFamily('700')).toBe(fontFamilies.sans700);
    expect(sansFamily('800')).toBe(fontFamilies.sans800);
  });
});

describe('shadows — four steps, one shadow per view', () => {
  it.each(SHADOW_NAMES)('%s is a complete RN shadow plus an Android elevation', (name) => {
    const s = shadowsFor(true)[name];
    expect(typeof s.shadowColor).toBe('string');
    expect(s.shadowOffset.width).toBe(0);
    expect(s.shadowOffset.height).toBeGreaterThan(0);
    expect(s.shadowOpacity).toBeGreaterThan(0);
    expect(s.shadowRadius).toBeGreaterThan(0);
    expect(s.elevation).toBeGreaterThan(0);
  });

  it('rises monotonically, so a floating thing cannot read as lower than a chip', () => {
    const steps = SHADOW_NAMES.map((n) => shadowsFor(true)[n]);
    for (let i = 1; i < steps.length; i += 1) {
      expect((steps[i] as { elevation: number }).elevation).toBeGreaterThan(
        (steps[i - 1] as { elevation: number }).elevation,
      );
    }
  });

  it('casts warm in light and true black in dark', () => {
    expect(shadowsFor(false).float.shadowColor).toBe(palette.ink[950]);
    expect(shadowsFor(true).float.shadowColor).toBe('#000000');
  });
});

describe('spacing — the numbers screens would otherwise hardcode', () => {
  it('puts the tab-bar inset at the artboards’ pb-32', () => {
    // `useTabBarInset()` (WP-6) must return exactly this at safe-area inset 0.
    expect(layout.tabBarInset).toBe(128);
  });

  it('puts the screen gutter at the artboards’ px-5', () => {
    expect(layout.screenGutter).toBe(20);
  });

  it('keeps the accessibility floor where a11y wants it', () => {
    expect(layout.minTouchTarget).toBe(44);
  });

  it('agrees with the Tailwind preset step for step', () => {
    const presetSpacing = (presetConfig as { theme?: { spacing?: Record<string, string> } }).theme
      ?.spacing as Record<string, string>;
    for (const [step, value] of Object.entries(spacing)) {
      expect(presetSpacing[step]).toBe(`${value}px`);
    }
  });
});
