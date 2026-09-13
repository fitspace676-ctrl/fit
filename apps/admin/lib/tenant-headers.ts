// @fit/admin — the tenant header for server-side API calls (server-only).
//
// `lib/api.ts` and the agent route handlers call the API server-to-server at its
// own host, so the gym the operator is on has to be stated. See
// `TENANT_HOST_HEADER` in `@fit/utils/tenant-host-edge` for the contract.

import { headers } from 'next/headers';
import { resolveTenantHost, tenantHostHeaders } from './tenant-host';

/**
 * `{ 'x-tenant-host': <public host of this request> }`, or `{}` when the request
 * carries no host. Reads `next/headers`, so request scope only.
 */
export async function tenantHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  return tenantHostHeaders(resolveTenantHost(h.get('x-forwarded-host'), h.get('host')));
}
