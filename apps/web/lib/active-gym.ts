import { headers } from 'next/headers';
import { extractGymSlug } from '@fit/utils';
import {
  DEFAULT_TIMEZONE,
  type GymPortalTheme,
  type GymPublicBrand,
  type GymPublicContact,
} from '@fit/types';
import { chosenPortalColors, type PortalColorChoice } from '@/src/lib/portal-theme';
import { env } from './env';

/**
 * The active tenant's portal skin as this app consumes it — the sign-in
 * photograph, the gym's mark, and the colours it chose, unresolved.
 */
export interface ActiveGymPortalSkin extends PortalColorChoice {
  loginImageUrl: string | null;
  /**
   * The gym's own wordmark, already resolved API-side through
   * `memberPortal.logoUrl ?? brand.logoUrl`, or `null` when it has uploaded none
   * — which `PortalLogo` renders as the bundled FormaCore mark.
   *
   * Handed over RESOLVED, unlike the two colours beside it, and the asymmetry is
   * deliberate. The colours have to be un-resolved here because the brand's own
   * colour DEFAULTS were written for invoices, so honouring them would repaint
   * every existing tenant's portal on deploy (see `chosenPortalColors`).
   * `brand.logoUrl` has no such default: it is `null` until a gym uploads a file.
   * So a brand logo arriving here is always one the gym deliberately supplied,
   * and there is nothing to undo.
   */
  logoUrl: string | null;
}

/**
 * Dev-only fallback tenant, from `NEXT_PUBLIC_DEV_GYM_SLUG`. Local browsers that
 * refuse to resolve `<slug>.localhost` can only reach the portal on the bare
 * host, which would leave every page tenant-less; setting the var in
 * `apps/web/.env.local` pins the tenant instead. Unset in production, where the
 * Host stays the only source of truth.
 */
function devGymSlug(): string | null {
  const slug = env.NEXT_PUBLIC_DEV_GYM_SLUG?.trim();
  return slug ? slug : null;
}

/**
 * The gym slug the current request is served under (`<slug>.<root>`), resolved
 * from the request `Host` against `NEXT_PUBLIC_ROOT_DOMAIN`. Returns `null` on
 * the apex domain or a `.vercel.app` preview URL, where the member site renders
 * generically with no tenant in scope.
 *
 * Server-only (reads `next/headers`); call it from Server Components, layouts,
 * or route handlers to brand/scope the page to the active tenant. `x-forwarded-host`
 * wins over `host` so it reflects the public hostname behind Vercel's proxy.
 */
export async function getActiveGymSlug(): Promise<string | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return extractGymSlug(host, env.NEXT_PUBLIC_ROOT_DOMAIN) ?? devGymSlug();
}

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * The one `GET /gyms/by-subdomain/:slug` request every reader below makes.
 *
 * UNCACHED, on purpose. This lookup carried `next: { revalidate: 300 }`, and on
 * Vercel that data cache outlives the request: a gym that saved a new portal
 * colour in the console kept seeing the old one on its own sign-in screen for up
 * to five minutes, and — since the console had already said "saved" — read that
 * as the setting doing nothing. A tenant's skin, name, zone and contact details
 * all come from this body, and every one of them is edited in the console with
 * the expectation of seeing it land. The API answers from one indexed row, and
 * the pages that call this are already dynamic (they read cookies and headers),
 * so nothing is given up.
 *
 * Within one render the several readers still share ONE request: React's fetch
 * memoization dedupes identical `GET`s regardless of the cache option, so a
 * layout that resolves the skin and the presence, and a shell that resolves the
 * name and the skin again, cost the API a single round trip.
 */
function lookupTenant(slug: string): Promise<Response> {
  return fetch(`${API_URL}/gyms/by-subdomain/${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
}

/**
 * Resolve the active tenant to its gym id via the public
 * `GET /gyms/by-subdomain/:slug` lookup, or `null` when there is no tenant in
 * scope (apex / preview URL) or the slug names no active gym. Server-only.
 *
 * The classes page (T3.4) needs the gym *id* — not just the slug — to query
 * `GET /class-instances?gymId=<id>`; this performs that one extra round-trip on
 * the server so the client component receives a ready-to-use id (or `null`,
 * which the page renders as its empty state). Never throws: any network / 4xx
 * failure resolves to `null`, degrading to "no classes" rather than an error.
 */
export async function getActiveGymId(): Promise<string | null> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return null;
  }

  try {
    const response = await lookupTenant(slug);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { gymId?: unknown };
    return typeof body.gymId === 'string' && body.gymId.length > 0 ? body.gymId : null;
  } catch {
    return null;
  }
}

/**
 * Whether the tenant this request's host names exists, as far as the public
 * `GET /gyms/by-subdomain/:slug` lookup can tell:
 *
 * - `none` — no tenant in scope (apex, `app.<root>`, a preview URL). The portal
 *   renders generically, as it always has.
 * - `found` — the slug names an active gym.
 * - `not-found` — the API answered `404`: there is no such gym at this address.
 * - `unknown` — anything else (network error, `5xx`). Rendered like `found`, so a
 *   passing API hiccup never tells a gym's members their gym does not exist.
 *
 * Server-only. The lookup is uncached, so a gym created a moment after someone
 * hit its address is found on the next visit.
 */
export type ActiveGymPresence = 'none' | 'found' | 'not-found' | 'unknown';

export async function getActiveGymPresence(): Promise<ActiveGymPresence> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return 'none';
  }

  try {
    const response = await lookupTenant(slug);
    if (response.ok) {
      return 'found';
    }
    return response.status === 404 ? 'not-found' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * The active tenant's public contact details (address / phone / email / website)
 * from the same `GET /gyms/by-subdomain/:slug` lookup, or `null` when there is no
 * tenant in scope, the slug names no active gym, or the gym has filled none of
 * them in. Server-only.
 *
 * These are the details the gym itself typed into Settings → Business info; the
 * member portal renders whichever ones exist in its footer, so a member always has
 * a way to reach the gym. Never throws — any failure resolves to `null` and the
 * footer simply is not rendered.
 */
export async function getActiveGymContact(): Promise<GymPublicContact | null> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return null;
  }

  try {
    const response = await lookupTenant(slug);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { contact?: GymPublicContact | null };
    const contact = body.contact ?? null;
    if (!contact) return null;
    const hasAny = [contact.address, contact.phone, contact.email, contact.website].some(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    return hasAny ? contact : null;
  } catch {
    return null;
  }
}

/**
 * The active tenant's display name (`Downtown Strength`), or `null` when there
 * is no tenant in scope. Server-only, and from the same
 * `GET /gyms/by-subdomain/:slug` lookup as {@link getActiveGymId}.
 *
 * The login screen names the gym in its headline — "Downtown Strength · წევრის
 * პორტალი" — so a member arriving on a tenant subdomain sees whose door they
 * are at before they type anything. Never throws: a failure resolves to `null`
 * and the screen falls back to unbranded copy.
 */
export async function getActiveGymName(): Promise<string | null> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return null;
  }

  try {
    const response = await lookupTenant(slug);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { name?: unknown };
    return typeof body.name === 'string' && body.name.trim().length > 0 ? body.name : null;
  } catch {
    return null;
  }
}

/**
 * The IANA zone the active tenant's wall-clock times are read in, or
 * `Asia/Tbilisi` when there is no tenant in scope. Server-only, from the same
 * `GET /gyms/by-subdomain/:slug` lookup as {@link getActiveGymId}.
 *
 * Every class and booking time the portal renders goes through this rather than
 * the viewer's zone: "Monday 18:00 at Main Floor" is the same appointment
 * whether it is read in Tbilisi or on a phone abroad, and only the gym's zone
 * turns the stored instant back into that wall clock.
 */
export async function getActiveGymTimezone(): Promise<string> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return DEFAULT_TIMEZONE;
  }

  try {
    const response = await lookupTenant(slug);
    if (!response.ok) {
      return DEFAULT_TIMEZONE;
    }
    const body = (await response.json()) as { timezone?: unknown };
    return typeof body.timezone === 'string' && body.timezone.length > 0
      ? body.timezone
      : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * The active tenant's member-portal skin: the sign-in photograph and the gym's
 * own wordmark, plus the two colours **the gym actually chose** (`null` on either
 * meaning "never chosen").
 * `null` overall when there is no tenant in scope, the slug names no active gym,
 * or the lookup fails. Server-only, from the same
 * `GET /gyms/by-subdomain/:slug` lookup as {@link getActiveGymId}.
 *
 * `null` means "render the shipped FormaCore palette", which is the right answer
 * for the apex domain and for a preview URL: there is no gym whose colours those
 * pages would be wearing. It is also the answer while an API that predates the
 * `portal` field is deployed — the response simply has no such key, and a
 * half-applied palette guessed from a missing one would be worse than none.
 *
 * The two colours are handed back UNRESOLVED even though the API resolves them,
 * because the resolution is the thing that has to be undone here: a gym that
 * never opened Settings → Member portal inherits its brand's colours, and the
 * brand's own defaults exist for invoices, not for this screen. Honouring them
 * would restyle every existing tenant on deploy. `chosenPortalColors` recovers
 * the distinction by comparing the resolved theme against the brand it was
 * resolved from — both of which this one response already carries.
 */
export async function getActiveGymPortalSkin(): Promise<ActiveGymPortalSkin | null> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return null;
  }

  try {
    const response = await lookupTenant(slug);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      portal?: GymPortalTheme | null;
      brand?: GymPublicBrand | null;
    };
    const portal = body.portal ?? null;
    // Guard the shape rather than trusting it: this is the one lookup rendered
    // before anyone is authenticated, and a malformed colour would reach an
    // inline `style` attribute.
    if (!portal || typeof portal.primaryColor !== 'string') {
      return null;
    }
    return {
      loginImageUrl: typeof portal.loginImageUrl === 'string' ? portal.loginImageUrl : null,
      // Guarded the same way, and for the same reason: this value reaches an
      // `<img src>` on the one screen rendered before anyone is authenticated,
      // and an API old enough to predate the field simply has no such key.
      logoUrl: typeof portal.logoUrl === 'string' ? portal.logoUrl : null,
      ...chosenPortalColors(portal, body.brand ?? null),
    };
  } catch {
    return null;
  }
}

/** A six-digit hex colour — the only shape a `<meta name="theme-color">` gets. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * What the browser shows of the active tenant outside the page itself: the name
 * in the tab and on a share card, the mark used as its favicon, and the colour
 * the browser chrome is tinted with.
 */
export interface ActiveGymBrand {
  name: string;
  /** `memberPortal.logoUrl ?? brand.logoUrl`, or `null` for the bundled FormaCore icon. */
  logoUrl: string | null;
  /**
   * The portal colour the gym actually chose, or `null` when it chose none — the
   * same distinction {@link getActiveGymPortalSkin} draws, so the tab is never
   * tinted a colour the page itself is not wearing.
   */
  themeColor: string | null;
}

/**
 * The active tenant's {@link ActiveGymBrand}, or `null` when there is no tenant in
 * scope, the slug names no active gym, or the lookup fails — every one of which
 * the page's metadata answers with plain FormaCore. Server-only, from the same
 * `GET /gyms/by-subdomain/:slug` lookup as {@link getActiveGymId}. Never
 * throws: metadata that failed to resolve must not take the page down with it.
 */
export async function getActiveGymBrand(): Promise<ActiveGymBrand | null> {
  const slug = await getActiveGymSlug();
  if (!slug) {
    return null;
  }

  try {
    const response = await lookupTenant(slug);
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
    const portal = body.portal ?? null;
    const brand = body.brand ?? null;
    const logoUrl =
      typeof portal?.logoUrl === 'string'
        ? portal.logoUrl
        : typeof brand?.logoUrl === 'string'
          ? brand.logoUrl
          : null;
    const chosen =
      portal && typeof portal.primaryColor === 'string'
        ? chosenPortalColors(portal, brand).primaryColor
        : null;
    return { name, logoUrl, themeColor: chosen && HEX_COLOR.test(chosen) ? chosen : null };
  } catch {
    return null;
  }
}
