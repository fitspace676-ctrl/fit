// @fit/mobile — the member's self-service purchase (T7.10).
//
// Until now buying was web-only: the Personal Training screen listed the gym's
// packages but could not sell one, so a member had to finish on the portal's
// wizard or at reception. This closes that gap against the same endpoint the
// wizard's final step posts:
//
//   • POST /checkout — buy a package / subscription / credit pack
//
// The body is deliberately thin. The gym, the buying member and the price are
// resolved server-side from the session and the catalogue row, so a tampered
// body cannot buy someone else a membership or name its own price; only *what*
// is being bought crosses the wire.
//
// Like `subscriptions.ts` this returns a discriminated result rather than
// throwing, because the failures here are ordinary outcomes a screen must phrase
// exactly — a plan withdrawn from sale, or a member who already holds one.

import type { CheckoutProductType, CreateCheckoutResponse } from '@fit/types';
import { apiFetch } from './api-client';

/** A purchase outcome: the settled record, or a coded failure. */
export type CheckoutResult =
  | { ok: true; data: CreateCheckoutResponse }
  | { ok: false; code?: string; message?: string };

export interface CheckoutInput {
  productType: CheckoutProductType;
  productId: string;
  /** Which branch the purchase belongs to, when the gym has more than one. */
  locationId?: string;
  promoCode?: string;
}

/** Pull `{ code, message }` off an error payload, if present. */
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
 * Buy `productId` from the `productType` catalogue via `POST /checkout`.
 *
 * On success exactly one of `orderId` / `subscriptionId` is set, keyed by
 * `productType`: a package or credit pack raises a paid order, while a
 * subscription enrolment mints the first period's invoice instead — the two
 * settle onto different financial records on purpose, so the caller reads the
 * confirmation from whichever id came back.
 *
 * The failures worth phrasing are `422 PRODUCT_UNAVAILABLE` (withdrawn from sale
 * or not this gym's), `409 ALREADY_SUBSCRIBED`, and a `403` when the session
 * holds no live membership here.
 *
 * Note there is no payment gateway behind this yet (the T8.8 stub): a success
 * means the purchase was recorded and the membership reserved, not that a card
 * was charged. Settlement still happens at the gym.
 */
export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const response = await apiFetch('/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (response.ok && payload && typeof payload === 'object') {
    return { ok: true, data: payload as CreateCheckoutResponse };
  }
  return { ok: false, ...errorOf(payload) };
}
