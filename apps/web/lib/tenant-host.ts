// @fit/web — which tenant a request is addressed to (edge / server / browser safe).
//
// Imported by `middleware.ts` (Edge), by server helpers through
// `lib/tenant-headers.ts`, and by the client fetchers the browser runs, so it
// must stay free of `next/headers`, React, and `@fit/types` (whose zod barrel
// does not belong in the middleware bundle). The slug logic comes from
// `@fit/utils/tenant-host-edge` for the same reason.

import { TENANT_HOST_HEADER, extractGymSlugEdge, requestHost } from '@fit/utils/tenant-host-edge';

/**
 * Dev-only fallback tenant (`NEXT_PUBLIC_DEV_GYM_SLUG`), for local browsers that
 * cannot reach `<slug>.localhost`. Mirrors `devGymSlug()` in `lib/active-gym.ts`;
 * unset in production, where the Host is the only source of truth.
 */
function devGymSlug(): string | null {
  const slug = process.env.NEXT_PUBLIC_DEV_GYM_SLUG?.trim();
  return slug ? slug : null;
}

/**
 * The tenant host to tell the API about, from a request's `x-forwarded-host` /
 * `host`. When the dev fallback is set and the host names no tenant, the
 * fallback is spelled as the host it stands in for (`<slug>.<root>`), so the API
 * resolves the same gym the page is rendering.
 */
export function resolveTenantHost(
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): string | null {
  const resolved = requestHost(forwardedHost, host);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();
  const dev = devGymSlug();
  if (dev && root && !extractGymSlugEdge(resolved, root)) {
    return `${dev}.${root}`;
  }
  return resolved;
}

/** `{ 'x-tenant-host': host }`, or nothing when there is no host to send. */
export function tenantHostHeaders(tenantHost: string | null | undefined): Record<string, string> {
  return tenantHost ? { [TENANT_HOST_HEADER]: tenantHost } : {};
}

/**
 * The tenant header for a fetch the BROWSER makes straight to the API. The API
 * lives on its own host, so the page's host never reaches it on its own — the
 * browser has to say it. Empty during SSR (no `window`); a server-side caller
 * uses `tenantHeaders()` from `lib/tenant-headers.ts` instead.
 */
export function browserTenantHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }
  return tenantHostHeaders(resolveTenantHost(null, window.location.host));
}

/** The gym slug a request's host names, or the dev fallback, or `null`. */
export function requestGymSlug(
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): string | null {
  return (
    extractGymSlugEdge(requestHost(forwardedHost, host), process.env.NEXT_PUBLIC_ROOT_DOMAIN) ??
    devGymSlug()
  );
}
