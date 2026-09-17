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

/** The configured gym: one chosen colour, which is all this screen offers. */
function varsFor(primaryColor: string): PortalThemeVars {
  return portalThemeVars({ primaryColor });
}

/**
 * What the tenant lookup hands the scope, from one `GET /gyms/by-subdomain` body
 * — as an API that predates `chosenPrimaryColor` sends it, so these cases
 * exercise the comparison that stands in for it. The explicit field has its own
 * cases below.
 */
function skinFor(
  portal: Partial<Omit<GymPortalTheme, 'chosenPrimaryColor'>>,
  brand: Partial<GymPublicBrand> | null,
) {
  const resolved: Omit<GymPortalTheme, 'chosenPrimaryColor'> = {
    loginImageUrl: null,
    // Irrelevant to the colour resolution these cases exercise: the wordmark has
    // no "did the gym choose this?" problem to undo, because `brand.logoUrl` has
    // no platform default that could leak into the portal.
    logoUrl: null,
    primaryColor: DEFAULT_PRIMARY_COLOR,
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
const BRANDS: [name: string, primary: string][] = [
  ['platform default', DEFAULT_PRIMARY_COLOR],
  ['near-black', '#0B0B0C'],
  ['near-white', '#FAFAF5'],
  ['saturated mid-tone', '#E11D48'],
  ['the shipped lime', '#E4F26A'],
];

describe('portalThemeVars', () => {
  it.each(BRANDS)('keeps a label readable on the accent fill (%s)', (_name, primary) => {
    const vars = varsFor(primary);
    const fill = parsePortalHex(vars['--color-accent'] ?? '');
    const on = parsePortalHex(vars['--color-on-accent'] ?? '');
    expect(fill).not.toBeNull();
    expect(on).not.toBeNull();
    if (!fill || !on) return;
    expect(contrastRatio(fill, on)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(BRANDS)('keeps the booked pill readable on its own tint (%s)', (_name, primary) => {
    const vars = varsFor(primary);
    const tint = themes(vars['--fc-booked'] ?? '');
    const type = themes(vars['--fc-on-booked'] ?? '');
    const surface = (value: string) => {
      const parsed = parsePortalHex(value);
      if (!parsed) throw new Error(`not a hex colour: ${value}`);
      return parsed;
    };
    expect(contrastOn(type.light, surface(tint.light))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastOn(type.dark, surface(tint.dark))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('leaves the accent fill exactly as the gym typed it', () => {
    // The fill is the one value that is NOT corrected: it is a background, so
    // the ink on it moves instead and the gym's colour survives verbatim.
    expect(varsFor('#E11D48')['--color-accent']).toBe('#E11D48');
  });

  it('picks the theme ink on a light brand and its paper on a dark one', () => {
    expect(varsFor('#FAFAF5')['--color-on-accent']).toBe('#131312');
    expect(varsFor('#0B0B0C')['--color-on-accent']).toBe('#FFFFFF');
  });

  it('emits one value per theme only where the two differ', () => {
    const vars = varsFor('#E11D48');
    // The tint beside the fill is read on opposite canvases, so it splits…
    expect(vars['--color-accent-muted']).toMatch(/^light-dark\(/);
    // …while the fill is one colour in both and must not be wrapped.
    expect(vars['--color-accent']).not.toMatch(/^light-dark\(/);
  });

  it('paints the accent TYPE in the gym colour too, not only the fill', () => {
    // The regression this pins: Downtown chose `#069494`, its sign-in button
    // turned teal, and its "forgot password" link and every accented figure
    // behind the door stayed lime — the console's preview showed them teal, so
    // the setting read as broken.
    for (const primary of ['#069494', '#E11D48', DEFAULT_PRIMARY_COLOR]) {
      const vars = varsFor(primary);
      expect(vars['--color-text-accent']).toMatch(/^(light-dark\(|#)/);
      expect(vars['--color-icon-accent']).toBe(vars['--color-text-accent']);
    }
  });

  it.each(BRANDS)(
    'keeps accent type legible and distinct from body text (%s)',
    (_name, primary) => {
      const value = varsFor(primary)['--color-text-accent'];
      // A brand that cannot be told apart from body text in either theme keeps the
      // shipped lime rather than turning every link into plain prose.
      if (value === undefined) return;
      const { light, dark } = themes(value);
      expect(contrastOn(light, LIGHT_SURFACE)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastOn(dark, DARK_SURFACE)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastOn(light, INK)).toBeGreaterThanOrEqual(1.6);
      expect(contrastOn(dark, PAPER)).toBeGreaterThanOrEqual(1.6);
    },
  );

  it('leaves the accent type lime for a brand that would read as body text', () => {
    // A near-black corrected for the light surface IS the ink, and a near-white
    // corrected for the dark surface IS the paper: as type, neither says "notice
    // this", so the lime stays and only the fill follows the gym.
    for (const primary of ['#0B0B0C', '#FAFAF5']) {
      const vars = varsFor(primary);
      expect(vars['--color-accent']).toBeDefined();
      expect(vars['--color-text-accent']).toBeUndefined();
      expect(vars['--color-icon-accent']).toBeUndefined();
    }
  });

  it('treats a colour it cannot read as one the gym never chose', () => {
    // An API too old to send the field, or a hand-edited settings blob. An
    // unreadable value repaints nothing and the shipped palette stands, which is
    // the same rule an unset colour gets — painting from a value we could not
    // parse would be worse than leaving it.
    expect(varsFor('rebeccapurple')).toEqual({});
    expect(varsFor('#FFF')).toEqual({});
  });

  it('leaves the focus ring to the theme, which derives it from the accent', () => {
    expect(varsFor('#E11D48')['--fc-focus-ring']).toBeUndefined();
  });

  it('repaints only the accent ramp, never the semantic colours', () => {
    // A gym's brand is not the product's "success" or "error", and a red brand
    // must not turn a failure banner into a passing one.
    const keys = Object.keys(varsFor('#E11D48'));
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
    expect(skinFor({}, {})).toEqual({ primaryColor: null });
    expect(portalThemeVars(skinFor({}, {}))).toEqual({});
  });

  it('repaints a gym that did choose', () => {
    const chosen = skinFor({ primaryColor: '#E11D48' }, {});
    expect(chosen).toEqual({ primaryColor: '#E11D48' });
    expect(portalThemeVars(chosen)['--color-accent']).toBe('#E11D48');
  });

  it('follows a gym that customised its BRAND but not its portal', () => {
    // The brand moved, the portal inherited it — still nothing chosen here. This
    // is the case a comparison against hardcoded platform defaults would get
    // wrong, which is why the comparison is against the response's own brand.
    const portal = { primaryColor: '#7C2D12' };
    const brand = { primaryColor: '#7C2D12', secondaryColor: '#134E4A' };
    expect(skinFor(portal, brand)).toEqual({ primaryColor: null });
  });

  it('repaints the fill and the accent type when a gym chooses', () => {
    const only = skinFor({ primaryColor: '#E11D48' }, {});
    expect(only).toEqual({ primaryColor: '#E11D48' });
    const vars = portalThemeVars(only);
    expect(vars['--color-accent']).toBe('#E11D48');
    expect(vars['--color-on-accent']).toBeDefined();
    expect(vars['--fc-booked']).toBeDefined();
    expect(vars['--color-text-accent']).toBeDefined();
    expect(vars['--color-icon-accent']).toBeDefined();
  });

  // The lookup now says outright which colour was chosen, and that answer wins
  // over the comparison — which could not tell "chose the brand's own colour"
  // from "never chose", and the console's "customise" button seeds the field
  // with exactly the brand colour.
  it('believes the lookup when it says the colour was chosen, even the brand’s own', () => {
    const portal: GymPortalTheme = {
      loginImageUrl: null,
      logoUrl: null,
      primaryColor: '#7C2D12',
      chosenPrimaryColor: '#7C2D12',
    };
    const brand = { primaryColor: '#7C2D12', secondaryColor: '#134E4A' };
    expect(chosenPortalColors(portal, brand)).toEqual({ primaryColor: '#7C2D12' });
    expect(portalThemeVars(chosenPortalColors(portal, brand))['--color-accent']).toBe('#7C2D12');
  });

  it('believes the lookup when it says nothing was chosen, whatever the brand', () => {
    const portal: GymPortalTheme = {
      loginImageUrl: null,
      logoUrl: null,
      primaryColor: '#E11D48',
      chosenPrimaryColor: null,
    };
    expect(
      chosenPortalColors(portal, { primaryColor: '#111111', secondaryColor: '#222222' }),
    ).toEqual({ primaryColor: null });
    expect(chosenPortalColors(portal, null)).toEqual({ primaryColor: null });
  });

  it('falls back to the comparison when the field is not a string or null', () => {
    const portal = { primaryColor: '#E11D48', chosenPrimaryColor: 42 } as unknown as GymPortalTheme;
    expect(
      chosenPortalColors(portal, { primaryColor: '#111111', secondaryColor: '#222222' }),
    ).toEqual({ primaryColor: '#E11D48' });
  });

  it('ignores hex case, so #4F46E5 and #4f46e5 are one colour', () => {
    expect(
      skinFor({ primaryColor: DEFAULT_PRIMARY_COLOR.toUpperCase() }, {}).primaryColor,
    ).toBeNull();
  });

  it('claims nothing when the response carries no brand to compare against', () => {
    // Nothing can be told apart, so nothing is repainted — the conservative
    // answer, which leaves the portal exactly as it renders today.
    expect(skinFor({ primaryColor: '#E11D48' }, null)).toEqual({ primaryColor: null });
  });
});
