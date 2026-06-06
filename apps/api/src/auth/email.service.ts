import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

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
