import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@fit/db';
import { gymSettingsStoredSchema } from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import type { DispatchNotificationInput } from './notification-dispatch.service';
import { buildNotificationEmail, resolveEmailLocale } from './notification-email';
import { ExpoPushService } from './expo-push.service';
import type { ExpoPushTicket } from './expo-push.service';

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
  /** True when the send was accepted by the pipeline but nothing was actually
   * transmitted — a channel with no way to deliver in this environment (email
   * unconfigured / push disabled) or no reachable recipient (no address / no
   * registered device). Lets callers and tests tell a real delivery from a
   * no-op without the channel having to pretend it delivered. */
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
 * Email channel (T8.2) — renders a resolved notification into a branded, localized
 * transactional email and sends it via Resend ({@link MailerService}).
 *
 * The delivery payload names only `(gymId, userId)` and the message, so the
 * channel resolves the rest itself off the unscoped Prisma client: the recipient's
 * address + name, and the gym's display name + interface language (its
 * {@link gymSettingsStoredSchema} locale) for the sender wordmark and template
 * locale. An in-app `href` is expanded to an absolute web URL for the email CTA.
 *
 * Delivery degrades exactly like the other transactional mail: when Resend is
 * unconfigured (dev / CI) the send is a logged no-op reported as `pending`, and a
 * recipient with no resolvable address is likewise a `pending` no-op rather than a
 * throw — so a missing address can never blow up the producer's operation. A real
 * Resend transport error still propagates, consistent with the channel contract.
 */
@Injectable()
export class EmailNotificationChannel implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailNotificationChannel.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async deliver(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult> {
    // Skip the recipient lookups entirely when mail can't go out anyway.
    if (!this.mailer.isConfigured) {
      this.logger.debug(
        `email channel pending (Resend unconfigured): would send "${input.title}" to user ${input.userId}`,
      );
      return { channel: this.channel, ref: null, pending: true };
    }

    const [user, gym] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: input.userId },
        select: { email: true, name: true },
      }),
      this.prisma.client.gym.findUnique({
        where: { id: input.gymId },
        select: { name: true, settings: true },
      }),
    ]);

    if (!user?.email || !gym) {
      this.logger.warn(
        `email channel: no deliverable address for user ${input.userId} in gym ${input.gymId} — skipping`,
      );
      return { channel: this.channel, ref: null, pending: true };
    }

    const settings = gymSettingsStoredSchema.parse(gym.settings ?? {});
    const senderName = settings.notifications.fromName ?? gym.name;

    const email = buildNotificationEmail(
      {
        category: input.category,
        title: input.title,
        body: input.body,
        actionUrl: toAbsoluteWebUrl(input.href),
      },
      {
        locale: resolveEmailLocale(settings.locale.language),
        senderName,
        recipientName: user.name,
      },
    );

    const { id } = await this.mailer.send({
      to: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: settings.notifications.replyTo ?? undefined,
    });
    return { channel: this.channel, ref: id };
  }
}

/**
 * Expand a notification's in-app `href` into an absolute URL for an email CTA. An
 * already-absolute link is used as-is; a relative path is resolved against
 * `WEB_URL`, and when neither yields an absolute URL the button is dropped (the
 * email still renders, just without a CTA) rather than linking somewhere broken.
 */
function toAbsoluteWebUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (!env.WEB_URL) return null;
  return `${env.WEB_URL.replace(/\/+$/, '')}/${href.replace(/^\/+/, '')}`;
}

/**
 * Push channel (T8.3) — fans a resolved notification out to every device the
 * recipient has registered, over Expo push ({@link ExpoPushService}).
 *
 * The delivery payload names only `(userId, …)` and the message, so the channel
 * resolves the recipient's registered {@link PushToken}s itself off the unscoped
 * Prisma client (a token belongs to the person, not a gym) and sends one message
 * per device. The notification's in-app `href` rides along as `data.href`, the
 * exact key the mobile app reads to deep-link a tapped notification to the right
 * screen (T6.10) — so a tapped push lands where its in-app twin would.
 *
 * Delivery degrades exactly like the email channel: when push is disabled
 * (`EXPO_PUSH_ENABLED` not `true`, i.e. dev / CI / preview) the send is a logged
 * no-op reported as `pending`, and a recipient with no registered device is
 * likewise a `pending` no-op rather than a throw — so a member who never enabled
 * push can never blow up the producer's operation. A real Expo transport error
 * still propagates, consistent with the channel contract.
 *
 * Tokens Expo rejects as `DeviceNotRegistered` (the app was uninstalled or the
 * token rotated) are pruned best-effort after the send so the table does not
 * accumulate dead registrations; a prune failure never fails the delivery.
 */
@Injectable()
export class PushNotificationChannel implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(PushNotificationChannel.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: ExpoPushService,
  ) {}

  async deliver(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult> {
    // Skip the token lookup entirely when push can't go out anyway.
    if (!this.push.isConfigured) {
      this.logger.debug(
        `push channel pending (Expo push disabled): would send "${input.title}" to user ${input.userId}`,
      );
      return { channel: this.channel, ref: null, pending: true };
    }

    const tokens = await this.prisma.client.pushToken.findMany({
      where: { userId: input.userId },
      select: { token: true },
    });

    if (tokens.length === 0) {
      this.logger.debug(`push channel: user ${input.userId} has no registered devices — skipping`);
      return { channel: this.channel, ref: null, pending: true };
    }

    // One message per device; the in-app href is carried as `data.href`, which the
    // mobile app reads to route a tapped notification (see @fit/mobile lib/push).
    const data = input.href ? { href: input.href } : undefined;
    const messages = tokens.map((t) => ({
      to: t.token,
      title: input.title,
      body: input.body,
      data,
    }));

    const { tickets } = await this.push.send(messages);

    // Expo returns tickets 1:1 (and in order) with the messages posted, so a
    // ticket's index maps back to the token it was sent to. Prune the ones Expo
    // says are dead so we stop targeting them; best-effort — never fail the send.
    await this.pruneDeadTokens(input.userId, tokens, tickets);

    // A batch delivery has no single id; reference the first accepted ticket.
    const firstOk = tickets.find((t) => t.status === 'ok' && t.id);
    return { channel: this.channel, ref: firstOk?.id ?? null };
  }

  /** Delete registrations Expo rejected as `DeviceNotRegistered`. Best-effort:
   * a failure here is logged, not thrown — the notification was still delivered to
   * the live devices. */
  private async pruneDeadTokens(
    userId: string,
    tokens: readonly { token: string }[],
    tickets: readonly ExpoPushTicket[],
  ): Promise<void> {
    const dead = tokens
      .filter(
        (_, i) =>
          tickets[i]?.status === 'error' && tickets[i]?.details?.error === 'DeviceNotRegistered',
      )
      .map((t) => t.token);
    if (dead.length === 0) return;

    try {
      await this.prisma.client.pushToken.deleteMany({
        where: { userId, token: { in: dead } },
      });
      this.logger.debug(`pruned ${dead.length} unregistered push token(s) for user ${userId}`);
    } catch (err) {
      this.logger.warn(
        `failed to prune ${dead.length} dead push token(s) for user ${userId}: ${String(err)}`,
      );
    }
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
