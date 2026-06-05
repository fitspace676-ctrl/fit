// @fit/platform — owner-signup API client.
//
// Thin wrapper over the @fit/api `POST /auth/register-gym` endpoint that the
// marketing site's gym-owner signup form posts to. Provisioning a tenant does
// NOT issue a session — the API emails the owner a verification link first — so
// this returns the provisioned tenant/owner ids rather than tokens, mirroring
// how `apps/web`'s plain registration defers the session to email verification.

import type { RegisterGymInput, RegisterGymResponse } from '@fit/types';
import { env } from './env';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Provision a new gym tenant and onboard its first OWNER in one call. POSTs the
 * {@link RegisterGymInput} to `POST /auth/register-gym`; on success the API has
 * created the tenant and the (unverified) owner account and emailed a
 * verification link, returning the provisioned ids. No session is issued, so the
 * caller swaps the form for a "check your inbox" notice rather than redirecting
 * straight into the tenant console. Throws with the API's error message on a
 * non-2xx response (e.g. `409 EMAIL_TAKEN`, `409 SLUG_TAKEN`).
 */
export async function registerGym(input: RegisterGymInput): Promise<RegisterGymResponse> {
  const response = await fetch(`${API_URL}/auth/register-gym`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Gym signup failed (${response.status})`);
  }

  return (await response.json()) as RegisterGymResponse;
}
