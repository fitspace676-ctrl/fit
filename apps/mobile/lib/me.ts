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
 * One line of the member's billing history, as `GET /me/subscription` returns it.
 *
 * Deliberately declared here rather than reusing `@fit/types`' `MemberInvoice`:
 * that one describes the *admin* member-detail row (`number`, `issuedAt`, a
 * downloadable PDF), while this endpoint sends the member's own thinner
 * projection — `date`, no invoice number. The portal's membership page keeps the
 * same local shape for the same reason.
 */
export interface MemberBillingInvoice {
  id: string;
  /** ISO instant the invoice was raised. */
  date: string;
  /** Amount in minor currency units (tetri). */
  amount: number;
  currency: string;
  /** Settlement state — `PAID` / `PENDING` / `FAILED` / `REFUNDED`. */
  status: string;
}

/**
 * Fetch the member's billing history from `GET /me/subscription` — the same read
 * as {@link fetchMeSubscription}, projected onto the `invoices` it also returns.
 *
 * Hand-parsed rather than Zod'd because a malformed row must not take the whole
 * list down: an unreadable entry is dropped and the rest still render, which is
 * the right failure for a history screen. `[]` on `401`/`403`, or for a member
 * who has never been invoiced.
 */
export async function fetchMeInvoices({ signal }: FetchMeArgs = {}): Promise<
  MemberBillingInvoice[]
> {
  const response = await apiFetch('/me/subscription', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return [];
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load billing history (${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as { invoices?: unknown } | null;
  const rows = Array.isArray(body?.invoices) ? body.invoices : [];

  return rows.flatMap((entry): MemberBillingInvoice[] => {
    if (!entry || typeof entry !== 'object') return [];
    const r = entry as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : null;
    const date = typeof r.date === 'string' ? r.date : null;
    if (!id || !date) return [];
    return [
      {
        id,
        date,
        amount: typeof r.amount === 'number' ? r.amount : 0,
        currency: typeof r.currency === 'string' ? r.currency : 'GEL',
        status: typeof r.status === 'string' ? r.status : 'PAID',
      },
    ];
  });
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
