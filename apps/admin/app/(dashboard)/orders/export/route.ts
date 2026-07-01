// @fit/admin — orders CSV export proxy (T7.9).
//
// The admin "Export CSV" link points here rather than at the API directly: the
// staff session lives in an httpOnly cookie the browser can't forward as a Bearer
// token, so this server route re-checks the capability, calls the API's streaming
// `GET /orders/export` with the token attached, and pipes the CSV body straight
// back to the browser as a download. Streaming the body through (rather than
// buffering it) keeps a 5k+ row export memory-flat on the way out.

import { NextResponse } from 'next/server';
import { Permission, roleHasPermission, type ListOrdersQueryInput } from '@fit/types';
import { fetchOrdersExport } from '@/lib/api';
import { getServerSession } from '@/lib/session';

// Reads the live session cookie + proxies a live stream, so never cache.
export const dynamic = 'force-dynamic';

/** `GET /orders/export?<filters>` — stream the filtered orders as a CSV download. */
export async function GET(req: Request): Promise<Response> {
  // Defence in depth: the middleware gates the route to staff, but re-assert the
  // billing-read capability here since this is its own endpoint. The API re-checks
  // again behind its own guards.
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.BillingRead)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const filters: Partial<ListOrdersQueryInput> = {
    channel: (params.get('channel') ?? undefined) as ListOrdersQueryInput['channel'],
    status: (params.get('status') ?? undefined) as ListOrdersQueryInput['status'],
    memberId: params.get('memberId') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  };

  const upstream = await fetchOrdersExport(filters);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Export failed (${upstream.status})` },
      { status: upstream.status === 0 ? 502 : upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="orders.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
