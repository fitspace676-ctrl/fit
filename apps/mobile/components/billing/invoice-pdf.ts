// @fit/mobile — handing an invoice PDF to the operating system.
//
// ===========================================================================
// THE WEB PORTAL'S `<a download>` HAS NO EQUIVALENT ON A PHONE.
//
// `GET /me/invoices/:invoiceId/pdf` answers `application/pdf` bytes, not JSON.
// On the web that is an anchor with a `download` attribute and the browser does
// the rest. React Native has no anchor, no browser download manager and no
// filesystem the user can see, so the two-step below is the platform's actual
// answer:
//
//   1. `expo-file-system` streams the response into the app's CACHE directory,
//      with the `Authorization` header attached — this route is
//      `SubscriptionManage`, not `@Public()`, so a bare URL in a browser 401s.
//   2. `expo-sharing` hands that file to the OS share sheet, which is where
//      "save to Files", "mail it to my accountant" and "print" all live.
//
// The cache directory, deliberately, not documents: an invoice PDF is a
// transient copy of a server-side record. Leaving it in documents grows
// forever, and re-downloading it costs one request.
//
// ---------------------------------------------------------------------------
// WHY THIS IMPORTS `lib/api/me` WHEN SCREENS MUST NOT.
//
// The rule is that a SCREEN reads `hooks/`, never `lib/api/`. This module is
// not a screen, and `myInvoicePdfUrl`'s own docstring names this exact caller:
//
//   > Exposed as a URL as well as a fetch because the natural way to hand a PDF
//   > to the OS on a device is `expo-file-system`'s `downloadAsync` +
//   > `expo-sharing`, and neither may be imported from `lib/` (§5).
//
// So the seam was built for this, and the alternative — rebuilding the path
// from `env.apiUrl` — would put a second copy of a route outside the `ENDPOINTS`
// table that `scripts/check-mobile-endpoints.ts` checks, which is precisely the
// defect class WP-17 exists for.
//
// **Still owed to Lane B:** a `useInvoicePdf()` mutation in `hooks/`, so the
// screen layer never names `lib/` at all. Flagged in the report.
//
// ---------------------------------------------------------------------------
// THERE IS NO INVOICE *LIST* ENDPOINT, WHICH IS WHY THERE IS NO INVOICE QUERY.
//
// The history arrives inside `GET /me/subscription` — one endpoint, one key
// (`queryKeys.membership`), which is also why booking a PT session invalidates
// the membership key (it raises an invoice). Anything here that looks like it
// wants a `useInvoices()` is looking for a route that does not exist.

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { myInvoicePdfUrl } from '../../lib/api/me';
import { getAccessToken } from '../../lib/auth/token-store';

/** Why a download did not end in a share sheet. */
export type InvoicePdfFailure =
  /** No session — the route is `SubscriptionManage`. */
  | 'unauthenticated'
  /** The OS has nothing to share with (a bare simulator, some Android builds). */
  | 'unavailable'
  /** The request failed, or the file could not be written. */
  | 'failed';

/** A completed download, or the reason it stopped. */
export type InvoicePdfResult = { ok: true } | { ok: false; reason: InvoicePdfFailure };

/**
 * The filename the share sheet offers.
 *
 * Built from the invoice id rather than from a localised label: this string
 * becomes a filename on the member's device and in whatever they mail it to, so
 * it must be stable, ASCII, and free of the path separators an id never
 * contains but a name might.
 */
export function invoiceFileName(invoiceId: string): string {
  return `invoice-${invoiceId.replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;
}

/**
 * Download one invoice and offer it to the OS.
 *
 * Never throws: every failure is a `reason` the caller turns into a toast, because
 * an unhandled rejection inside a press handler is a red screen in development
 * and a silent no-op in production — and this is a button a member presses when
 * they are already annoyed about a charge.
 */
export async function shareInvoicePdf(invoiceId: string): Promise<InvoicePdfResult> {
  const token = getAccessToken();
  if (token === null) return { ok: false, reason: 'unauthenticated' };

  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'unavailable' };
    }

    const destination = new FileSystem.File(FileSystem.Paths.cache, invoiceFileName(invoiceId));
    const file = await FileSystem.File.downloadFileAsync(myInvoicePdfUrl(invoiceId), destination, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
      // The same invoice, downloaded twice, must overwrite rather than reject
      // with `DestinationAlreadyExists` — which is what a member pressing the
      // row a second time would otherwise see.
      idempotent: true,
    });

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
