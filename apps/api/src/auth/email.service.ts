import { Injectable, Logger } from '@nestjs/common';
import {
  REPORT_DEFINITIONS,
  REPORT_DIGEST_CADENCE_LABEL,
  type PaymentMethod,
  type PosReceipt,
  type ReportCellValue,
  type ReportColumn,
  type ReportDigest,
  type ReportDigestSection,
} from '@fit/types';
import { env } from '../config/env';
import { EMAIL_BRAND, escapeHtml, renderBrandedEmail } from '../mail/branded-email';

/** Resend's transactional-email endpoint. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Sends transactional email via Resend's REST API (no SDK dependency — a single
 * `fetch` keeps the surface small and trivially mockable in tests).
 *
 * Delivery is an optional integration: when `RESEND_API_KEY` is unset the
 * service logs the message (including the verification link) instead of sending,
 * so registration works end-to-end in CI / local dev without a Resend account.
 * Callers should treat a thrown delivery error as non-fatal — the account and
 * its verification token already exist regardless of whether the mail went out.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /** True when a Resend API key is configured and mail will actually be sent. */
  get isConfigured(): boolean {
    return Boolean(env.RESEND_API_KEY);
  }

  /**
   * Send the address-verification email containing a single-use deep link.
   * Resolves once the mail is accepted by Resend (or immediately, having logged
   * the link, when Resend is unconfigured); rejects when Resend returns an error.
   */
  async sendVerificationEmail(to: string, token: string, name?: string): Promise<void> {
    const url = buildVerificationUrl(token);
    const greeting = name ? `Hi ${name},` : 'Hi,';

    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — verification link for ${to}: ${url}`,
      );
      return;
    }

    const html =
      `<p>${greeting}</p>` +
      `<p>Confirm your email to finish setting up your Fit account:</p>` +
      `<p><a href="${url}">Verify your email</a></p>` +
      `<p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>`;
    const text = `${greeting}\n\nConfirm your email to finish setting up your Fit account:\n${url}\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.`;

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: 'Verify your email',
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    this.logger.debug(`Verification email dispatched to ${to}`);
  }

  /**
   * Send the password-reset email containing a single-use deep link. Resolves
   * once the mail is accepted by Resend (or immediately, having logged the link,
   * when Resend is unconfigured); rejects when Resend returns an error.
   */
  async sendPasswordResetEmail(to: string, token: string, name?: string): Promise<void> {
    const url = buildPasswordResetUrl(token);
    const greeting = name ? `Hi ${name},` : 'Hi,';

    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — password-reset link for ${to}: ${url}`,
      );
      return;
    }

    const html =
      `<p>${greeting}</p>` +
      `<p>We received a request to reset your Fit password. Choose a new one here:</p>` +
      `<p><a href="${url}">Reset your password</a></p>` +
      `<p>This link expires in 1 hour. If you didn't request a reset, you can ignore this email — your password won't change.</p>`;
    const text = `${greeting}\n\nWe received a request to reset your Fit password. Choose a new one here:\n${url}\n\nThis link expires in 1 hour. If you didn't request a reset, you can ignore this email — your password won't change.`;

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: 'Reset your password',
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    this.logger.debug(`Password-reset email dispatched to ${to}`);
  }

  /**
   * Send the gym-owner onboarding email after a tenant is provisioned
   * (`POST /auth/register-gym`). Carries the same single-use verification deep
   * link plain registration uses — following it verifies the owner's address and
   * issues their first session — but the copy is framed around the gym they now
   * own rather than a bare account confirmation. Resolves once the mail is
   * accepted by Resend (or immediately, having logged the link, when Resend is
   * unconfigured); rejects when Resend returns an error.
   */
  async sendOwnerOnboardingEmail(
    to: string,
    token: string,
    gymName: string,
    name?: string,
  ): Promise<void> {
    const url = buildVerificationUrl(token);
    const greeting = name ? `Hi ${name},` : 'Hi,';

    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — owner onboarding link for ${to}: ${url}`,
      );
      return;
    }

    const html =
      `<p>${greeting}</p>` +
      `<p><strong>${gymName}</strong> is ready on Fit. Confirm your email to finish setting up your gym and sign in:</p>` +
      `<p><a href="${url}">Verify your email &amp; get started</a></p>` +
      `<p>This link expires in 24 hours. If you didn't create this gym, you can ignore this email.</p>`;
    const text = `${greeting}\n\n${gymName} is ready on Fit. Confirm your email to finish setting up your gym and sign in:\n${url}\n\nThis link expires in 24 hours. If you didn't create this gym, you can ignore this email.`;

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: `Welcome to Fit — finish setting up ${gymName}`,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    this.logger.debug(`Owner onboarding email dispatched to ${to}`);
  }

  /**
   * Send the staff-invitation email (T4.7) containing the single-use accept link.
   * The link points at the API's `GET /auth/accept-invite` route, which verifies
   * the token and 302-redirects the invitee to the web register / login flow that
   * redeems it. Resolves once the mail is accepted by Resend (or immediately,
   * having logged the link, when Resend is unconfigured); rejects when Resend
   * returns an error. The copy names the gym and the role so the invitee knows
   * what they're accepting.
   */
  async sendStaffInviteEmail(
    to: string,
    token: string,
    gymName: string,
    role: string,
  ): Promise<void> {
    const url = buildInviteAcceptUrl(token);
    const roleLabel = role.toLowerCase();

    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — staff invite link for ${to}: ${url}`,
      );
      return;
    }

    const html =
      `<p>Hi,</p>` +
      `<p>You've been invited to join <strong>${gymName}</strong> on Fit as a ${roleLabel}. ` +
      `Accept the invitation to set up your account and get started:</p>` +
      `<p><a href="${url}">Accept your invitation</a></p>` +
      `<p>This link expires in 7 days. If you weren't expecting this invitation, you can ignore this email.</p>`;
    const text = `Hi,\n\nYou've been invited to join ${gymName} on Fit as a ${roleLabel}. Accept the invitation to set up your account and get started:\n${url}\n\nThis link expires in 7 days. If you weren't expecting this invitation, you can ignore this email.`;

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: `You're invited to join ${gymName} on Fit`,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    this.logger.debug(`Staff invite email dispatched to ${to}`);
  }

  /**
   * Email the customer the receipt of a completed POS sale (T7.4). Builds the
   * receipt copy from the sale snapshot via {@link buildReceiptEmail} and posts it
   * to Resend. Resolves `true` once the mail is accepted; resolves `false` —
   * without sending — when Resend is unconfigured (the receipt is logged instead),
   * so the caller can surface "emailed" vs "delivery not configured" to staff.
   * Rejects only when Resend returns an error, which the POS treats as a failed
   * send (the sale itself already completed and is unaffected).
   */
  async sendReceiptEmail(to: string, receipt: PosReceipt, gymName?: string): Promise<boolean> {
    const { subject, html, text } = buildReceiptEmail(receipt, gymName);

    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — receipt for ${to} not sent: ${subject}`,
      );
      return false;
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    this.logger.debug(`Receipt email dispatched to ${to}`);
    return true;
  }

  /**
   * Email a gym's owner/manager the scheduled operational report digest (T4.10).
   * Builds the digest copy from the computed {@link ReportDigest} via
   * {@link buildReportDigestEmail} and posts it to Resend. Resolves `true` once
   * the mail is accepted; resolves `false` — without sending — when Resend is
   * unconfigured (the digest is logged instead), so the scheduler can tally
   * "delivered" vs "delivery not configured". Rejects only when Resend returns an
   * error, which the scheduler treats as a failed send for that one recipient.
   */
  async sendReportDigestEmail(
    to: string,
    digest: ReportDigest,
    options?: { reportsUrl?: string },
  ): Promise<boolean> {
    const { subject, html, text } = buildReportDigestEmail(digest, options);

    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — ${digest.cadence} report digest for ${to} not sent: ${subject}`,
      );
      return false;
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    this.logger.debug(`Report digest email dispatched to ${to}`);
    return true;
  }
}

/**
 * Build the verification deep link the token is appended to. Prefers an explicit
 * `EMAIL_VERIFICATION_URL`, then the web client's `/auth/verify` route, falling
 * back to a localhost default that is only ever hit (and logged, not sent) in
 * unconfigured dev / CI environments.
 */
export function buildVerificationUrl(token: string): string {
  const base =
    env.EMAIL_VERIFICATION_URL ??
    (env.WEB_URL
      ? `${env.WEB_URL.replace(/\/+$/, '')}/auth/verify`
      : 'http://localhost:3001/auth/verify');
  return `${base}?token=${encodeURIComponent(token)}`;
}

/**
 * Build the password-reset deep link the token is appended to. Prefers an
 * explicit `PASSWORD_RESET_URL`, then the web client's `/auth/reset-password`
 * route, falling back to a localhost default that is only ever hit (and logged,
 * not sent) in unconfigured dev / CI environments.
 */
export function buildPasswordResetUrl(token: string): string {
  const base =
    env.PASSWORD_RESET_URL ??
    (env.WEB_URL
      ? `${env.WEB_URL.replace(/\/+$/, '')}/auth/reset-password`
      : 'http://localhost:3001/auth/reset-password');
  return `${base}?token=${encodeURIComponent(token)}`;
}

/**
 * Build the staff-invite accept link the token is appended to. Points at the
 * API's own `GET /auth/accept-invite` route (built from `API_PUBLIC_URL`), which
 * verifies the token and redirects the invitee on to the web register / login
 * flow — so the invite email always lands on the API regardless of which client
 * eventually redeems it.
 */
export function buildInviteAcceptUrl(token: string): string {
  const base = `${env.API_PUBLIC_URL.replace(/\/+$/, '')}/auth/accept-invite`;
  return `${base}?token=${encodeURIComponent(token)}`;
}

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string (e.g. `$29.99`),
 * mirroring the admin's `formatPrice`. Falls back to `29.99 USD` for a currency
 * code `Intl` doesn't recognise so the receipt always renders a number.
 */
function formatReceiptMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / MINOR_PER_MAJOR;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/** Human-facing label for a POS settlement method, matching the POS UI copy. */
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  member_account: 'Member account',
};

/**
 * Render a completed POS sale snapshot into the receipt email's subject, HTML, and
 * plain-text bodies (T7.4). Pure — no I/O, no env beyond formatting — so the copy
 * is unit-testable in isolation and {@link EmailService.sendReceiptEmail} is just
 * the delivery wrapper around it. The line table, the discount line (only when a
 * discount applied), and the cash tendered/change rows (only for a cash sale) are
 * all derived from the snapshot, which the caller validated against
 * `sendReceiptSchema`.
 */
export function buildReceiptEmail(
  receipt: PosReceipt,
  gymName?: string,
): { subject: string; html: string; text: string } {
  const seller = gymName?.trim() || 'Fit';
  const money = (amount: number): string => formatReceiptMoney(amount, receipt.currency);
  const methodLabel = PAYMENT_METHOD_LABELS[receipt.paymentMethod];
  const subject = `Your receipt from ${seller}`;

  const itemRowsHtml = receipt.items
    .map(
      (item) =>
        `<tr>` +
        `<td style="padding:4px 0;">${escapeHtml(item.name)}${item.quantity > 1 ? ` &times; ${item.quantity}` : ''}</td>` +
        `<td style="padding:4px 0;text-align:right;">${money(item.amount)}</td>` +
        `</tr>`,
    )
    .join('');

  const totalsHtml =
    (receipt.discountTotal > 0
      ? `<tr><td style="padding:2px 0;">Discount</td><td style="padding:2px 0;text-align:right;">-${money(receipt.discountTotal)}</td></tr>`
      : '') +
    `<tr><td style="padding:6px 0;font-weight:bold;">Total</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${money(receipt.total)}</td></tr>` +
    (receipt.paymentMethod === 'cash'
      ? `<tr><td style="padding:2px 0;">Cash received</td><td style="padding:2px 0;text-align:right;">${money(receipt.cashTendered)}</td></tr>` +
        `<tr><td style="padding:2px 0;">Change</td><td style="padding:2px 0;text-align:right;">${money(receipt.changeDue)}</td></tr>`
      : '');

  const contentHtml =
    `<p style="margin:0 0 12px;">Thanks for your purchase at <strong>${escapeHtml(seller)}</strong>.</p>` +
    (receipt.memberName
      ? `<p style="margin:0 0 12px;">Charged to ${escapeHtml(receipt.memberName)}.</p>`
      : '') +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">` +
    itemRowsHtml +
    `<tr><td style="padding:6px 0;border-top:1px solid ${EMAIL_BRAND.border};">Subtotal</td><td style="padding:6px 0;border-top:1px solid ${EMAIL_BRAND.border};text-align:right;">${money(receipt.subtotal)}</td></tr>` +
    totalsHtml +
    `</table>` +
    `<p style="margin:16px 0 0;font-size:13px;color:${EMAIL_BRAND.muted};">Paid by ${methodLabel}.</p>`;

  const html = renderBrandedEmail({
    senderName: escapeHtml(seller),
    heading: 'Your receipt',
    contentHtml,
    footerNote: 'This is a receipt for your records. No payment is due.',
  });

  const itemLines = receipt.items
    .map(
      (item) =>
        `  ${item.name}${item.quantity > 1 ? ` x ${item.quantity}` : ''}  ${money(item.amount)}`,
    )
    .join('\n');

  const totalsLines = [
    `Subtotal: ${money(receipt.subtotal)}`,
    ...(receipt.discountTotal > 0 ? [`Discount: -${money(receipt.discountTotal)}`] : []),
    `Total: ${money(receipt.total)}`,
    ...(receipt.paymentMethod === 'cash'
      ? [`Cash received: ${money(receipt.cashTendered)}`, `Change: ${money(receipt.changeDue)}`]
      : []),
  ].join('\n');

  const text =
    `Thanks for your purchase at ${seller}.\n` +
    (receipt.memberName ? `Charged to ${receipt.memberName}.\n` : '') +
    `\n${itemLines}\n\n${totalsLines}\n\nPaid by ${methodLabel}.`;

  return { subject, html, text };
}

/**
 * Render one report cell as the display string the digest shows, by its column
 * type: `money` minor units become a localized currency string in the section's
 * `currency` (e.g. `₾29.99`), `percent` a one-decimal figure with a `%` suffix,
 * `date`/`number`/`text` their own string. A `null` cell (a slice with no value,
 * e.g. attendance rate for a class with no completed bookings) renders as an em
 * dash so the column still lines up.
 */
function formatDigestCell(column: ReportColumn, value: ReportCellValue, currency: string): string {
  if (value === null || value === '') {
    return '—';
  }
  switch (column.type) {
    case 'money':
      return formatReceiptMoney(Number(value), currency);
    case 'percent':
      return `${Math.round(Number(value) * 10) / 10}%`;
    default:
      return String(value);
  }
}

/**
 * Render one digest section as a branded HTML block: the report's name + one-line
 * description, then either its rows as a bordered table (money right-aligned) or
 * an honest "No activity in this period." empty state when the report produced no
 * rows. Every interpolated value is escaped — report rows carry gym-supplied names
 * (class titles, trainer names) that must not break out of the markup.
 */
function renderDigestSectionHtml(section: ReportDigestSection): string {
  const heading =
    `<h2 style="margin:24px 0 4px;font-size:15px;line-height:22px;font-weight:700;color:${EMAIL_BRAND.ink};">${escapeHtml(section.name)}</h2>` +
    `<p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${EMAIL_BRAND.muted};">${escapeHtml(REPORT_DEFINITIONS[section.key].description)}</p>`;

  if (section.rows.length === 0) {
    return (
      heading +
      `<p style="margin:0;font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};">No activity in this period.</p>`
    );
  }

  const align = (column: ReportColumn): string =>
    column.type === 'money' || column.type === 'percent' || column.type === 'number'
      ? 'right'
      : 'left';

  const headerCells = section.columns
    .map(
      (column) =>
        `<th style="padding:6px 8px;text-align:${align(column)};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${EMAIL_BRAND.muted};border-bottom:1px solid ${EMAIL_BRAND.border};">${escapeHtml(column.label)}</th>`,
    )
    .join('');

  const bodyRows = section.rows
    .map((row) => {
      const cells = section.columns
        .map(
          (column) =>
            `<td style="padding:6px 8px;text-align:${align(column)};font-size:13px;color:${EMAIL_BRAND.ink};border-bottom:1px solid ${EMAIL_BRAND.border};">${escapeHtml(formatDigestCell(column, row[column.key] ?? null, section.currency))}</td>`,
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return (
    heading +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">` +
    `<thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`
  );
}

/** Render one digest section as plain text: a title line then `label: value` rows. */
function renderDigestSectionText(section: ReportDigestSection): string {
  if (section.rows.length === 0) {
    return `${section.name}\n  No activity in this period.`;
  }
  const lines = section.rows.map((row) => {
    const cells = section.columns.map(
      (column) =>
        `${column.label}: ${formatDigestCell(column, row[column.key] ?? null, section.currency)}`,
    );
    return `  ${cells.join('  |  ')}`;
  });
  return `${section.name}\n${lines.join('\n')}`;
}

/**
 * Render a computed {@link ReportDigest} into the digest email's subject, HTML, and
 * plain-text bodies (T4.10). Pure — no I/O, no env beyond formatting — so the copy
 * is unit-testable in isolation and {@link EmailService.sendReportDigestEmail} is
 * just the delivery wrapper around it. Each section becomes a titled table (or an
 * empty-state line); an optional `reportsUrl` renders a "View full reports" link so
 * the owner can jump to the live console. Gym-supplied text (the gym name, report
 * row labels) is escaped by the section renderers before it reaches the markup.
 */
export function buildReportDigestEmail(
  digest: ReportDigest,
  options?: { reportsUrl?: string },
): { subject: string; html: string; text: string } {
  const seller = digest.gymName.trim() || 'Fit';
  const cadenceLabel = REPORT_DIGEST_CADENCE_LABEL[digest.cadence];
  const subject = `${cadenceLabel} report digest — ${seller}`;
  const windowLabel = digest.cadence === 'weekly' ? 'the past week' : 'the past 30 days';

  const intro = `<p style="margin:0 0 4px;">Here's how <strong>${escapeHtml(seller)}</strong> performed over ${windowLabel}.</p>`;
  const sectionsHtml = digest.sections.map(renderDigestSectionHtml).join('');
  const linkHtml = options?.reportsUrl
    ? `<p style="margin:24px 0 0;"><a href="${options.reportsUrl}" style="color:${EMAIL_BRAND.brand};font-weight:600;">View full reports &rarr;</a></p>`
    : '';

  const html = renderBrandedEmail({
    senderName: escapeHtml(seller),
    heading: `${cadenceLabel} report digest`,
    contentHtml: intro + sectionsHtml + linkHtml,
    footerNote: `You're receiving this because you manage ${escapeHtml(seller)} on Fit.`,
  });

  const sectionsText = digest.sections.map(renderDigestSectionText).join('\n\n');
  const linkText = options?.reportsUrl ? `\n\nView full reports: ${options.reportsUrl}` : '';
  const text =
    `${cadenceLabel} report digest for ${seller}\n` +
    `How ${seller} performed over ${windowLabel}.\n\n` +
    `${sectionsText}${linkText}`;

  return { subject, html, text };
}
