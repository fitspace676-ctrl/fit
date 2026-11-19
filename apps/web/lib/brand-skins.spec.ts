import { describe, expect, it } from 'vitest';
import { getBrandSkin } from './brand-skins';

describe('portal brand assets', () => {
  it('maps the shared skin to portal public URLs', () => {
    expect(getBrandSkin('synergy')?.logo).toEqual({
      onLight: '/brands/synergy/logo-light.png',
      onDark: '/brands/synergy/logo-dark.png',
    });
    expect(getBrandSkin('synergy')?.icon).toBe('/brands/synergy/icon.png');
    expect(getBrandSkin('unknown')).toBeNull();
  });
});
