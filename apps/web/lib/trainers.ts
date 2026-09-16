// @fit/web — trainer-discovery API helpers.
//
// Thin wrapper over the public `@fit/api` `GET /trainers` endpoint used by the
// trainers index (T3.6). The listing is `@Public()`, scoped by an explicit
// `gymId` the page resolves from the active subdomain; a signed-in member's
// session is forwarded so it narrows to their home branch
// (`lib/portal-listing.ts`). The detail read stays an unauthenticated fetch.

import {
  trainerCardSchema,
  trainerDetailSchema,
  type TrainerCard,
  type TrainerDetail,
} from '@fit/types';
import { fetchPortalListing } from './fetch-portal-listing';
import { browserTenantHeaders } from './tenant-host';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchTrainers}. */
export interface FetchTrainersArgs {
  gymId: string;
  /** Abort signal so an in-flight request is cancelled if the gym changes. */
  signal?: AbortSignal;
}

/**
 * Fetch the trainers for one gym — a signed-in member's home branch only. Returns
 * the parsed, validated cards (a malformed payload throws rather than reaching
 * the grid). The caller passes an `AbortSignal` so an unmount settles the request
 * instead of racing it.
 */
export async function fetchTrainers({ gymId, signal }: FetchTrainersArgs): Promise<TrainerCard[]> {
  const body = (await fetchPortalListing('trainers', { gymId }, { signal, label: 'trainers' })) as {
    trainers?: unknown;
  } | null;
  return trainerCardSchema.array().parse(body?.trainers ?? []);
}

/** Arguments for {@link fetchTrainer}. */
export interface FetchTrainerArgs {
  gymId: string;
  /** The trainer's id, from the detail route's path segment. */
  id: string;
  /** Abort signal so an in-flight request is cancelled if the request changes. */
  signal?: AbortSignal;
}

/**
 * Fetch one trainer's profile + schedule for the detail page. Returns the parsed,
 * validated {@link TrainerDetail}, or `null` when the trainer doesn't exist for
 * this gym (a `404` — an unknown or cross-tenant id), which the page renders as
 * its "trainer not found" state. Any other non-OK status throws; a malformed
 * payload throws rather than reaching the page.
 */
export async function fetchTrainer({
  gymId,
  id,
  signal,
}: FetchTrainerArgs): Promise<TrainerDetail | null> {
  const params = new URLSearchParams({ gymId });

  const response = await fetch(
    `${API_URL}/trainers/${encodeURIComponent(id)}?${params.toString()}`,
    {
      method: 'GET',
      headers: { ...browserTenantHeaders(), Accept: 'application/json' },
      signal,
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load trainer (${response.status})`);
  }

  const body = (await response.json()) as { trainer?: unknown };
  return trainerDetailSchema.parse(body.trainer);
}
