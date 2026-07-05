'use client';

import { useEffect } from 'react';
import { useRouter } from '@/src/i18n/navigation';
import type { ClassInstanceStatus } from '@fit/types';
import { useClassOccupancy } from '@/src/hooks/useClassOccupancy';

export interface ClassOccupancyLiveProps {
  /** The gym in scope, or `null` on the apex / preview URL (no live stream then). */
  gymId: string | null;
  /** The occurrence whose occupancy this island keeps live. */
  instanceId: string;
  /** The server-rendered figures — the baseline a live snapshot is compared against. */
  bookedCount: number;
  capacity: number;
  status: ClassInstanceStatus;
}

/**
 * A headless client island (T8.10) that keeps the class-detail page's live
 * capacity in sync with other members' book / cancel / promote. It subscribes to
 * the public occupancy stream via {@link useClassOccupancy} and, when a snapshot
 * for this occurrence differs from what the server rendered, calls
 * `router.refresh()` — re-running the Server Component so the occupancy bar, the
 * "spots left" copy, and the booking CTA all re-derive from fresh figures in one
 * pass. This mirrors how the booking CTA already refreshes after the caller's own
 * action; here the trigger is someone else's.
 *
 * Renders nothing. The refresh only fires on a genuine change (guarded against the
 * server-rendered baseline), so a re-render that lands the same figures does not
 * loop, and a quiet stream costs a single idle connection.
 */
export function ClassOccupancyLive({
  gymId,
  instanceId,
  bookedCount,
  capacity,
  status,
}: ClassOccupancyLiveProps) {
  const router = useRouter();
  const snapshot = useClassOccupancy(gymId, instanceId);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const changed =
      snapshot.bookedCount !== bookedCount ||
      snapshot.capacity !== capacity ||
      snapshot.status !== status;
    if (changed) {
      router.refresh();
    }
  }, [snapshot, bookedCount, capacity, status, router]);

  return null;
}
