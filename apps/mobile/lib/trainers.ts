// @fit/mobile — trainer-discovery API helpers.
//
// Mirrors the web's `lib/trainers.ts`: the mobile trainer browse/detail screens
// read the exact same wire contract (`GET /trainers`, `GET /trainers/:id`,
// `@fit/types`) the public web index does, so the two surfaces can never drift
// on the card/detail shape. Both endpoints are `@Public()`, but the reads still
// go through the shared `apiFetch` client so base-URL + auth-header handling
// lives in one place (and a signed-in member's `gymId` scopes the roster).

import {
  trainerCardSchema,
  trainerDetailSchema,
  type TrainerCard,
  type TrainerDetail,
} from '@fit/types';
import { apiFetch } from './api-client';

/** Arguments for {@link fetchTrainers}. */
export interface FetchTrainersArgs {
  gymId: string;
  /** Abort signal so a superseded roster request is cancelled. */
  signal?: AbortSignal;
}

/**
 * Fetch a gym's full trainer roster (`GET /trainers?gymId=<id>`). Returns the
 * parsed, validated cards ordered by name (a malformed payload throws rather
 * than reaching the list). An empty array is a normal result — the screen
 * renders its "no trainers yet" empty state.
 */
export async function fetchTrainers({ gymId, signal }: FetchTrainersArgs): Promise<TrainerCard[]> {
  const params = new URLSearchParams({ gymId });

  const response = await apiFetch(`/trainers?${params.toString()}`, {
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

/** Arguments for {@link fetchTrainer}. */
export interface FetchTrainerArgs {
  gymId: string;
  /** The trainer id (the `[trainerId]` route param). */
  trainerId: string;
  /** Abort signal so a superseded detail request is cancelled. */
  signal?: AbortSignal;
}

/**
 * Fetch one trainer's profile + upcoming schedule for the detail screen via
 * `GET /trainers/:id?gymId=<id>`. Returns the parsed, validated
 * {@link TrainerDetail}. A `404` (unknown / cross-tenant id) surfaces as a
 * thrown {@link TrainerNotFound} so the screen can show its dedicated
 * "trainer not found" state rather than a generic error; any other non-OK
 * status throws a plain error.
 */
export async function fetchTrainer({
  gymId,
  trainerId,
  signal,
}: FetchTrainerArgs): Promise<TrainerDetail> {
  const params = new URLSearchParams({ gymId });

  const response = await apiFetch(`/trainers/${trainerId}?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 404) {
    throw new TrainerNotFound(trainerId);
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load trainer (${response.status})`);
  }

  const body = (await response.json()) as { trainer?: unknown };
  return trainerDetailSchema.parse(body.trainer);
}

/**
 * Thrown by {@link fetchTrainer} when the trainer cannot be found (`404`). Lets
 * the detail screen branch on a missing trainer without parsing status text —
 * see `useTrainer`.
 */
export class TrainerNotFound extends Error {
  constructor(trainerId: string) {
    super(`Trainer not found: ${trainerId}`);
    this.name = 'TrainerNotFound';
  }
}

/** The up-to-two-letter initials for a name, for the avatar placeholder. */
export function trainerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const last = parts[parts.length - 1];
  if (parts.length === 1 || !last) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}
