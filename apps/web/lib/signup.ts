// @fit/web — join-wizard API helpers: catalogue, self-signup, checkout.
//
// The three calls the purchase wizard makes that no other screen does. Split out
// from `./auth` because signup is a *gym-scoped* flow with its own contract —
// unlike `registerWithCredentials`, it creates the membership, captures the
// profile, and comes back with a live session.

import {
  EMAIL_TAKEN_CODE,
  createCheckoutResponseSchema,
  type CreateCheckoutInput,
  type CreateCheckoutResponse,
  type MemberSignupInput,
  type SignupCatalogueResponse,
  type TokenPair,
} from '@fit/types';
import { storeTokens } from './auth';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Raised when signup is refused because the address already has an account. A
 * distinct error type (rather than a message the caller has to string-match) so
 * the wizard can offer "sign in instead" without losing the buyer's place in the
 * flow.
 */
export class EmailTakenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailTakenError';
  }
}

/** Read `{ message, code }` off a non-2xx body, tolerating a non-JSON response. */
async function errorBody(response: Response): Promise<{ message?: string; code?: string }> {
  return ((await response.json().catch(() => null)) as { message?: string; code?: string }) ?? {};
}

/**
 * Everything the wizard's branch + product steps render, in one request
 * (`GET /catalogue`). Public — this runs before the visitor has any session.
 * Throws with the API's error message on a non-2xx response.
 */
export async function fetchSignupCatalogue({
  gymId,
  locationId,
  signal,
}: {
  gymId: string;
  locationId?: string;
  signal?: AbortSignal;
}): Promise<SignupCatalogueResponse> {
  const params = new URLSearchParams({ gymId });
  if (locationId) params.set('locationId', locationId);

  const response = await fetch(`${API_URL}/catalogue?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const detail = await errorBody(response);
    throw new Error(detail.message ?? `Failed to load the catalogue (${response.status})`);
  }
  return (await response.json()) as SignupCatalogueResponse;
}

/**
 * Create the member's account **and** their gym membership, then persist the
 * session it returns (`POST /auth/signup`). The buyer walks away signed in, so
 * the checkout call that follows is authenticated.
 *
 * Throws {@link EmailTakenError} when the address is already registered — the
 * one failure the wizard handles as a branch rather than an error — and a plain
 * `Error` carrying the API's message otherwise.
 */
export async function signupMember(input: MemberSignupInput): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await errorBody(response);
    if (detail.code === EMAIL_TAKEN_CODE) {
      throw new EmailTakenError(detail.message ?? 'Email is already registered');
    }
    throw new Error(detail.message ?? `Sign-up failed (${response.status})`);
  }

  const tokens = (await response.json()) as TokenPair;
  await storeTokens(tokens);
  return tokens;
}

/**
 * Buy the chosen product. Authenticated: the gym, the member and the price are
 * resolved server-side from the session and the catalogue, so the body only
 * names what is being bought. Returns the parsed, validated response — a
 * malformed payload throws rather than redirecting to a broken confirmation
 * page.
 *
 * Goes through the **same-origin** `/api/checkout` route rather than the API
 * directly. The session lives in an httpOnly cookie the client cannot read, and
 * the API sits on a different origin than the portal, so a direct cross-origin
 * call carries no credentials at all and is rejected — the route reads the
 * cookie server-side and forwards a Bearer token.
 */
export async function createCheckout(
  input: CreateCheckoutInput & { signal?: AbortSignal },
): Promise<CreateCheckoutResponse> {
  const { signal, ...body } = input;
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = await errorBody(response);
    throw new Error(detail.message ?? `Checkout failed (${response.status})`);
  }

  return createCheckoutResponseSchema.parse(await response.json());
}
