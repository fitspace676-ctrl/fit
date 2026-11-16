'use client';

// @fit/admin — client live-refresh (polling) hook.
//
// `useLiveRefresh(ms)` re-runs the current route's server components on a fixed
// interval by calling `router.refresh()`, so a `force-dynamic` server page (the
// activity feed, the reception board) re-fetches its data and the
// screen stays live without a full navigation or losing client state. This is the
// polling fallback for the front-desk surfaces; it is superseded by real push
// (SSE / socket) in T8.9/T8.10.
//
// The timer is paused while the tab is hidden (a back-office screen left open all
// day shouldn't hammer the API in the background) and fires an immediate refresh
// the moment the tab is shown again, so a receptionist returning to the tab sees
// current state at once rather than waiting out the interval.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSessionChecked, isSessionUsable } from './use-session';

/**
 * Poll the current route by calling `router.refresh()` every `intervalMs`.
 *
 * @param intervalMs How often to refresh, in milliseconds. A value `<= 0`
 *   disables polling entirely.
 * @param enabled When `false`, no polling is scheduled (lets a caller gate
 *   refresh on view state — e.g. only the first page of a paginated feed).
 */
export function useLiveRefresh(intervalMs: number, enabled = true): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    let checking = false;

    const tick = async (): Promise<void> => {
      if (disposed || checking || document.hidden) return;
      checking = true;
      try {
        // Renew first: an RSC request with an expired cookie can redirect to login.
        await ensureSessionChecked();
        if (!disposed && !document.hidden && isSessionUsable()) router.refresh();
      } finally {
        checking = false;
      }
    };

    const start = (): void => {
      if (!document.hidden) timer = setInterval(() => void tick(), intervalMs);
    };

    const stop = (): void => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const onVisibilityChange = (): void => {
      stop();
      if (!document.hidden) {
        void tick();
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled, router]);
}

/** Default poll cadences (ms) per front-desk surface, tuned to how live each feels. */
export const LIVE_REFRESH_MS = {
  /** Reception check-in board — the most live, front-desk screen. */
  reception: 15_000,
  /** Unified activity event feed (first page only). */
  activity: 20_000,
} as const;
