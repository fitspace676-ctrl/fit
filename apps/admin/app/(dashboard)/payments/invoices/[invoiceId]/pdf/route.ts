// @fit/admin — invoice PDF proxy (T5.10).
//
// The invoice roster's and member-detail's PDF links point here rather than at the
// API directly: the staff session lives in an httpOnly cookie the browser can't
// forward as a Bearer token, so this server route re-checks the billing-read
// capability, calls the API's `GET /invoices/:id/pdf` with the token attached, and
// pipes the PDF body straight back to the browser.
//
// One route serves both affordances staff need, differing only in
// `Content-Disposition`: `?view=1` previews the invoice in a browser tab, and the
// default downloads it. Re-fetching the same bytes for either is free — the API
// renders once and caches the document to R2.

import { NextResponse } from 'next/server';
import { Permission, roleHasPermission } from '@fit/types';
import { fetchInvoicePdf } from '@/lib/api';
import { getServerSession } from '@/lib/session';

// Reads the live session cookie + proxies a live stream, so never cache.
export const dynamic = 'force-dynamic';

/**
 * Re-label an upstream `Content-Disposition` as inline, keeping whatever filename it
 * carried (the API names the file after the invoice number, which the id in the URL
 * can't reproduce). Falls back to a name built from the id when the header is absent.
 */
function inlineDisposition(upstream: string | null, invoiceId: string): string {
  const filename = upstream?.match(/filename="([^"]+)"/)?.[1] ?? `invoice-${invoiceId}.pdf`;
  return `inline; filename="${filename}"`;
}

/**
 * `GET /payments/invoices/:invoiceId/pdf` — stream the invoice PDF.
 *
 * Downloads by default; pass `?view=1` to render it in the browser instead.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  // Defence in depth: the middleware gates the route to staff, but re-assert the
  // billing-read capability here. The API re-checks again behind its own guards.
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.BillingRead)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { invoiceId } = await params;
  const view = new URL(req.url).searchParams.get('view') === '1';

  const upstream = await fetchInvoicePdf(invoiceId);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Download failed (${upstream.status})` },
      { status: upstream.status === 0 ? 502 : upstream.status },
    );
  }

  const disposition = upstream.headers.get('content-disposition');
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': view
        ? inlineDisposition(disposition, invoiceId)
        : (disposition ?? `attachment; filename="invoice-${invoiceId}.pdf"`),
      'Cache-Control': 'no-store',
    },
  });
}
