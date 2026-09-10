// What an auth failure turns into, and whether "try again" is honest.
//
// `authErrorKey` currently answers `auth.genericError` for everything — the
// `auth` namespace carries exactly one error sentence — and the table in
// `auth-error.ts` says which three keys are owed. That is asserted here on
// purpose: when the keys land, this file is the one that fails, which is what
// makes the debt visible rather than merely commented.
//
// `isRetryable` is the more interesting half. Plan §6 item 3 asks for "error
// with a working retry", and on a form the retry IS the submit button — so the
// question the function answers is whether re-pressing it is honest, not whether
// something went wrong.
//
// Lives here as a `.test.tsx` rather than a `.spec.ts` for the same reason as
// `use-cool-down.test.tsx`: `vitest.config.ts` claims only `lib/**` and
// `hooks/**`, so a spec under `components/` would be run by neither runner.

import { ApiError } from '../../lib/http/api-error';
import { authErrorKey, isRetryable } from './auth-error';

describe('authErrorKey', () => {
  it('answers a catalogue key, never the API’s own prose', () => {
    // `POST /auth/forgot-password` answers with one hardcoded English sentence
    // BY DESIGN, so it cannot leak whether the address exists. Rendering
    // `error.message` would put that English line in the middle of a Georgian
    // screen — which is the mistake `apps/web` shipped and then fixed.
    const error = new ApiError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });

    expect(authErrorKey(error)).toBe('auth.genericError');
  });

  it('handles a non-ApiError — a thrown string, a TypeError, undefined', () => {
    expect(authErrorKey(new TypeError('undefined is not a function'))).toBe('auth.genericError');
    expect(authErrorKey('boom')).toBe('auth.genericError');
    expect(authErrorKey(undefined)).toBe('auth.genericError');
    expect(authErrorKey(null)).toBe('auth.genericError');
  });

  it('TODO(i18n): every code still lands on the one sentence the namespace has', () => {
    // Three keys are owed — `auth.errors.invalidCredentials` (401),
    // `auth.errors.emailNotVerified` (403), `auth.errors.rateLimited` (429).
    // Until they exist the app says "Something went wrong" to a member whose
    // real problem is "verify your email first", which is a dead end they
    // cannot escape without being told. When the keys land, THIS test fails.
    for (const status of [400, 401, 403, 409, 422, 429, 500, 503]) {
      expect(authErrorKey(new ApiError({ status, code: 'ANY' }))).toBe('auth.genericError');
    }
  });
});

describe('isRetryable', () => {
  it('yes for a transport failure — the request never reached anything', () => {
    // `status: 0` is a timeout or a dead radio. Pressing again is exactly the
    // right advice.
    expect(isRetryable(new ApiError({ status: 0, code: 'NETWORK_ERROR' }))).toBe(true);
  });

  it('yes for a 5xx — the server failed, the request was fine', () => {
    expect(isRetryable(new ApiError({ status: 500, code: 'INTERNAL' }))).toBe(true);
    expect(isRetryable(new ApiError({ status: 502, code: 'BAD_GATEWAY' }))).toBe(true);
    expect(isRetryable(new ApiError({ status: 503, code: 'UNAVAILABLE' }))).toBe(true);
  });

  it('no for a 4xx — the same request will fail the same way', () => {
    // Offering "try again" for a wrong password is the app telling the user
    // their correct action is to do the same thing twice.
    expect(isRetryable(new ApiError({ status: 400, code: 'BAD_REQUEST' }))).toBe(false);
    expect(isRetryable(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' }))).toBe(false);
    expect(isRetryable(new ApiError({ status: 403, code: 'EMAIL_NOT_VERIFIED' }))).toBe(false);
    expect(isRetryable(new ApiError({ status: 404, code: 'NOT_FOUND' }))).toBe(false);
    expect(isRetryable(new ApiError({ status: 422, code: 'VALIDATION_FAILED' }))).toBe(false);
  });

  it('no for a 429 — the cool-down owns that, and it must never re-arm submit', () => {
    // Retrying a rate-limit response is precisely what the limiter is defending
    // against: it turns a 15-minute wait into a longer one.
    expect(isRetryable(new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS' }))).toBe(false);
    expect(
      isRetryable(new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec: 900 })),
    ).toBe(false);
  });

  it('no for anything that is not an ApiError', () => {
    // A `TypeError` from our own code is a bug, and "try again" for a bug is a
    // button that fails identically every time it is pressed.
    expect(isRetryable(new TypeError('cannot read properties of null'))).toBe(false);
    expect(isRetryable('boom')).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});
