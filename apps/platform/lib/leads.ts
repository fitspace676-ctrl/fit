// @fit/platform — marketing lead-capture API client.
//
// Posts the marketing site's free-trial, book-a-demo and pricing-request forms to
// the app's own `POST /api/leads` route handler, which forwards them server-side
// to the @fit/api `POST /platform/leads` endpoint. Same-origin on purpose: the
// browser used to call the API directly, which required `NEXT_PUBLIC_API_URL` to
// be inlined at build time — it was not set in production, so every submission
// failed against a `http://localhost:3000` fallback. Capturing a lead creates no
// account or session, so this returns nothing but the stored lead id.

import type { CreatePlatformLeadInput, CreatePlatformLeadResponse } from '@fit/types';

/** A lead plus the honeypot input; `website` is stripped by the route handler. */
export type SubmitLeadInput = CreatePlatformLeadInput & { website?: string };

/**
 * Submit a trial / demo / pricing lead. Resolves with the stored lead id on
 * success; throws with the server's error message on a non-2xx response (a
 * malformed email, a rate-limited client, an unreachable API) so the form can
 * surface it and let the visitor retry.
 */
export async function submitLead(input: SubmitLeadInput): Promise<CreatePlatformLeadResponse> {
  const response = await fetch('/api/leads', {
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
