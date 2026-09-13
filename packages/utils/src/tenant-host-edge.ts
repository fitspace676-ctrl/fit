// Tenant-host helpers that are safe to bundle into Edge middleware.
//
// `./tenant-host` reads `RESERVED_SUBDOMAINS` from `@fit/types`, and that barrel
// brings zod and every schema in the platform with it — far too much for the
// web and admin `middleware.ts` bundles, which only need to know which gym a
// request's Host names. This module imports nothing, so it is exposed on its
// own subpath (`@fit/utils/tenant-host-edge`) and the middleware can use it.
//
// The price is a mirrored copy of the reserved list below. It is pinned to the
// original by `tenant-host-edge.spec.ts`, which fails the moment the two drift.

/**
 * The header web/admin put on every request they make to the API, carrying the
 * public tenant host the visitor is on (`downtown.formacore.io`).
 *
 * The API cannot learn it any other way: the Next apps call it server-to-server
 * at its own Railway host, and Railway's edge overwrites `x-forwarded-host` with
 * that host on the way in. The API still validates the value against its root
 * domain, and on an authenticated request the session's own gym stays the scope
 * — the header only picks the tenant for public routes and detects a session
 * used on the wrong gym's host.
 */
export const TENANT_HOST_HEADER = 'x-tenant-host';

/** Mirror of `RESERVED_SUBDOMAINS` in `@fit/types` (`packages/types/src/gyms.ts`). */
export const EDGE_RESERVED_SUBDOMAINS: readonly string[] = [
  'www',
  'app',
  'api',
  'admin',
  'platform',
  'superadmin',
  'auth',
  'login',
  'mail',
  'email',
  'static',
  'assets',
  'cdn',
  'status',
  'help',
  'support',
  'docs',
  'dashboard',
];

/** Strip a trailing `:port` and any `x-forwarded-host` list, then normalise. */
export function normaliseHostname(host: string): string {
  return host.split(',')[0]!.split(':')[0]!.trim().toLowerCase();
}

/**
 * The gym slug `host` names under `rootDomain`, treating `reserved` labels as
 * platform hosts. The one implementation behind both `extractGymSlug` and
 * {@link extractGymSlugEdge}, which differ only in where the list comes from.
 */
export function gymSlugFromHost(
  host: string | null | undefined,
  rootDomain: string | null | undefined,
  reserved: readonly string[],
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
  if (!label || label.includes('.') || reserved.includes(label)) {
    return null;
  }
  return label;
}

/** `extractGymSlug` for the Edge runtime — same answers, no `@fit/types` import. */
export function extractGymSlugEdge(
  host: string | null | undefined,
  rootDomain: string | null | undefined,
): string | null {
  return gymSlugFromHost(host, rootDomain, EDGE_RESERVED_SUBDOMAINS);
}

/**
 * The public host a request was addressed to: the first `x-forwarded-host`
 * entry when a proxy set one (Vercel, and the web app's `/admin` rewrite), else
 * `host`. Trimmed; the port is kept. `null` when neither carries a value.
 */
export function requestHost(
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): string | null {
  for (const candidate of [forwardedHost, host]) {
    const first = candidate?.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return null;
}

/**
 * Whether a session minted for one gym is being used on another gym's host.
 *
 * Only a positive disagreement counts. A host that names no tenant (the apex,
 * `app.<root>`, a preview URL, the Railway host) and a token that carries no
 * `gymSlug` (a SUPER_ADMIN session, or one issued before the claim existed)
 * both mean "nothing to compare", never "mismatch" — otherwise every legacy
 * session would be signed out on deploy.
 */
export function isTenantMismatch(
  sessionGymSlug: string | null | undefined,
  hostGymSlug: string | null | undefined,
): boolean {
  if (!sessionGymSlug || !hostGymSlug) {
    return false;
  }
  return sessionGymSlug.toLowerCase() !== hostGymSlug.toLowerCase();
}
