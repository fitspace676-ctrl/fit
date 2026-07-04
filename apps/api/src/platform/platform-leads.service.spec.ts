import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { PlatformLeadType } from '@fit/db';
import type { CreatePlatformLeadInput } from '@fit/types';
import { PlatformLeadsService, buildLeadNotificationEmail } from './platform-leads.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailerService } from '../mail/mailer.service';

function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, overrides);
}

const TRIAL: CreatePlatformLeadInput = {
  type: 'trial',
  name: 'David Iobashvili',
  email: 'david@ironworks.ge',
  business: 'IronWorks Fitness',
};

const DEMO: CreatePlatformLeadInput = {
  type: 'demo',
  name: 'Nino K',
  email: 'nino@studio.ge',
  phone: '+995 555 12 34 56',
  message: 'Bookings and the member app',
};

function setup() {
  const create = vi.fn().mockResolvedValue({ id: 'lead-1' });
  const prisma = { client: { platformLead: { create } } } as unknown as PrismaService;
  const send = vi.fn().mockResolvedValue({ sent: true, id: 'msg-1' });
  const mailer = { send } as unknown as MailerService;
  const service = new PlatformLeadsService(prisma, mailer);
  return { service, create, send };
}

describe('PlatformLeadsService.create', () => {
  beforeEach(() => configure({ PLATFORM_LEADS_EMAIL: 'sales@fit.app' }));
  afterEach(() => vi.restoreAllMocks());

  it('persists a trial lead mapped to the TRIAL enum and returns its id', async () => {
    const { service, create } = setup();

    const result = await service.create(TRIAL);

    expect(result).toEqual({ id: 'lead-1' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({
      data: {
        type: PlatformLeadType.TRIAL,
        name: 'David Iobashvili',
        email: 'david@ironworks.ge',
        business: 'IronWorks Fitness',
        phone: null,
        message: null,
      },
    });
  });

  it('persists a demo lead mapped to the DEMO enum with its phone/message', async () => {
    const { service, create } = setup();

    await service.create(DEMO);

    expect(create.mock.calls[0]![0]).toMatchObject({
      data: {
        type: PlatformLeadType.DEMO,
        business: null,
        phone: '+995 555 12 34 56',
        message: 'Bookings and the member app',
      },
    });
  });

  it('notifies the sales inbox with the prospect set as reply-to', async () => {
    const { service, send } = setup();

    await service.create(TRIAL);

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0] as { to: string; subject: string; replyTo?: string };
    expect(message.to).toBe('sales@fit.app');
    expect(message.subject).toContain('Free-trial signup');
    expect(message.replyTo).toBe('david@ironworks.ge');
  });

  it('skips the team notification when PLATFORM_LEADS_EMAIL is unset but still persists', async () => {
    configure({});
    const { service, create, send } = setup();

    const result = await service.create(TRIAL);

    expect(result).toEqual({ id: 'lead-1' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows a notification failure — the lead is already stored', async () => {
    const { service, send } = setup();
    send.mockRejectedValue(new Error('Resend 500'));

    await expect(service.create(TRIAL)).resolves.toEqual({ id: 'lead-1' });
  });
});

describe('buildLeadNotificationEmail', () => {
  it('subjects a trial lead and lists the supplied fields', () => {
    const { subject, html, text } = buildLeadNotificationEmail(TRIAL, PlatformLeadType.TRIAL);
    expect(subject).toBe('New Free-trial signup: David Iobashvili');
    expect(html).toContain('david@ironworks.ge');
    expect(html).toContain('IronWorks Fitness');
    expect(html).not.toContain('Phone'); // no phone on a trial lead
    expect(text).toContain('Email: david@ironworks.ge');
  });

  it('subjects a demo lead and shows the phone + message but no gym row', () => {
    const { subject, html } = buildLeadNotificationEmail(DEMO, PlatformLeadType.DEMO);
    expect(subject).toBe('New Demo request: Nino K');
    expect(html).toContain('+995 555 12 34 56');
    expect(html).toContain('Bookings and the member app');
    expect(html).not.toContain('Gym / studio');
  });

  it('escapes lead-supplied text', () => {
    const { html } = buildLeadNotificationEmail(
      { ...TRIAL, name: '<script>x</script>' },
      PlatformLeadType.TRIAL,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
