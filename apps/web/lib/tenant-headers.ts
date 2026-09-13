// @fit/web — the tenant header for server-side API calls (server-only).
//
// Every Server Component, Server Action and route handler that calls the API
// spreads `await tenantHeaders()` into its request headers. Those calls go
// server-to-server to the API's own host, so without this the API would see no
// trace of the gym the visitor is on. See `TENANT_HOST_HEADER` for the contract.

import { headers } from 'next/headers';
import { resolveTenantHost, tenantHostHeaders } from './tenant-host';

/**
 * `{ 'x-tenant-host': <public host of this request> }` — `x-forwarded-host`
 * before `host`, so it is the tenant host behind Vercel's proxy — or `{}` when
 * the request carries neither. Reads `next/headers`, so request scope only.
 */
export async function tenantHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  return tenantHostHeaders(resolveTenantHost(h.get('x-forwarded-host'), h.get('host')));
}
