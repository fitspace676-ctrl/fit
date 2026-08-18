import { env } from './env';

/**
 * Absolute URLs into one gym's tenant surfaces, built from
 * `NEXT_PUBLIC_ROOT_DOMAIN` — `https://<slug>.<root>` for the member portal and
 * `…/admin` for the staff console. `http` is used for a `localhost` dev root
 * (which may carry a port, e.g. `localhost:3001`), `https` otherwise.
 *
 * Both return `null` when no root domain is configured, so a caller renders
 * plain text rather than a link to a host that does not exist. The same shape as
 * `apps/platform/lib/tenant-url.ts`, which builds the post-signup redirect.
 */
function tenantOrigin(slug: string): string | null {
  const root = env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  if (!root) return null;
  const scheme = root === 'localhost' || root.startsWith('localhost:') ? 'http' : 'https';
  return `${scheme}://${slug}.${root}`;
}

/** The gym's member portal — `https://<slug>.<root>`. */
export function tenantPortalUrl(slug: string): string | null {
  return tenantOrigin(slug);
}

/** The gym's staff console — `https://<slug>.<root>/admin`. */
export function tenantAdminUrl(slug: string): string | null {
  const origin = tenantOrigin(slug);
  return origin ? `${origin}/admin` : null;
}
