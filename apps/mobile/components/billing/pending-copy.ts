// ===========================================================================
// TODO(i18n) — FOUR KEYS THE `billing` NAMESPACE DOES NOT CARRY. A DEBT.
// ===========================================================================
//
// Same shape and same reasoning as `components/auth/pending-copy.ts` and
// `components/shop/pending-copy.ts`: the branch is built STRUCTURALLY and
// marked, rather than Georgian being invented for it.
//
// `components/billing/invoice-pdf.ts` deliberately distinguishes THREE reasons a
// download did not end in a share sheet — and its docstring says why in as many
// words ("every failure is a `reason` the caller turns into a toast"). The
// screen was throwing all three away and rendering `billing.invoices.error`
// ("Invoices could not be loaded."), which is:
//
//   * WRONG — the invoices loaded fine; the list is on screen behind the toast;
//   * and, for `unauthenticated`, actively misleading. An expired session is
//     told the list would not load and offered nothing. The one thing that
//     would fix it — signing back in — is never mentioned.
//
// The `billing` namespace has 5 top-level keys and `billing.invoices` has 9,
// none of which is about a DOWNLOAD. Nothing in either catalogue says "your
// session has ended" either — `auth.errors` is an empty block.
//
// THE KEYS OWED:
//
//   | key                                | English placeholder                          |
//   |------------------------------------|----------------------------------------------|
//   | `billing.invoices.downloadError`   | We couldn't download that invoice. …         |
//   | `billing.invoices.downloadExpired` | Your session has ended. Sign in to …         |
//   | `billing.invoices.downloadNoShare` | This device has nowhere to send a PDF.       |
//   | `billing.invoices.downloading`     | Downloading…                                 |
//
// DELETE THIS FILE when they land.

/** The three download failures, plus the in-flight label. English-only, on purpose. */
export const BILLING_PENDING_COPY = {
  /** TODO(i18n) `billing.invoices.downloadError` — reason `failed`. */
  downloadError: "We couldn't download that invoice. Please try again.",
  /**
   * TODO(i18n) `billing.invoices.downloadExpired` — reason `unauthenticated`.
   *
   * `GET /me/invoices/:id/pdf` is `SubscriptionManage`, so a token that has
   * gone means the file can never arrive. This is the only one of the three
   * with an action attached, which is why it is worded as an instruction.
   */
  downloadExpired: 'Your session has ended. Sign in again to download this invoice.',
  /**
   * TODO(i18n) `billing.invoices.downloadNoShare` — reason `unavailable`.
   *
   * `Sharing.isAvailableAsync()` is false on a bare simulator and on some
   * Android builds. Retrying cannot help, so this one offers nothing: saying
   * "try again" to a device that has no share sheet is a dead instruction.
   */
  downloadNoShare: 'This device has nowhere to send a PDF.',
  /** TODO(i18n) `billing.invoices.downloading` — the pressed row's spinner. */
  downloading: 'Downloading…',
} as const;
