// @fit/types — live class-occupancy contracts (Zod schema + inferred type).
//
// The wire shape for the real-time occupancy push (Phase 8, T8.10): the snapshot
// the API broadcasts to the staff schedule and the member class-detail views the
// moment a book / cancel / waitlist-promote changes an occurrence's seat counts,
// so a capacity bar updates without polling. It rides the same Redis-multiplexed
// Server-Sent-Events seam T8.9 built for the activity feed, on its own channel.
//
// Unlike the activity feed (a newest-first log of what happened), an occupancy
// snapshot is the CURRENT state of one occurrence — the latest wins, so a burst
// of writes on the same class collapses to one delivered snapshot (the producer
// debounces per occurrence). The figures mirror the ones the class card and the
// detail page already render (`capacity` / `bookedCount`), so a live update and a
// freshly-fetched page agree on the wire.

import { z } from 'zod';
import { classInstanceStatusSchema } from './classes';

/**
 * The Server-Sent-Events event name every occupancy frame carries, so a client
 * subscribes to just this one name and ignores the `ping` heartbeat the stream
 * also emits. Shared by the API (the frame's `type`) and every consumer's
 * `addEventListener`, so producer and clients can never drift on the name.
 */
export const CLASS_OCCUPANCY_EVENT = 'class.occupancy';

/**
 * A live snapshot of one class occurrence's seat counts, broadcast on every
 * book / cancel / promote (T8.10). Carries the same denormalised figures the
 * schedule card and the member detail page render, so a live patch drops straight
 * into the existing capacity bar:
 *
 * - `capacity` resolves any per-occurrence override (`capacityOverride ??
 *   template.capacity`), matching the schedule + detail projections.
 * - `bookedCount` is the denormalised held-seat counter — a manual desk promote
 *   may take it *above* `capacity` (a deliberate over-book), so consumers clamp
 *   for display.
 * - `available` is the pre-clamped `max(0, capacity - bookedCount)` — the "spots
 *   left" figure, never negative even when over-booked.
 * - `waitlistCount` is the current length of the queue.
 * - `status` is the occurrence's lifecycle (a cancel flips it to `CANCELED`), so
 *   a subscribed detail page can degrade a since-canceled class gracefully.
 * - `at` is the ISO-8601 instant the snapshot was taken (for a client that wants
 *   to drop a stale out-of-order frame).
 */
export const classOccupancySchema = z.object({
  classInstanceId: z.string().min(1),
  capacity: z.number().int().nonnegative(),
  bookedCount: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  waitlistCount: z.number().int().nonnegative(),
  status: classInstanceStatusSchema,
  at: z.string().datetime(),
});

/** One live occupancy snapshot for a class occurrence — {@link classOccupancySchema}. */
export type ClassOccupancy = z.infer<typeof classOccupancySchema>;
