// @fit/web — services catalogue API helper.
//
// Thin wrapper over the public `@fit/api` `GET /services` endpoint behind the
// portal's Services page. Like the trainer and product helpers this is a public
// read scoped by an explicit `gymId` the page resolves from the active subdomain;
// a signed-in member's session is forwarded so it narrows to their home branch
// (`lib/portal-listing.ts`).

import { serviceCardSchema, type ServiceCard } from '@fit/types';
import { fetchPortalListing } from './fetch-portal-listing';

export interface FetchServicesArgs {
  gymId: string;
  /** Abort signal so an in-flight request is settled if the gym changes. */
  signal?: AbortSignal;
}

/**
 * Fetch one gym's ACTIVE services — a signed-in member's home branch only.
 * Returns the parsed, validated cards (a malformed payload throws rather than
 * reaching the grid).
 */
export async function fetchServices({ gymId, signal }: FetchServicesArgs): Promise<ServiceCard[]> {
  const body = (await fetchPortalListing('services', { gymId }, { signal, label: 'services' })) as {
    services?: unknown;
  } | null;
  return serviceCardSchema.array().parse(body?.services ?? []);
}
