'use client';

// @fit/admin — client session hook.
//
// `useSession()` resolves the current session by fetching the same-origin
// `GET /api/session` route, which reads the **httpOnly** access cookie on the
// server and returns the *verified* {@link Session} (the client can't read the
// cookie itself, and has no secret to verify a token with). Drives role-aware
// navigation; every privileged action is still re-checked server-side.

import { useEffect, useSyncExternalStore } from 'react';
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
       * Set when the route found no valid access token but a refresh token beside
       * it — the session is one middleware-handled navigation away from valid, so
       * `user: null` here does *not* mean signed out.
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
 * fetch resolves. Re-fetches when the tab regains focus so a sign-in / sign-out
 * in another tab is reflected.
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

/**
 * Set when the last answer was a recoverable `null`, meaning the access token has
 * expired and only a navigation can renew it. Read (and cleared) by the hook,
 * which has the router the plain fetch does not.
 */
let needsRenewal = false;

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
      needsRenewal = data.user === null && data.recoverable === true;
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
 * fetch resolves. Re-fetches when the tab regains focus so a sign-in / sign-out
 * in another tab is reflected.
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
export function useSession(): UseSessionResult {
  const state = useSyncExternalStore(
    subscribe,
    () => sessionState,
    () => INITIAL_SERVER_STATE,
  );

  useEffect(() => {
    const run = async (): Promise<void> => {
      await resolveSession();
      if (!needsRenewal) {
        return;
      }
      // Cleared before navigating so several mounted consumers cause one reload,
      // not one each — the refresh token may only be spent once.
      needsRenewal = false;
      // A full document load, deliberately, not `router.refresh()`. An RSC refresh
      // reaches the middleware stripped of every header that marks it a
      // navigation, so it is answered with a redirect to the sign-in page instead
      // of a renewed session — which is exactly how the sidebar used to vanish.
      window.location.reload();
    };

    void run();
    const onFocus = (): void => void run();
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
  // Also false while a check is open. On tab return the poll and the session
  // check fire in the same tick, and without this the poll would send its RSC
  // refresh before the answer arrives — landing a redirect to the sign-in page in
  // exactly the window the check exists to detect.
  return !needsRenewal && inFlight === null;
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
