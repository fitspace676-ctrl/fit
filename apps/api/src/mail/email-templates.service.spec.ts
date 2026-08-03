import { describe, expect, it, vi } from 'vitest';
import { EMAIL_TEMPLATE_DEFAULTS, emailTemplateDefault } from '@fit/types';
import { EmailTemplatesService } from './email-templates.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { MailerService } from './mailer.service';

/** Build the service over a hand-rolled Prisma + mailer mock. */
function setup(overrides: Array<Record<string, unknown>> = []) {
  const findMany = vi.fn(() => Promise.resolve(overrides));
  const findFirst = vi.fn(() => Promise.resolve(overrides[0] ?? null));
  const upsert = vi.fn((_args: unknown) => Promise.resolve({}));
  const deleteMany = vi.fn((_args: unknown) => Promise.resolve({ count: 1 }));
  const send = vi.fn((_msg: unknown) => Promise.resolve({ sent: true, id: 'msg-1' }));

  const prisma = {
    client: {
      emailTemplateOverride: { findMany, findFirst, upsert, deleteMany },
    },
  } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const mailer = { send } as unknown as MailerService;

  return {
    service: new EmailTemplatesService(prisma, tenant, mailer),
    findMany,
    upsert,
    deleteMany,
    send,
  };
}

describe('EmailTemplatesService.list', () => {
  it('returns every system email even for a gym that has never edited one', async () => {
    // Nothing is seeded per gym, so a brand-new gym must still have the full set —
    // otherwise an event would fire with no wording to send.
    const ctx = setup([]);

    const { data } = await ctx.service.list();

    expect(data).toHaveLength(EMAIL_TEMPLATE_DEFAULTS.length);
    expect(data.every((row) => !row.customised)).toBe(true);
    expect(data.every((row) => row.enabled)).toBe(true);
  });

  it('shows the gym’s own wording, and marks only that one customised', async () => {
    const ctx = setup([
      {
        key: 'birthday_greeting',
        subject: 'Happy birthday from us',
        body: 'Our words, not the default.',
        enabled: true,
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      },
    ]);

    const { data } = await ctx.service.list();
    const birthday = data.find((row) => row.key === 'birthday_greeting');
    const other = data.find((row) => row.key === 'payment_failed');

    expect(birthday).toMatchObject({
      subject: 'Happy birthday from us',
      customised: true,
      updatedAt: '2026-08-01T10:00:00.000Z',
    });
    expect(other).toMatchObject({
      subject: emailTemplateDefault('payment_failed').subject,
      customised: false,
      updatedAt: null,
    });
  });

  it('offers the common tokens alongside the template’s own', async () => {
    const ctx = setup([]);

    const { data } = await ctx.service.list();
    const reminder = data.find((row) => row.key === 'membership_expiry_reminder_7d');

    expect(reminder?.tokens).toEqual(
      expect.arrayContaining(['first_name', 'gym_name', 'plan_name', 'expiry_date']),
    );
  });
});

describe('EmailTemplatesService.send', () => {
  it('fills the merge tokens and hands the mail to the transport', async () => {
    const ctx = setup([]);

    const result = await ctx.service.send('birthday_greeting', 'ana@example.com', {
      first_name: 'Ana',
      gym_name: 'Downtown',
    });

    expect(result.sent).toBe(true);
    const message = ctx.send.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(message.to).toBe('ana@example.com');
    expect(message.subject).toBe('Happy birthday, Ana!');
    expect(message.text).toContain('Ana');
    expect(message.text).toContain('Downtown');
  });

  it('never leaves a raw token in front of a recipient', async () => {
    // The caller forgot `gym_name`. Blanking it is ugly; showing someone
    // "{{gym_name}}" is worse, and is the failure this guards.
    const ctx = setup([]);

    await ctx.service.send('birthday_greeting', 'ana@example.com', { first_name: 'Ana' });

    const message = ctx.send.mock.calls[0]![0] as { subject: string; text: string };
    expect(message.subject).not.toContain('{{');
    expect(message.text).not.toContain('{{');
  });

  it('sends nothing when the gym has switched that email off', async () => {
    const ctx = setup([
      { key: 'birthday_greeting', subject: 'x', body: 'y', enabled: false, updatedAt: new Date() },
    ]);

    const result = await ctx.service.send('birthday_greeting', 'ana@example.com', {});

    expect(result.sent).toBe(false);
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it('reports a transport failure instead of throwing it at the caller', async () => {
    // The payment has already been taken; failing it because the receipt bounced
    // would be the wrong trade.
    const ctx = setup([]);
    ctx.send.mockRejectedValueOnce(new Error('provider down'));

    const result = await ctx.service.send('payment_successful', 'ana@example.com', {});

    expect(result.sent).toBe(false);
  });
});

describe('EmailTemplatesService.reset', () => {
  it('deletes the override rather than copying the default into it', async () => {
    // A copy would freeze this gym on today's wording; a delete lets a later
    // improvement to the default reach them.
    const ctx = setup([]);

    await ctx.service.reset('welcome_new_member');

    expect(ctx.deleteMany).toHaveBeenCalledWith({ where: { key: 'welcome_new_member' } });
    expect(ctx.upsert).not.toHaveBeenCalled();
  });
});

describe('the built-in wording', () => {
  it('covers every key exactly once', () => {
    const keys = EMAIL_TEMPLATE_DEFAULTS.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never ships a default that references a token it has not declared', () => {
    // A stray token would reach a recipient blanked, leaving a sentence with a
    // hole in it that no editor thought to fill.
    const common = ['first_name', 'last_name', 'gym_name'];
    for (const template of EMAIL_TEMPLATE_DEFAULTS) {
      const declared = new Set([...common, ...template.tokens]);
      const used = [...`${template.subject} ${template.body}`.matchAll(/\{\{(\w+)\}\}/g)].map(
        (match) => match[1]!,
      );
      for (const token of used) {
        expect(declared.has(token), `${template.key} uses undeclared {{${token}}}`).toBe(true);
      }
    }
  });
});
