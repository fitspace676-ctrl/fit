import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { NotificationCategory, NotificationChannel } from '@fit/db';
import { EmailNotificationChannel } from './notification-channels';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailerService } from '../mail/mailer.service';

function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(
    mockEnv,
    { EMAIL_FROM: 'Fit <no-reply@fit.app>', WEB_URL: 'https://app.fit' },
    overrides,
  );
}

const INPUT = {
  gymId: 'gym-1',
  userId: 'user-1',
  category: NotificationCategory.BOOKING,
  title: 'Booking confirmed',
  body: 'Morning HIIT · Mon 08:00',
  href: '/bookings',
  dedupeKey: null,
};

function setup(options: {
  configured?: boolean;
  user?: { email: string | null; name: string | null } | null;
  gym?: { name: string; settings: unknown } | null;
}) {
  const user = { findUnique: vi.fn().mockResolvedValue(options.user ?? null) };
  const gym = { findUnique: vi.fn().mockResolvedValue(options.gym ?? null) };
  const prisma = { client: { user, gym } } as unknown as PrismaService;
  const send = vi.fn().mockResolvedValue({ sent: true, id: 'msg-9' });
  const mailer = { isConfigured: options.configured ?? true, send } as unknown as MailerService;
  const channel = new EmailNotificationChannel(prisma, mailer);
  return { channel, user, gym, send };
}

describe('EmailNotificationChannel', () => {
  beforeEach(() => configure());
  afterEach(() => vi.restoreAllMocks());

  it('is a pending no-op — no lookups, no send — when Resend is unconfigured', async () => {
    const { channel, user, send } = setup({ configured: false });

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.EMAIL, ref: null, pending: true });
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('resolves the recipient + gym and sends a branded email, returning the provider id', async () => {
    const { channel, send } = setup({
      user: { email: 'sam@example.com', name: 'Sam' },
      gym: { name: 'Downtown', settings: {} },
    });

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.EMAIL, ref: 'msg-9' });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(message.to).toBe('sam@example.com');
    expect(message.subject).toBe('Booking confirmed');
    expect(message.html).toContain('Hi Sam,');
    expect(message.html).toContain('Downtown');
    // The in-app relative href is expanded against WEB_URL for the email CTA.
    expect(message.html).toContain('https://app.fit/bookings');
  });

  it('renders in the gym’s configured language and uses its notification fromName', async () => {
    const { channel, send } = setup({
      user: { email: 'nino@example.com', name: 'Nino' },
      gym: {
        name: 'Downtown',
        settings: { locale: { language: 'ka' }, notifications: { fromName: 'Downtown Fitness' } },
      },
    });

    await channel.deliver(INPUT);

    const message = send.mock.calls[0]![0] as { html: string };
    expect(message.html).toContain('გამარჯობა Nino,'); // Georgian greeting
    expect(message.html).toContain('Downtown Fitness'); // custom sender wordmark
  });

  it('is a pending no-op when the recipient has no deliverable address', async () => {
    const { channel, send } = setup({
      user: { email: null, name: 'Sam' },
      gym: { name: 'Downtown', settings: {} },
    });

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.EMAIL, ref: null, pending: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('omits the CTA link when there is no WEB_URL to resolve a relative href against', async () => {
    configure({ WEB_URL: undefined });
    const { channel, send } = setup({
      user: { email: 'sam@example.com', name: 'Sam' },
      gym: { name: 'Downtown', settings: {} },
    });

    await channel.deliver(INPUT);

    const message = send.mock.calls[0]![0] as { html: string };
    expect(message.html).not.toContain('View booking');
  });
});
