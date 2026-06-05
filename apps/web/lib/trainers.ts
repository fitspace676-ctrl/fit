// @fit/web — trainer-discovery API helpers.
//
// Thin wrapper over the public `@fit/api` `GET /trainers` endpoint used by the
// trainers index (T3.6). Like the class helpers this is an unauthenticated read:
// the listing is `@Public()`, scoped by an explicit `gymId` the page resolves
// from the active subdomain.

import { trainerCardSchema, type TrainerCard } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchTrainers}. */
export interface FetchTrainersArgs {
  gymId: string;
  /** Abort signal so an in-flight request is cancelled if the gym changes. */
  signal?: AbortSignal;
}

/**
 * Fetch the trainers for one gym. Returns the parsed, validated cards (a
 * malformed payload throws rather than reaching the grid). The caller passes an
 * `AbortSignal` so an unmount cancels the request instead of racing it.
 */
export async function fetchTrainers({ gymId, signal }: FetchTrainersArgs): Promise<TrainerCard[]> {
  const params = new URLSearchParams({ gymId });

  const response = await fetch(`${API_URL}/trainers?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load trainers (${response.status})`);
  }

  const body = (await response.json()) as { trainers?: unknown };
  return trainerCardSchema.array().parse(body.trainers ?? []);
}
