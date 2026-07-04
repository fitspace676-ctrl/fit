// @fit/platform — marketing lead-capture API client.
//
// Thin wrapper over the @fit/api `POST /platform/leads` endpoint the marketing
// site's free-trial and book-a-demo forms post to. Capturing a lead does nothing
// but record the prospect (and best-effort notify the sales team) — no account or
// session is created — so this returns the stored lead id.

import type { CreatePlatformLeadInput, CreatePlatformLeadResponse } from '@fit/types';
import { env } from './env';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Submit a trial/demo lead to `POST /platform/leads`. Resolves with the stored
 * lead id on success; throws with the API's error message on a non-2xx response
 * (e.g. `400` for a malformed email) so the form can surface it.
 */
export async function submitLead(
  input: CreatePlatformLeadInput,
): Promise<CreatePlatformLeadResponse> {
  const response = await fetch(`${API_URL}/platform/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Submission failed (${response.status})`);
  }

  return (await response.json()) as CreatePlatformLeadResponse;
}
