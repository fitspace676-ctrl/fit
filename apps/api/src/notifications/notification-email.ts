import { NotificationCategory } from '@fit/db';
import { escapeHtml, renderBrandedEmail, renderEmailButton } from '../mail/branded-email';

export { resolveEmailLocale, type EmailLocale } from '../mail/email-locale';
import { type EmailLocale } from '../mail/email-locale';

/** The localized chrome wrapped around a notification's own (already-localized)
 * title/body: greeting, the category's call-to-action label, and the footer. */
interface EmailChrome {
  greeting: (name?: string) => string;
  cta: Record<NotificationCategory, string>;
  footer: (sender: string) => string;
}

const CHROME: Record<EmailLocale, EmailChrome> = {
  en: {
    greeting: (name) => (name ? `Hi ${name},` : 'Hi,'),
    cta: {
      [NotificationCategory.BOOKING]: 'View booking',
      [NotificationCategory.BILLING]: 'View membership',
      [NotificationCategory.SYSTEM]: 'Open FormaCore',
    },
    footer: (sender) =>
      `You're receiving this from ${sender} on FormaCore. Manage which notifications you get in your account settings.`,
  },
  ka: {
    greeting: (name) => (name ? `გამარჯობა ${name},` : 'გამარჯობა,'),
    cta: {
      [NotificationCategory.BOOKING]: 'ჯავშნის ნახვა',
      [NotificationCategory.BILLING]: 'გაწევრიანების ნახვა',
      [NotificationCategory.SYSTEM]: 'FormaCore-ის გახსნა',
    },
    footer: (sender) =>
      `ეს შეტყობინება მოგივიდათ ${sender}-გან FormaCore-ზე. შეტყობინებების მართვა შეგიძლიათ ანგარიშის პარამეტრებში.`,
  },
};

/** The notification being rendered to email — the same fields the in-app channel
 * persists, so a live email and a polled inbox row describe the same event. */
export interface NotificationEmailInput {
  category: NotificationCategory;
  title: string;
  body: string;
  /** Absolute action URL for the CTA button; omit/null for a button-less notice. */
  actionUrl?: string | null;
}

/** Per-recipient rendering context resolved from the recipient + their gym. */
export interface NotificationEmailContext {
  locale: EmailLocale;
  /** The gym's display name — the branded wordmark and footer signer. */
  senderName: string;
  /** The recipient's name for the greeting; omitted → a nameless "Hi,". */
  recipientName?: string | null;
}

/**
 * Render one member notification into a branded, localized transactional email
 * (T8.2). Pure — no I/O — so the copy is unit-testable in isolation and the email
 * channel is just the delivery wrapper. The notification's own `title`/`body` are
 * the (producer-localized) message; this adds the localized greeting, the
 * category's CTA button (only when an `actionUrl` is given), and the footer, all
 * inside the shared formacore shell. Every interpolated value is escaped.
 */
export function buildNotificationEmail(
  input: NotificationEmailInput,
  ctx: NotificationEmailContext,
): { subject: string; html: string; text: string } {
  const chrome = CHROME[ctx.locale];
  const sender = ctx.senderName.trim() || 'FormaCore';
  const greeting = chrome.greeting(ctx.recipientName?.trim() || undefined);
  const ctaLabel = chrome.cta[input.category];

  const bodyParagraphs = input.body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>`)
    .join('');

  const buttonHtml = input.actionUrl
    ? renderEmailButton(input.actionUrl, escapeHtml(ctaLabel))
    : '';

  const contentHtml =
    `<p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>` + bodyParagraphs + buttonHtml;

  const html = renderBrandedEmail({
    senderName: escapeHtml(sender),
    heading: escapeHtml(input.title),
    contentHtml,
    footerNote: escapeHtml(chrome.footer(sender)),
  });

  const linkText = input.actionUrl ? `\n\n${ctaLabel}: ${input.actionUrl}` : '';
  const text = `${greeting}\n\n${input.body}${linkText}`;

  return { subject: input.title, html, text };
}
