// @fit/web — member invoice PDF download proxy (T5.10).
//
// The membership screen's "Download" link points here rather than at the API
// directly: the member session lives in an httpOnly `accessToken` cookie the
// browser can't forward as a Bearer token, so this route reads the cookie, calls
// the API's `GET /me/invoices/:id/pdf` (which resolves the caller and constrains
// the lookup to their own invoices), and pipes the PDF body straight back as a
// download. Not locale-prefixed or auth-gated by the middleware (the `/api` prefix
// is excluded), so it re-checks the session itself via the cookie.

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

// Reads the live session cookie + proxies a live stream, so never cache.
export const dynamic = 'force-dynamic';

/** `GET /api/invoices/:invoiceId` — stream the caller's invoice PDF as a download. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  const { invoiceId } = await params;
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/me/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'UPSTREAM_UNREACHABLE' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Download failed (${upstream.status})` },
      { status: upstream.status || 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ??
        `attachment; filename="invoice-${invoiceId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
