'use server';

// @fit/web — credit-pack purchase server action (T5.8).
//
// Buy a class-credit pack for the signed-in member without exposing the httpOnly
// session: the action runs on the server, reads the `accessToken` cookie, and
// forwards it as a bearer token to the @fit/api member endpoint
// (`POST /credit-packs/purchase`). Gym + member identity come from the token, so
// only the catalogue `packId` crosses the wire. Returns a small tagged result the
// caller turns into a toast; a `422 PACK_UNAVAILABLE` is surfaced with its code so
// the member is told the pack is no longer on sale.

import { cookies } from 'next/headers';
import {
  purchaseCreditPackSchema,
  type PurchaseCreditPackResponse,
  PACK_UNAVAILABLE_CODE,
} from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** A purchase action's outcome — `ok` with the new pack id, or an error with the API's stable `code`. */
export type PurchaseCreditPackActionResult =
  | { ok: true; data: PurchaseCreditPackResponse }
  | { ok: false; error: string; code?: string };

/** Extract `{ code, message }` from an error payload, if present. */
function errorOf(body: unknown): { code?: string; message?: string } {
  if (body && typeof body === 'object') {
    const b = body as { code?: unknown; message?: unknown };
    return {
      code: typeof b.code === 'string' ? b.code : undefined,
      message: typeof b.message === 'string' ? b.message : undefined,
    };
  }
  return {};
}

/**
 * Buy the credit pack named by `packId` for the calling member. Validates the id
 * with the same Zod schema the API uses, forwards the session token, and maps the
 * result to a tagged outcome — `PACK_UNAVAILABLE` is passed through as a `code` so
 * the picker can tell the member the pack is no longer available.
 */
export async function purchaseCreditPackAction(
  packId: string,
): Promise<PurchaseCreditPackActionResult> {
  const parsed = purchaseCreditPackSchema.safeParse({ packId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'INVALID_REQUEST' };
  }

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return { ok: false, error: 'UNAUTHENTICATED', code: 'UNAUTHENTICATED' };
  }

  const response = await fetch(`${API_URL}/credit-packs/purchase`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (response.status === 201 && body && typeof body === 'object') {
    return { ok: true, data: body as PurchaseCreditPackResponse };
  }
  const { code, message } = errorOf(body);
  return {
    ok: false,
    error: message ?? `Failed to buy pack (${response.status})`,
    code: code ?? (response.status === 422 ? PACK_UNAVAILABLE_CODE : undefined),
  };
}
