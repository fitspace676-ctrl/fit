// @fit/admin — AI Agent chat session by id: get (full) / upsert / delete.
//
// Same-origin proxy to the fit API (`/agent/sessions/:id`), forwarding the
// operator's httpOnly access token so the API scopes the session to the gym +
// current user. See ../route.ts for the list endpoint and rationale.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

async function token(): Promise<string | null> {
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthenticated' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

/** Pass an API response straight back to the client (JSON, no caching). */
function relay(res: Response): Response {
  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

interface Ctx {
  params: Promise<{ id: string }>;
}

/** `GET /api/agent/sessions/:id` — one session with its full transcript. */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const t = await token();
  if (!t) return unauthorized();
  const { id } = await params;
  const res = await fetch(`${apiBaseUrl()}/agent/sessions/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${t}` },
    cache: 'no-store',
  });
  return relay(res);
}

/** `PUT /api/agent/sessions/:id` — upsert title + messages. */
export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const t = await token();
  if (!t) return unauthorized();
  const { id } = await params;
  const body = await req.text();
  const res = await fetch(`${apiBaseUrl()}/agent/sessions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    body,
    cache: 'no-store',
  });
  return relay(res);
}

/** `DELETE /api/agent/sessions/:id` — remove a saved session. */
export async function DELETE(_req: Request, { params }: Ctx): Promise<Response> {
  const t = await token();
  if (!t) return unauthorized();
  const { id } = await params;
  const res = await fetch(`${apiBaseUrl()}/agent/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${t}` },
    cache: 'no-store',
  });
  return new Response(null, { status: res.status === 204 ? 204 : res.status });
}
