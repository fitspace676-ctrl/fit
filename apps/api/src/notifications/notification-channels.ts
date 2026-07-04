import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@fit/db';
import { NotificationDispatchService } from './notification-dispatch.service';
import type { DispatchNotificationInput } from './notification-dispatch.service';

/**
 * One resolved notification, addressed to a single recipient, ready for a channel
 * to deliver. This is the payload {@link NotificationService} hands each channel
 * adapter after it has resolved preferences and dedupe — the same shape the
 * in-app dispatcher already accepts, so a channel is a thin transport over it.
 */
export type ChannelDeliveryInput = DispatchNotificationInput;

/** The outcome of one channel attempting delivery of one notification. */
export interface ChannelDeliveryResult {
  /** Which channel produced this result. */
  channel: NotificationChannel;
  /** A channel-specific reference for the delivery (the in-app row id, a
   * provider message id, …), or `null` when the channel has no artefact to
   * reference (e.g. a pending stub). */
  ref: string | null;
  /** True when the channel is a not-yet-wired stub (EMAIL until T8.2, PUSH until
   * T8.3): the send was accepted by the pipeline but nothing was actually
   * transmitted. Lets callers and tests tell a real delivery from a placeholder
   * without the stub having to pretend it delivered. */
  pending?: boolean;
}

/**
 * The seam every delivery channel implements (T8.1). {@link NotificationService}
 * fans a resolved notification out across the channels a member has enabled by
 * calling {@link deliver} on each; adding a channel (email T8.2, push T8.3) is
 * implementing this interface and registering the adapter — the orchestrator
 * never changes.
 */
export interface NotificationChannelAdapter {
  /** The channel this adapter serves — its key in the registry. */
  readonly channel: NotificationChannel;
  /**
   * Deliver one notification over this channel. May throw: the orchestrator maps
   * a `(userId, dedupeKey)` unique violation to a dedupe hit and otherwise lets
   * the error propagate (a channel failure is a real failure, not silently
   * swallowed).
   */
  deliver(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult>;
}

/**
 * In-app channel — the one live channel (T6.10 / T8.1). Persists the member's
 * inbox {@link Notification} row via {@link NotificationDispatchService}, which
 * the portal bell reads back. Its `ref` is the created row id; when a `dedupeKey`
 * collides the underlying create throws `P2002`, which the orchestrator catches.
 */
@Injectable()
export class InAppNotificationChannel implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.IN_APP;

  constructor(private readonly dispatch: NotificationDispatchService) {}

  async deliver(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult> {
    const { id } = await this.dispatch.dispatch(input);
    return { channel: this.channel, ref: id };
  }
}

/**
 * Email channel — a wired-in placeholder for T8.2. The interface and the
 * orchestrator's fan-out exist now so producers can target `EMAIL` and the
 * routing is exercised; actual transactional-email transport lands in T8.2, which
 * fills in {@link deliver}. Until then it accepts the send and reports `pending`
 * so nothing downstream mistakes it for a real delivery.
 */
@Injectable()
export class EmailNotificationChannel implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailNotificationChannel.name);

  // Not `async`: the placeholder does no awaiting yet, so it returns a resolved
  // promise to satisfy the interface (T8.2 fills in the real awaited transport).
  deliver(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult> {
    // TODO(T8.2): send a transactional email via the platform mailer.
    this.logger.debug(
      `email channel pending (T8.2): would send "${input.title}" to user ${input.userId}`,
    );
    return Promise.resolve({ channel: this.channel, ref: null, pending: true });
  }
}

/**
 * Push channel — a wired-in placeholder for T8.3. As with {@link
 * EmailNotificationChannel}, the seam is present so the fan-out can route to
 * `PUSH`; Expo push transport (fanning out to the member's registered
 * {@link PushToken}s) lands in T8.3.
 */
@Injectable()
export class PushNotificationChannel implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(PushNotificationChannel.name);

  // Not `async`: see EmailNotificationChannel — resolved promise until T8.3.
  deliver(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult> {
    // TODO(T8.3): fan out to the recipient's Expo push tokens.
    this.logger.debug(
      `push channel pending (T8.3): would send "${input.title}" to user ${input.userId}`,
    );
    return Promise.resolve({ channel: this.channel, ref: null, pending: true });
  }
}

/** DI token for the channel registry — a `Map<NotificationChannel, adapter>`
 * assembled from every registered adapter, injected into the orchestrator. */
export const NOTIFICATION_CHANNEL_REGISTRY = Symbol('NOTIFICATION_CHANNEL_REGISTRY');

/** The resolved channel lookup the orchestrator fans out through. */
export type NotificationChannelRegistry = ReadonlyMap<
  NotificationChannel,
  NotificationChannelAdapter
>;

/** Build the registry from the concrete adapters, keyed by each adapter's own
 * `channel`, so registering a new channel needs no edit here beyond the `inject`
 * list in the module provider. */
export function buildChannelRegistry(
  adapters: readonly NotificationChannelAdapter[],
): NotificationChannelRegistry {
  return new Map(adapters.map((a) => [a.channel, a]));
}
