import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { NotificationCategory, NotificationChannel } from '@fit/db';
import { EmailNotificationChannel, PushNotificationChannel } from './notification-channels';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailerService } from '../mail/mailer.service';
import type { ExpoPushService, ExpoPushTicket } from './expo-push.service';

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

  // The gym's own name is the sender wordmark: Settings no longer carries an
  // override, so the name a member joined under is the one they read.
  it('renders in the gym’s configured language, signed with the gym’s name', async () => {
    const { channel, send } = setup({
      user: { email: 'nino@example.com', name: 'Nino' },
      gym: { name: 'Downtown Fitness', settings: { locale: { language: 'ka' } } },
    });

    await channel.deliver(INPUT);

    const message = send.mock.calls[0]![0] as { html: string };
    expect(message.html).toContain('გამარჯობა Nino,'); // Georgian greeting
    expect(message.html).toContain('Downtown Fitness'); // sender wordmark
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

function setupPush(options: {
  configured?: boolean;
  tokens?: { token: string }[];
  tickets?: ExpoPushTicket[];
}) {
  const pushToken = {
    findMany: vi.fn().mockResolvedValue(options.tokens ?? []),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = { client: { pushToken } } as unknown as PrismaService;
  const send = vi
    .fn<(m: unknown[]) => Promise<{ sent: boolean; tickets: ExpoPushTicket[] }>>()
    .mockResolvedValue({ sent: true, tickets: options.tickets ?? [] });
  const push = {
    isConfigured: options.configured ?? true,
    send,
  } as unknown as ExpoPushService;
  const channel = new PushNotificationChannel(prisma, push);
  return { channel, pushToken, send };
}

describe('PushNotificationChannel', () => {
  beforeEach(() => configure());
  afterEach(() => vi.restoreAllMocks());

  it('is a pending no-op — no token lookup, no send — when push is disabled', async () => {
    const { channel, pushToken, send } = setupPush({ configured: false });

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.PUSH, ref: null, pending: true });
    expect(pushToken.findMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('is a pending no-op when the recipient has no registered devices', async () => {
    const { channel, send } = setupPush({ tokens: [] });

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.PUSH, ref: null, pending: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends one message per device carrying title/body and data.href, returning the first ok ticket id', async () => {
    const { channel, pushToken, send } = setupPush({
      tokens: [{ token: 'ExponentPushToken[a]' }, { token: 'ExponentPushToken[b]' }],
      tickets: [
        { status: 'ok', id: 'ticket-a' },
        { status: 'ok', id: 'ticket-b' },
      ],
    });

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.PUSH, ref: 'ticket-a' });
    // Tokens resolved for the recipient user (person-scoped, no gym filter).
    expect(pushToken.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { userId: 'user-1' } });
    const messages = send.mock.calls[0]![0] as {
      to: string;
      title: string;
      body: string;
      data?: { href?: string };
    }[];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      to: 'ExponentPushToken[a]',
      title: 'Booking confirmed',
      body: 'Morning HIIT · Mon 08:00',
      data: { href: '/bookings' }, // the in-app href the mobile app deep-links on tap
    });
    expect(messages[1]!.to).toBe('ExponentPushToken[b]');
  });

  it('omits data.href when the notification carries no deep-link', async () => {
    const { channel, send } = setupPush({
      tokens: [{ token: 'ExponentPushToken[a]' }],
      tickets: [{ status: 'ok', id: 'ticket-a' }],
    });

    await channel.deliver({ ...INPUT, href: null });

    const messages = send.mock.calls[0]![0] as { data?: unknown }[];
    expect(messages[0]!.data).toBeUndefined();
  });

  it('prunes tokens Expo rejects as DeviceNotRegistered, keeping the live ones', async () => {
    const { channel, pushToken } = setupPush({
      tokens: [{ token: 'ExponentPushToken[live]' }, { token: 'ExponentPushToken[dead]' }],
      tickets: [
        { status: 'ok', id: 'ticket-live' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ],
    });

    const result = await channel.deliver(INPUT);

    // Delivery still succeeds off the live device's ticket.
    expect(result).toEqual({ channel: NotificationChannel.PUSH, ref: 'ticket-live' });
    expect(pushToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', token: { in: ['ExponentPushToken[dead]'] } },
    });
  });

  it('does not prune on a non-DeviceNotRegistered error and reports ref null when nothing was accepted', async () => {
    const { channel, pushToken } = setupPush({
      tokens: [{ token: 'ExponentPushToken[a]' }],
      tickets: [{ status: 'error', message: 'boom', details: { error: 'MessageTooBig' } }],
    });

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.PUSH, ref: null });
    expect(pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it('still delivers when the best-effort prune fails (never throws)', async () => {
    const { channel, pushToken } = setupPush({
      tokens: [{ token: 'ExponentPushToken[dead]' }],
      tickets: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
    });
    pushToken.deleteMany.mockRejectedValue(new Error('db down'));

    const result = await channel.deliver(INPUT);

    expect(result).toEqual({ channel: NotificationChannel.PUSH, ref: null });
  });
});
