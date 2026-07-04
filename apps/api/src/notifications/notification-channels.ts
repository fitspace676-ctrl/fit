import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@fit/db';
import { gymSettingsStoredSchema } from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import type { DispatchNotificationInput } from './notification-dispatch.service';
import { buildNotificationEmail, resolveEmailLocale } from './notification-email';

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
