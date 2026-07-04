// @fit/web — member credit-pack (personal-training credits) API helper.
//
// Authenticated, server-only read of the signed-in member's usable PT credit
// packs (`GET /members/me/credit-packs`). Like the booking-history helper it
// forwards the `accessToken` cookie as a bearer token and degrades to an empty
// list on an absent/`401`/`403` session, so a page can render its "no credits"
// state instead of erroring.

import { cookies } from 'next/headers';
import {
  creditPackCatalogueEntrySchema,
  creditPackSummarySchema,
  type CreditPackCatalogueEntry,
  type CreditPackSummary,
} from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Fetch the calling member's active credit packs (credits remaining, soonest to
 * expire first). Returns `[]` when there is no session or the API answers
 * `401`/`403`; any other non-OK status throws, as does a malformed payload.
 */
export async function fetchMyCreditPacks({ signal }: { signal?: AbortSignal } = {}): Promise<
  CreditPackSummary[]
> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return [];
  }

  const response = await fetch(`${API_URL}/members/me/credit-packs`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
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
  return creditPackSummarySchema.array().parse(body.packs ?? []);
}

/** Total credits remaining across every active pack. */
export function totalRemainingCredits(packs: CreditPackSummary[]): number {
  return packs.reduce((sum, pack) => sum + pack.remainingCredits, 0);
}

/**
 * Fetch the gym's buyable credit packs (`GET /credit-packs/catalogue`) for the
 * member's "Buy credits" picker (T5.8). Like {@link fetchMyCreditPacks} it forwards
 * the session cookie and degrades to `[]` on an absent / `401` / `403` session, so
 * the membership page renders without a purchase option rather than erroring.
 */
export async function fetchCreditPackCatalogue({ signal }: { signal?: AbortSignal } = {}): Promise<
  CreditPackCatalogueEntry[]
> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return [];
  }

  const response = await fetch(`${API_URL}/credit-packs/catalogue`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return [];
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load credit-pack catalogue (${response.status})`);
  }

  const body = (await response.json()) as { packs?: unknown };
  return creditPackCatalogueEntrySchema.array().parse(body.packs ?? []);
}
