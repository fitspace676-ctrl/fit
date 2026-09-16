// @fit/mobile — session orchestration: the only module that writes tokens.
//
// `token-store.ts` owns *storage* (keychain + in-memory snapshot + subscribers).
// This file owns the *transitions*: sign in, sign in socially, verify, reset,
// refresh proactively, sign out. Every path that mints a session funnels through
// `saveTokens` here, and the single path that ends one funnels through
// `endSession()` — which is why `clearTokens` is not exported from the store.
//
// Four things it exists to get right:
//
//   1. **`gymSlug` is not optional at the call site** (D4). `signIn` requires it
//      in the signature — `undefined` is a value you must pass deliberately, not
//      a parameter you can forget. {@link resolveGymSlug} decides *which* slug:
//      deep link → build config → last successful login → nothing.
//   2. **The mismatch nobody else can see.** `resolveSessionScope`
//      (`apps/api/src/auth/auth.service.ts`) treats `gymSlug` as *context, not a
//      credential*: an unknown slug, or one the user has no active membership
//      in, is silently ignored and the session falls back to the earliest-joined
//      membership. The API returns `200` either way and the token carries only
//      `gymId`. So "I asked to sign into gym X and got gym Y" is invisible
//      server-side and invisible in the response — the client is the only place
//      it can be detected. {@link verifyGymScope} detects it, reports it, and
//      **does not block the login**: the user is legitimately signed in, just
//      not where the deep link pointed.
//   3. **Sign-out actually revokes.** The deleted app never called
//      `POST /auth/logout`, so every sign-out left a 30-day refresh token — and
//      its whole rotation family — live on the server. {@link signOut} unregisters
//      the push device, revokes the family, then clears. Both network calls are
//      best-effort under a 5s cap, but they are *attempted*: a user on a plane
//      still signs out, and a user with a signal genuinely revokes.
//   4. **Refresh before the 401, not after** (WP-4). See
//      {@link ensureFreshSession}.
//
// Nothing here imports `react-native` (§5): the storage backend arrives through
// `setSecureStorage`, and the transport, clock and crash reporter arrive through
// {@link configureSession}.

import type { AppleAuthInput, GoogleAuthInput, MemberSignupInput, RegisterInput } from '@fit/types';
import { authApi, type AuthApi, type AuthCallOptions } from '../api/auth';
import { env } from '../env';
import type { ApiError } from '../http/api-error';
import { apiFetch } from '../http/api-client';
import {
  configureSharedRefreshGate,
  resetSharedRefreshGate,
  sharedRefreshGate,
  type RefreshGate,
} from '../http/refresh-gate';
import { EXPIRY_SKEW_MS, isExpired, decodeSessionClaims, type SessionClaims } from './claims';
import { getDeviceIdSnapshot, hydrateDeviceId } from './device-id';
import { hydrateOnboarding } from './onboarding-store';
import {
  endSession,
  getSecureStorage,
  getSessionClaims,
  getSessionSnapshot,
  hydrateSession,
  saveTokens,
  subscribeSession,
  type TokenPair,
} from './token-store';

// ─────────────────────────────────────────────────────────────────────────────
// Public state shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three states, and the first one matters as much as the other two.
 *
 * `hydrating` is not "signed out yet" — telling them apart is what stops a cold
 * launch with a perfectly good keychain session from flashing through `/login`
 * before the keychain read resolves. The route guard returns `null` for it.
 */
export type SessionStatus = 'hydrating' | 'signed-out' | 'signed-in';

/** The session as the UI sees it. Reference-stable between transitions. */
export interface SessionState {
  readonly status: SessionStatus;
  /** The signed-in user's id (JWT `sub`), or `null`. */
  readonly userId: string | null;
  /**
   * The gym this session is scoped to, or `null`.
   *
   * `null` while signed in is a real, reachable state: a user with no active
   * gym membership gets a token with no `gymId` claim
   * (`resolveSessionScope` → `{ gymId: null }`), and `decodeSessionClaims`
   * returns `null` for it. Such a user is signed in and may browse; every
   * membership-gated CTA renders its own "no plan" state. It is **never** a
   * routing input — see `route-policy.ts`.
   */
  readonly gymId: string | null;
  /** The user's role in that gym (`MEMBER` for the app's own users), or `null`. */
  readonly role: string | null;
  /** Access-token expiry in epoch milliseconds, or `null` when the token carries no `exp`. */
  readonly expiresAt: number | null;
}

/** The gym scope every gym-scoped query key reads. */
export interface ActiveGym {
  readonly gymId: string;
  readonly role: string | null;
  readonly userId: string;
}

/**
 * Where a "we landed on the wrong gym" report goes.
 *
 * An interface rather than a direct `@sentry/react-native` import because that
 * package pulls in `react-native`, which would drag this module — and therefore
 * `token-store`, `api-client` and every spec that touches them — out of the fast
 * Vitest suite (§5). The app wires the real one at startup.
 */
export interface SessionReporter {
  captureMessage(message: string, context: Record<string, unknown>): void;
  captureException(error: unknown, context: Record<string, unknown>): void;
}

const NOOP_REPORTER: SessionReporter = {
  captureMessage: () => undefined,
  captureException: () => undefined,
};

/** The injectable seams. Defaults are the real app's. */
export interface SessionDeps {
  /** The `/auth/*` transport. */
  authApi: AuthApi;
  /** Crash/telemetry sink for non-fatal session anomalies. */
  reporter: SessionReporter;
  /** The clock, so expiry logic is testable without fake timers. */
  now: () => number;
  /** The bare `fetch` the proactive refresh gate uses. */
  fetchImpl: typeof fetch;
  /** API base URL for the proactive refresh gate. */
  apiUrl: string;
  /** Per-request timeout for the proactive refresh. */
  timeoutMs: number;
}

let deps: SessionDeps = defaultDeps();

function defaultDeps(): SessionDeps {
  return {
    authApi: authApi(),
    reporter: NOOP_REPORTER,
    now: () => Date.now(),
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    apiUrl: env.apiUrl,
    timeoutMs: env.requestTimeoutMs,
  };
}

/**
 * Override one or more seams. The app calls this once at startup to install the
 * Sentry reporter; specs call it to inject a scripted transport.
 */
export function configureSession(overrides: Partial<SessionDeps>): void {
  deps = { ...deps, ...overrides };
  // The gate is built from `deps`; a changed transport must not keep the old one.
  resetSharedRefreshGate();
}

/**
 * Report a non-fatal session/startup anomaly through the configured reporter.
 *
 * The reporter is private (`deps`), but the launch gate needs the same sink:
 * a failed secure-store install is exactly the class of "the app still runs,
 * but one capability is gone" event this reporter exists for, and it must not
 * get its own second, differently-shaped channel.
 */
export function reportSessionException(scope: string, error: unknown): void {
  deps.reporter.captureException(error, { scope });
}

/** Restore the app defaults and drop all cached state. Specs only. */
export function resetSessionForTests(): void {
  deps = defaultDeps();
  resetSharedRefreshGate();
  hydrated = false;
  lastGymSlug = undefined;
  cachedState = null;
  cachedFrom = null;
  cachedGym = null;
  cachedGymFrom = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hydration + the observable snapshot
// ─────────────────────────────────────────────────────────────────────────────

let hydrated = false;
const localSubscribers = new Set<() => void>();

function emitLocal(): void {
  for (const notify of localSubscribers) {
    notify();
  }
}

/**
 * Subscribe to every input of {@link getSessionState}: the token store's own
 * save/clear/hydrate events **and** the hydration flag this module owns.
 *
 * One subscription rather than two is what lets `useSession` be a single
 * `useSyncExternalStore` call.
 */
export function subscribeSessionState(callback: () => void): () => void {
  const unsubscribeTokens = subscribeSession(callback);
  localSubscribers.add(callback);
  return () => {
    localSubscribers.delete(callback);
    unsubscribeTokens();
  };
}

// `useSyncExternalStore` re-renders whenever `getSnapshot()` returns a new
// reference, so these must be memoised on their inputs or every commit
// re-renders the whole tree (and React throws "getSnapshot should be cached").
// `getSessionSnapshot()` is itself reference-stable between writes, which is
// what makes identity a sufficient cache key.
let cachedState: SessionState | null = null;
let cachedFrom: { hydrated: boolean; snapshot: TokenPair | null } | null = null;
let cachedGym: ActiveGym | null = null;
let cachedGymFrom: { snapshot: TokenPair | null } | null = null;

const SIGNED_OUT: SessionState = {
  status: 'signed-out',
  userId: null,
  gymId: null,
  role: null,
  expiresAt: null,
};

const HYDRATING: SessionState = {
  status: 'hydrating',
  userId: null,
  gymId: null,
  role: null,
  expiresAt: null,
};

/** The current session state, read synchronously. Reference-stable. */
export function getSessionState(): SessionState {
  const snapshot = getSessionSnapshot();
  if (cachedFrom !== null && cachedFrom.hydrated === hydrated && cachedFrom.snapshot === snapshot) {
    return cachedState as SessionState;
  }
  cachedFrom = { hydrated, snapshot };
  cachedState = computeState(snapshot);
  return cachedState;
}

function computeState(snapshot: TokenPair | null): SessionState {
  if (!hydrated) {
    return HYDRATING;
  }
  if (snapshot === null) {
    return SIGNED_OUT;
  }
  const claims = getSessionClaims();
  return {
    status: 'signed-in',
    userId: claims?.sub ?? null,
    gymId: claims?.gymId ?? null,
    role: claims?.role ?? null,
    expiresAt: claims?.exp === undefined ? null : claims.exp * 1000,
  };
}

/**
 * The active gym scope, or `null` when there is no session or the session has no
 * membership. The single authority behind every `queryKeys.*(gymId)` call.
 */
export function getActiveGymSnapshot(): ActiveGym | null {
  const snapshot = getSessionSnapshot();
  if (cachedGymFrom !== null && cachedGymFrom.snapshot === snapshot) {
    return cachedGym;
  }
  cachedGymFrom = { snapshot };
  const claims = getSessionClaims();
  cachedGym =
    claims === null ? null : { gymId: claims.gymId, role: claims.role ?? null, userId: claims.sub };
  return cachedGym;
}

/** SecureStore key for the slug of the last gym a login actually landed on. */
const LAST_GYM_SLUG_KEY = 'last_gym_slug';

let lastGymSlug: string | undefined;

/**
 * Load everything the first frame depends on: the session, the onboarding flag,
 * the device id, and the remembered gym slug.
 *
 * Until this resolves, {@link getSessionState} reports `hydrating` and the route
 * guard redirects nowhere — so the splash must be held until it does. Resolves
 * even if the keychain read fails: an unreadable keychain is a signed-out
 * launch, not a hung app.
 */
export async function hydrateAuth(): Promise<SessionState> {
  try {
    await Promise.all([
      hydrateSession(),
      hydrateOnboarding(),
      hydrateDeviceId(),
      loadLastGymSlug(),
    ]);
  } catch (error) {
    deps.reporter.captureException(error, { scope: 'session.hydrate' });
  } finally {
    hydrated = true;
    emitLocal();
  }
  return getSessionState();
}

async function loadLastGymSlug(): Promise<void> {
  const stored = await getSecureStorage().getItem(LAST_GYM_SLUG_KEY);
  lastGymSlug = stored === null || stored.length === 0 ? undefined : stored;
}

/** The slug of the gym the last successful login landed on, if any. */
export function getLastGymSlug(): string | undefined {
  return lastGymSlug;
}

async function rememberGymSlug(slug: string): Promise<void> {
  lastGymSlug = slug;
  try {
    await getSecureStorage().setItem(LAST_GYM_SLUG_KEY, slug);
  } catch (error) {
    // A remembered slug is a convenience; failing to write one must never fail
    // a login that already succeeded.
    deps.reporter.captureException(error, { scope: 'session.rememberGymSlug' });
  }
}

/**
 * Which gym slug this sign-in should ask for, in priority order:
 *
 *   1. **The deep link's `?gym=`** — the user followed a specific gym's link, and
 *      that intent outranks anything the app remembers.
 *   2. **`EXPO_PUBLIC_GYM_SLUG`** — a single-tenant build is pinned to its gym.
 *   3. **The last successful login's slug** — a multi-gym member returns to the
 *      gym they last used rather than to whichever they happened to join first.
 *   4. **`undefined`** — let the API pick the primary gym. Which it will do
 *      silently, which is exactly why {@link verifyGymScope} exists.
 *
 * Note (2) reads `env.gymSlug`, which WP-3 bound to `EXPO_PUBLIC_GYM_SLUG`, not
 * the `EXPO_PUBLIC_DEFAULT_GYM_SLUG` the WP-4 brief named. `lib/env.ts` is WP-3's
 * file; renaming the variable there is a one-line follow-up, and doing it from
 * here would mean two modules reading build config.
 */
export function resolveGymSlug(options: { deepLinkSlug?: string | null } = {}): string | undefined {
  const fromLink = normaliseSlug(options.deepLinkSlug);
  if (fromLink !== undefined) {
    return fromLink;
  }
  const fromEnv = normaliseSlug(env.gymSlug);
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  return normaliseSlug(lastGymSlug);
}

/** `loginSchema` lower-cases and trims `gymSlug`; do it here so both agree. */
function normaliseSlug(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in
// ─────────────────────────────────────────────────────────────────────────────

/** What {@link verifyGymScope} concluded about the gym the session landed on. */
export type GymScopeCheck =
  /** The session is scoped to the gym that was asked for. */
  | { readonly kind: 'match'; readonly slug: string; readonly gymId: string }
  /**
   * The API ignored the requested slug and scoped the session elsewhere — an
   * unknown slug, a suspended gym, or (most often) no active membership in it.
   * Reported, never blocking: the user *is* signed in.
   */
  | {
      readonly kind: 'mismatch';
      readonly slug: string;
      readonly requestedGymId: string;
      readonly issuedGymId: string | null;
    }
  /** Nothing to check, or the check itself could not be completed. */
  | { readonly kind: 'unverified'; readonly slug: string | undefined; readonly reason: string };

/** The result of a session-issuing call. */
export interface SignInResult {
  readonly tokens: TokenPair;
  readonly claims: SessionClaims | null;
  /**
   * The gym-scope verification, **already running**.
   *
   * Returned as a promise rather than awaited so a slow (or failed) public gym
   * lookup can never delay a sign-in that has already succeeded. Production
   * ignores it; the spec awaits it to assert the report fired.
   */
  readonly gymScope: Promise<GymScopeCheck>;
}

/**
 * Sign in with an email and password.
 *
 * `gymSlug` is a required property of the argument — pass
 * `resolveGymSlug({ deepLinkSlug })`, or `undefined` deliberately. Making it
 * required is the whole of D4's client half: an optional parameter is one a
 * screen forgets, and a forgotten slug is a member silently signed into the
 * wrong branch.
 */
export async function signIn(
  input: { email: string; password: string; gymSlug: string | undefined },
  options?: AuthCallOptions,
): Promise<SignInResult> {
  const gymSlug = normaliseSlug(input.gymSlug);
  const tokens = await deps.authApi.login(
    {
      email: input.email,
      password: input.password,
      // Omitted rather than sent as `undefined`: `loginSchema` marks it
      // `.optional()`, and `JSON.stringify` drops an undefined value anyway —
      // being explicit keeps the wire body identical either way.
      ...(gymSlug === undefined ? {} : { gymSlug }),
    },
    options,
  );
  return adopt(tokens, gymSlug);
}

/**
 * Sign in with a Google **ID token** (not an authorization code — the API
 * verifies the token against Google's keys itself).
 *
 * A pure function of the token: obtaining it is `expo-auth-session`'s job and
 * belongs in the sign-in screen. Importing that here would put `react-native` in
 * `lib/` and break the §5 test boundary for the whole directory.
 *
 * `googleAuthSchema` accepts no `gymSlug`, and `loginWithGoogle` resolves scope
 * with none, so **social sign-in always lands on the primary gym** — the
 * earliest-joined active membership. There is no lost parameter to find.
 */
export async function signInWithGoogle(
  input: GoogleAuthInput,
  options?: AuthCallOptions,
): Promise<SignInResult> {
  return adopt(await deps.authApi.google(input, options), undefined);
}

/**
 * Sign in with an Apple **ID token**, plus the display name if this is the first
 * authorization.
 *
 * Apple returns the name exactly once, out of band, on the first authorization —
 * never in the ID token and never again. `appleAuthSchema`'s optional `name` is
 * the only channel for it, and the API uses it only when creating the account.
 * Drop it and the account is nameless permanently: Apple will not resend it
 * unless the user revokes the app under Settings → Apple ID → Sign in with Apple.
 * So the screen must pass `credential.fullName` straight through on the first
 * call, even though it will be `null` on every later one.
 *
 * Same primary-gym note as {@link signInWithGoogle}.
 */
export async function signInWithApple(
  input: AppleAuthInput,
  options?: AuthCallOptions,
): Promise<SignInResult> {
  return adopt(await deps.authApi.apple(input, options), undefined);
}

/**
 * Complete email verification (`GET /auth/verify?token=`) — which issues the
 * account's first session, so it lands here rather than in a screen.
 */
export async function completeEmailVerification(
  token: string,
  options?: AuthCallOptions,
): Promise<SignInResult> {
  return adopt(await deps.authApi.verifyEmail(token, options), undefined);
}

/**
 * Complete a password reset. The API revokes every existing session before
 * issuing this one, so the caller walks away signed in and every other device is
 * signed out — the point of resetting a possibly-compromised password.
 */
export async function completePasswordReset(
  input: { token: string; password: string },
  options?: AuthCallOptions,
): Promise<SignInResult> {
  return adopt(await deps.authApi.resetPassword(input, options), undefined);
}

/**
 * Create an account. Issues **no** session — the API sends a verification email
 * and the session arrives via {@link completeEmailVerification}.
 *
 * `authStrict`: 5 per 900s per IP. A 429 here carries `retryAfterSec`, and the
 * screen is expected to render a countdown rather than a dead button.
 */
export async function registerAccount(
  input: RegisterInput,
  options?: AuthCallOptions,
): Promise<{ message: string }> {
  return deps.authApi.register(input, options);
}

/**
 * Join a gym: create the account, its membership, and the first session — the
 * join funnel's `POST /auth/signup`.
 *
 * ===========================================================================
 * THIS IS THE CALL THAT MUST HAPPEN BEFORE THE CHARGE (D9).
 *
 * `POST /checkout` resolves the buying member from the Bearer, so it cannot run
 * until a session exists. `signupMember` on the API therefore creates the
 * account *and* answers with a `TokenPair`, and this function persists it —
 * through {@link adopt}, the same path `signIn` takes, because `saveTokens` is
 * deliberately not exported from `token-store.ts` and every minted session in
 * the app funnels through one place.
 *
 * A REJECTION HERE MUST NEVER REACH `POST /checkout`. The two calls are ordered
 * by `await`, not by a race: no account, no charge. That sequencing is the
 * single highest-value test in the join stage.
 * ===========================================================================
 *
 * Unlike {@link registerAccount} this issues a session immediately, so the
 * buyer is signed in the moment it resolves — with an *unverified* address. The
 * API allows it (the session is already minted); the funnel's confirmation
 * screen is what tells them to click the emailed link, because once this
 * session ends they cannot sign in again until they have.
 *
 * `gymSlug` is passed only for the D4 mismatch diagnostic, exactly as `signIn`
 * uses it — `memberSignupSchema` takes a `gymId`, not a slug, so the tenant is
 * already unambiguous on the wire and the check can only ever confirm it.
 *
 * `authStrict`: 5 per 900s. A 429 carries `retryAfterSec`; the screen renders a
 * countdown and never auto-retries.
 */
export async function signUpMember(
  input: MemberSignupInput,
  options: { gymSlug?: string | undefined } & AuthCallOptions = {},
): Promise<SignInResult> {
  const { gymSlug, ...call } = options;
  return adopt(await deps.authApi.signup(input, call), normaliseSlug(gymSlug));
}

/**
 * Request a password-reset email. Deliberately indistinguishable whether or not
 * the address exists — the screen must not branch on the response. `authStrict`.
 */
export async function requestPasswordReset(
  email: string,
  options?: AuthCallOptions,
): Promise<{ message: string }> {
  return deps.authApi.forgotPassword({ email }, options);
}

/** Persist an issued pair, then start (but do not await) the gym-scope check. */
async function adopt(tokens: TokenPair, requestedSlug: string | undefined): Promise<SignInResult> {
  await saveTokens(tokens);
  const claims = decodeSessionClaims(tokens.accessToken);
  const gymScope = verifyGymScope(requestedSlug, claims).catch(
    (error: unknown): GymScopeCheck => ({
      kind: 'unverified',
      slug: requestedSlug,
      reason: error instanceof Error ? error.message : String(error),
    }),
  );
  return { tokens, claims, gymScope };
}

/**
 * Did the session land on the gym we asked for?
 *
 * The access token carries `gymId`, the request carried a slug, and nothing maps
 * one to the other — so this resolves the slug through the `@Public()`
 * `GET /gyms/by-subdomain/:slug` and compares. On a mismatch it reports and
 * remembers **nothing**; on a match it remembers the slug so the next launch can
 * default to it.
 *
 * Never throws and never blocks. A failed lookup is `unverified`, not an error:
 * the user is signed in either way, and refusing a good session because a
 * diagnostic call timed out would be absurd.
 */
export async function verifyGymScope(
  requestedSlug: string | undefined,
  claims: SessionClaims | null,
): Promise<GymScopeCheck> {
  if (requestedSlug === undefined) {
    // Includes every social sign-in: neither Google nor Apple accepts a slug.
    return { kind: 'unverified', slug: undefined, reason: 'NO_SLUG_REQUESTED' };
  }

  const issuedGymId = claims?.gymId ?? null;
  const requestedGymId = await deps.authApi.gymIdBySlug(requestedSlug);

  if (requestedGymId === null) {
    // `gymSlugSchema` rejects reserved / malformed labels with the same 404 as a
    // miss, so this covers "typo in the deep link" as well as "gym deleted".
    deps.reporter.captureMessage('Sign-in used a gym slug that resolves to no gym', {
      scope: 'session.gymScope',
      slug: requestedSlug,
      issuedGymId,
    });
    return { kind: 'unverified', slug: requestedSlug, reason: 'SLUG_NOT_FOUND' };
  }

  if (requestedGymId === issuedGymId) {
    await rememberGymSlug(requestedSlug);
    return { kind: 'match', slug: requestedSlug, gymId: requestedGymId };
  }

  // The one condition only the client can see. `resolveSessionScope` ignored the
  // slug — no active membership in that gym, or the gym is suspended — and
  // scoped the session to the earliest-joined membership instead. The user is
  // signed in and browsing gym Y while their link said gym X.
  deps.reporter.captureMessage('Sign-in landed on a different gym than requested', {
    scope: 'session.gymScope',
    slug: requestedSlug,
    requestedGymId,
    issuedGymId,
  });
  return { kind: 'mismatch', slug: requestedSlug, requestedGymId, issuedGymId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proactive refresh
// ─────────────────────────────────────────────────────────────────────────────

// Deliberately the SAME gate `api-client` uses. The proactive refresh below and
// the client's 401 refresh can collide on resume-from-background, and two gates
// would each spend the refresh token — which the server reads as reuse and
// answers by revoking the whole family. See `refresh-gate.ts`.
function refreshGate(): RefreshGate {
  configureSharedRefreshGate({
    apiUrl: deps.apiUrl,
    fetchImpl: deps.fetchImpl,
    getSnapshot: getSessionSnapshot,
    saveTokens,
    timeoutMs: deps.timeoutMs,
  });
  return sharedRefreshGate();
}

/** What {@link ensureFreshSession} did. */
export type FreshnessOutcome =
  /** The access token has more than {@link EXPIRY_SKEW_MS} left. No request was made. */
  | { readonly kind: 'fresh' }
  /** Nobody is signed in. */
  | { readonly kind: 'signed-out' }
  /** A rotation happened; the snapshot now holds the new pair. */
  | { readonly kind: 'refreshed' }
  /** The refresh token is dead. The session has been ended. */
  | { readonly kind: 'rejected'; readonly error: ApiError }
  /** The refresh could not be delivered (offline, 5xx). The session survives. */
  | { readonly kind: 'unavailable'; readonly error: ApiError };

/**
 * Refresh the session **before** it expires, rather than paying a 401 for the
 * privilege of finding out.
 *
 * `JWT_ACCESS_TTL` is 900s. Without this, every 15 minutes of use costs one
 * request that is guaranteed to fail, plus a refresh, plus a replay — three round
 * trips where one would do, and the wasted one lands on whichever screen the user
 * happened to open. With `EXPIRY_SKEW_MS` at 60s (WP-3's constant, reused so the
 * two cannot disagree) the token is rotated in the last minute of its life and
 * the 401 path becomes the exception it should be.
 *
 * **Why this does not race the client's own refresh.** There are two
 * `RefreshGate` instances in the app — `api-client`'s, driven by 401s, and this
 * one — and two concurrent `POST /auth/refresh` calls would be classified as
 * token reuse and revoke the entire family. They cannot collide in the intended
 * flow, because the two triggers are disjoint in time: this one fires while the
 * token is *still valid* (60s before `exp`) and completes within the 15s request
 * budget, whereas a 401 requires the token to be *already expired*. Both gates
 * read and write the same snapshot, so the loser of any residual race also gets
 * `alreadySuperseded` and makes no call.
 *
 * The one window that is genuinely open is a resume-from-background where the
 * token expired while the app slept: `focusManager` may refetch (→ 401 → gate A)
 * at the same moment the foreground handler calls this (→ gate B). Call this
 * **before** marking the app focused and that window closes; the app's
 * `AppState` handler is the place to do it.
 *
 * Idempotent and safe to call often — the common answer is `fresh`, with no
 * network at all, which is what makes it cheap enough to call on every
 * foreground and before any fan-out.
 */
export async function ensureFreshSession(now: number = deps.now()): Promise<FreshnessOutcome> {
  const snapshot = getSessionSnapshot();
  if (snapshot === null) {
    return { kind: 'signed-out' };
  }
  const claims = getSessionClaims();
  if (!isExpired(claims, now, EXPIRY_SKEW_MS)) {
    return { kind: 'fresh' };
  }

  const outcome = await refreshGate().refresh(snapshot.accessToken);
  switch (outcome.kind) {
    case 'refreshed':
      return { kind: 'refreshed' };
    case 'signed-out':
      return { kind: 'signed-out' };
    case 'rejected':
      // A definitive 4xx: the refresh token is revoked or its family was killed.
      // Only this ends the session — a 5xx or a dead radio must not, or a deploy
      // window signs the whole user base out.
      await endSession();
      return { kind: 'rejected', error: outcome.error };
    case 'unavailable':
      return { kind: 'unavailable', error: outcome.error };
  }
}

/**
 * How long until {@link ensureFreshSession} would actually refresh, in
 * milliseconds — `null` when there is nothing to schedule (no session, or a
 * token with no `exp`). For an app-level timer; clamped at 0, never negative.
 */
export function msUntilProactiveRefresh(now: number = deps.now()): number | null {
  const claims = getSessionClaims();
  if (claims?.exp === undefined) {
    return null;
  }
  return Math.max(0, claims.exp * 1000 - EXPIRY_SKEW_MS - now);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-out
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Network budget for each of the two sign-out calls.
 *
 * Sign-out is a UI action with an immediate expectation. 5s is enough for a
 * request on a slow connection and short enough that a user on a dead network
 * does not watch a spinner; both calls are best-effort, so the cap is a promise
 * about latency, not correctness.
 */
export const SIGN_OUT_TIMEOUT_MS = 5_000;

/** What each leg of {@link signOut} managed to do. Returned for diagnostics. */
export interface SignOutResult {
  readonly pushUnregistered: boolean;
  readonly revoked: boolean;
}

/**
 * End the session, on the server as well as on the device.
 *
 * Order is not arbitrary:
 *
 *   1. **`DELETE /notifications/push-token/:deviceId`** — it needs a live Bearer
 *      (`RequirePermissions(NotificationManage)` behind `TenantGuard`), so it has
 *      to happen while the session still works. Skipped after the revoke, it
 *      would 401, and the device would keep receiving this member's push
 *      notifications on a phone they have signed out of.
 *   2. **`POST /auth/logout { refreshToken }`** — revokes the refresh token's
 *      whole family. This is the call the deleted app never made, which is why
 *      every sign-out there left a 30-day refresh token live server-side. The
 *      refresh token is read from the snapshot *after* step 1, because step 1
 *      goes through `apiFetch` and a 401 there rotates the pair.
 *   3. **`endSession()`** — keychain, in-memory snapshot, and the query cache.
 *
 * Both network calls are best-effort and swallowed: a user on a plane must still
 * end up signed out locally. They are, however, *attempted* — "best effort" is
 * not a synonym for "skipped". `endSession()` runs in a `finally`, so no failure
 * anywhere above can leave a signed-out user holding a populated cache.
 */
export async function signOut(): Promise<SignOutResult> {
  let pushUnregistered = false;
  let revoked = false;

  try {
    const deviceId = getDeviceIdSnapshot();
    if (deviceId !== null && getSessionSnapshot() !== null) {
      pushUnregistered = await bestEffort(async () => {
        await apiFetch(`/notifications/push-token/${encodeURIComponent(deviceId)}`, {
          method: 'DELETE',
          timeoutMs: SIGN_OUT_TIMEOUT_MS,
        });
      }, 'session.signOut.pushToken');
    }

    // Read *after* the push call: `apiFetch` may have refreshed, and revoking a
    // superseded refresh token would leave the live one alive — the exact leak
    // this function exists to close.
    const refreshToken = getSessionSnapshot()?.refreshToken;
    if (refreshToken !== undefined) {
      revoked = await bestEffort(
        () => deps.authApi.logout({ refreshToken }, { timeoutMs: SIGN_OUT_TIMEOUT_MS }),
        'session.signOut.logout',
      );
    }
  } finally {
    await endSession();
  }

  return { pushUnregistered, revoked };
}

/** Run `task`, reporting and swallowing any failure. Returns whether it succeeded. */
async function bestEffort(task: () => Promise<unknown>, scope: string): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (error) {
    deps.reporter.captureException(error, { scope });
    return false;
  }
}
