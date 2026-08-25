// @fit/web — services catalogue API helper.
//
// Thin wrapper over the public `@fit/api` `GET /services` endpoint behind the
// portal's Services page. Like the trainer and product helpers this is an
// unauthenticated read scoped by an explicit `gymId` the page resolves from the
// active subdomain.

import { serviceCardSchema, type ServiceCard } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export interface FetchServicesArgs {
  gymId: string;
  /** Abort signal so an in-flight request is cancelled if the gym changes. */
  signal?: AbortSignal;
}

/**
 * Fetch one gym's ACTIVE services. Returns the parsed, validated cards (a
 * malformed payload throws rather than reaching the grid).
 */
export async function fetchServices({ gymId, signal }: FetchServicesArgs): Promise<ServiceCard[]> {
  const params = new URLSearchParams({ gymId });
  const response = await fetch(`${API_URL}/services?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load services (${response.status})`);
  }
  const body = (await response.json()) as { services?: unknown };
  return serviceCardSchema.array().parse(body.services ?? []);
}
