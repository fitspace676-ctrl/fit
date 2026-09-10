// @fit/mobile — the raw `POST /auth/*` transport.
//
// ## Why this file does not use `apiFetch`
//
// Two independent reasons, either of which alone is sufficient:
//
//   1. **Recursion.** `apiFetch` answers a 401 by refreshing and retrying. A
//      login that 401s (`INVALID_CREDENTIALS` — the *correct* answer to a wrong
//      password) would therefore spend the refresh token, and a refresh that
//      failed would recurse. `refresh-gate.ts` avoids this by taking its `fetch`
//      as a dependency and never importing the client; this module does the
//      same, and its spec asserts the import is absent.
//   2. **These routes take no Bearer.** `AuthController` is `@Public()` in its
//      entirety (`apps/api/src/auth/auth.controller.ts`) — every route must work
//      before a session exists. Attaching a stale `Authorization` header would
//      be pointless noise on the wire.
//
// What it *does* share with the client is the error contract: a non-2xx throws
// an {@link ApiError} carrying the API's `code`, its `details`, and — this is the
// load-bearing one for auth — `retryAfterSec`.
//
// ## `POST /auth/signup` LIVES HERE, and an earlier draft of this header said
// ## it should not. That reversal is deliberate — C4b, 2026-08-31.
//
// The note this replaces reasoned from the BODY: `memberSignupSchema`'s required
// fields are derived per-gym from `GymMemberIntakeSettings`, so it read like a
// join-funnel concern rather than a session one. But which fields a gym asks for
// is decided in the FORM, against the catalogue the form already holds; nothing
// about the request itself is join-specific. What *is* specific is everything
// this module exists for, and signup needs all of it:
//
//   * it is `@Public()` and takes no Bearer, like every other route in here;
//   * it is `authStrict` — **5 requests per 900 seconds** — so it must surface
//     `retryAfterSec` for the countdown, which is this module's own contract;
//   * it MINTS A SESSION. It answers with a `TokenPair`, exactly as `login`,
//     `verifyEmail` and `resetPassword` do, and `lib/auth/session.ts` is the
//     only module allowed to persist one. Routing it through `apiFetch` instead
//     would have put a session-issuing call behind the refresh-and-retry client
//     — the recursion this file's header opens by refusing.
//
// So the join funnel owns the FORM and the ordering (`signUpMember` then
// `POST /checkout`); the transport is here, beside its four siblings.
//
// ## Rate limits, and why `retryAfterSec` is not optional here
//
// `AuthController` carries `RATE_LIMITS.auth` (10 requests / 60s per IP) at the
// controller level, and `register`, `forgot-password` and `reset-password`
// override it with `RATE_LIMITS.authStrict` — **5 requests per 900 seconds**
// (`apps/api/src/common/rate-limit/rate-limit.decorator.ts`). Fifteen minutes is
// far past the point where "try again later" is an acceptable message: a screen
// that cannot say *how long* leaves the user tapping a dead button. The guard
// sets `Retry-After` in seconds on every 429, so it is parsed here and surfaced
// as `ApiError.retryAfterSec` for the countdown UI to render.
//
// ## Not here
//
//   - `POST /auth/refresh` — owned by `lib/http/refresh-gate.ts`, which must be
//     the *only* caller: the endpoint rotates and reuse-detects, so a second
//     entry point is how a healthy session gets its whole token family revoked.
//   - `POST /auth/register-gym`, `GET /auth/accept-invite` — staff/owner
//     surfaces the member app has no screen for.

import type {
  AppleAuthInput,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  GoogleAuthInput,
  LoginInput,
  MemberSignupInput,
  RefreshInput,
  RegisterInput,
  RegisterResponse,
  ResetPasswordInput,
  TokenPair,
} from '@fit/types';
import { env } from '../env';
import {
  ApiError,
  apiErrorFromResponse,
  CLIENT_ERROR_CODES,
  parseRetryAfter,
} from '../http/api-error';

/** Everything the transport needs from the outside world. */
export interface AuthApiDeps {
  /** API base URL, no trailing slash. */
  apiUrl: string;
  /**
   * The **bare** `fetch`. Never `apiFetch` — see this file's header for the two
   * reasons. Injected so the spec drives every route with no network and no
   * global stubbing.
   */
  fetchImpl: typeof fetch;
  /** Default per-request timeout, in milliseconds. */
  timeoutMs: number;
}

/** Per-call overrides. */
export interface AuthCallOptions {
  /** Override the default timeout — sign-out caps its calls far tighter. */
  timeoutMs?: number;
  /** The caller's cancellation signal. */
  signal?: AbortSignal | null;
}

/**
 * The `/auth/*` surface the member app uses.
 *
 * Every method rejects with {@link ApiError} on a non-2xx; none of them touches
 * the keychain. Persisting a returned {@link TokenPair} is `lib/auth/session.ts`'s
 * job and only its job — this module has no idea a session exists.
 */
export interface AuthApi {
  /** `POST /auth/login` — issues a session. `409`-free; `401 INVALID_CREDENTIALS`, `403 EMAIL_NOT_VERIFIED`, `403 GYM_SUSPENDED`. */
  login(input: LoginInput, options?: AuthCallOptions): Promise<TokenPair>;
  /** `POST /auth/register` — creates the account and sends the verification email. No session. `authStrict`. */
  register(input: RegisterInput, options?: AuthCallOptions): Promise<RegisterResponse>;
  /**
   * `POST /auth/signup` — the join funnel's account creation. **Issues a
   * session**, unlike {@link register}.
   *
   * One call creates the `User`, its `MEMBER` membership on `input.gymId` with
   * the captured profile, sends the verification email, and returns a
   * `TokenPair`. That ordering is the whole of D9: the buyer is authenticated
   * before `POST /checkout` moves any money, so a signed-out visitor can finish
   * the funnel.
   *
   * `authStrict` — 5 per 900s. A `409 EMAIL_TAKEN` is a BRANCH, not a failure:
   * the funnel turns it into "sign in instead", prefilled. A `400 GYM_NOT_FOUND`
   * means the tenant is unknown or suspended.
   */
  signup(input: MemberSignupInput, options?: AuthCallOptions): Promise<TokenPair>;
  /** `GET /auth/verify?token=…` — verifies the address and issues the first session. */
  verifyEmail(token: string, options?: AuthCallOptions): Promise<TokenPair>;
  /** `POST /auth/forgot-password` — always the same generic acknowledgement. `authStrict`. */
  forgotPassword(
    input: ForgotPasswordInput,
    options?: AuthCallOptions,
  ): Promise<ForgotPasswordResponse>;
  /** `POST /auth/reset-password` — consumes the token, sets the password, issues a session. `authStrict`. */
  resetPassword(input: ResetPasswordInput, options?: AuthCallOptions): Promise<TokenPair>;
  /** `POST /auth/google` — verifies a Google **ID token** and issues a session. */
  google(input: GoogleAuthInput, options?: AuthCallOptions): Promise<TokenPair>;
  /** `POST /auth/apple` — verifies an Apple **ID token** and issues a session. */
  apple(input: AppleAuthInput, options?: AuthCallOptions): Promise<TokenPair>;
  /** `POST /auth/logout` — revokes the refresh token's whole family. `204`, idempotent. */
  logout(input: RefreshInput, options?: AuthCallOptions): Promise<void>;
  /**
   * `GET /gyms/by-subdomain/:slug` — the one non-`/auth` route here.
   *
   * It is the *only* way a client can turn the `gymSlug` it asked for into the
   * `gymId` the access token came back with, which is what makes the D4 mismatch
   * check possible at all (see `lib/auth/session.ts`). `@Public()`, cheap, and
   * resolves to `null` on `404 GYM_NOT_FOUND` rather than throwing — an unknown
   * slug is a diagnosis, not a failure.
   *
   * WP-7's `lib/api/gyms.ts` will own the full public-gym surface (branding,
   * timezone, contact); this is deliberately just the id, so the session layer
   * does not have to wait for that file to exist.
   */
  gymIdBySlug(slug: string, options?: AuthCallOptions): Promise<string | null>;
}

/** One request. Mirrors `api-client`'s error handling, minus auth and refresh. */
async function request<T>(
  deps: AuthApiDeps,
  path: string,
  init: {
    method: 'GET' | 'POST';
    json?: unknown;
    query?: Record<string, string>;
    options?: AuthCallOptions;
    /** Statuses that resolve to `null` instead of throwing. */
    nullStatuses?: readonly number[];
  },
): Promise<T> {
  const timeoutMs = init.options?.timeoutMs ?? deps.timeoutMs;
  const url = buildAuthUrl(deps.apiUrl, path, init.query);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const callerSignal = init.options?.signal ?? null;
  const forward = (): void => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', forward);
    }
  }

  let response: Response;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    response = await deps.fetchImpl(url, {
      method: init.method,
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      // No cookie, ever. The API's session is the Bearer token it is about to
      // issue; the only cookie this app could send is the guest cart's (D3).
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch (cause) {
    if (timedOut) {
      throw new ApiError({
        status: 0,
        code: CLIENT_ERROR_CODES.timeout,
        message: `The request timed out after ${timeoutMs}ms`,
        cause,
      });
    }
    // A caller-initiated cancellation is not an error — rethrow it verbatim.
    if (callerSignal?.aborted) {
      throw cause;
    }
    throw new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.network,
      message: 'The network request failed',
      cause,
    });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forward);
  }

  if (!response.ok) {
    if (init.nullStatuses?.includes(response.status)) {
      return null as T;
    }
    const body = await readJson(response);
    throw apiErrorFromResponse(
      response.status,
      body,
      // `RateLimitGuard` sets `Retry-After` in delta-seconds on every 429, and
      // on `authStrict` routes that number can be most of 15 minutes.
      response.status === 429 ? parseRetryAfter(response.headers.get('Retry-After')) : undefined,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.malformed,
      message: 'The response body was not valid JSON',
      cause,
    });
  }
}

/** Build an absolute URL for an API-relative path plus optional query. */
export function buildAuthUrl(apiUrl: string, path: string, query?: Record<string, string>): string {
  const base = `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) {
    return base;
  }
  const params = new URLSearchParams(query);
  const serialised = params.toString();
  return serialised ? `${base}?${serialised}` : base;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** Build an {@link AuthApi} over the given transport. */
export function createAuthApi(deps: AuthApiDeps): AuthApi {
  return {
    login: (input, options) =>
      request(deps, '/auth/login', { method: 'POST', json: input, options }),

    register: (input, options) =>
      request(deps, '/auth/register', { method: 'POST', json: input, options }),

    signup: (input, options) =>
      request(deps, '/auth/signup', { method: 'POST', json: input, options }),

    verifyEmail: (token, options) =>
      request(deps, '/auth/verify', { method: 'GET', query: { token }, options }),

    forgotPassword: (input, options) =>
      request(deps, '/auth/forgot-password', { method: 'POST', json: input, options }),

    resetPassword: (input, options) =>
      request(deps, '/auth/reset-password', { method: 'POST', json: input, options }),

    // `googleAuthSchema` is `{ idToken }` — an **ID token**, not an auth code.
    // The API verifies it against Google's public keys itself, so there is no
    // code-exchange leg and no client secret on the device.
    //
    // Note what the schema does NOT accept: `gymSlug`. `loginWithGoogle` calls
    // `resolveSessionScope(userId)` with no slug (`auth.service.ts`), so a
    // social sign-in **always lands on the primary gym** — the earliest-joined
    // active membership. That is a server-side contract, not a client bug: do
    // not go looking for a lost parameter.
    google: (input, options) =>
      request(deps, '/auth/google', { method: 'POST', json: input, options }),

    // `appleAuthSchema` is `{ idToken, name? }`. `name` is optional because
    // Apple puts the display name in **neither** the ID token nor any
    // subsequent authorization — it is handed to the client exactly once, on the
    // very first authorization, out of band. If the caller drops it there, the
    // account is created nameless and Apple will never send it again; the only
    // repair is for the user to revoke the app in iOS Settings. Same primary-gym
    // note as `google` above.
    apple: (input, options) =>
      request(deps, '/auth/apple', { method: 'POST', json: input, options }),

    logout: (input, options) =>
      request(deps, '/auth/logout', { method: 'POST', json: input, options }),

    gymIdBySlug: async (slug, options) => {
      const found = await request<{ gymId: string } | null>(
        deps,
        `/gyms/by-subdomain/${encodeURIComponent(slug)}`,
        { method: 'GET', options, nullStatuses: [404] },
      );
      return typeof found?.gymId === 'string' ? found.gymId : null;
    },
  };
}

// One instance for the app, built lazily so importing this module never reads
// `env` at import time in a spec that wants a different base URL.
let singleton: AuthApi | null = null;

/** The app's `/auth/*` transport, bound to `env` and the global `fetch`. */
export function authApi(): AuthApi {
  singleton ??= createAuthApi({
    apiUrl: env.apiUrl,
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    timeoutMs: env.requestTimeoutMs,
  });
  return singleton;
}

/** Discard the lazy singleton. Specs only. */
export function resetAuthApiForTests(): void {
  singleton = null;
}
