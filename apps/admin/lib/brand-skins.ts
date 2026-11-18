import { getBrandSkin } from '@fit/types';
import { adminPath } from './base-path';

/** The console owns its base-path-prefixed assets, never the shared registry. */
export function consoleBrandAssets(slug: string | null | undefined) {
  const skin = getBrandSkin(slug);
  return skin
    ? {
        name: skin.name,
        onLight: adminPath('/brands/synergy/logo-light.png'),
        onDark: adminPath('/brands/synergy/logo-dark.png'),
        icon: adminPath('/brands/synergy/icon.png'),
      }
    : null;
}
