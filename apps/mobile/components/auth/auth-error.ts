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
// `auth.genericError` is the fallback sentence, and it cannot tell "wrong
// password" from "verify your email first" — the second one is a dead end the
// user cannot escape without being told. So each code the API distinguishes on
// these five screens (`apps/api` sets them; `lib/api/auth.ts` documents them)
// gets its own sentence as the key lands:
//
//   | key                                    | code / status            |
//   |----------------------------------------|--------------------------|
//   | `auth.login.errors.invalidCredentials` | 401 INVALID_CREDENTIALS  |
//   | `auth.errors.emailNotVerified` (owed)  | 403 EMAIL_NOT_VERIFIED   |
//   | `auth.errors.rateLimited` (owed)       | 429 (see `pending-copy`) |
//
// `invalidCredentials` sits under `auth.login.errors` beside the other sign-in
// refusals: only `POST /auth/login` answers with that code. Deliberately NOT a
// `switch` on `error.message`: the message is server-authored prose that
// changes without notice, the code is the contract.

import type { MessageKey } from '../../lib/i18n/keys';
import { ApiError } from '../../lib/http/api-error';

/** The catalogue key for a failed auth call. */
export function authErrorKey(error: unknown): MessageKey {
  if (!ApiError.is(error)) {
    return 'auth.genericError';
  }
  // A wrong address or password is the user's to fix at the field, and the
  // generic "try again" would tell them to repeat the same thing.
  if (error.code === 'INVALID_CREDENTIALS') {
    return 'auth.login.errors.invalidCredentials';
  }
  // TODO(i18n): `auth.errors.emailNotVerified` for 403 EMAIL_NOT_VERIFIED.
  // Until that key exists, every other code lands on the generic sentence —
  // which is at least true, and in the user's language, which the API's own
  // message is not.
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
