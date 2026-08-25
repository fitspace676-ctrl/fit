// @fit/web — service slots + the member's own service sessions.
//
// `fetchServiceSlots` is the public read behind a service's booking calendar
// (`GET /service-sessions`, gymId-scoped, no session), so it is safe to call from
// a client component. The member's own sessions live in `my-service-sessions.ts`,
// which is server-only (it reads the session cookie).

import { listServiceSlotsResultSchema, type ServiceSlot } from '@fit/types';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export interface FetchServiceSlotsArgs {
  gymId: string;
  serviceId: string;
  /** ISO instants bounding the window, `[from, to)`. */
  from: string;
  to: string;
  signal?: AbortSignal;
}

/** The OPEN, future slots of one service in a window. Unauthenticated. */
export async function fetchServiceSlots({
  gymId,
  serviceId,
  from,
  to,
  signal,
}: FetchServiceSlotsArgs): Promise<ServiceSlot[]> {
  const params = new URLSearchParams({ gymId, serviceId, from, to });
  const response = await fetch(`${API_URL}/service-sessions?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load slots (${response.status})`);
  }
  return listServiceSlotsResultSchema.parse(await response.json()).slots;
}
