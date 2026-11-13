// T5.9 — Invoice-description wording.
//
// The pure, framework-agnostic phrasing shared by the subscription mint sites. The
// invoice *reference* rule that used to live here moved to `@fit/types`
// (`formatInvoiceNumber`, beside the Settings → Invoicing schema that composes it),
// so the staff console's live preview and the API's mint site build a number with
// the same function instead of two copies of the same rule. The atomic allocation of
// `seq` remains a database concern (the `InvoiceSequence` counter, done in the API's
// `InvoiceService`).

/**
 * Build an invoice's human-readable `description` for a subscription charge, so the
 * enrolment and renewal mint sites word it identically, always in Georgian: `"Premium - ყოველთვიური
 * აბონემენტი"` for the first (enrolment) charge and `"Premium - ყოველთვიური განახლება"`
 * for a recurring one. `planName` falls back to a generic label for a plan-less / renamed
 * subscription; `interval` picks the cadence adjective. Pure so it is shared and
 * unit-testable without a database.
 */
export function subscriptionInvoiceDescription(
  planName: string | null | undefined,
  interval: 'MONTH' | 'YEAR',
  kind: 'enrolment' | 'renewal',
): string {
  const label = planName?.trim() ? planName.trim() : 'აბონემენტი';
  const cadence = interval === 'YEAR' ? 'წლიური' : 'ყოველთვიური';
  return `${label} - ${cadence} ${kind === 'renewal' ? 'განახლება' : 'აბონემენტი'}`;
}
