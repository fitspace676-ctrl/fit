import { Injectable, Logger } from '@nestjs/common';
import {
  REPORT_DEFINITIONS,
  type GymBusinessSettings,
  type PosReceipt,
  type ReportCellValue,
  type ReportColumn,
  type ReportDigest,
  type ReportDigestSection,
} from '@fit/types';
import { env } from '../config/env';
import {
  EMAIL_BRAND,
  escapeHtml,
  renderBrandedEmail,
  renderEmailButton,
  renderEmailLinkFallback,
  renderEmailPanel,
  renderEmailRows,
  renderEmailTd,
  renderEmailTh,
} from '../mail/branded-email';
import {
  DEFAULT_EMAIL_LOCALE,
  formatEmailDate,
  formatEmailMoney,
  type EmailLocale,
} from '../mail/email-locale';
import { emailStrings } from '../mail/email-strings';

/** Resend's transactional-email endpoint. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** One low-variant of a product on the low-stock digest (T8.8): a human label
 *  (the variant name, or its SKU / index when unnamed) and the on-hand count that
 *  tripped the alert threshold. */
export interface LowStockDigestVariant {
  label: string;
  stock: number;
}

/** One product on the low-stock digest (T8.8) — its name plus only the variants at
 *  or below the threshold, and `lowestStock` (the most-depleted of them) so the
 *  list can lead with the most urgent line. */
export interface LowStockDigestProduct {
  name: string;
  variants: LowStockDigestVariant[];
  lowestStock: number;
}

/** A gym's computed low-stock digest (T8.8): the products carrying at least one low
 *  variant (most urgent first), the `threshold` the sweep ran at, and an optional
 *  deep link to the console's products screen. */
export interface LowStockDigest {
  gymName: string;
  threshold: number;
  products: LowStockDigestProduct[];
  productsUrl?: string;
  /** The gym's email language; English when omitted. */
  locale?: EmailLocale;
}

/** A gym's computed end-of-day summary (T8.8): the day's takings, orders,
 *  check-ins and new members for `date` (the gym-local business day, `YYYY-MM-DD`),
 *  in the gym's `currency`, with an optional deep link to the console dashboard.
 *  `revenue` is captured payments in the currency's MINOR units. */
export interface DailySummary {
  gymName: string;
  date: string;
  currency: string;
  revenue: number;
  orders: number;
  checkIns: number;
  newMembers: number;
  lowStockProducts: number;
  dashboardUrl?: string;
  /** The gym's email language; English when omitted. */
  locale?: EmailLocale;
}

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
  async sendVerificationEmail(
    to: string,
    token: string,
    name?: string,
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<void> {
    const url = buildVerificationUrl(token);
    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — verification link for ${to}: ${url}`,
      );
      return;
    }
    await this.deliver(to, buildVerificationEmail(url, name, locale), 'verification');
  }

  /**
   * Send the password-reset email containing a single-use deep link. Resolves
   * once the mail is accepted by Resend (or immediately, having logged the link,
   * when Resend is unconfigured); rejects when Resend returns an error.
   */
  async sendPasswordResetEmail(
    to: string,
    token: string,
    name?: string,
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<void> {
    const url = buildPasswordResetUrl(token);
    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — password-reset link for ${to}: ${url}`,
      );
      return;
    }
    await this.deliver(to, buildPasswordResetEmail(url, name, locale), 'password-reset');
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
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<void> {
    const url = buildVerificationUrl(token);
    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — owner onboarding link for ${to}: ${url}`,
      );
      return;
    }
    await this.deliver(
      to,
      buildOwnerOnboardingEmail(url, gymName, name, locale),
      'owner onboarding',
    );
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
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<void> {
    const url = buildInviteAcceptUrl(token);
    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — staff invite link for ${to}: ${url}`,
      );
      return;
    }
    await this.deliver(to, buildStaffInviteEmail(url, gymName, role, locale), 'staff invite');
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
  async sendReceiptEmail(
    to: string,
    receipt: PosReceipt,
    gymName?: string,
    gymContact?: GymBusinessSettings,
    locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
  ): Promise<boolean> {
    const message = buildReceiptEmail(receipt, gymName, gymContact, locale);
    return this.deliver(to, message, 'receipt');
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
    options?: { reportsUrl?: string; locale?: EmailLocale },
  ): Promise<boolean> {
    const message = buildReportDigestEmail(digest, options);
    return this.deliver(to, message, `${digest.cadence} report digest`);
  }

  /**
   * Email a gym's owner/manager the daily low-stock reorder digest (T8.8). Builds
   * the copy from the computed {@link LowStockDigest} via
   * {@link buildLowStockDigestEmail} and delivers it. Resolves `true` once accepted,
   * `false` — without sending — when Resend is unconfigured, and rejects only when
   * Resend returns an error, matching {@link sendReportDigestEmail}'s contract so the
   * ops scheduler can tally sent / skipped / failed.
   */
  async sendLowStockDigestEmail(to: string, digest: LowStockDigest): Promise<boolean> {
    return this.deliver(
      to,
      buildLowStockDigestEmail(digest),
      `low-stock digest for ${digest.gymName}`,
    );
  }

  /**
   * Email a gym's owner/manager the end-of-day summary (T8.8). Builds the copy from
   * the computed {@link DailySummary} via {@link buildDailySummaryEmail} and delivers
   * it, with the same sent / skipped (unconfigured) / rejected (Resend error)
   * contract as the other ops mails.
   */
  async sendDailySummaryEmail(to: string, summary: DailySummary): Promise<boolean> {
    return this.deliver(
      to,
      buildDailySummaryEmail(summary),
      `daily summary for ${summary.gymName}`,
    );
  }

  /**
   * Post a prebuilt transactional email to Resend, or log-and-skip when Resend is
   * unconfigured. The shared delivery seam behind the ops-alert senders (T8.8):
   * returns `true` once Resend accepts the mail, `false` when Resend is unconfigured
   * (the mail is logged, not sent), and rejects when Resend returns an error.
   */
  private async deliver(
    to: string,
    message: { subject: string; html: string; text: string },
    context: string,
  ): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn(
        `Resend not configured (RESEND_API_KEY unset) — ${context} for ${to} not sent`,
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
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    this.logger.debug(`${context} email dispatched to ${to}`);
    return true;
  }
}

/**
 * Build the verification deep link the token is appended to. Prefers an explicit
 * `EMAIL_VERIFICATION_URL`, then the web client's `/member/verify` page (the
 * locale prefix is added by the web middleware), falling back to a localhost
 * default that is only ever hit (and logged, not sent) in unconfigured dev / CI
 * environments.
 */
export function buildVerificationUrl(token: string): string {
  const base =
    env.EMAIL_VERIFICATION_URL ??
    (env.WEB_URL
      ? `${env.WEB_URL.replace(/\/+$/, '')}/member/verify`
      : 'http://localhost:3001/member/verify');
  return `${base}?token=${encodeURIComponent(token)}`;
}

/**
 * Build the password-reset deep link the token is appended to. Prefers an
 * explicit `PASSWORD_RESET_URL`, then the web client's `/member/reset-password`
 * page (the locale prefix is added by the web middleware), falling back to a
 * localhost default that is only ever hit (and logged, not sent) in
 * unconfigured dev / CI environments.
 */
export function buildPasswordResetUrl(token: string): string {
  const base =
    env.PASSWORD_RESET_URL ??
    (env.WEB_URL
      ? `${env.WEB_URL.replace(/\/+$/, '')}/member/reset-password`
      : 'http://localhost:3001/member/reset-password');
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

/** The platform's own name, the sender of every account email. */
const PLATFORM_NAME = 'FormaCore';

/** A body paragraph in the shell's running-text style. `html` is already escaped. */
function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;">${html}</p>`;
}

/** A name set in ink and bold inside running text. `html` is already escaped. */
function strong(html: string): string {
  return `<strong class="em-ink" style="color:${EMAIL_BRAND.ink};">${html}</strong>`;
}

/** The "expires in ..." panel every link-carrying account mail ends with. */
function expiryPanel(expires: string, ignore: string): string {
  return renderEmailPanel(`${strong(escapeHtml(expires))} ${escapeHtml(ignore)}`);
}

/**
 * Render the address-verification email (subject, HTML, plain text) in `locale`.
 * Pure - no I/O - so the copy is unit-testable and
 * {@link EmailService.sendVerificationEmail} is just the delivery wrapper. `url`
 * is the trusted verification deep link.
 */
export function buildVerificationEmail(
  url: string,
  name?: string,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): { subject: string; html: string; text: string } {
  const t = emailStrings(locale);
  const greeting = t.shell.greeting(name?.trim() || undefined);
  const html = renderBrandedEmail({
    locale,
    senderName: PLATFORM_NAME,
    eyebrow: escapeHtml(t.verify.eyebrow),
    heading: escapeHtml(t.verify.heading),
    preheader: t.verify.preheader,
    contentHtml:
      paragraph(escapeHtml(greeting)) +
      paragraph(escapeHtml(t.verify.body)) +
      renderEmailButton(url, escapeHtml(t.verify.button)) +
      renderEmailLinkFallback(url, locale) +
      expiryPanel(t.verify.expires, t.verify.ignore),
    footerNote: escapeHtml(t.verify.footer),
  });
  const text = `${greeting}\n\n${t.verify.body}\n${url}\n\n${t.verify.expires} ${t.verify.ignore}`;
  return { subject: t.verify.subject, html, text };
}

/**
 * Render the password-reset email (subject, HTML, plain text) in `locale`. Pure -
 * no I/O - so the copy is unit-testable and
 * {@link EmailService.sendPasswordResetEmail} is just the delivery wrapper. `url`
 * is the trusted reset deep link.
 */
export function buildPasswordResetEmail(
  url: string,
  name?: string,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): { subject: string; html: string; text: string } {
  const t = emailStrings(locale);
  const greeting = t.shell.greeting(name?.trim() || undefined);
  const html = renderBrandedEmail({
    locale,
    senderName: PLATFORM_NAME,
    eyebrow: escapeHtml(t.reset.eyebrow),
    heading: escapeHtml(t.reset.heading),
    preheader: t.reset.preheader,
    contentHtml:
      paragraph(escapeHtml(greeting)) +
      paragraph(escapeHtml(t.reset.body)) +
      renderEmailButton(url, escapeHtml(t.reset.button)) +
      renderEmailLinkFallback(url, locale) +
      expiryPanel(t.reset.expires, t.reset.ignore),
    footerNote: escapeHtml(t.reset.footer),
  });
  const text = `${greeting}\n\n${t.reset.body}\n${url}\n\n${t.reset.expires} ${t.reset.ignore}`;
  return { subject: t.reset.subject, html, text };
}

/**
 * Render the gym-owner onboarding email (subject, HTML, plain text) in `locale`.
 * Pure - no I/O - so the copy is unit-testable and
 * {@link EmailService.sendOwnerOnboardingEmail} is just the delivery wrapper.
 * `url` is the trusted verification deep link; `gymName` is gym-supplied and
 * escaped here.
 */
export function buildOwnerOnboardingEmail(
  url: string,
  gymName: string,
  name?: string,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): { subject: string; html: string; text: string } {
  const t = emailStrings(locale);
  const greeting = t.shell.greeting(name?.trim() || undefined);
  const gym = escapeHtml(gymName);
  const html = renderBrandedEmail({
    locale,
    senderName: PLATFORM_NAME,
    eyebrow: escapeHtml(t.onboarding.eyebrow),
    heading: escapeHtml(t.onboarding.heading(gymName)),
    preheader: t.onboarding.preheader(gymName),
    contentHtml:
      paragraph(escapeHtml(greeting)) +
      paragraph(escapeHtml(t.onboarding.body('\u0000')).replace('\u0000', strong(gym))) +
      renderEmailButton(url, escapeHtml(t.onboarding.button)) +
      renderEmailLinkFallback(url, locale) +
      expiryPanel(t.onboarding.expires, t.onboarding.ignore),
    footerNote: escapeHtml(t.onboarding.footer(gymName)),
  });
  const text =
    `${greeting}\n\n${t.onboarding.body(gymName)}\n${url}\n\n` +
    `${t.onboarding.expires} ${t.onboarding.ignore}`;
  return { subject: t.onboarding.subject(gymName), html, text };
}

/**
 * Render the staff-invitation email (subject, HTML, plain text) in `locale`. Pure
 * - no I/O - so the copy is unit-testable and {@link EmailService.sendStaffInviteEmail}
 * is just the delivery wrapper. The gym is the sender (an invitee recognises the
 * gym, not the platform); `gymName` and `role` are gym-supplied and escaped here.
 */
export function buildStaffInviteEmail(
  url: string,
  gymName: string,
  role: string,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): { subject: string; html: string; text: string } {
  const t = emailStrings(locale);
  const roleKey = role.toLowerCase();
  const roleLabel = t.invite.roles[roleKey] ?? roleKey;
  const sender = gymName.trim() || PLATFORM_NAME;
  const gym = escapeHtml(sender);
  const html = renderBrandedEmail({
    locale,
    senderName: gym,
    eyebrow: escapeHtml(t.invite.eyebrow),
    heading: escapeHtml(t.invite.heading(sender, roleLabel)),
    preheader: t.invite.preheader(sender),
    contentHtml:
      paragraph(escapeHtml(t.shell.greeting())) +
      paragraph(escapeHtml(t.invite.body('\u0000', roleLabel)).replace('\u0000', strong(gym))) +
      renderEmailButton(url, escapeHtml(t.invite.button)) +
      renderEmailLinkFallback(url, locale) +
      expiryPanel(t.invite.expires, t.invite.ignore),
    footerNote: escapeHtml(t.shell.sentBy(sender)),
  });
  const text =
    `${t.shell.greeting()}\n\n${t.invite.body(sender, roleLabel)}\n${url}\n\n` +
    `${t.invite.expires} ${t.invite.ignore}`;
  return { subject: t.invite.subject(sender), html, text };
}

/**
 * Render a completed POS sale snapshot into the receipt email's subject, HTML, and
 * plain-text bodies (T7.4) in `locale`. Pure - no I/O, no env beyond formatting -
 * so the copy is unit-testable in isolation and {@link EmailService.sendReceiptEmail}
 * is just the delivery wrapper around it. The line table, the discount line (only
 * when a discount applied), and the cash tendered/change rows (only for a cash
 * sale) are all derived from the snapshot, which the caller validated against
 * `sendReceiptSchema`.
 */
export function buildReceiptEmail(
  receipt: PosReceipt,
  gymName?: string,
  gymContact?: GymBusinessSettings,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): { subject: string; html: string; text: string } {
  const t = emailStrings(locale);
  const seller = gymName?.trim() || PLATFORM_NAME;
  const money = (amount: number): string => formatEmailMoney(amount, receipt.currency, locale);
  const methodLabel = t.receipt.methods[receipt.paymentMethod];
  const subject = t.receipt.subject(seller);
  const contactLines = [
    gymContact?.address,
    gymContact?.phone,
    gymContact?.email,
    gymContact?.website,
  ]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value.length > 0);

  const muted = `color:${EMAIL_BRAND.muted};`;
  const mutedCell = `class="em-muted" style="`;
  const itemRowsHtml = receipt.items
    .map(
      (item) =>
        `<tr>` +
        `<td style="padding:6px 0;">${escapeHtml(item.name)}${item.quantity > 1 ? `<span class="em-muted" style="${muted}"> &times; ${item.quantity}</span>` : ''}</td>` +
        `<td style="padding:6px 0;text-align:right;font-weight:600;">${money(item.amount)}</td>` +
        `</tr>`,
    )
    .join('');

  const quietRow = (label: string, value: string): string =>
    `<tr><td ${mutedCell}padding:4px 0;${muted}">${escapeHtml(label)}</td><td ${mutedCell}padding:4px 0;text-align:right;${muted}">${value}</td></tr>`;

  const totalsHtml =
    (receipt.discountTotal > 0
      ? quietRow(t.receipt.discount, `-${money(receipt.discountTotal)}`)
      : '') +
    `<tr><td style="padding:10px 0;border-top:1px solid ${EMAIL_BRAND.border};font-size:16px;font-weight:800;">${escapeHtml(t.receipt.total)}</td><td style="padding:10px 0;border-top:1px solid ${EMAIL_BRAND.border};text-align:right;font-size:16px;font-weight:800;">${money(receipt.total)}</td></tr>` +
    (receipt.paymentMethod === 'cash'
      ? quietRow(t.receipt.cashReceived, money(receipt.cashTendered)) +
        quietRow(t.receipt.change, money(receipt.changeDue))
      : '');

  const contentHtml =
    paragraph(
      escapeHtml(t.receipt.thanks('\u0000')).replace('\u0000', strong(escapeHtml(seller))),
    ) +
    (receipt.memberName ? paragraph(escapeHtml(t.receipt.chargedTo(receipt.memberName))) : '') +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="em-ink" style="border-collapse:collapse;width:100%;margin-top:8px;font-size:14px;line-height:20px;color:${EMAIL_BRAND.ink};">` +
    itemRowsHtml +
    `<tr><td ${mutedCell}padding:10px 0 4px;border-top:1px solid ${EMAIL_BRAND.border};${muted}">${escapeHtml(t.receipt.subtotal)}</td><td ${mutedCell}padding:10px 0 4px;border-top:1px solid ${EMAIL_BRAND.border};text-align:right;${muted}">${money(receipt.subtotal)}</td></tr>` +
    totalsHtml +
    `</table>` +
    `<p ${mutedCell}margin:16px 0 0;font-size:13px;line-height:20px;${muted}">${escapeHtml(t.receipt.paidBy(methodLabel))}</p>` +
    // The seller's own contact details (Settings > Business info), so a customer
    // with a question about the sale can answer it from the receipt itself.
    (contactLines.length > 0
      ? `<p ${mutedCell}margin:12px 0 0;font-size:13px;line-height:20px;${muted}">` +
        contactLines.map((line) => escapeHtml(line)).join('<br />') +
        `</p>`
      : '');

  const html = renderBrandedEmail({
    locale,
    senderName: escapeHtml(seller),
    eyebrow: escapeHtml(t.receipt.eyebrow),
    heading: escapeHtml(t.receipt.heading),
    preheader: t.receipt.preheader(money(receipt.total), seller),
    contentHtml,
    footerNote: escapeHtml(t.receipt.footer),
  });

  const itemLines = receipt.items
    .map(
      (item) =>
        `  ${item.name}${item.quantity > 1 ? ` x ${item.quantity}` : ''}  ${money(item.amount)}`,
    )
    .join('\n');

  const totalsLines = [
    `${t.receipt.subtotal}: ${money(receipt.subtotal)}`,
    ...(receipt.discountTotal > 0
      ? [`${t.receipt.discount}: -${money(receipt.discountTotal)}`]
      : []),
    `${t.receipt.total}: ${money(receipt.total)}`,
    ...(receipt.paymentMethod === 'cash'
      ? [
          `${t.receipt.cashReceived}: ${money(receipt.cashTendered)}`,
          `${t.receipt.change}: ${money(receipt.changeDue)}`,
        ]
      : []),
  ].join('\n');

  const text =
    `${t.receipt.thanks(seller)}\n` +
    (receipt.memberName ? `${t.receipt.chargedTo(receipt.memberName)}\n` : '') +
    `\n${itemLines}\n\n${totalsLines}\n\n${t.receipt.paidBy(methodLabel)}` +
    (contactLines.length > 0 ? `\n\n${contactLines.join('\n')}` : '');

  return { subject, html, text };
}

/**
 * Render one report cell as the display string the digest shows, by its column
 * type: `money` minor units become a localized currency string in the section's
 * `currency` (e.g. `₾29.99`), `percent` a one-decimal figure with a `%` suffix,
 * `date`/`number`/`text` their own string. A `null` cell (a slice with no value,
 * e.g. attendance rate for a class with no completed bookings) renders as a
 * dash so the column still lines up.
 */
function formatDigestCell(
  column: ReportColumn,
  value: ReportCellValue,
  currency: string,
  locale: EmailLocale,
): string {
  if (value === null || value === '') {
    return '-';
  }
  switch (column.type) {
    case 'money':
      return formatEmailMoney(Number(value), currency, locale);
    case 'percent':
      return `${Math.round(Number(value) * 10) / 10}%`;
    default:
      return String(value);
  }
}

/**
 * Render one digest section as a branded HTML block: the report's name + one-line
 * description, then either its rows as a bordered table (money right-aligned) or
 * an honest empty state when the report produced no rows. Every interpolated
 * value is escaped - report rows carry gym-supplied names (class titles, trainer
 * names) that must not break out of the markup. Report names and column labels
 * come from the report catalogue and are not yet translated.
 */
function renderDigestSectionHtml(section: ReportDigestSection, locale: EmailLocale): string {
  const t = emailStrings(locale);
  const heading =
    `<h2 class="em-ink" style="margin:28px 0 4px;font-size:16px;line-height:22px;font-weight:800;letter-spacing:-0.01em;color:${EMAIL_BRAND.ink};">${escapeHtml(section.name)}</h2>` +
    `<p class="em-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};">${escapeHtml(REPORT_DEFINITIONS[section.key].description)}</p>`;

  if (section.rows.length === 0) {
    return (
      heading +
      `<p class="em-muted" style="margin:0;font-size:13px;line-height:20px;color:${EMAIL_BRAND.muted};">${escapeHtml(t.digest.empty)}</p>`
    );
  }

  const align = (column: ReportColumn): 'left' | 'right' =>
    column.type === 'money' || column.type === 'percent' || column.type === 'number'
      ? 'right'
      : 'left';

  const headerCells = section.columns
    .map((column) => renderEmailTh(escapeHtml(column.label), align(column)))
    .join('');

  const bodyRows = section.rows
    .map((row) => {
      const cells = section.columns
        .map((column) =>
          renderEmailTd(
            escapeHtml(formatDigestCell(column, row[column.key] ?? null, section.currency, locale)),
            align(column),
          ),
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
function renderDigestSectionText(section: ReportDigestSection, locale: EmailLocale): string {
  if (section.rows.length === 0) {
    return `${section.name}\n  ${emailStrings(locale).digest.empty}`;
  }
  const lines = section.rows.map((row) => {
    const cells = section.columns.map(
      (column) =>
        `${column.label}: ${formatDigestCell(column, row[column.key] ?? null, section.currency, locale)}`,
    );
    return `  ${cells.join('  |  ')}`;
  });
  return `${section.name}\n${lines.join('\n')}`;
}

/**
 * Render a computed {@link ReportDigest} into the digest email's subject, HTML, and
 * plain-text bodies (T4.10) in the gym's locale. Pure - no I/O, no env beyond
 * formatting - so the copy is unit-testable in isolation and
 * {@link EmailService.sendReportDigestEmail} is just the delivery wrapper around
 * it. Each section becomes a titled table (or an empty-state line); an optional
 * `reportsUrl` renders a "View full reports" button so the owner can jump to the
 * live console. Gym-supplied text (the gym name, report row labels) is escaped by
 * the section renderers before it reaches the markup.
 */
export function buildReportDigestEmail(
  digest: ReportDigest,
  options?: { reportsUrl?: string; locale?: EmailLocale },
): { subject: string; html: string; text: string } {
  const locale = options?.locale ?? DEFAULT_EMAIL_LOCALE;
  const t = emailStrings(locale);
  const seller = digest.gymName.trim() || PLATFORM_NAME;
  const cadenceLabel = t.digest.cadence[digest.cadence];
  const windowLabel = t.digest.window[digest.cadence];
  const subject = t.digest.subject(cadenceLabel, seller);

  const intro = `<p style="margin:0;">${escapeHtml(t.digest.intro('\u0000', windowLabel)).replace('\u0000', strong(escapeHtml(seller)))}</p>`;
  const sectionsHtml = digest.sections
    .map((section) => renderDigestSectionHtml(section, locale))
    .join('');
  const linkHtml = options?.reportsUrl
    ? renderEmailButton(options.reportsUrl, escapeHtml(t.digest.button))
    : '';

  const html = renderBrandedEmail({
    locale,
    senderName: escapeHtml(seller),
    eyebrow: escapeHtml(t.digest.eyebrow(cadenceLabel)),
    heading: escapeHtml(t.digest.heading(cadenceLabel)),
    preheader: t.digest.preheader(seller, windowLabel),
    contentHtml: intro + sectionsHtml + linkHtml,
    footerNote: escapeHtml(t.shell.manageReason(seller)),
  });

  const sectionsText = digest.sections
    .map((section) => renderDigestSectionText(section, locale))
    .join('\n\n');
  const linkText = options?.reportsUrl ? `\n\n${t.digest.button}: ${options.reportsUrl}` : '';
  const text =
    `${t.digest.textTitle(cadenceLabel, seller)}\n` +
    `${t.digest.preheader(seller, windowLabel)}\n\n` +
    `${sectionsText}${linkText}`;

  return { subject, html, text };
}

/**
 * Render a computed {@link LowStockDigest} into the low-stock alert email's subject,
 * HTML, and plain-text bodies (T8.8) in the gym's locale. Pure - no I/O - so the
 * copy is unit-testable in isolation and {@link EmailService.sendLowStockDigestEmail}
 * is just the delivery wrapper. Each low product becomes a table row per low
 * variant (product name spanning its variants), most-urgent product first.
 * Gym-supplied text (product / variant labels) is escaped before it reaches the
 * markup.
 */
export function buildLowStockDigestEmail(digest: LowStockDigest): {
  subject: string;
  html: string;
  text: string;
} {
  const locale = digest.locale ?? DEFAULT_EMAIL_LOCALE;
  const t = emailStrings(locale);
  const seller = digest.gymName.trim() || PLATFORM_NAME;
  const lineCount = digest.products.reduce((sum, product) => sum + product.variants.length, 0);
  const subject = t.lowStock.subject(lineCount, seller);

  const intro = `<p style="margin:0;">${escapeHtml(t.lowStock.intro(lineCount, '\u0000', digest.threshold)).replace('\u0000', strong(escapeHtml(seller)))}</p>`;

  const rows = digest.products
    .flatMap((product) =>
      product.variants.map(
        (variant) =>
          `<tr>` +
          renderEmailTd(escapeHtml(product.name), 'left', 'font-weight:600;') +
          renderEmailTd(escapeHtml(variant.label), 'left', `color:${EMAIL_BRAND.muted};`) +
          renderEmailTd(
            String(variant.stock),
            'right',
            `font-weight:700;${variant.stock === 0 ? `color:${EMAIL_BRAND.danger};` : ''}`,
          ) +
          `</tr>`,
      ),
    )
    .join('');

  const table =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin-top:20px;">` +
    `<thead><tr>${renderEmailTh(escapeHtml(t.lowStock.product), 'left')}${renderEmailTh(escapeHtml(t.lowStock.variant), 'left')}${renderEmailTh(escapeHtml(t.lowStock.onHand), 'right')}</tr></thead>` +
    `<tbody>${rows}</tbody></table>`;

  const linkHtml = digest.productsUrl
    ? renderEmailButton(digest.productsUrl, escapeHtml(t.lowStock.button))
    : '';

  const html = renderBrandedEmail({
    locale,
    senderName: escapeHtml(seller),
    eyebrow: escapeHtml(t.lowStock.eyebrow),
    heading: escapeHtml(t.lowStock.heading),
    preheader: t.lowStock.preheader(lineCount, seller),
    contentHtml: intro + table + linkHtml,
    footerNote: escapeHtml(t.shell.manageReason(seller)),
  });

  const textRows = digest.products
    .flatMap((product) =>
      product.variants.map(
        (variant) => `  ${t.lowStock.textRow(product.name, variant.label, variant.stock)}`,
      ),
    )
    .join('\n');
  const linkText = digest.productsUrl ? `\n\n${t.lowStock.button}: ${digest.productsUrl}` : '';
  const text =
    `${t.lowStock.textTitle(seller)}\n` +
    `${t.lowStock.textIntro(lineCount, digest.threshold)}\n\n` +
    `${textRows}${linkText}`;

  return { subject, html, text };
}

/**
 * Render a computed {@link DailySummary} into the end-of-day summary email's subject,
 * HTML, and plain-text bodies (T8.8) in the gym's locale. Pure - no I/O - so the
 * copy is unit-testable in isolation and {@link EmailService.sendDailySummaryEmail}
 * is just the delivery wrapper. Renders the day's figures as a label/value table,
 * with revenue formatted in the gym's currency. Gym-supplied text (the gym name)
 * is escaped before it reaches the markup.
 */
export function buildDailySummaryEmail(summary: DailySummary): {
  subject: string;
  html: string;
  text: string;
} {
  const locale = summary.locale ?? DEFAULT_EMAIL_LOCALE;
  const t = emailStrings(locale);
  const seller = summary.gymName.trim() || PLATFORM_NAME;
  const revenue = formatEmailMoney(summary.revenue, summary.currency, locale);
  const date = formatEmailDate(summary.date, locale);
  const subject = t.daily.subject(summary.date, seller);

  const metrics: Array<{ label: string; value: string; emphasis?: boolean; danger?: boolean }> = [
    { label: t.daily.revenue, value: revenue, emphasis: true },
    { label: t.daily.orders, value: String(summary.orders) },
    { label: t.daily.checkIns, value: String(summary.checkIns) },
    { label: t.daily.newMembers, value: String(summary.newMembers) },
    {
      label: t.daily.lowStock,
      value: String(summary.lowStockProducts),
      // The one figure to worry about, when it is not zero.
      danger: summary.lowStockProducts > 0,
    },
  ];

  const intro = `<p style="margin:0;">${escapeHtml(t.daily.intro('\u0000', date)).replace('\u0000', strong(escapeHtml(seller)))}</p>`;
  const table = renderEmailRows(metrics);
  const linkHtml = summary.dashboardUrl
    ? renderEmailButton(summary.dashboardUrl, escapeHtml(t.daily.button))
    : '';

  const html = renderBrandedEmail({
    locale,
    senderName: escapeHtml(seller),
    eyebrow: escapeHtml(t.daily.eyebrow),
    heading: escapeHtml(t.daily.heading(summary.date)),
    preheader: t.daily.preheader(revenue, summary.orders, summary.checkIns),
    contentHtml: intro + table + linkHtml,
    footerNote: escapeHtml(t.shell.manageReason(seller)),
  });

  const textRows = metrics.map((metric) => `  ${metric.label}: ${metric.value}`).join('\n');
  const linkText = summary.dashboardUrl ? `\n\n${t.daily.button}: ${summary.dashboardUrl}` : '';
  const text = `${t.daily.textTitle(seller, summary.date)}\n\n${textRows}${linkText}`;

  return { subject, html, text };
}
