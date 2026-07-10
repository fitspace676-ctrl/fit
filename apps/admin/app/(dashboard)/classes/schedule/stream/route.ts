// @fit/admin — live class-occupancy stream proxy (T8.10).
//
// The schedule board's live capacity updates come over Server-Sent Events, but
// the staff session lives in an httpOnly cookie the browser can't forward as a
// Bearer token — and a native `EventSource` can't set an Authorization header
// anyway. So the board opens a *same-origin* `EventSource('/schedule/stream')`
// against this route, which re-checks the class-read capability, calls the API's
// `GET /admin/schedule/stream` with the token attached, and pipes the event
// stream straight back. Same token-forwarding shape as the file-export proxies
// (reports / orders), but long-lived — the body is streamed through, never
// buffered.

import { NextResponse } from 'next/server';
import { Permission, roleHasPermission } from '@fit/types';
import { fetchScheduleStream } from '@/lib/api';
import { getServerSession } from '@/lib/session';

// Reads the live session cookie + proxies a long-lived stream, so never cache.
export const dynamic = 'force-dynamic';

/** `GET /schedule/stream` — proxy the gym's live occupancy SSE to the browser. */
export async function GET(req: Request): Promise<Response> {
  // Defence in depth: the middleware gates the route to staff, but re-assert the
  // class-read capability here since this is its own endpoint. The API re-checks
  // again behind its own guards, and scopes the stream to the token's gym.
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ClassRead)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Tie the upstream connection to the client's: when the browser closes the
  // EventSource (navigation / unmount), the abort tears the upstream fetch down
  // too rather than leaking a dangling stream.
  const upstream = await fetchScheduleStream(req.signal);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Stream failed (${upstream.status})` },
      { status: upstream.status === 0 ? 502 : upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
    },
  });
}
