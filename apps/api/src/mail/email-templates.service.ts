import { Injectable, Logger } from '@nestjs/common';
import {
  COMMON_EMAIL_TOKENS,
  EMAIL_TEMPLATE_DEFAULTS,
  emailTemplateDefault,
  interpolateMergeFields,
  type EmailTemplateKey,
  type EmailTemplateRow,
  type ListEmailTemplatesResponse,
  type MergeValues,
  type UpdateEmailTemplateInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { MailerService } from './mailer.service';
import { escapeHtml, renderBrandedEmail } from './branded-email';

/**
 * Expand a template's tokens, leaving none behind.
 *
 * `interpolateMergeFields` only blanks tokens it recognises from the *marketing*
 * catalogue, and these templates carry their own vocabulary (`plan_name`,
 * `shift_time`, `expiry_date`). Anything it does not know it leaves raw — which
 * is right for the campaign composer's live preview, where a visible `{{token}}`
 * tells staff what will be filled in later, and wrong here, where the next stop
 * is a member's inbox. So a second pass clears whatever survives.
 */
function fill(text: string, values: MergeValues): string {
  const expanded = interpolateMergeFields(text, values, { blankMissing: true });
  return expanded.replace(/\{\{\s*\w+\s*\}\}/g, '');
}

/** One template's wording as it currently stands for a gym. */
interface ResolvedTemplate {
  subject: string;
  body: string;
  enabled: boolean;
}

/**
 * The gym's system emails: reading them, editing them, and sending them.
 *
 * The wording resolves in two layers — the built-in default from `@fit/types`,
 * overridden by the gym's own row when one exists. Nothing is seeded, so every
 * gym has every template from the moment it is created, and improving a default
 * still reaches everyone who has not rewritten it.
 *
 * Sending is deliberately forgiving. A transactional email is a side effect of
 * something more important (a payment landing, a class being cancelled), and a
 * mail provider being down must never fail that. Every send here reports success
 * or failure and throws nothing.
 */
@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Every template, in the order the settings screen groups them, each showing
   * the wording currently in force and whether the gym has edited it.
   */
  async list(): Promise<ListEmailTemplatesResponse> {
    const overrides = await this.prisma.client.emailTemplateOverride.findMany({
      select: { key: true, subject: true, body: true, enabled: true, updatedAt: true },
    });
    const byKey = new Map(overrides.map((row) => [row.key, row]));

    const data: EmailTemplateRow[] = EMAIL_TEMPLATE_DEFAULTS.map((template) => {
      const override = byKey.get(template.key);
      return {
        key: template.key,
        name: template.name,
        description: template.description,
        group: template.group,
        audience: template.audience,
        subject: override?.subject ?? template.subject,
        body: override?.body ?? template.body,
        enabled: override?.enabled ?? true,
        customised: override !== undefined,
        tokens: [...COMMON_EMAIL_TOKENS, ...template.tokens],
        updatedAt: override?.updatedAt.toISOString() ?? null,
      };
    });

    return { data };
  }

  /** Save a gym's wording for one template, creating the override or replacing it. */
  async update(key: EmailTemplateKey, input: UpdateEmailTemplateInput): Promise<EmailTemplateRow> {
    const gymId = this.tenant.gymId;
    await this.prisma.client.emailTemplateOverride.upsert({
      where: { gymId_key: { gymId, key } },
      create: { gymId, key, subject: input.subject, body: input.body, enabled: input.enabled },
      update: { subject: input.subject, body: input.body, enabled: input.enabled },
    });
    return this.row(key);
  }

  /**
   * Drop a gym's wording and fall back to the built-in default.
   *
   * A delete rather than a copy of the default, so the template rejoins the set
   * that improves when the default copy does. Deleting one that was never
   * overridden is a no-op, which makes "reset" safe to press twice.
   */
  async reset(key: EmailTemplateKey): Promise<EmailTemplateRow> {
    await this.prisma.client.emailTemplateOverride.deleteMany({ where: { key } });
    return this.row(key);
  }

  /**
   * Send one system email, if the gym has it switched on.
   *
   * `values` fills the template's merge tokens; anything the template asks for
   * and the caller did not supply is blanked rather than left as a raw
   * `{{token}}` — a recipient should never see the machinery.
   *
   * Returns whether the mail was handed to the provider. Never throws: the event
   * that triggered this (a payment, a cancellation) has already happened, and
   * undoing it because an email bounced would be the wrong trade.
   */
  async send(
    key: EmailTemplateKey,
    recipient: string,
    values: MergeValues,
  ): Promise<{ sent: boolean }> {
    try {
      const template = await this.resolve(key);
      if (!template.enabled) {
        return { sent: false };
      }

      const subject = fill(template.subject, values);
      const body = fill(template.body, values);

      // The stored body is plain text with blank lines between paragraphs, which
      // is what the editor shows; the branded shell turns it into HTML so staff
      // never have to write markup to change a sentence.
      const contentHtml = body
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map(
          (part) =>
            `<p style="margin:0 0 12px;font-size:14px;line-height:22px;">${escapeHtml(part).replace(/\n/g, '<br />')}</p>`,
        )
        .join('');

      const html = renderBrandedEmail({
        senderName: values.gym_name ?? 'Fit',
        heading: subject,
        contentHtml,
      });

      const result = await this.mailer.send({ to: recipient, subject, html, text: body });
      return { sent: result.sent };
    } catch (error) {
      // Logged, not thrown — see the note above.
      this.logger.warn(
        `Could not send "${key}" to ${recipient}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { sent: false };
    }
  }

  /** The wording in force for one key: the gym's, or the built-in default. */
  private async resolve(key: EmailTemplateKey): Promise<ResolvedTemplate> {
    const override = await this.prisma.client.emailTemplateOverride.findFirst({
      where: { key },
      select: { subject: true, body: true, enabled: true },
    });
    if (override) {
      return override;
    }
    const fallback = emailTemplateDefault(key);
    return { subject: fallback.subject, body: fallback.body, enabled: true };
  }

  /** Re-read one template as the screen renders it, after a write. */
  private async row(key: EmailTemplateKey): Promise<EmailTemplateRow> {
    const { data } = await this.list();
    const found = data.find((row) => row.key === key);
    if (!found) {
      throw new Error(`Unknown email template "${key}"`);
    }
    return found;
  }
}
