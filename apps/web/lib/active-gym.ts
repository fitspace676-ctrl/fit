import { headers } from 'next/headers';
import { extractGymSlug } from '@fit/utils';
import type { GymPublicContact } from '@fit/types';
import { env } from './env';

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
  return extractGymSlug(host, env.NEXT_PUBLIC_ROOT_DOMAIN);
}

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

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
    const response = await fetch(`${API_URL}/gyms/by-subdomain/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      // The tenant rarely changes; let Next cache the lookup briefly.
      next: { revalidate: 300 },
    });
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
    const response = await fetch(`${API_URL}/gyms/by-subdomain/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      // Same short cache as the id lookup: contact details change rarely.
      next: { revalidate: 300 },
    });
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
 * is no tenant in scope. Server-only, and from the same cached
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
    const response = await fetch(`${API_URL}/gyms/by-subdomain/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { name?: unknown };
    return typeof body.name === 'string' && body.name.trim().length > 0 ? body.name : null;
  } catch {
    return null;
  }
}
