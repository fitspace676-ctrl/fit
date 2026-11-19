import type { Metadata, Viewport } from 'next';
import type { ActiveGymBrand } from './active-gym';
import { getBrandSkin } from './brand-skins';

/** What a page is called where no gym is in scope — apex, `app.<root>`, a preview URL, an unknown slug. */
export const PLATFORM_NAME = 'FormaCore';

/** The bundled FormaCore mark (`public/icon.png`), for a gym that has uploaded none. */
const DEFAULT_ICON = '/icon.png?v=2';

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
  const skin = getBrandSkin(brand?.skinSlug);
  const name = brand?.name ?? PLATFORM_NAME;
  const description = brand
    ? `Classes, bookings and membership at ${brand.name}.`
    : 'FormaCore web application.';
  // The tab icon the gym uploaded, else its logo, else the bundled mark. The
  // share card keeps the logo: it is drawn large, where a wordmark reads fine.
  const icon = brand?.faviconUrl ?? brand?.logoUrl ?? skin?.icon ?? DEFAULT_ICON;

  const shareImage = brand?.logoUrl ?? skin?.icon;

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
      ...(shareImage ? { images: [shareImage] } : {}),
    },
  };
}

/** Registered skins use their page backgrounds; other tenants keep their chosen tint. */
export function gymViewport(brand: ActiveGymBrand | null): Viewport {
  const skin = getBrandSkin(brand?.skinSlug);
  if (skin) {
    return {
      themeColor: [
        { media: '(prefers-color-scheme: light)', color: skin.light['--color-background-body']! },
        { media: '(prefers-color-scheme: dark)', color: skin.dark['--color-background-body']! },
      ],
    };
  }
  return brand?.themeColor ? { themeColor: brand.themeColor } : {};
}
