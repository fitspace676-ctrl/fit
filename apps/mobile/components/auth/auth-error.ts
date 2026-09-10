// @fit/mobile — turning a failed auth call into a sentence the user can read.
//
// ## Why not just render `error.message`
//
// The web member portal does (`err instanceof Error ? err.message : …`), and it
// is the one thing about those four forms that should not be copied. The API's
// messages are hardcoded English — `POST /auth/forgot-password` answers with a
// single constant English sentence *by design*, so it cannot leak whether the
// address exists — and rendering them verbatim puts an English line in the
// middle of a Georgian screen. `apps/web` already learned this and now says
// `auth.forgot.sent` in its own voice; see the comment in
// `forgot-password-form.tsx`. Mobile starts there instead of arriving there.
//
// ## What that costs, and what is owed
//
// `auth.genericError` is the only error sentence the `auth` namespace carries,
// so today every failure reads "Something went wrong. Please try again." — true,
// but it cannot tell "wrong password" from "verify your email first", and the
// second one is a dead end the user cannot escape without being told.
//
// TODO(i18n) — three keys owed, one per code the API actually distinguishes on
// these five screens (`apps/api` sets them; `lib/api/auth.ts` documents them):
//
//   | key                              | code / status            |
//   |----------------------------------|--------------------------|
//   | `auth.errors.invalidCredentials`  | 401 INVALID_CREDENTIALS  |
//   | `auth.errors.emailNotVerified`    | 403 EMAIL_NOT_VERIFIED   |
//   | `auth.errors.rateLimited`         | 429 (see `pending-copy`) |
//
// The mapping table below is written now, with every arm pointing at the
// fallback, so closing the gap is a one-line change per row rather than a new
// module. Deliberately NOT a `switch` on `error.message`: the message is
// server-authored prose that changes without notice, the code is the contract.

import type { MessageKey } from '../../lib/i18n/keys';
import { ApiError } from '../../lib/http/api-error';

/** The catalogue key for a failed auth call. */
export function authErrorKey(error: unknown): MessageKey {
  if (!ApiError.is(error)) {
    return 'auth.genericError';
  }
  // TODO(i18n): `auth.errors.invalidCredentials` for 401 INVALID_CREDENTIALS,
  // `auth.errors.emailNotVerified` for 403 EMAIL_NOT_VERIFIED. Until those keys
  // exist, every code lands on the generic sentence — which is at least true,
  // and in the user's language, which the API's own message is not.
  return 'auth.genericError';
}

/**
 * Is this the kind of failure a *retry* fixes?
 *
 * Plan §6 item 3 asks for "error with a working retry", and on a form the retry
 * IS the submit button — so the only question is whether re-pressing it is
 * honest. A transport failure (`status: 0` — timeout, dead radio) or a 5xx: yes.
 * A 401 on a wrong password: no, and offering "try again" for it would be the
 * app telling the user their correct action is to do the same thing twice.
 * A 429 is handled separately, by the cool-down, and must never re-arm submit.
 */
export function isRetryable(error: unknown): boolean {
  if (!ApiError.is(error)) return false;
  if (error.status === 429) return false;
  return error.isTransport || error.status >= 500;
}
