import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

/** Expo's push-send endpoint. Accepts a JSON array of messages in one request. */
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** One push message addressed to a single Expo device token. `data` rides along
 * to the client verbatim (the mobile app reads `data.href` to deep-link a tap). */
export interface ExpoPushMessage {
  /** The recipient device's `ExponentPushToken[…]`. */
  to: string;
  /** Notification title (heads-up headline). */
  title: string;
  /** Notification body. */
  body: string;
  /** Arbitrary client payload delivered as `content.data` on the device. */
  data?: Record<string, unknown>;
}

/** One Expo push *ticket* — the immediate, per-message acknowledgement Expo
 * returns 1:1 (and in order) with the messages posted. `ok` means Expo accepted
 * the message for delivery (the id references a later receipt); `error` means it
 * was rejected outright (e.g. `details.error === 'DeviceNotRegistered'` for a
 * stale token). */
export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string } | null;
}

/** The outcome of an {@link ExpoPushService.send}. */
export interface ExpoPushSendResult {
  /** True when Expo accepted the batch (a 2xx response); false when push is
   * unconfigured (the batch was logged, not transmitted) so the caller can tell
   * "sent" from "delivery not set up" without treating the latter as a failure. */
  sent: boolean;
  /** One ticket per input message, in the same order; empty when not sent. */
  tickets: ExpoPushTicket[];
}

/**
 * The single low-level Expo-push transport (T8.3) — the push analogue of
 * {@link MailerService}. Wraps Expo's REST push API in one `fetch` (no SDK
 * dependency, trivially mockable in tests) so the notification push channel posts
 * through one place.
 *
 * Delivery is an **optional integration**: unless `EXPO_PUSH_ENABLED` is `true`
 * the service logs the batch and resolves `{ sent: false }` without transmitting,
 * so every flow that notifies works end-to-end in CI / local dev / a preview
 * environment without pushing to real devices. When enabled it posts to Expo and
 * returns the per-message tickets; a non-2xx response rejects, so a caller can
 * tell a transport failure from an unconfigured environment.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  /** True when push is enabled and messages will actually be transmitted. */
  get isConfigured(): boolean {
    return env.EXPO_PUSH_ENABLED;
  }

  /**
   * Send a batch of push messages. Resolves `{ sent: true, tickets }` once Expo
   * accepts the batch (tickets 1:1 with `messages`), `{ sent: false, tickets: [] }`
   * — without transmitting — when push is disabled (the batch is logged instead)
   * or the batch is empty, and rejects when Expo returns a non-2xx response.
   */
  async send(messages: ExpoPushMessage[]): Promise<ExpoPushSendResult> {
    if (messages.length === 0) return { sent: false, tickets: [] };

    if (!this.isConfigured) {
      this.logger.warn(
        `Expo push disabled (EXPO_PUSH_ENABLED not true) — not sending ${messages.length} message(s)`,
      );
      return { sent: false, tickets: [] };
    }

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Expo push responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: ExpoPushTicket[];
    } | null;
    const tickets = payload?.data ?? [];
    this.logger.debug(
      `Expo push dispatched: ${messages.length} message(s), ${tickets.length} ticket(s)`,
    );
    return { sent: true, tickets };
  }
}
