// @fit/mobile — the signed-in member's PT credit balance (`/members/me/credit-packs`).
//
// The redesigned Profile tab (T7.9) shows the member's remaining personal-training
// sessions on its "PT credits" card. Those live behind
// `GET /members/me/credit-packs` — self-scoped (the caller is resolved from the
// session, no member id on the wire), the same endpoint the web member dashboard
// reads. It returns the member's usable packs (`ACTIVE`, with credits left); the
// card sums their `remainingCredits` into a single "N PT sessions left".
//
// Goes through the authenticated `apiFetch` client and is Zod-validated against
// the `@fit/types` schema so the wire contract can't silently drift. A `401`/`403`
// (the token can no longer read this member) degrades to an empty list rather than
// throwing — the card then simply shows "No PT sessions left".

import { creditPackSummarySchema, type CreditPackSummary } from '@fit/types';
import { apiFetch } from './api-client';

/** Arguments for {@link fetchMyCreditPacks}. */
export interface FetchCreditPacksArgs {
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the signed-in member's usable credit packs via `GET /members/me/credit-packs`,
 * parsed and validated. Returns `[]` for a member with no packs (a normal `200`)
 * or when the session can't read them (`401`/`403`).
 */
export async function fetchMyCreditPacks({ signal }: FetchCreditPacksArgs = {}): Promise<
  CreditPackSummary[]
> {
  const response = await apiFetch('/members/me/credit-packs', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return [];
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load credit packs (${response.status})`);
  }

  const body = (await response.json()) as { packs?: unknown };
  const packs = Array.isArray(body.packs) ? body.packs : [];
  return packs.map((pack) => creditPackSummarySchema.parse(pack));
}

/** Sum the live `remainingCredits` across `packs` — the member's PT session balance. */
export function totalRemainingCredits(packs: CreditPackSummary[]): number {
  return packs.reduce((sum, pack) => sum + pack.remainingCredits, 0);
}
