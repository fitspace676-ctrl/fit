import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { ClassOccupancy } from '@fit/types';
import { RedisService } from '../redis/redis.service';

/**
 * The single Redis pub/sub channel every gym's live occupancy snapshots are
 * multiplexed over — the occupancy counterpart of the activity feed's
 * `activity:events`. The recipient gym rides inside the payload (see
 * {@link LiveOccupancyMessage}) rather than in a per-gym channel name, so the
 * subscriber holds one durable subscription and never churns `SUBSCRIBE` /
 * `UNSUBSCRIBE` as SSE clients come and go; each subscriber's {@link
 * OccupancyStreamService.stream} filters to its own gym.
 */
const OCCUPANCY_CHANNEL = 'occupancy:events';

/**
 * How long the producer coalesces a burst of book / cancel / promote writes on
 * the *same* occurrence before broadcasting. A cancel storm or a waitlist cascade
 * fires many seat mutations back-to-back; a short trailing debounce collapses them
 * to a single broadcast carrying the latest counts, so subscribers never thrash
 * the capacity bar. Well under a second, so a single action still lands live.
 */
const OCCUPANCY_DEBOUNCE_MS = 200;

/** The Redis-serialised envelope: which gym a snapshot belongs to + the snapshot. */
interface LiveOccupancyMessage {
  gymId: string;
  occupancy: ClassOccupancy;
}

/**
 * The live occupancy push seam (Phase 8, T8.10) — the counterpart to
 * {@link ActivityStreamService}. Producers (the member booking flow and the
 * front-desk schedule actions) call {@link publish} with a gym id + a
 * {@link ClassOccupancy} snapshot the moment a book / cancel / promote changes an
 * occurrence's seat counts; the schedule board and member class-detail views
 * subscribe over SSE and repaint the capacity bar without polling.
 *
 * The transport mirrors the activity stream exactly — one Redis channel so a
 * snapshot reaches SSE subscribers on **every** API replica, a dedicated
 * subscriber connection (a subscribed ioredis socket can't run ordinary commands)
 * feeding a local RxJS {@link Subject}, and a per-gym filtered {@link stream}.
 *
 * Two things it adds over the activity stream:
 *
 * - **Trailing debounce per occurrence.** {@link publish} is fire-and-forget and
 *   coalesces a burst of writes on one `classInstanceId` into a single broadcast
 *   of the latest snapshot ({@link OCCUPANCY_DEBOUNCE_MS}). Distinct occurrences
 *   never block each other — each has its own timer — and the last snapshot always
 *   wins, so the delivered figure is the settled one, not a mid-storm flicker.
 * - **Best-effort throughout.** The debounced Redis publish swallows a broker
 *   outage (logged, never thrown) so a live-push hiccup can never fail the write
 *   that produced it — the booking still commits, and the client's next fetch of
 *   the occurrence catches the counts up.
 */
@Injectable()
export class OccupancyStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OccupancyStreamService.name);
  /** Local fan-out every SSE subscriber on THIS instance reads from. */
  private readonly events$ = new Subject<LiveOccupancyMessage>();
  /** Dedicated subscriber socket — a subscribed conn can't issue normal commands. */
  private subscriber: Redis | null = null;
  /** Trailing-debounce timers keyed by classInstanceId (one burst per occurrence). */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Latest pending snapshot per classInstanceId, coalesced during a burst. */
  private readonly pending = new Map<string, LiveOccupancyMessage>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Stand up the subscriber connection and relay the shared channel into the local
   * {@link events$} fan-out. Cloned from the shared client so it inherits the same
   * URL/retry policy; a subscribe failure (Redis temporarily absent) is logged, not
   * thrown, so the API still boots — publishing is best-effort and a client's next
   * fetch covers the gap.
   */
  async onModuleInit(): Promise<void> {
    const subscriber = this.redis.client.duplicate();
    subscriber.on('error', (err: Error) =>
      this.logger.warn(`occupancy stream subscriber error: ${err.message}`),
    );
    subscriber.on('message', (_channel: string, payload: string) => this.onMessage(payload));
    this.subscriber = subscriber;
    try {
      await subscriber.subscribe(OCCUPANCY_CHANNEL);
    } catch (err) {
      this.logger.warn(`occupancy stream subscribe failed: ${(err as Error).message}`);
    }
  }

  /**
   * Broadcast an occupancy snapshot for one occurrence to every connected SSE
   * subscriber, cluster-wide — trailing-debounced per `classInstanceId`. Returns
   * immediately: the caller fires it after a booking mutation commits and never
   * awaits it, so a slow or failed broadcast can't disturb the write whose result
   * the caller already holds. A later snapshot for the same occurrence within the
   * debounce window replaces the pending one, so only the settled counts go out.
   */
  publish(gymId: string, occupancy: ClassOccupancy): void {
    const key = occupancy.classInstanceId;
    this.pending.set(key, { gymId, occupancy });

    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      const message = this.pending.get(key);
      this.pending.delete(key);
      if (message) {
        void this.flush(message);
      }
    }, OCCUPANCY_DEBOUNCE_MS);
    // Don't let a pending debounce keep the event loop (and tests / graceful
    // shutdown) alive; the snapshot is disposable.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.timers.set(key, timer);
  }

  /**
   * The live occupancy stream for one gym — the snapshots that gym produces,
   * delivered as they settle. Each SSE request gets its own filtered subscription;
   * a subscriber only ever sees its own gym's occurrences (the recipient gym is
   * matched on the payload), so tenant isolation holds on the stream.
   */
  stream(gymId: string): Observable<ClassOccupancy> {
    return this.events$.asObservable().pipe(
      filter((message) => message.gymId === gymId),
      map((message) => message.occupancy),
    );
  }

  /** Publish one coalesced snapshot to Redis; a broker failure is logged, never thrown. */
  private async flush(message: LiveOccupancyMessage): Promise<void> {
    try {
      await this.redis.client.publish(OCCUPANCY_CHANNEL, JSON.stringify(message));
    } catch (err) {
      this.logger.warn(`occupancy stream publish failed: ${(err as Error).message}`);
    }
  }

  /** Parse one Redis message and push it into the local fan-out; drop malformed ones. */
  private onMessage(payload: string): void {
    let message: LiveOccupancyMessage;
    try {
      message = JSON.parse(payload) as LiveOccupancyMessage;
    } catch (err) {
      this.logger.warn(`occupancy stream dropped malformed message: ${(err as Error).message}`);
      return;
    }
    if (message && typeof message.gymId === 'string' && message.occupancy) {
      this.events$.next(message);
    }
  }

  /** Cancel pending debounces, tear down the fan-out and the subscriber on shutdown. */
  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.pending.clear();
    this.events$.complete();
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
      this.subscriber = null;
    }
  }
}
