'use client';

// @fit/admin — client session hook.
//
// `useSession()` resolves the current session by fetching the same-origin
// `GET /api/session` route, which reads the **httpOnly** access cookie on the
// server and returns the *verified* {@link Session} (the client can't read the
// cookie itself, and has no secret to verify a token with). Drives role-aware
// navigation; every privileged action is still re-checked server-side.

import { useEffect, useState } from 'react';
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
export type SessionFetchOutcome = { ok: true; user: Session | null } | { ok: false };

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
export function useSession(): UseSessionResult {
  const [state, setState] = useState<UseSessionResult>({ user: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const resolve = async (): Promise<void> => {
      try {
        const res = await fetch(SESSION_URL, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`session request failed (${res.status})`);
        const data = (await res.json()) as { user: Session | null };
        if (!cancelled) setState((prev) => nextSessionState(prev, { ok: true, user: data.user }));
      } catch {
        // Transient — preserve the last-known session so the nav never collapses, and
        // retry only while we have nothing to show yet (initial load failed).
        if (cancelled) return;
        let shouldRetry = false;
        setState((prev) => {
          const next = nextSessionState(prev, { ok: false });
          shouldRetry = next.isLoading;
          return next;
        });
        if (shouldRetry) {
          if (retry) clearTimeout(retry);
          retry = setTimeout(() => void resolve(), 2000);
        }
      }
    };

    void resolve();
    const onFocus = (): void => void resolve();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return state;
}
