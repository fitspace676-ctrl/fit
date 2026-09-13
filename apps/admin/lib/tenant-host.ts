// @fit/admin — which tenant a request is addressed to (edge / server / browser safe).
//
// Imported by `middleware.ts` (Edge), by `lib/api.ts` through
// `lib/tenant-headers.ts`, and by the console's few browser-side API calls, so
// it must stay free of `next/headers`, React, and `@fit/types` (whose zod barrel
// does not belong in the middleware bundle — see `lib/auth-session.ts`). The slug
// logic comes from `@fit/utils/tenant-host-edge` for the same reason.

import { TENANT_HOST_HEADER, extractGymSlugEdge, requestHost } from '@fit/utils/tenant-host-edge';

export { isTenantMismatch } from '@fit/utils/tenant-host-edge';

/** The error code the API answers `403` with when a session meets another gym's host. */
export const TENANT_MISMATCH_CODE = 'TENANT_MISMATCH';

/**
 * `?reason=` value on `/login` meaning "your session belongs to another gym".
 * The middleware clears the session cookies when it sees it — the one way a
 * Server Component that met the API's `403` can get them cleared.
 */
export const TENANT_MISMATCH_REASON = 'tenant';

/**
 * The tenant host to tell the API about. Behind the web app's `/admin` rewrite,
 * `x-forwarded-host` is the gym's host and `host` the console's own upstream.
 */
export function resolveTenantHost(
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): string | null {
  return requestHost(forwardedHost, host);
}

/** `{ 'x-tenant-host': host }`, or nothing when there is no host to send. */
export function tenantHostHeaders(tenantHost: string | null | undefined): Record<string, string> {
  return tenantHost ? { [TENANT_HOST_HEADER]: tenantHost } : {};
}

/**
 * The tenant header for a fetch the BROWSER makes straight to the API — the
 * API's own host never sees the page's host otherwise. Empty without `window`.
 */
export function browserTenantHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }
  return tenantHostHeaders(window.location.host);
}

/** The gym slug a request's host names under `NEXT_PUBLIC_ROOT_DOMAIN`, or `null`. */
export function requestGymSlug(
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): string | null {
  return extractGymSlugEdge(requestHost(forwardedHost, host), process.env.NEXT_PUBLIC_ROOT_DOMAIN);
}
