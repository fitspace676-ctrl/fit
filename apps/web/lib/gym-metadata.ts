import type { Metadata, Viewport } from 'next';
import type { ActiveGymBrand } from './active-gym';

/** What a page is called where no gym is in scope — apex, `app.<root>`, a preview URL, an unknown slug. */
export const PLATFORM_NAME = 'FormaCore';

/** The bundled FormaCore mark (`public/icon.png`), for a gym that has uploaded none. */
const DEFAULT_ICON = '/icon.png';

/**
 * The member site's document metadata for one tenant: `<slug>.<root>` is titled,
 * described and iconed as the gym it serves, and every page title is suffixed
 * with that gym's name through the template — so a page only ever sets its own
 * short title (`Home`), never the product's.
 *
 * `null` is plain FormaCore. That covers "no tenant" and "lookup failed" alike,
 * which is deliberate: a tab reading FormaCore on a gym's site is merely generic,
 * and there is no gym name to guess.
 */
export function gymMetadata(brand: ActiveGymBrand | null): Metadata {
  const name = brand?.name ?? PLATFORM_NAME;
  const description = brand
    ? `Classes, bookings and membership at ${brand.name}.`
    : 'FormaCore web application.';
  const icon = brand?.logoUrl ?? DEFAULT_ICON;

  return {
    title: { default: name, template: `%s · ${name}` },
    description,
    applicationName: name,
    icons: { icon, apple: icon },
    openGraph: {
      type: 'website',
      title: name,
      siteName: name,
      description,
      ...(brand?.logoUrl ? { images: [brand.logoUrl] } : {}),
    },
  };
}

/** The browser-chrome tint — only a colour the gym chose; otherwise the browser's own. */
export function gymViewport(brand: ActiveGymBrand | null): Viewport {
  return brand?.themeColor ? { themeColor: brand.themeColor } : {};
}
