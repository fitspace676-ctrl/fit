// Tenant-host helpers — recover the gym slug a request's subdomain names.
//
// The member site (`@fit/web`) and staff console (`@fit/admin`) are served at
// `<slug>.<rootDomain>`, so the active tenant is a function of the request Host.
// This mirrors the API's own `extractTenantSlug`
// (apps/api/src/common/middleware/subdomain-tenant.middleware.ts) so the
// frontend resolves the same slug the API binds a session to — kept here, shared,
// rather than duplicated per app.

import { RESERVED_SUBDOMAINS } from '@fit/types';

/** Strip a trailing `:port` and any `x-forwarded-host` list, then normalise. */
function normaliseHostname(host: string): string {
  return host.split(',')[0]!.split(':')[0]!.trim().toLowerCase();
}

/**
 * Recover the gym slug from a request `Host`, given the platform root domain.
 *
 * Returns the single subdomain label of `<slug>.<rootDomain>` — lower-cased and
 * port-stripped — or `null` when the host is the bare root domain, isn't under
 * the root domain at all, carries a multi-level subdomain (`a.b.fit.ge`), or is a
 * {@link RESERVED_SUBDOMAINS} platform label. `rootDomain` may itself carry a
 * port (e.g. the dev `localhost:3001`); it is stripped the same way, so
 * `downtown.localhost:3001` against root `localhost` resolves to `downtown`.
 *
 * Returns `null` for any falsy input — on a `.vercel.app` preview or an apex
 * host the caller simply has no tenant in scope and renders generically.
 */
export function extractGymSlug(
  host: string | null | undefined,
  rootDomain: string | null | undefined,
): string | null {
  if (!host || !rootDomain) {
    return null;
  }
  const hostname = normaliseHostname(host);
  const root = normaliseHostname(rootDomain);
  if (!hostname || !root || hostname === root) {
    return null;
  }

  const suffix = `.${root}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const label = hostname.slice(0, -suffix.length);
  // Empty (bare root domain), multi-level (`a.b.fit.ge`), or a reserved platform
  // label is never a tenant.
  if (!label || label.includes('.') || RESERVED_SUBDOMAINS.includes(label)) {
    return null;
  }
  return label;
}

/**
 * The other direction: the absolute origin one gym's surfaces are served at —
 * `https://<slug>.<rootDomain>` — which is what {@link extractGymSlug} reads back
 * off a request Host. Used to address a tenant from outside a request: the API's
 * console deep links in email, and the platform / superadmin links into a gym.
 *
 * `http` is used for a `localhost` dev root (which may carry a port, e.g.
 * `localhost:3001`, and keeps it), `https` otherwise. Returns `null` when either
 * side is missing or blank — no root domain is configured, or there is no tenant
 * in scope — so the caller can fall back to a generic URL or plain text rather
 * than link to a host that does not exist.
 *
 * Pure: `rootDomain` is passed in rather than read from config, because the var
 * that holds it differs per app (`PLATFORM_ROOT_DOMAIN` in the API,
 * `NEXT_PUBLIC_ROOT_DOMAIN` in the Next apps).
 */
export function tenantOrigin(
  slug: string | null | undefined,
  rootDomain: string | null | undefined,
): string | null {
  const label = slug?.trim().toLowerCase();
  const root = rootDomain?.trim().toLowerCase();
  if (!label || !root) {
    return null;
  }
  const scheme = root === 'localhost' || root.startsWith('localhost:') ? 'http' : 'https';
  return `${scheme}://${label}.${root}`;
}
