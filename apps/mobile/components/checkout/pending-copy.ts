// ===========================================================================
// TODO(i18n) — TWO SENTENCES THE CATALOGUES DO NOT HAVE. A DEBT, NOT A PATTERN.
// ===========================================================================
//
// The `checkout` namespace is 109 keys at full en/ka parity and it covers this
// funnel almost completely — every step, every empty state, both payment
// notices, the whole success screen. It has exactly one hole, and it is a hole
// because `apps/web` never rendered the branch:
//
//   | key owed                             | English placeholder                    |
//   |--------------------------------------|----------------------------------------|
//   | `checkout.payment.alreadySubscribed` | You already have an active membership. |
//   | `checkout.payment.termsRequired`     | Tick the box above to continue.        |
//
// `POST /checkout` answers `409 ALREADY_SUBSCRIBED` when the member already
// holds a live subscription. Web does not branch on it: `CheckoutScreen` lets
// every checkout failure fall through to `setError(err.message)` and renders
// the API's own English sentence, so the key was never needed. Doing the same
// here would put an English line in the middle of a Georgian screen, which is
// the defect `components/auth/auth-error.ts` exists to avoid.
//
// `checkout.payment.error` is NOT the substitute: it says "please try again",
// and trying again cannot work — there is nothing wrong to fix, the member
// simply already has what they were buying.
//
// The second is the same hole one layer up. `checkout.payment.terms` is the
// LABEL on the switch and there is no sentence anywhere saying the box is
// required — because, again, the branch was never rendered: web leaves Pay
// disabled and says nothing, and so did this screen. The file already reasons
// about that exact class of failure two hundred lines earlier ("a disabled
// `Button` swallows its own press, so 'press Continue and I will show you what
// is missing' cannot work through a disabled control") and then does it anyway
// on the last control in the funnel.
//
// The other two DoD states with no copy — offline, and the 429 cool-down —
// are NOT re-declared here. They are already owed by
// `components/auth/pending-copy.ts`, and this funnel renders that module's
// `OfflineNotice` / `CoolDownNotice` rather than growing a second copy of the
// same debt.
//
// DELETE THIS FILE when both keys land in both locales.

/** The two join-funnel sentences with no catalogue key. English-only, on purpose. */
export const CHECKOUT_PENDING_COPY = {
  /** TODO(i18n) `checkout.payment.alreadySubscribed` */
  alreadySubscribed: 'You already have an active membership.',
  /** TODO(i18n) `checkout.payment.termsRequired` */
  termsRequired: 'Tick the box above to continue.',
} as const;
