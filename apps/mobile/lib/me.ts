// @fit/mobile — the signed-in member's self-service reads (`/me/*`).
//
// The check-in screen (T7.8) needs the member's REAL standing to paint its
// membership pass: the plan name, the live subscription status, and how much of
// the current billing period is left. That lives behind `GET /me/subscription`
// — the same self-scoped endpoint the web portal's Membership page reads — which
// resolves the caller from the session (no member id on the wire) and is gated by
// `SubscriptionManage`, a capability every member holds. `GET /me/profile` gives
// the display name for the pass's member line (the session JWT carries only
// `sub`, never a name).
//
// Both go through the authenticated `apiFetch` client and are Zod-validated
// against the `@fit/types` schemas, so the wire contract can never silently
// drift. A `401`/`403` (the token can no longer read this member) degrades to
// `null` rather than throwing — the screen then falls back to the session
// identity, exactly as it does today.

import {
  meProfileSchema,
  meSubscriptionSchema,
  type MeProfile,
  type MeSubscription,
} from '@fit/types';
import { apiFetch } from './api-client';

/** Arguments shared by the `/me/*` reads. */
export interface FetchMeArgs {
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the signed-in member's current membership via `GET /me/subscription`,
 * parsed and validated. Returns `null` when the member has never subscribed (the
 * API's `{ subscription: null }`) or when the session can't read it
 * (`401`/`403`) — the screen then shows a "no active plan" pass rather than an
 * error. The billing-history `invoices` the endpoint also returns are not needed
 * here, so they are dropped.
 */
export async function fetchMeSubscription({
  signal,
}: FetchMeArgs = {}): Promise<MeSubscription | null> {
  const response = await apiFetch('/me/subscription', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load membership (${response.status})`);
  }

  const body = (await response.json()) as { subscription?: unknown };
  if (body.subscription == null) {
    return null;
  }
  return meSubscriptionSchema.parse(body.subscription);
}

/**
 * Fetch the signed-in member's profile via `GET /me/profile`, parsed and
 * validated. Returns `null` on a `401`/`403` so the caller falls back to the
 * session identity.
 */
export async function fetchMeProfile({ signal }: FetchMeArgs = {}): Promise<MeProfile | null> {
  const response = await apiFetch('/me/profile', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load profile (${response.status})`);
  }

  const body = (await response.json()) as { profile?: unknown };
  return meProfileSchema.parse(body.profile);
}
