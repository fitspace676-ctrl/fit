// @fit/admin — invoice PDF download proxy (T5.10).
//
// The member-detail "Invoices" tab's download link points here rather than at the
// API directly: the staff session lives in an httpOnly cookie the browser can't
// forward as a Bearer token, so this server route re-checks the billing-read
// capability, calls the API's `GET /invoices/:id/pdf` with the token attached, and
// pipes the PDF body straight back to the browser as a download.

import { NextResponse } from 'next/server';
import { Permission, roleHasPermission } from '@fit/types';
import { fetchInvoicePdf } from '@/lib/api';
import { getServerSession } from '@/lib/session';

// Reads the live session cookie + proxies a live stream, so never cache.
export const dynamic = 'force-dynamic';

/** `GET /invoices/:invoiceId/pdf` — stream the invoice PDF as an attachment. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  // Defence in depth: the middleware gates the route to staff, but re-assert the
  // billing-read capability here. The API re-checks again behind its own guards.
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.BillingRead)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { invoiceId } = await params;
  const upstream = await fetchInvoicePdf(invoiceId);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Download failed (${upstream.status})` },
      { status: upstream.status === 0 ? 502 : upstream.status },
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
