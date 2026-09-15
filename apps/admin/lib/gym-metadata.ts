import type { Metadata, Viewport } from 'next';
import type { ActiveGymBrand } from './active-gym';
import { adminPath } from './base-path';

/** What the console is called where no gym is in scope — apex, a preview URL, an unknown slug. */
export const PLATFORM_NAME = 'FormaCore';

/**
 * The staff console's document metadata for one tenant: `<slug>.<root>/admin` is
 * titled `Downtown Strength — Staff console`, iconed with the gym's mark, and
 * every page title is suffixed with the gym's name through the template — so a
 * page only ever sets its own short title (`Members`).
 *
 * `null` is plain FormaCore, for "no tenant" and "lookup failed" alike.
 */
export function gymMetadata(brand: ActiveGymBrand | null): Metadata {
  const name = brand?.name ?? PLATFORM_NAME;
  const title = `${name} — Staff console`;
  const description = `${name} staff console.`;
  // `public/icon.png`. A metadata URL is not given the basePath by Next, unlike
  // the file-based `app/icon.png` it replaces, so it is prefixed here.
  const icon = brand?.logoUrl ?? adminPath('/icon.png');

  return {
    title: { default: title, template: `%s · ${name}` },
    description,
    applicationName: name,
    icons: { icon, apple: icon },
    openGraph: { type: 'website', title, siteName: name, description },
  };
}

/** The browser-chrome tint — the gym's brand colour, when there is a gym. */
export function gymViewport(brand: ActiveGymBrand | null): Viewport {
  return brand?.themeColor ? { themeColor: brand.themeColor } : {};
}
