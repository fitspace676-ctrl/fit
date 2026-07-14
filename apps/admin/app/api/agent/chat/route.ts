// @fit/admin — AI Agent chat proxy.
//
// The agent loop (Claude/Gemini + the Fit MCP tools) runs in the backend
// `@fit/mcp-server` service, where the provider keys live — not in this frontend.
// This route is a thin same-origin proxy: the browser can't read the httpOnly
// access-token cookie, so it POSTs here, and we forward the conversation to the
// agent service's `POST /agent/chat` with the operator's token as a bearer,
// streaming the NDJSON reply straight back to the client.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';

export const runtime = 'nodejs';
// The stream must flush incrementally; never statically cache or buffer it.
export const dynamic = 'force-dynamic';

/** Base URL of the backend AI-agent service (@fit/mcp-server). */
function agentServiceUrl(): string {
  return process.env.AGENT_SERVICE_URL ?? 'http://localhost:3005';
}

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession();
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!session || !token) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = await request.text();
  const upstream = await fetch(`${agentServiceUrl()}/agent/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body,
  });

  // Stream the API's NDJSON response through to the browser unchanged.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  });
}
