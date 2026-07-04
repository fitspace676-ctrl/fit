import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { ActivityEvent } from '@fit/types';
import { RedisService } from '../redis/redis.service';

/**
 * The single Redis pub/sub channel every gym's live activity events are
 * multiplexed over. The recipient gym rides inside the payload (see
 * {@link LiveActivityMessage}) rather than in a per-gym channel name, so the
 * subscriber never has to churn `SUBSCRIBE`/`UNSUBSCRIBE` as SSE clients come and
 * go — one durable subscription fans every gym's events out locally, and each
 * subscriber's {@link ActivityStreamService.stream} filters to its own gym.
 */
const ACTIVITY_CHANNEL = 'activity:events';

/** The Redis-serialised envelope: which gym an event belongs to + the event. */
interface LiveActivityMessage {
  gymId: string;
  event: ActivityEvent;
}

/**
 * The live half of the activity feed (Phase 8, T8.9) — the push seam that turns
 * the polling reception board and activity screen into a server-pushed stream.
 *
 * Producers (the reception check-in flow today; bookings/sales tomorrow) call
 * {@link publish} with a gym id + an {@link ActivityEvent} — the *same*
 * denormalised shape the paginated `GET /admin/activity` feed emits, so a live
 * row and a polled row are byte-identical on the wire. The event is published to
 * one Redis channel so it reaches SSE subscribers on **every** API instance, not
 * just the one that handled the write (production runs multiple API replicas).
 *
 * Each instance holds a dedicated subscriber connection (an ioredis connection in
 * subscriber mode cannot run ordinary commands, so it must be a separate socket
 * from the shared {@link RedisService} client) that feeds a local RxJS
 * {@link Subject}. {@link stream} hands each SSE request an `Observable` filtered
 * to its own gym. Publishing goes through Redis even for same-instance delivery,
 * so there is exactly one delivery path and no double-emit.
 *
 * The live path is strictly best-effort: {@link publish} swallows a Redis outage
 * (logged, never rethrown) so a transient broker hiccup can never fail the
 * originating write — a check-in still succeeds, and the client's periodic poll
 * of `GET /admin/check-ins/today` catches up the missed row.
 */
@Injectable()
export class ActivityStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityStreamService.name);
  /** Local fan-out every SSE subscriber on THIS instance reads from. */
  private readonly events$ = new Subject<LiveActivityMessage>();
  /** Dedicated subscriber socket — a subscribed conn can't issue normal commands. */
  private subscriber: Redis | null = null;

  constructor(private readonly redis: RedisService) {}

  /**
   * Stand up the subscriber connection and start relaying the shared channel into
   * the local {@link events$} fan-out. Cloned from the shared client so it inherits
   * the same URL/retry policy, then connects lazily; a subscribe failure (Redis
   * temporarily absent) is logged, not thrown, so the API still boots — publishing
   * is best-effort and pollers cover the gap.
   */
  async onModuleInit(): Promise<void> {
    const subscriber = this.redis.client.duplicate();
    subscriber.on('error', (err: Error) =>
      this.logger.warn(`activity stream subscriber error: ${err.message}`),
    );
    subscriber.on('message', (_channel: string, payload: string) => this.onMessage(payload));
    this.subscriber = subscriber;
    try {
      await subscriber.subscribe(ACTIVITY_CHANNEL);
    } catch (err) {
      this.logger.warn(`activity stream subscribe failed: ${(err as Error).message}`);
    }
  }

  /**
   * Broadcast one gym's activity event to every connected SSE subscriber,
   * cluster-wide. Best-effort: a Redis failure is logged and swallowed so it can
   * never fail the write that produced the event.
   */
  async publish(gymId: string, event: ActivityEvent): Promise<void> {
    const message: LiveActivityMessage = { gymId, event };
    try {
      await this.redis.client.publish(ACTIVITY_CHANNEL, JSON.stringify(message));
    } catch (err) {
      this.logger.warn(`activity stream publish failed: ${(err as Error).message}`);
    }
  }

  /**
   * The live activity stream for one gym — the events that gym produces, delivered
   * as they happen. Each SSE request gets its own filtered subscription; a gym only
   * ever sees its own events (the recipient gym is matched on the payload, never
   * read from an SSE query param), so tenant isolation holds on the stream just as
   * it does on the paginated feed.
   */
  stream(gymId: string): Observable<ActivityEvent> {
    return this.events$.asObservable().pipe(
      filter((message) => message.gymId === gymId),
      map((message) => message.event),
    );
  }

  /** Parse one Redis message and push it into the local fan-out; drop malformed ones. */
  private onMessage(payload: string): void {
    let message: LiveActivityMessage;
    try {
      message = JSON.parse(payload) as LiveActivityMessage;
    } catch (err) {
      this.logger.warn(`activity stream dropped malformed message: ${(err as Error).message}`);
      return;
    }
    if (message && typeof message.gymId === 'string' && message.event) {
      this.events$.next(message);
    }
  }

  /** Tear down the local fan-out and the subscriber socket on shutdown. */
  async onModuleDestroy(): Promise<void> {
    this.events$.complete();
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
      this.subscriber = null;
    }
  }
}
