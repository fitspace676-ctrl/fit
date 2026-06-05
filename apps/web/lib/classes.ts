// @fit/web — class-discovery API helpers.
//
// Thin wrappers over the public `@fit/api` class endpoints used by the classes
// page (T3.4). Unlike the auth helpers these are unauthenticated reads: the
// `GET /class-instances` listing is `@Public()`, scoped by an explicit `gymId`
// the page resolves from the active subdomain.

import {
  classInstanceCardSchema,
  type ClassCalendarView,
  type ClassInstanceCard,
} from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchClassInstances}. */
export interface FetchClassInstancesArgs {
  gymId: string;
  /** Window start, ISO-8601. */
  from: string;
  /** Window end (exclusive), ISO-8601. */
  to: string;
  /** Optional view hint echoed to the API; the response shape is identical. */
  view?: ClassCalendarView;
  /** Abort signal so an in-flight week request is cancelled when the week changes. */
  signal?: AbortSignal;
}

/**
 * Fetch the class occurrences for one gym in the `[from, to)` window. Returns
 * the parsed, validated cards (a malformed payload throws rather than reaching
 * the calendar). The caller passes an `AbortSignal` so navigating to another
 * week cancels the previous request instead of racing it.
 */
export async function fetchClassInstances({
  gymId,
  from,
  to,
  view,
  signal,
}: FetchClassInstancesArgs): Promise<ClassInstanceCard[]> {
  const params = new URLSearchParams({ gymId, from, to });
  if (view) {
    params.set('view', view);
  }

  const response = await fetch(`${API_URL}/class-instances?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load classes (${response.status})`);
  }

  const body = (await response.json()) as { instances?: unknown };
  return classInstanceCardSchema.array().parse(body.instances ?? []);
}
