import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { portalThemeVars } from './portal-theme';
import { BRAND_SKINS, brandSkinVars, brandedPortalThemeVars, getBrandSkin } from './brand-skins';

describe('brand skins', () => {
  it('keeps the guide colours on their intended tokens in both modes', () => {
    const skin = getBrandSkin('synergy')!;
    expect(skin.light['--color-background-body']).toBe('#F3EDE3');
    expect(skin.dark['--color-background-body']).toBe('#1C1C1E');
    expect(skin.light['--color-text-primary']).toBe('#1C1C1E');
    expect(skin.dark['--color-text-primary']).toBe('#F3EDE3');
    for (const mode of [skin.light, skin.dark]) {
      expect(mode['--fc-membership']).toBe('#765B49');
      expect(mode['--color-accent']).toBe('#526EAA');
      expect(mode['--color-on-accent']).toBe('#F3EDE3');
    }
    expect(brandSkinVars('synergy')['--color-background-body']).toBe(
      'light-dark(#F3EDE3, #1C1C1E)',
    );
    expect(brandSkinVars('synergy')['--color-accent']).toBe('#526EAA');
  });

  it('emits only compiled theme tokens, plus the new membership token', () => {
    const css = readFileSync(
      new URL('../../astryx-theme/dist/formacore.css', import.meta.url),
      'utf8',
    );
    for (const skin of Object.values(BRAND_SKINS)) {
      expect(Object.keys(skin.light).sort()).toEqual(Object.keys(skin.dark).sort());
      for (const token of Object.keys(skin.light)) {
        if (token !== '--fc-membership') expect(css).toContain(`${token}:`);
      }
    }
  });

  it('leaves unknown slugs and their chosen colours exactly as before', () => {
    for (const slug of [null, undefined, 'unknown', 'toString', '__proto__']) {
      expect(getBrandSkin(slug)).toBeNull();
      expect(brandSkinVars(slug)).toEqual({});
      expect(brandedPortalThemeVars(slug, null)).toEqual({});
      const chosen = { primaryColor: '#cc3311' };
      expect(brandedPortalThemeVars(slug, chosen)).toEqual(portalThemeVars(chosen));
    }
  });

  it('lets a console choice override the accent ramp without repainting the card or canvas', () => {
    const chosen = { primaryColor: '#cc3311' };
    const vars = brandedPortalThemeVars('synergy', chosen);
    expect(vars).toMatchObject(portalThemeVars(chosen));
    expect(vars['--fc-membership']).toBe('#765B49');
    expect(vars['--color-background-body']).toBe('light-dark(#F3EDE3, #1C1C1E)');
    expect(brandedPortalThemeVars('synergy', { primaryColor: null })).toEqual(
      brandSkinVars('synergy'),
    );
  });
});
