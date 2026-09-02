'use client';

// @fit/admin — client session hook.
//
// `useSession()` resolves the current session by fetching the same-origin
// `GET /api/session` route, which reads the **httpOnly** access cookie on the
// server and returns the *verified* {@link Session} (the client can't read the
// cookie itself, and has no secret to verify a token with). Drives role-aware
// navigation; every privileged action is still re-checked server-side.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Session } from '@/lib/auth-session';

/**
 * Same-origin URL of the session route, prefixed with the app's basePath when set
 * (`/admin` behind the tenant-subdomain proxy). Next applies basePath to
 * navigation and assets but not to `fetch`, so we prefix it ourselves; empty in
 * the default standalone deployment.
 */
const SESSION_URL = `${process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? ''}/api/session`;

export interface UseSessionResult {
  user: Session | null;
  isLoading: boolean;
}

/**
 * Outcome of one `GET /api/session` attempt: `ok` carries the server's authoritative
 * answer (`user: null` is a genuine sign-out); the failure variant is any transient
 * error — a network blip on tab refocus, or a 5xx from the session route.
 */
export type SessionFetchOutcome =
  | {
      ok: true;
      user: Session | null;
      /**
       * Set when the route could not renew an expired access token this time but
       * a refresh token is still there - the next attempt (or the middleware, on
       * a navigation) can, so `user: null` here does *not* mean signed out.
       */
      recoverable?: boolean;
    }
  | { ok: false };

/**
 * Pure reducer for {@link useSession}: the next state given the previous one and a
 * fetch outcome. Extracted so the core rule is unit-testable without a DOM.
 *
 * The rule that fixes the vanishing sidebar: a **transient failure must never
 * downgrade a known-good session to signed-out**. Only a successful response is
 * authoritative. On failure we keep the last-known user (nav stays); if none was
 * resolved yet we stay in `loading` so the caller can retry instead of rendering an
 * empty nav.
 */
export function nextSessionState(
  prev: UseSessionResult,
  outcome: SessionFetchOutcome,
): UseSessionResult {
  if (outcome.ok) {
    // A recoverable `null` is an expired access token, not a sign-out: the refresh
    // token is still there and a navigation will renew it. Blanking the nav for it
    // is what made the whole sidebar vanish when an operator came back to the tab.
    if (outcome.user === null && outcome.recoverable && prev.user) {
      return { user: prev.user, isLoading: false };
    }
    return { user: outcome.user, isLoading: false };
  }
  return prev.user ? { user: prev.user, isLoading: false } : { user: null, isLoading: true };
}

/**
 * Resolve the current session client-side. `isLoading` is `true` until the first
 * fetch resolves, unless the caller seeds it with the server-rendered session
 * (`initial`). Re-fetches when the tab regains focus so a sign-in / sign-out in
 * another tab is reflected.
 *
 * A transient failure (a network blip on tab refocus, or a 5xx from the session
 * route) must **never** downgrade a known-good session to "signed out" — doing so
 * emptied `visibleNavItems(null)` and made the whole sidebar vanish mid-session.
 * The route always answers `200 { user }` (with `user: null` for a genuine
 * sign-out), so only a successful response is authoritative: on any error we keep
 * the last-known user and, if we never resolved one yet (initial load failed),
 * stay in `loading` and retry rather than flashing an empty nav.
 */
/**
 * The one session every consumer reads. Module-level on purpose.
 *
 * `useSession` is called from several places at once (the sidebar and the top bar
 * at least), and local state per component meant each one fetched separately —
 * two requests on load, two more on every tab refocus. That was merely wasteful
 * until the session route began refreshing expired tokens: the API rotates the
 * refresh token on each use and revokes the family when one is reused, so two
 * simultaneous refreshes would log the operator out for real. Sharing one
 * in-flight request is what keeps that from happening.
 */
let sessionState: UseSessionResult = { user: null, isLoading: true };

/** Components to notify when {@link sessionState} changes. */
const listeners = new Set<() => void>();

/** The request currently in flight, so concurrent callers join it rather than race. */
let inFlight: Promise<void> | null = null;

/** Pending retry after a transient failure, cancelled when a fetch succeeds. */
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function publish(next: UseSessionResult): void {
  sessionState = next;
  for (const listener of listeners) listener();
}

/**
 * Resolve the session once, sharing the request with any caller that arrives
 * while it is still open.
 */
function resolveSession(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const res = await fetch(SESSION_URL, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`session request failed (${res.status})`);
      const data = (await res.json()) as { user: Session | null; recoverable?: boolean };
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      publish(
        nextSessionState(sessionState, {
          ok: true,
          user: data.user,
          recoverable: data.recoverable,
        }),
      );
      // Flag the renewal exactly once per episode. Only the hook can act on it:
      // renewing needs a *document* request, the one shape the middleware still
      // refreshes on, and rotation has to stay single-owner or the API's reuse
      // detector turns a renewal into a real sign-out.
    } catch {
      // Transient — preserve the last-known session so the nav never collapses, and
      // retry only while we have nothing to show yet (initial load failed).
      const next = nextSessionState(sessionState, { ok: false });
      publish(next);
      if (next.isLoading && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void resolveSession();
        }, 2000);
      }
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Resolve the current session client-side. `isLoading` is `true` until the first
 * fetch resolves, unless the caller seeds it with the server-rendered session
 * (`initial`). Re-fetches when the tab regains focus so a sign-in / sign-out in
 * another tab is reflected.
 *
 * A transient failure (a network blip on tab refocus, or a 5xx from the session
 * route) must **never** downgrade a known-good session to "signed out" — doing so
 * emptied `visibleNavItems(null)` and made the whole sidebar vanish mid-session.
 * The route always answers `200 { user }` (with `user: null` for a genuine
 * sign-out), so only a successful response is authoritative: on any error we keep
 * the last-known user and, if we never resolved one yet (initial load failed),
 * stay in `loading` and retry rather than flashing an empty nav.
 *
 * The state is shared across every caller rather than held per component — see
 * {@link sessionState} for why that matters now that the route rotates tokens.
 */
/**
 * Seed the shared session from a server-rendered one, once, before the first
 * fetch has answered. The console layout already verified the session to render
 * the page at all; handing it to the sidebar means the nav is painted with it on
 * the very first frame instead of as a skeleton that fills in after a round
 * trip - the flash that read as "the sidebar keeps refreshing" on every load.
 * A fetch that has already answered is never overwritten: the server value is
 * older than anything the browser has learned since.
 */
export function seedSessionState(user: Session | null): void {
  if (sessionState.isLoading && sessionState.user === null) {
    sessionState = { user, isLoading: false };
  }
}

export function useSession(initial?: Session | null): UseSessionResult {
  // Synchronously, so the first client render agrees with the server snapshot
  // below and hydration has nothing to reconcile.
  if (initial !== undefined) seedSessionState(initial);
  const serverSnapshot = useMemo<UseSessionResult>(
    () => (initial === undefined ? INITIAL_SERVER_STATE : { user: initial, isLoading: false }),
    [initial],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => sessionState,
    () => serverSnapshot,
  );

  // The route renews an expired token itself now (see `lib/session-renewal.ts`),
  // so a refocus is one fetch and never a page reload. It used to be
  // `window.location.reload()` here, once per return to the tab after the
  // 15-minute access token had lapsed - the "sidebar keeps refreshing" report.
  useEffect(() => {
    void resolveSession();
    const onFocus = (): void => void resolveSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return state;
}

/**
 * Re-check the session and resolve once the answer is in, joining a check that is
 * already open. Lets a caller sequence work behind the answer instead of racing
 * it — see `useLiveRefresh`.
 */
export function ensureSessionChecked(): Promise<void> {
  return resolveSession();
}

/**
 * Whether the session is currently usable for background work.
 *
 * `useLiveRefresh` reads this to hold its polling while the access token is
 * expired: an RSC refresh sent in that window is answered with a redirect to the
 * sign-in page, and following it drops the operator out of the console before the
 * renewal lands.
 */
export function isSessionUsable(): boolean {
  // False while a check is open. On tab return the poll and the session check
  // fire in the same tick, and without this the poll would send its RSC refresh
  // before the answer arrives - landing a redirect to the sign-in page in exactly
  // the window the check exists to detect. Once the check has answered, the
  // route has renewed whatever needed renewing, so there is no longer an
  // "expired, waiting for a navigation" state to hold for.
  return inFlight === null;
}

/** Subscribe a component to session changes; returns its unsubscribe. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * What the server renders. Constant so `useSyncExternalStore` sees a stable
 * snapshot during hydration — the client's first real state arrives from the
 * fetch the effect above kicks off.
 */
const INITIAL_SERVER_STATE: UseSessionResult = { user: null, isLoading: true };
