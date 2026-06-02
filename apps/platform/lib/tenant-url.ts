import { env } from './env';

/**
 * Absolute URL of a gym's staff console — `https://<slug>.<root>/admin` — the
 * destination a freshly provisioned owner is redirected to after `register-gym`
 * (the signup form that calls this lands in T3.11). Built from
 * `NEXT_PUBLIC_ROOT_DOMAIN`; `http` is used for a `localhost` dev root, `https`
 * otherwise. Returns `null` when no root domain is configured, so the caller can
 * fall back to an in-app confirmation rather than link to a bad host.
 */
export function tenantAdminUrl(slug: string): string | null {
  const root = env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  if (!root) return null;
  const scheme = root === 'localhost' || root.startsWith('localhost:') ? 'http' : 'https';
  return `${scheme}://${slug}.${root}/admin`;
}
