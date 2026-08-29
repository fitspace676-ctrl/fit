import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  type GymPortalTheme,
  type GymPublicBrand,
} from '@fit/types';
import {
  chosenPortalColors,
  contrastRatio,
  parsePortalHex,
  portalThemeVars,
  PORTAL_SURFACES,
  type PortalThemeVars,
} from './portal-theme';

/**
 * A gym's two colours, held to the one promise that matters.
 *
 * The feature is a text field in a settings form, which makes it very easy to
 * ship the failure: a gym types its brand navy, the portal dutifully paints
 * `--color-text-accent` navy, and every accent line on the DARK skin becomes
 * invisible. Nobody notices, because the person who configured it looks at the
 * light one. The same trap runs the other way for a pale brand on the light
 * skin, and a third time on `--color-on-accent`, where the label on a button
 * disappears into the button.
 *
 * So these are contrast assertions, not snapshot assertions. They pin the
 * PROMISE — every value the portal reads is legible in both themes, for brands
 * at both ends of the lightness range — rather than the particular hexes the
 * correction happens to produce, which are free to change.
 */

const { LIGHT_SURFACE, DARK_SURFACE, INK, PAPER } = PORTAL_SURFACES;

/** WCAG AA for body text — the bar `--color-text-accent` has to clear. */
const AA_TEXT = 4.5;

/** The two halves of a `light-dark(a, b)` value, or the value twice if it is flat. */
function themes(value: string): { light: string; dark: string } {
  const match = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(value);
  const light = match?.[1];
  const dark = match?.[2];
  return light !== undefined && dark !== undefined
    ? { light, dark }
    : { light: value, dark: value };
}

/** Contrast of a token's value against a surface, per theme. */
function contrastOn(value: string, surface: { r: number; g: number; b: number }): number {
  const parsed = parsePortalHex(value);
  if (!parsed) throw new Error(`not a hex colour: ${value}`);
  return contrastRatio(parsed, surface);
}

/** Both colours chosen — the fully configured gym. */
function varsFor(primaryColor: string, accentColor: string): PortalThemeVars {
  return portalThemeVars({ primaryColor, accentColor });
}

/** What the tenant lookup hands the scope, from one `GET /gyms/by-subdomain` body. */
function skinFor(portal: Partial<GymPortalTheme>, brand: Partial<GymPublicBrand> | null) {
  const resolved: GymPortalTheme = {
    loginImageUrl: null,
    primaryColor: DEFAULT_PRIMARY_COLOR,
    accentColor: DEFAULT_SECONDARY_COLOR,
    ...portal,
  };
  return chosenPortalColors(
    resolved,
    brand === null
      ? null
      : {
          primaryColor: DEFAULT_PRIMARY_COLOR,
          secondaryColor: DEFAULT_SECONDARY_COLOR,
          ...brand,
        },
  );
}

/**
 * Brands chosen to break the naive implementation: a near-black that vanishes in
 * dark mode, a near-white that vanishes in light mode, a saturated mid-tone that
 * passes neither surface untouched, and the platform's own defaults.
 */
const BRANDS: [name: string, primary: string, accent: string][] = [
  ['platform defaults', DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR],
  ['near-black', '#0B0B0C', '#111827'],
  ['near-white', '#FAFAF5', '#F2F5E1'],
  ['saturated mid-tone', '#E11D48', '#0EA5E9'],
  ['the shipped lime', '#E4F26A', '#63701D'],
];

describe('portalThemeVars', () => {
  it.each(BRANDS)('keeps accent type legible in both themes (%s)', (_name, primary, accent) => {
    const { light, dark } = themes(varsFor(primary, accent)['--color-text-accent'] ?? '');
    expect(contrastOn(light, LIGHT_SURFACE)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastOn(dark, DARK_SURFACE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(BRANDS)('keeps a label readable on the accent fill (%s)', (_name, primary, accent) => {
    const vars = varsFor(primary, accent);
    const fill = parsePortalHex(vars['--color-accent'] ?? '');
    const on = parsePortalHex(vars['--color-on-accent'] ?? '');
    expect(fill).not.toBeNull();
    expect(on).not.toBeNull();
    if (!fill || !on) return;
    expect(contrastRatio(fill, on)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(BRANDS)(
    'keeps the booked pill readable on its own tint (%s)',
    (_name, primary, accent) => {
      const vars = varsFor(primary, accent);
      const tint = themes(vars['--fc-booked'] ?? '');
      const type = themes(vars['--fc-on-booked'] ?? '');
      const surface = (value: string) => {
        const parsed = parsePortalHex(value);
        if (!parsed) throw new Error(`not a hex colour: ${value}`);
        return parsed;
      };
      expect(contrastOn(type.light, surface(tint.light))).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastOn(type.dark, surface(tint.dark))).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it('keeps a corrected colour recognisably coloured, not grey', () => {
    // The regression this guards is silent: a dark brand blended toward white
    // until it cleared AA on the dark canvas comes out an unsaturated grey, which
    // a member reads as ordinary secondary text rather than as the gym's accent —
    // the colour arrives having been thrown away. Raising its lightness instead
    // keeps the hue, so a dark rust stays rust.
    const { dark } = themes(varsFor('#4F46E5', '#7C2D12')['--color-text-accent'] ?? '');
    const parsed = parsePortalHex(dark);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    const spread = Math.max(parsed.r, parsed.g, parsed.b) - Math.min(parsed.r, parsed.g, parsed.b);
    expect(spread).toBeGreaterThan(40);
    expect(parsed.r).toBeGreaterThan(parsed.b);
  });

  it('falls back to the primary when the second colour cannot read as an accent', () => {
    // A gym that deliberately picks a near-black as its accent has picked
    // something that, once made legible, is body copy — every link on the sign-in
    // screen would stop looking like a link. So the accent ramp collapses to one
    // hue, exactly as the shipped lime behaves.
    const { light } = themes(varsFor('#E11D48', '#0F172A')['--color-text-accent'] ?? '');
    expect(light).toBe('#E11D48');
  });

  it('leaves the shipped accent type alone when the near-black is all the gym chose', () => {
    // Same degenerate colour, but with no primary to hand the job to. Repainting
    // the type ramp near-black would be worse than not repainting it.
    const vars = portalThemeVars({ primaryColor: null, accentColor: '#0F172A' });
    expect(vars['--color-text-accent']).toBeUndefined();
    expect(vars['--color-icon-accent']).toBeUndefined();
  });

  it('honours a second colour that genuinely is one', () => {
    const { light } = themes(varsFor('#0F172A', '#E11D48')['--color-text-accent'] ?? '');
    expect(light).toBe('#E11D48');
  });

  it('leaves a colour that already passes completely alone', () => {
    // A brand picked to be read should arrive verbatim. The shipped lime clears
    // AA on the dark canvas as-is, so the dark half must be the gym's own hex.
    const { dark } = themes(varsFor('#E4F26A', '#E4F26A')['--color-text-accent'] ?? '');
    expect(dark).toBe('#E4F26A');
  });

  it('leaves the accent fill exactly as the gym typed it', () => {
    // The fill is the one value that is NOT corrected: it is a background, so
    // the ink on it moves instead and the gym's colour survives verbatim.
    expect(varsFor('#E11D48', '#0EA5E9')['--color-accent']).toBe('#E11D48');
  });

  it('picks the theme ink on a light brand and its paper on a dark one', () => {
    expect(varsFor('#FAFAF5', '#FAFAF5')['--color-on-accent']).toBe('#131312');
    expect(varsFor('#0B0B0C', '#0B0B0C')['--color-on-accent']).toBe('#FFFFFF');
  });

  it('emits one value per theme only where the two differ', () => {
    const vars = varsFor('#E11D48', '#0EA5E9');
    // Accent type is corrected against opposite canvases, so it always splits…
    expect(vars['--color-text-accent']).toMatch(/^light-dark\(/);
    // …while the fill is one colour in both and must not be wrapped.
    expect(vars['--color-accent']).not.toMatch(/^light-dark\(/);
  });

  it('drives the icon accent from the same value as the text accent', () => {
    // They are the same decision wearing two token names; drifting them would
    // put a lime tick beside navy type.
    const vars = varsFor('#E11D48', '#0EA5E9');
    expect(vars['--color-icon-accent']).toBe(vars['--color-text-accent']);
  });

  it('treats a colour it cannot read as one the gym never chose', () => {
    // An API too old to send the field, or a hand-edited settings blob. The
    // unreadable half repaints nothing and the shipped palette stands for it,
    // which is the same rule an unset colour gets — painting from a value we
    // could not parse would be worse than leaving it.
    const badPrimary = varsFor('rebeccapurple', '#0EA5E9');
    expect(badPrimary['--color-accent']).toBeUndefined();
    expect(badPrimary['--color-text-accent']).toBeDefined();

    const badAccent = varsFor('#E11D48', '#FFF');
    expect(badAccent['--color-accent']).toBe('#E11D48');
    expect(badAccent['--color-text-accent']).toBeUndefined();
  });

  it('leaves the focus ring to the theme, which derives it from the accent', () => {
    expect(varsFor('#E11D48', '#0EA5E9')['--fc-focus-ring']).toBeUndefined();
  });

  it('repaints only the accent ramp, never the semantic colours', () => {
    // A gym's brand is not the product's "success" or "error", and a red brand
    // must not turn a failure banner into a passing one.
    const keys = Object.keys(varsFor('#E11D48', '#0EA5E9'));
    expect(
      keys.filter((key) => /success|error|warning|background-body|text-primary/.test(key)),
    ).toEqual([]);
  });

  it('measures its poles against the theme it is overriding', () => {
    // A guard on the constants themselves: if `formacore.css` ever moves its
    // surfaces, the corrections above are being computed against the wrong page.
    expect(contrastRatio(INK, PAPER)).toBeGreaterThan(15);
    expect(contrastRatio(LIGHT_SURFACE, INK)).toBeGreaterThan(15);
    expect(contrastRatio(DARK_SURFACE, PAPER)).toBeGreaterThan(12);
  });
});

/**
 * The gate: a gym is repainted because it asked, never because a default leaked.
 *
 * `gymPortalTheme` resolves an unset portal colour to the brand's before the
 * value crosses the wire, and the brand's own defaults were written for invoices
 * — so a naive consumer repaints every existing tenant in the platform indigo the
 * moment this ships. That is the regression these pin, from both directions.
 */
describe('chosenPortalColors', () => {
  it('reads a gym that never opened the screen as having chosen nothing', () => {
    expect(skinFor({}, {})).toEqual({ primaryColor: null, accentColor: null });
    expect(portalThemeVars(skinFor({}, {}))).toEqual({});
  });

  it('repaints a gym that did choose', () => {
    const chosen = skinFor({ primaryColor: '#E11D48', accentColor: '#0EA5E9' }, {});
    expect(chosen).toEqual({ primaryColor: '#E11D48', accentColor: '#0EA5E9' });
    expect(portalThemeVars(chosen)['--color-accent']).toBe('#E11D48');
  });

  it('follows a gym that customised its BRAND but not its portal', () => {
    // The brand moved, the portal inherited it — still nothing chosen here. This
    // is the case a comparison against hardcoded platform defaults would get
    // wrong, which is why the comparison is against the response's own brand.
    const portal = { primaryColor: '#7C2D12', accentColor: '#134E4A' };
    const brand = { primaryColor: '#7C2D12', secondaryColor: '#134E4A' };
    expect(skinFor(portal, brand)).toEqual({ primaryColor: null, accentColor: null });
  });

  it('takes each colour on its own, so half a choice repaints half the ramp', () => {
    const only = skinFor({ primaryColor: '#E11D48' }, {});
    expect(only).toEqual({ primaryColor: '#E11D48', accentColor: null });
    const vars = portalThemeVars(only);
    // The fill ramp follows the gym…
    expect(vars['--color-accent']).toBe('#E11D48');
    expect(vars['--color-on-accent']).toBeDefined();
    expect(vars['--fc-booked']).toBeDefined();
    // …and the type it said nothing about stays as shipped.
    expect(vars['--color-text-accent']).toBeUndefined();
    expect(vars['--color-icon-accent']).toBeUndefined();
  });

  it('repaints only the type ramp when only the accent was chosen', () => {
    const only = skinFor({ accentColor: '#0EA5E9' }, {});
    expect(only).toEqual({ primaryColor: null, accentColor: '#0EA5E9' });
    const vars = portalThemeVars(only);
    expect(vars['--color-text-accent']).toBeDefined();
    expect(vars['--color-accent']).toBeUndefined();
    expect(vars['--fc-booked']).toBeUndefined();
  });

  it('ignores hex case, so #4F46E5 and #4f46e5 are one colour', () => {
    expect(
      skinFor({ primaryColor: DEFAULT_PRIMARY_COLOR.toUpperCase() }, {}).primaryColor,
    ).toBeNull();
  });

  it('claims nothing when the response carries no brand to compare against', () => {
    // Nothing can be told apart, so nothing is repainted — the conservative
    // answer, which leaves the portal exactly as it renders today.
    expect(skinFor({ primaryColor: '#E11D48' }, null)).toEqual({
      primaryColor: null,
      accentColor: null,
    });
  });
});
