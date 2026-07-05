// @fit/mobile — live class occupancy over Server-Sent Events (T8.10).
//
// Subscribes to the public occupancy stream (`GET /class-instances/occupancy/
// stream?gymId=`) and patches the `['class-instance', gymId, instanceId]` query
// cache in place whenever *another* member's book / cancel / promote changes the
// occurrence the detail screen is showing — so the occupancy meter moves without
// the viewer doing anything. Complements `useBookingActions`, which only refreshes
// after the caller's *own* mutation.
//
// The stream is `@Public()` and scoped by `gymId` (the same public data the class
// card already shows), so no auth token is needed — React Native has no built-in
// `EventSource`, so the transport is `react-native-sse` (a pure-JS, XHR-backed
// polyfill). The patch only ever *updates* an already-cached detail (never
// fabricates one) and ignores frames for other occurrences, so an open connection
// costs nothing until a relevant snapshot arrives.

import { useEffect } from 'react';
import EventSource from 'react-native-sse';
import { useQueryClient } from '@tanstack/react-query';
import { CLASS_OCCUPANCY_EVENT, classOccupancySchema, type ClassInstanceDetail } from '@fit/types';
import { API_URL } from '../lib/api-client';

/**
 * Keep occurrence `instanceId`'s cached detail live while the class-detail screen
 * is mounted. Pass either id as `null`/`undefined` while unknown (no gym scope
 * yet, or the route param hasn't resolved) — the subscription stays closed until
 * both are known. Tears the connection down on unmount / id change.
 */
export function useClassOccupancy(gymId: string | null, instanceId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!gymId || !instanceId) {
      return;
    }

    const url = `${API_URL}/class-instances/occupancy/stream?gymId=${encodeURIComponent(gymId)}`;
    const source = new EventSource<typeof CLASS_OCCUPANCY_EVENT>(url);

    const onOccupancy = (event: { type: string; data?: string | null }) => {
      if (!event.data) {
        return;
      }
      const parsed = classOccupancySchema.safeParse(safeJsonParse(event.data));
      // Ignore a malformed frame or a snapshot for another occurrence on the stream.
      if (!parsed.success || parsed.data.classInstanceId !== instanceId) {
        return;
      }
      const snapshot = parsed.data;
      queryClient.setQueryData<ClassInstanceDetail>(
        ['class-instance', gymId, instanceId],
        // Only patch an already-loaded detail — never fabricate one from a snapshot
        // (which carries no title/description/etc. the screen also renders).
        (previous) =>
          previous
            ? {
                ...previous,
                capacity: snapshot.capacity,
                bookedCount: snapshot.bookedCount,
                status: snapshot.status,
              }
            : previous,
      );
    };

    source.addEventListener(CLASS_OCCUPANCY_EVENT, onOccupancy);

    return () => {
      source.removeAllEventListeners();
      source.close();
    };
  }, [gymId, instanceId, queryClient]);
}

/** Parse JSON, returning `null` rather than throwing on a malformed frame. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
