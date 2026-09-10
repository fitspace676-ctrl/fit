// @fit/mobile — the public tenant lookup (`GET /gyms/by-subdomain/:slug`).
//
// The one gym route a member app may call, and the one query key with no `gymId`
// prefix — necessarily so: it is what the join / login flow resolves *before* a
// session exists, so there is no gym to scope it by.
//
// `GET /gyms` is **not** here. It carries `TenantGuard` + `@AllowCrossTenant()`
// and lists every gym on the platform: `Gym` is not a tenant-scoped model, so
// without that guard any authenticated user could read the whole roster. It is a
// SUPER_ADMIN surface, and a `MEMBER` calling it gets a 403.
//
// `lib/api/auth.ts` also reaches this route, through its own bare-`fetch`
// transport — deliberately, because the session layer needs the gym id *while
// establishing* a session, when `apiFetch`'s 401→refresh path would be a
// recursion (see that file's header). This module is the richer read the rest of
// the app uses: branding, timezone, contact.

import type { GymBySubdomainResponse } from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * `GET /gyms/by-subdomain/:slug` — a tenant's public entry view.
 *
 * Deliberately minimal server-side: id, name, brand and timezone, never the
 * roster fields. An unknown or reserved slug is a `404 GYM_NOT_FOUND`, which
 * throws — a caller that wants "unknown slug is a diagnosis, not a failure"
 * should catch it (`lib/api/auth.ts`'s `gymIdBySlug` does exactly that for the
 * D4 mismatch check).
 */
export async function getGymBySubdomain(
  params: { slug: string },
  options: FetchOptions = {},
): Promise<GymBySubdomainResponse> {
  return apiJson<GymBySubdomainResponse>(
    endpointPath(ENDPOINTS.getGymBySubdomain, { slug: params.slug }),
    {
      method: ENDPOINTS.getGymBySubdomain.method,
      // `@Public()`, and reached before a session exists. Sending a stale Bearer
      // would be noise the server still has to parse.
      anonymous: true,
      signal: options.signal,
    },
  );
}
