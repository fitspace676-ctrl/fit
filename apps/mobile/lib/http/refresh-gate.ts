// @fit/mobile — the single-flight gate in front of `POST /auth/refresh`.
//
// ## Why this file exists at all
//
// `apps/api/src/auth/token.service.ts::rotateRefreshToken` is a *rotating,
// reuse-detecting* implementation. Read the two guards:
//
//   - presenting an already-revoked token → `revokeFamily(...)` then 401
//   - losing the `updateMany({ where: { id, revokedAt: null } })` race →
//     `spent.count === 0` → `revokeFamily(...)` then 401
//
// A refresh token is single-use, and a *second concurrent spend* is
// indistinguishable from a stolen token being replayed. The server's response to
// that is to revoke the **entire family** — every live token in the lineage,
// across every device. So the naive client (each 401 refreshes for itself) has
// this failure mode: a home screen fans out to eight endpoints, the access token
// expires, eight requests 401 at once, eight refreshes fire, the first wins and
// the other seven are classified as reuse — and the user is hard-signed-out of a
// session that was perfectly healthy. Intermittently, under load, on the screen
// that fans out the most.
//
// The deleted app's singleton was the right idea. Two things it got wrong, fixed
// here:
//
//   1. **It only de-duplicated *simultaneous* callers.** A request that 401s a
//      few milliseconds after a refresh completed found `refreshInFlight` back at
//      `null` and started a second refresh — spending the token that was just
//      minted while the first retry was still in flight. Fixed by
//      {@link RefreshGate.refresh} taking the token the caller *saw fail* and
//      returning the current snapshot untouched when it has already moved on:
//      a newer token exists, so there is nothing to refresh.
//   2. **Nothing enforced the "bare `fetch`" rule.** This module does not import
//      the API client — it cannot, structurally, because it takes its `fetch` as
//      a dependency. A refresh that went through `apiFetch` would 401 → refresh →
//      401 → refresh forever, and the spec asserts the import is absent.

import { ApiError, apiErrorFromResponse, CLIENT_ERROR_CODES } from './api-error';
import type { TokenPair } from '../auth/token-store';

/** Everything the gate needs from the outside world. */
export interface RefreshGateDeps {
  /** API base URL, no trailing slash. */
  apiUrl: string;
  /**
   * The **bare** `fetch`. Never the API client: `apiFetch` retries a 401 by
   * refreshing, so refreshing through it is unbounded recursion.
   */
  fetchImpl: typeof fetch;
  /** The current in-memory session, read synchronously. */
  getSnapshot: () => TokenPair | null;
  /** Persist a rotated pair (and publish it to the in-memory snapshot). */
  saveTokens: (tokens: TokenPair) => Promise<void>;
  /** Per-attempt timeout, in milliseconds. */
  timeoutMs: number;
}

/** A refresh attempt's outcome. */
export type RefreshOutcome =
  /** A newer session is in hand — either freshly minted, or already there. */
  | { readonly kind: 'refreshed'; readonly tokens: TokenPair }
  /** The refresh token is dead (401 / family revoked) — the session is over. */
  | { readonly kind: 'rejected'; readonly error: ApiError }
  /** There was no refresh token to spend — the caller was signed out already. */
  | { readonly kind: 'signed-out' }
  /** The refresh itself could not be delivered (offline, timeout). Retryable. */
  | { readonly kind: 'unavailable'; readonly error: ApiError };

/** The de-duplicating gate. One per app; `createRefreshGate` builds it. */
export interface RefreshGate {
  /**
   * Obtain a session newer than `staleAccessToken`.
   *
   * Concurrent callers share one `POST /auth/refresh`, and a caller whose stale
   * token has already been superseded gets the current session back with **no**
   * network call at all.
   */
  refresh(staleAccessToken: string | null): Promise<RefreshOutcome>;
  /** True while a refresh is in flight. For assertions and diagnostics. */
  isRefreshing(): boolean;
}

export function createRefreshGate(deps: RefreshGateDeps): RefreshGate {
  let inFlight: Promise<RefreshOutcome> | null = null;

  /**
   * Has someone already replaced the token this caller saw fail?
   *
   * This is the check that turns "one refresh per burst" into "one refresh,
   * full stop". Called both *before* joining the gate (the caller 401'd on a
   * token that a just-finished refresh already replaced) and it is what the
   * shared promise's result is reconciled against.
   */
  function alreadySuperseded(staleAccessToken: string | null): TokenPair | null {
    const current = deps.getSnapshot();
    if (current === null) {
      return null;
    }
    return current.accessToken !== staleAccessToken ? current : null;
  }

  async function performRefresh(): Promise<RefreshOutcome> {
    const current = deps.getSnapshot();
    if (current === null) {
      return { kind: 'signed-out' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, deps.timeoutMs);

    let response: Response;
    try {
      response = await deps.fetchImpl(`${deps.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        // `POST /auth/refresh` takes exactly `{ refreshToken }` — see
        // `refreshSchema` in `packages/types/src/auth.ts`. No cookie is ever
        // attached: the API's session is the Bearer token, and a cookie on this
        // request would only be the guest cart's.
        body: JSON.stringify({ refreshToken: current.refreshToken }),
        credentials: 'omit',
        signal: controller.signal,
      });
    } catch (cause) {
      const timedOut = controller.signal.aborted;
      return {
        kind: 'unavailable',
        error: new ApiError({
          status: 0,
          code: timedOut ? CLIENT_ERROR_CODES.timeout : CLIENT_ERROR_CODES.network,
          message: timedOut ? 'The refresh request timed out' : 'The refresh request failed',
          cause,
        }),
      };
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const error = apiErrorFromResponse(response.status, body);
      // A 5xx is the API being unwell, not the session being dead. Signing the
      // user out because a deploy was mid-rollout would be gratuitous.
      return response.status >= 500 ? { kind: 'unavailable', error } : { kind: 'rejected', error };
    }

    const pair: unknown = await response.json().catch(() => null);
    if (!isTokenPair(pair)) {
      return {
        kind: 'unavailable',
        error: new ApiError({
          status: response.status,
          code: CLIENT_ERROR_CODES.malformed,
          message: 'The refresh response was not a token pair',
        }),
      };
    }

    await deps.saveTokens(pair);
    return { kind: 'refreshed', tokens: pair };
  }

  return {
    isRefreshing: () => inFlight !== null,

    async refresh(staleAccessToken) {
      // Fix (1): the token this caller failed on is already history. Whoever
      // refreshed it did so with the one live refresh token; spending another
      // would be the reuse the server kills the family for.
      const superseded = alreadySuperseded(staleAccessToken);
      if (superseded !== null) {
        return { kind: 'refreshed', tokens: superseded };
      }

      if (inFlight !== null) {
        const shared = await inFlight;
        // Reconcile against the snapshot rather than trusting the shared result
        // blindly: if the winner refreshed while we waited, take its tokens even
        // when its own outcome was reported before ours joined.
        const afterShared = alreadySuperseded(staleAccessToken);
        return afterShared !== null ? { kind: 'refreshed', tokens: afterShared } : shared;
      }

      const attempt = performRefresh();
      inFlight = attempt;
      try {
        return await attempt;
      } finally {
        inFlight = null;
      }
    },
  };
}

/** A response body is a usable session only if both halves are non-empty strings. */
function isTokenPair(value: unknown): value is TokenPair {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.accessToken === 'string' &&
    record.accessToken.length > 0 &&
    typeof record.refreshToken === 'string' &&
    record.refreshToken.length > 0
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The shared gate
// ─────────────────────────────────────────────────────────────────────────────
//
// There must be exactly ONE gate per process, and it lives here rather than in
// either caller, because two callers refresh for disjoint reasons:
//
//   `api-client`  reacts to a 401 — the token is already expired.
//   `session`     fires proactively ~60s BEFORE `exp`, while it is still valid.
//
// Those triggers almost never overlap, but "almost" is doing real work: on
// resume-from-background the token can expire while the app sleeps, so a
// proactive refresh and a focus-triggered refetch's 401 can start in the same
// tick. Two gates would then each spend the refresh token, and the server
// treats a second spend as reuse and revokes the WHOLE FAMILY — the user is
// signed out with no explanation and no way to reproduce it. Sharing the gate
// makes that unrepresentable instead of merely unlikely.
//
// Configuration is deferred so this module still imports nothing but
// `./api-error` and `../auth/token-store` (its spec pins that list, because an
// import of `api-client` here would let a failed refresh recurse into itself).

let shared: RefreshGate | null = null;
let sharedDeps: RefreshGateDeps | null = null;

/**
 * Install the dependencies the shared gate is built from. Idempotent: the first
 * caller wins, so whichever of `api-client` / `session` runs first configures
 * it and the other reuses the same instance.
 */
export function configureSharedRefreshGate(deps: RefreshGateDeps): void {
  sharedDeps ??= deps;
}

/** The one gate. Throws if nothing configured it — that is a wiring bug, not a runtime condition. */
export function sharedRefreshGate(): RefreshGate {
  if (!sharedDeps) {
    throw new Error(
      'sharedRefreshGate() before configureSharedRefreshGate() — wire the client first.',
    );
  }
  shared ??= createRefreshGate(sharedDeps);
  return shared;
}

/** Discard the shared gate and its configuration. Specs only. */
export function resetSharedRefreshGate(): void {
  shared = null;
  sharedDeps = null;
}
