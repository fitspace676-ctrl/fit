'use client';

// @fit/admin — client session hook.
//
// `useSession()` reads the `accessToken` cookie in the browser and decodes it
// (without verifying — the client has no secret) into a {@link Session} for
// rendering role-aware navigation. Authoritative checks always happen
// server-side in middleware / `getServerSession()`, where the signature is
// verified; this hook only drives what the UI shows.

import { useEffect, useState } from 'react';
import { ACCESS_TOKEN_COOKIE, readUnverifiedSession, type Session } from '@/lib/auth-session';

export interface UseSessionResult {
  user: Session | null;
  isLoading: boolean;
}

/** Read a cookie value by name from `document.cookie`, or `null`. */
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  const value = match?.[1];
  return value === undefined ? null : decodeURIComponent(value);
}

/**
 * Resolve the current session client-side. `isLoading` is `true` until the
 * first effect runs (the cookie can only be read after mount, which also avoids
 * an SSR/CSR hydration mismatch). Re-reads when the tab regains focus so a
 * sign-in / sign-out in another tab is reflected.
 */
export function useSession(): UseSessionResult {
  const [state, setState] = useState<UseSessionResult>({ user: null, isLoading: true });

  useEffect(() => {
    const resolve = (): void => {
      const token = readCookie(ACCESS_TOKEN_COOKIE);
      setState({ user: token ? readUnverifiedSession(token) : null, isLoading: false });
    };
    resolve();
    window.addEventListener('focus', resolve);
    return () => window.removeEventListener('focus', resolve);
  }, []);

  return state;
}
