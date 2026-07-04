import { Inject, Injectable } from '@nestjs/common';
import { NotificationCategory, NotificationChannel, Prisma } from '@fit/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_CHANNEL_REGISTRY,
  type ChannelDeliveryResult,
  type NotificationChannelRegistry,
} from './notification-channels';

/** The channels a `send` fans out to when the caller names none. In-app is the
 * one live channel (the portal bell / inbox); email (T8.2) and push (T8.3) are
 * opt-in per producer until their transports land, so they are deliberately not
 * default-on. */
const DEFAULT_CHANNELS: readonly NotificationChannel[] = [NotificationChannel.IN_APP];

/**
 * A notification to send to one member, addressed explicitly by `(gymId, userId)`
 * — never read from ambient tenant scope — so a request-scoped producer and an
 * out-of-request job (booking reminders T8.6, billing notifications T8.7) call it
 * the same way.
 */
export interface SendNotificationInput {
  /** The gym the notification belongs to (the recipient's tenant). */
  gymId: string;
  /** The recipient user id. */
  userId: string;
  /** Category — gates preferences and drives the in-app icon/grouping. */
  category: NotificationCategory;
  /** Short headline. */
  title: string;
  /** One- or two-line body. */
  body: string;
  /** Optional in-app deep-link the portal routes to when tapped (e.g. `/bookings`). */
  href?: string | null;
  /** Channels to attempt. Defaults to {@link DEFAULT_CHANNELS} (`IN_APP`). A
   * member's per-channel opt-outs are subtracted from this set before delivery. */
  channels?: readonly NotificationChannel[];
  /** Optional idempotency key. A second send with the same `(userId, dedupeKey)`
   * is skipped rather than delivered twice — e.g. a reminder job that reruns. */
  dedupeKey?: string | null;
}

/** The result of a {@link NotificationService.send}. */
export interface SendNotificationResult {
  /** True when the send was skipped because a notification with this
   * `(userId, dedupeKey)` had already been delivered — no channels were run. */
  deduped: boolean;
  /** One entry per channel that actually attempted delivery, after preferences. */
  delivered: ChannelDeliveryResult[];
  /** Channels that were requested but the member has muted for this category. */
  suppressed: NotificationChannel[];
}

/**
 * Notification dispatch orchestrator (T8.1) — the single seam every producer
 * calls to notify a member. {@link send} resolves the member's per-channel
 * preferences, applies dedupe, and fans the message out across the enabled
 * channels via their adapters (in-app today; email T8.2 / push T8.3 slot into the
 * same fan-out). {@link NotificationDispatchService} remains the low-level in-app
 * writer this composes over.
 *
 * Runs on the **unscoped** {@link PrismaService} and keys every read/write on the
 * `(gymId, userId)` from the input — a `Notification`/`NotificationPreference` is
 * addressed explicitly, not via ambient request scope — so it works identically
 * in-request and from a scheduled job.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL_REGISTRY)
    private readonly channels: NotificationChannelRegistry,
  ) {}

  /**
   * Send a notification to `(gymId, userId)`.
   *
   * 1. **Dedupe** — with a `dedupeKey`, a prior notification carrying it for this
   *    user short-circuits the whole send (nothing delivered). The DB's
   *    `(userId, dedupeKey)` unique index is the race backstop: a concurrent
   *    second send that slips past the pre-check collides on the in-app insert and
   *    is reported deduped too.
   * 2. **Preferences** — the requested channels minus the ones the member has
   *    muted for this category (opt-out: no row = enabled).
   * 3. **Fan-out** — deliver over each surviving channel through its adapter.
   */
  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    const requested = dedupeChannels(input.channels ?? DEFAULT_CHANNELS);

    if (input.dedupeKey && (await this.alreadySent(input.userId, input.dedupeKey))) {
      return { deduped: true, delivered: [], suppressed: [] };
    }

    const muted = await this.mutedChannels(input.gymId, input.userId, input.category);
    const suppressed = requested.filter((c) => muted.has(c));
    const effective = requested.filter((c) => !muted.has(c));

    const delivered: ChannelDeliveryResult[] = [];
    for (const channel of effective) {
      const adapter = this.channels.get(channel);
      if (!adapter) continue;
      try {
        delivered.push(await adapter.deliver(toDeliveryInput(input)));
      } catch (err) {
        if (isDedupeConflict(err)) {
          // A concurrent send won the race on the in-app dedupe index. Whatever
          // this send had already delivered stands; the colliding channel did not.
          return { deduped: true, delivered, suppressed };
        }
        throw err;
      }
    }

    return { deduped: false, delivered, suppressed };
  }

  /** True when a notification with this `(userId, dedupeKey)` already exists. */
  private async alreadySent(userId: string, dedupeKey: string): Promise<boolean> {
    const existing = await this.prisma.client.notification.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * The channels the member has explicitly muted for this category in this gym.
   * Opt-out model: only `enabled = false` rows mute; the absence of a row leaves a
   * channel enabled, so a member who never touched their settings gets everything.
   */
  private async mutedChannels(
    gymId: string,
    userId: string,
    category: NotificationCategory,
  ): Promise<Set<NotificationChannel>> {
    const rows = await this.prisma.client.notificationPreference.findMany({
      where: { gymId, userId, category, enabled: false },
      select: { channel: true },
    });
    return new Set(rows.map((r) => r.channel));
  }
}

/** De-duplicate the requested channel list while preserving order. */
function dedupeChannels(channels: readonly NotificationChannel[]): NotificationChannel[] {
  return [...new Set(channels)];
}

/** Project a send input to the per-channel delivery payload. */
function toDeliveryInput(input: SendNotificationInput) {
  return {
    gymId: input.gymId,
    userId: input.userId,
    category: input.category,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    dedupeKey: input.dedupeKey ?? null,
  };
}

/** A `(userId, dedupeKey)` unique-constraint violation — the dedupe race backstop. */
function isDedupeConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    targetsDedupeKey(err.meta?.target)
  );
}

/** Whether a Prisma `P2002` `meta.target` names the `dedupeKey` unique index.
 * Prisma reports the target as a string[] of columns or the constraint name
 * depending on the connector; accept either form. */
function targetsDedupeKey(target: unknown): boolean {
  if (Array.isArray(target)) return target.includes('dedupeKey');
  if (typeof target === 'string') return target.includes('dedupeKey');
  return false;
}
