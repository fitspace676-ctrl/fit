// @fit/mobile — the trainer roster (`/trainers`).
//
// Both routes are `@Public()` and scoped by an explicit `gymId`; the detail
// resolves a cross-tenant id to a `404`, identical to an unknown one, so a
// leaked id discloses nothing.
//
// A trainer's `rating` / `reviewCount` are **denormalised** and recomputed in
// the same transaction that accepts a review (`ReviewsService`), so posting a
// review changes this endpoint's output — see `./reviews.ts`.

import type { GetTrainerResponse, ListTrainersResponse } from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/** `GET /trainers?gymId` — the gym's trainers, ordered by name. */
export async function listTrainers(
  params: { gymId: string },
  options: FetchOptions = {},
): Promise<ListTrainersResponse> {
  return apiJson<ListTrainersResponse>(endpointPath(ENDPOINTS.listTrainers), {
    method: ENDPOINTS.listTrainers.method,
    query: { gymId: params.gymId },
    signal: options.signal,
  });
}

/** `GET /trainers/:id?gymId` — one trainer's profile and upcoming schedule. */
export async function getTrainer(
  params: { trainerId: string; gymId: string },
  options: FetchOptions = {},
): Promise<GetTrainerResponse> {
  return apiJson<GetTrainerResponse>(endpointPath(ENDPOINTS.getTrainer, { id: params.trainerId }), {
    method: ENDPOINTS.getTrainer.method,
    query: { gymId: params.gymId },
    signal: options.signal,
  });
}
