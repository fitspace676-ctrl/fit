import { Injectable, Logger } from '@nestjs/common';
import { PlatformLeadType } from '@fit/db';
import type { CreatePlatformLeadInput, CreatePlatformLeadResponse } from '@fit/types';
import { env } from '../config/env';
import { escapeHtml, renderBrandedEmail } from '../mail/branded-email';
import { MailerService } from '../mail/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

/** Map the wire lead source (`'trial' | 'demo'`) onto the stored Prisma enum. */
const LEAD_TYPE_BY_WIRE: Record<CreatePlatformLeadInput['type'], PlatformLeadType> = {
  trial: PlatformLeadType.TRIAL,
  demo: PlatformLeadType.DEMO,
};

/** Human label for each lead source, for the team-notification copy. */
const LEAD_TYPE_LABEL: Record<PlatformLeadType, string> = {
  [PlatformLeadType.TRIAL]: 'Free-trial signup',
  [PlatformLeadType.DEMO]: 'Demo request',
};

/**
 * Platform sales-lead capture (T8.2) — the backend the marketing site's trial /
 * demo forms post to, replacing their frontend-only placeholder submit.
 *
 * A lead belongs to no gym (the prospect has no tenant yet), so this runs on the
 * **unscoped** {@link PrismaService} and writes a tenant-less `PlatformLead`. The
 * row is persisted **first** so a lead is never lost; notifying the sales inbox is
 * a best-effort side effect on top of it — a mail failure (or unconfigured Resend /
 * missing `PLATFORM_LEADS_EMAIL`) is logged and swallowed, never surfaced to the
 * public caller as an error, since the lead is already safely stored.
 */
@Injectable()
export class PlatformLeadsService {
  private readonly logger = new Logger(PlatformLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /** Persist an inbound lead and best-effort notify the sales inbox. */
  async create(input: CreatePlatformLeadInput): Promise<CreatePlatformLeadResponse> {
    const type = LEAD_TYPE_BY_WIRE[input.type];
    const lead = await this.prisma.client.platformLead.create({
      data: {
        type,
        name: input.name,
        email: input.email,
        business: input.business ?? null,
        phone: input.phone ?? null,
        message: input.message ?? null,
      },
      select: { id: true },
    });

    await this.notifyTeam(input, type);
    return { id: lead.id };
  }

  /**
   * Email the configured sales inbox about a new lead. No-op (logged) when no
   * `PLATFORM_LEADS_EMAIL` is set or Resend is unconfigured; a Resend failure is
   * caught and logged — the lead is already persisted, so a notification hiccup
   * must not fail the public submission.
   */
  private async notifyTeam(input: CreatePlatformLeadInput, type: PlatformLeadType): Promise<void> {
    const to = env.PLATFORM_LEADS_EMAIL;
    if (!to) {
      this.logger.debug(`PLATFORM_LEADS_EMAIL unset — captured ${type} lead, not notifying`);
      return;
    }

    const { subject, html, text } = buildLeadNotificationEmail(input, type);
    try {
      await this.mailer.send({ to, subject, html, text, replyTo: input.email });
    } catch (error) {
      this.logger.warn(
        `Captured ${type} lead ${input.email} but failed to notify ${to}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Render a captured lead into the sales-team notification email. Pure so it is
 * unit-testable; every lead-supplied value is escaped before it reaches the markup.
 * Only the fields the relevant form supplies are shown (business for a trial;
 * phone / message for a demo).
 */
export function buildLeadNotificationEmail(
  input: CreatePlatformLeadInput,
  type: PlatformLeadType,
): { subject: string; html: string; text: string } {
  const label = LEAD_TYPE_LABEL[type];
  const subject = `New ${label}: ${input.name}`;

  const rows: Array<[string, string]> = [
    ['Name', input.name],
    ['Email', input.email],
    ...(input.business ? ([['Gym / studio', input.business]] as Array<[string, string]>) : []),
    ...(input.phone ? ([['Phone', input.phone]] as Array<[string, string]>) : []),
    ...(input.message ? ([['Message', input.message]] as Array<[string, string]>) : []),
  ];

  const rowsHtml = rows
    .map(
      ([key, value]) =>
        `<tr>` +
        `<td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top;white-space:nowrap;">${escapeHtml(key)}</td>` +
        `<td style="padding:4px 0;">${escapeHtml(value)}</td>` +
        `</tr>`,
    )
    .join('');

  const html = renderBrandedEmail({
    senderName: 'FormaCore',
    heading: label,
    contentHtml:
      `<p style="margin:0 0 12px;">A new ${escapeHtml(label.toLowerCase())} came in from the marketing site.</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">${rowsHtml}</table>`,
    footerNote: 'Reply directly to this email to reach the prospect.',
  });

  const text =
    `New ${label} from the marketing site.\n\n` +
    rows.map(([key, value]) => `${key}: ${value}`).join('\n');

  return { subject, html, text };
}
