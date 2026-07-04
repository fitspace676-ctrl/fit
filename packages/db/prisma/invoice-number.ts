// T5.9 — Invoice-number formatting.
//
// The pure, framework-agnostic rule that turns an invoice's structured parts — the
// fiscal `year` and the per-gym+year sequence number `seq` — into its human-facing
// reference (`"2026-0001"`). The atomic allocation of `seq` is a database concern
// (the `InvoiceSequence` counter, done in the API's `InvoiceService`); this formatting
// is kept pure and beside the schema so the same reference is produced identically
// wherever an invoice is minted (enrolment, renewal, POS) and is unit-testable without
// a database.

/** Digits the sequence number is zero-padded to within a year (`0001`, `0042`, `1234`). */
export const INVOICE_SEQ_PAD_WIDTH = 4;

/**
 * Format an invoice reference from its fiscal `year` and per-gym+year `seq`:
 * `"2026-0001"`. `seq` is 1-based and zero-padded to {@link INVOICE_SEQ_PAD_WIDTH}
 * digits; a `seq` that outgrows the pad width (≥ 10 000 in a single gym-year) simply
 * renders with its natural width rather than truncating, so the reference stays unique
 * and monotonic. Pass a whole-number `year` and a positive integer `seq`.
 */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `${year}-${String(seq).padStart(INVOICE_SEQ_PAD_WIDTH, '0')}`;
}

/**
 * Build an invoice's human-readable `description` for a subscription charge, so the
 * enrolment and renewal mint sites word it identically: `"Premium — monthly
 * subscription"` for the first (enrolment) charge and `"Premium — monthly renewal"` for
 * a recurring one. `planName` falls back to a generic label for a plan-less / renamed
 * subscription; `interval` picks the cadence adjective. Pure so it is shared and
 * unit-testable without a database.
 */
export function subscriptionInvoiceDescription(
  planName: string | null | undefined,
  interval: 'MONTH' | 'YEAR',
  kind: 'enrolment' | 'renewal',
): string {
  const label = planName?.trim() ? planName.trim() : 'Subscription';
  const cadence = interval === 'YEAR' ? 'annual' : 'monthly';
  return `${label} — ${cadence} ${kind === 'renewal' ? 'renewal' : 'subscription'}`;
}
