import { tenantOrigin } from '@fit/utils';
import { env } from '../config/env';

/**
 * Where a relative media path is resolved from: the gym's tenant host
 * (`https://<slug>.<rootDomain>`), then the platform-wide web origin.
 */
export interface MediaOrigins {
  gymSlug?: string | null;
  rootDomain?: string | null;
  webUrl?: string | null;
}

/**
 * Turn a stored media URL into the absolute URL a member/public wire contract
 * (`locationSummarySchema.photoUrl`, a `z.string().url()`) can carry.
 *
 * An http(s) URL — the R2 upload the admin form stores — passes through
 * untouched. A root-relative path (`/gym-hero.webp`) is a file in the web app's
 * `public/` folder: the web site resolves it against its own origin, but the
 * member app has no such origin, so it is joined onto the gym's tenant host,
 * falling back to `webUrl`. Anything else — blank, a bare filename, a
 * protocol-relative `//host`, or a relative path with no origin to join it to —
 * flattens to `null`, so one bad row renders the client's no-photo state instead
 * of failing the whole listing's parse.
 *
 * Pure; {@link toPublicMediaUrl} is the same, reading the origins from config.
 * Only for member/public responses — the admin endpoints return the stored value,
 * which is what their edit forms submit back.
 */
export function resolvePublicMediaUrl(
  stored: string | null | undefined,
  origins: MediaOrigins,
): string | null {
  const value = stored?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/') || value.startsWith('//')) return null;

  const origin =
    tenantOrigin(origins.gymSlug, origins.rootDomain) ??
    (origins.webUrl?.trim() ? origins.webUrl.trim().replace(/\/+$/, '') : null);
  return origin ? `${origin}${value}` : null;
}

/** {@link resolvePublicMediaUrl} against the API's `PLATFORM_ROOT_DOMAIN` / `WEB_URL`. */
export function toPublicMediaUrl(
  stored: string | null | undefined,
  gymSlug?: string | null,
): string | null {
  return resolvePublicMediaUrl(stored, {
    gymSlug,
    rootDomain: env.PLATFORM_ROOT_DOMAIN,
    webUrl: env.WEB_URL,
  });
}
