import { getBrandSkin as getSharedBrandSkin, type BrandSkin as SharedBrandSkin } from '@fit/types';
export { brandSkinVars, brandedPortalThemeVars } from '@fit/types';

export interface BrandSkin extends SharedBrandSkin {
  logo: { onLight: string; onDark: string };
  icon: string;
}

/** Public asset paths are app-local; palette data lives in @fit/types. */
export function getBrandSkin(slug: string | null | undefined): BrandSkin | null {
  const skin = getSharedBrandSkin(slug);
  if (!skin) return null;
  return {
    ...skin,
    logo: { onLight: '/brands/synergy/logo-light.png', onDark: '/brands/synergy/logo-dark.png' },
    icon: '/brands/synergy/icon.png',
  };
}
