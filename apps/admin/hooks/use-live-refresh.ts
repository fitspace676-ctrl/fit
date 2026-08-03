'use client';

// @fit/admin — client live-refresh (polling) hook.
//
// `useLiveRefresh(ms)` re-runs the current route's server components on a fixed
// interval by calling `router.refresh()`, so a `force-dynamic` server page (the
// dashboard, the activity feed, the reception board) re-fetches its data and the
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

    const tick = (): void => {
      // Guard the interval callback too: a tab can be hidden between the last
      // visibility event and a scheduled fire.
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      // Hold while the access token is expired. An RSC refresh in that window is
      // answered with a redirect to the sign-in page — following it would throw
      // the operator out of the console mid-shift, which is precisely what a
      // background poll must never do. `useSession` is already reloading.
      if (!isSessionUsable()) {
        return;
      }
      router.refresh();
    };

    const start = (): void => {
      timer = setInterval(tick, intervalMs);
    };

    const stop = (): void => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const onVisibilityChange = (): void => {
      if (document.hidden) {
        stop();
      } else {
        // Catch up immediately, then resume the cadence from now. The catch-up
        // waits on the session check rather than racing it: on tab return both
        // fire in the same tick, and a refresh sent before the answer is in gets
        // a redirect to the sign-in page when the access token has expired.
        void ensureSessionChecked().then(tick);
        stop();
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled, router]);
}

/** Default poll cadences (ms) per front-desk surface, tuned to how live each feels. */
export const LIVE_REFRESH_MS = {
  /** Dashboard KPIs + occupancy + today's schedule. */
  dashboard: 30_000,
  /** Reception check-in board — the most live, front-desk screen. */
  reception: 15_000,
  /** Unified activity event feed (first page only). */
  activity: 20_000,
} as const;
