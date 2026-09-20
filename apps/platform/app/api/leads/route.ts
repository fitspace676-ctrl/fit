import { NextResponse } from 'next/server';
import { createPlatformLeadSchema } from '@fit/types';
import { env } from '@/lib/env';

/**
 * `POST /api/leads` — the marketing site's own lead endpoint, a thin server-side
 * forwarder onto the backend's `POST /platform/leads`.
 *
 * The forms used to post to the API straight from the browser, which needs
 * `NEXT_PUBLIC_API_URL` present at **build** time to be inlined into the bundle.
 * It was not set on the production deploy, so the built site fell back to
 * `http://localhost:3000` and every submission failed silently in the visitor's
 * browser. Going through the server instead means:
 *
 * - the API base URL is read per request, so setting it later needs no rebuild;
 * - the browser talks to its own origin, so no CORS round-trip is involved;
 * - the honeypot never reaches the backend, keeping the wire contract clean.
 *
 * The visitor's address is forwarded as `X-Forwarded-For` so the API's per-IP
 * rate limit keys on the real client instead of collapsing the whole site into
 * one bucket.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where the backend lives when neither `API_URL` nor `NEXT_PUBLIC_API_URL` is
 * configured. Production falls back to the deployed API rather than to localhost:
 * an unset variable used to mean the form was quietly broken for every visitor,
 * and a public marketing form failing silently is the worst of the options. Set
 * `API_URL` on the deployment to point somewhere else.
 */
const FALLBACK_API_URL = {
  production: 'https://api-production-a2f4.up.railway.app',
  development: 'http://localhost:3000',
} as const;

/** Resolve the backend base URL for this request, without a trailing slash. */
export function apiBaseUrl(): string {
  const configured =
    env.API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === 'production'
      ? FALLBACK_API_URL.production
      : FALLBACK_API_URL.development);
  return configured.replace(/\/+$/, '');
}

/**
 * The submitted body, before it is narrowed to the API's contract: the lead
 * fields plus `website`, a honeypot input hidden from real visitors. Anything
 * that fills it in is automated, so the submission is accepted and dropped —
 * answering `400` would only tell the bot which field gave it away.
 */
const HONEYPOT_FIELD = 'website';

/** Left-most entry of the inbound `X-Forwarded-For` chain — the real visitor. */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body === 'object' && body !== null) {
    const honeypot = (body as Record<string, unknown>)[HONEYPOT_FIELD];
    if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
      return NextResponse.json({ id: 'ignored' }, { status: 201 });
    }
  }

  // Validate here as well as in the API so a malformed submission is answered
  // without a round-trip, and so the honeypot is stripped rather than forwarded.
  const parsed = createPlatformLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/platform/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: "We couldn't reach our servers. Please try again in a moment." },
      { status: 502 },
    );
  }

  const payload = (await upstream.json().catch(() => null)) as unknown;
  if (!upstream.ok) {
    const message =
      (payload as { message?: string | string[] } | null)?.message ??
      'Submission failed. Please try again.';
    return NextResponse.json(
      { message: Array.isArray(message) ? message[0] : message },
      { status: upstream.status },
    );
  }

  return NextResponse.json(payload, { status: upstream.status });
}
