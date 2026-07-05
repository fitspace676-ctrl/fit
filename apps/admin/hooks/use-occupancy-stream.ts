'use client';

// @fit/admin — live class-occupancy stream (T8.10).
//
// The push replacement for the schedule's polling. `useOccupancyStream()` opens a
// same-origin `EventSource` against the `/schedule/stream` proxy (which forwards
// the staff token to the API's `GET /admin/schedule/stream`) and, on each
// `class.occupancy` snapshot, calls `router.refresh()` so the `force-dynamic`
// schedule page re-fetches and the capacity bars move without a navigation — the
// same refresh seam `useLiveRefresh` uses, but driven by real events instead of a
// timer.
//
// Refreshes are throttled: the server already debounces per occurrence, but a busy
// gym can still change several distinct classes in a burst, and one route refresh
// picks them all up. The stream is dropped while the tab is hidden (a back-office
// screen left open all day shouldn't hold a connection or refresh in the
// background) and re-opened — with an immediate catch-up refresh — when shown.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CLASS_OCCUPANCY_EVENT } from '@fit/types';

/** Coalesce a burst of occupancy snapshots into at most one route refresh per window. */
const REFRESH_THROTTLE_MS = 1_000;

/**
 * Subscribe the current schedule route to live occupancy pushes, refreshing it as
 * bookings land. Enabled by default; pass `false` to gate it (e.g. a view where
 * live updates aren't wanted).
 */
export function useOccupancyStream(enabled = true): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    let source: EventSource | undefined;
    let throttle: ReturnType<typeof setTimeout> | undefined;

    // Coalesce bursts: schedule one refresh per window rather than one per event.
    const scheduleRefresh = (): void => {
      if (throttle !== undefined || (typeof document !== 'undefined' && document.hidden)) {
        return;
      }
      throttle = setTimeout(() => {
        throttle = undefined;
        router.refresh();
      }, REFRESH_THROTTLE_MS);
    };

    const open = (): void => {
      if (source) {
        return;
      }
      source = new EventSource('/schedule/stream');
      source.addEventListener(CLASS_OCCUPANCY_EVENT, scheduleRefresh);
    };

    const close = (): void => {
      if (throttle !== undefined) {
        clearTimeout(throttle);
        throttle = undefined;
      }
      if (source) {
        source.removeEventListener(CLASS_OCCUPANCY_EVENT, scheduleRefresh);
        source.close();
        source = undefined;
      }
    };

    const onVisibilityChange = (): void => {
      if (document.hidden) {
        close();
      } else {
        // Catch up to whatever landed while hidden, then re-open the stream.
        router.refresh();
        open();
      }
    };

    open();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      close();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, router]);
}
