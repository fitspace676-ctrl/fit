'use client';

// @fit/web — live class occupancy over Server-Sent Events (T8.10).
//
// Subscribes to the public occupancy stream (`GET /class-instances/occupancy/
// stream?gymId=`) and returns the latest snapshot for one occurrence, so the
// member class-detail page can reflect other members' book / cancel / promote as
// they happen. The stream is `@Public()` and scoped by `gymId` (the same public
// data the class card already shows), so the browser's native `EventSource`
// connects with no auth header. One connection is opened while mounted and closed
// on unmount / id change; frames for other occurrences on the gym stream are
// ignored.

import { useEffect, useState } from 'react';
import { CLASS_OCCUPANCY_EVENT, classOccupancySchema, type ClassOccupancy } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * The latest live occupancy snapshot for occurrence `instanceId` in gym `gymId`,
 * or `null` until one arrives. Pass `gymId` as `null` when no tenant is in scope
 * (apex / preview URL) — the subscription stays closed and the value stays `null`.
 */
export function useClassOccupancy(gymId: string | null, instanceId: string): ClassOccupancy | null {
  const [snapshot, setSnapshot] = useState<ClassOccupancy | null>(null);

  useEffect(() => {
    // No tenant / SSR pass — nothing to subscribe to.
    if (!gymId || !instanceId || typeof window === 'undefined') {
      return;
    }

    const url = `${API_URL}/class-instances/occupancy/stream?gymId=${encodeURIComponent(gymId)}`;
    const source = new EventSource(url);

    const onOccupancy = (event: MessageEvent<string>) => {
      const parsed = classOccupancySchema.safeParse(safeJsonParse(event.data));
      if (parsed.success && parsed.data.classInstanceId === instanceId) {
        setSnapshot(parsed.data);
      }
    };

    source.addEventListener(CLASS_OCCUPANCY_EVENT, onOccupancy as EventListener);

    return () => {
      source.removeEventListener(CLASS_OCCUPANCY_EVENT, onOccupancy as EventListener);
      source.close();
    };
  }, [gymId, instanceId]);

  return snapshot;
}

/** Parse JSON, returning `null` rather than throwing on a malformed frame. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
