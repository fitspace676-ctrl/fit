import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

/** Resend's transactional-email endpoint. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * One file to send alongside a message. `content` is the raw bytes; they are
 * base64-encoded on the way to Resend, which is the only encoding its API accepts.
 * Resend caps a request at ~40 MB, so this is for documents (an invoice PDF), not
 * media.
 */
export interface MailAttachment {
  /** Name the recipient sees, extension included (e.g. `"invoice-2026-0001.pdf"`). */
  filename: string;
  /** The file's bytes. */
  content: Buffer;
}

/** One transactional message to hand Resend. */
export interface MailMessage {
  /** Recipient address. */
  to: string;
  /** Subject line. */
  subject: string;
  /** Rendered HTML body. */
  html: string;
  /** Plain-text fallback body. */
  text: string;
  /** Override the platform default `from` (defaults to {@link env.EMAIL_FROM}). */
  from?: string;
  /** Optional `Reply-To` address. */
  replyTo?: string;
  /** Files to attach. Omit (or pass an empty list) for a plain message. */
  attachments?: MailAttachment[];
}

/** The outcome of a {@link MailerService.send}. */
export interface MailSendResult {
  /** True when Resend accepted the message; false when delivery is unconfigured
   * (the message was logged, not transmitted) so the caller can distinguish
   * "sent" from "delivery not set up" without treating the latter as a failure. */
  sent: boolean;
  /** The Resend message id when sent, else `null`. */
  id: string | null;
}

/**
 * The single low-level transactional-email transport (T8.2). Wraps Resend's REST
 * API in one `fetch` — no SDK dependency, trivially mockable in tests — so every
 * mailer (auth links, receipts, report digests, the notification email channel,
 * platform lead capture) posts through one place instead of re-implementing the
 * request.
 *
 * Delivery is an **optional integration**: when `RESEND_API_KEY` is unset the
 * service logs the message and resolves `{ sent: false }` instead of sending, so
 * every flow that mails works end-to-end in CI / local dev without a Resend
 * account. A real Resend error (non-2xx) rejects, so a caller can tell a transport
 * failure from an unconfigured environment.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  /** True when a Resend API key is configured and mail will actually be sent. */
  get isConfigured(): boolean {
    return Boolean(env.RESEND_API_KEY);
  }

  /**
   * Send one transactional message. Resolves `{ sent: true, id }` once Resend
   * accepts it, `{ sent: false, id: null }` — without sending — when Resend is
   * unconfigured (the subject is logged instead), and rejects when Resend returns
   * a non-2xx response.
   */
  async send(message: MailMessage): Promise<MailSendResult> {
    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — not sending "${message.subject}" to ${message.to}`,
      );
      return { sent: false, id: null };
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from ?? env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((file) => ({
                filename: file.filename,
                content: file.content.toString('base64'),
              })),
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json().catch(() => null)) as { id?: string } | null;
    this.logger.debug(`Mail dispatched to ${message.to}: ${message.subject}`);
    return { sent: true, id: payload?.id ?? null };
  }
}
