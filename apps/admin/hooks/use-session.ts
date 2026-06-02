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
 * Resolve the current session client-side. `isLoading` is `true` until the first
 * fetch resolves. Re-fetches when the tab regains focus so a sign-in / sign-out
 * in another tab is reflected. Any failure resolves to "signed out".
 */
export function useSession(): UseSessionResult {
  const [state, setState] = useState<UseSessionResult>({ user: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;

    const resolve = async (): Promise<void> => {
      try {
        const res = await fetch(SESSION_URL, { credentials: 'same-origin' });
        const data = res.ok ? ((await res.json()) as { user: Session | null }) : { user: null };
        if (!cancelled) setState({ user: data.user, isLoading: false });
      } catch {
        if (!cancelled) setState({ user: null, isLoading: false });
      }
    };

    void resolve();
    const onFocus = (): void => void resolve();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return state;
}
