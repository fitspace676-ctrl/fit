import { headers } from 'next/headers';
import type { GymPortalTheme, GymPublicBrand } from '@fit/types';
import { extractGymSlug } from '@fit/utils';
import { env } from './env';

/**
 * The gym slug the current request is served under (`<slug>.<root>/admin`),
 * resolved from the request `Host` against `NEXT_PUBLIC_ROOT_DOMAIN`. Returns
 * `null` on the apex domain or a `.vercel.app` preview URL.
 *
 * Server-only (reads `next/headers`); call it from Server Components or layouts
 * to scope the staff console to the active tenant. The session cookie (shared
 * across subdomains) already pins the API request's gym via its JWT claim — this
 * is for the console's own UI (which gym am I managing). `x-forwarded-host` wins
 * over `host` so it reflects the public hostname behind Vercel's proxy.
 */
export async function getActiveGymSlug(): Promise<string | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return extractGymSlug(host, env.NEXT_PUBLIC_ROOT_DOMAIN);
}

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** A six-digit hex colour — the only shape a `<meta name="theme-color">` gets. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * What the browser shows of the gym this console manages outside the page
 * itself: the name in the tab, the favicon, the browser-chrome tint.
 */
export interface ActiveGymBrand {
  name: string;
  /** `brand.logoUrl ?? memberPortal.logoUrl`, or `null` for the bundled FormaCore icon. */
  logoUrl: string | null;
  /** The gym's brand primary colour, when it is a readable hex. */
  themeColor: string | null;
}

/**
 * The active tenant's {@link ActiveGymBrand} from the public
 * `GET /gyms/by-subdomain/:slug` lookup — the same one the member site makes, so
 * no session is needed and the sign-in page is branded too. `null` when there is
 * no tenant in scope, the slug names no active gym, or the lookup fails.
 * Server-only. Never throws: metadata that failed to resolve must not take the
 * page down with it.
 */
export async function getActiveGymBrand(): Promise<ActiveGymBrand | null> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/gyms/by-subdomain/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      // The slug is in the URL, so the cache entry is per gym.
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      name?: unknown;
      portal?: GymPortalTheme | null;
      brand?: GymPublicBrand | null;
    };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return null;
    }
    const brand = body.brand ?? null;
    const portal = body.portal ?? null;
    const logoUrl =
      typeof brand?.logoUrl === 'string'
        ? brand.logoUrl
        : typeof portal?.logoUrl === 'string'
          ? portal.logoUrl
          : null;
    const primary = brand?.primaryColor;
    return {
      name,
      logoUrl,
      themeColor: typeof primary === 'string' && HEX_COLOR.test(primary) ? primary : null,
    };
  } catch {
    return null;
  }
}
