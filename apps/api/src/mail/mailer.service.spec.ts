import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { MailerService } from './mailer.service';

function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, { EMAIL_FROM: 'Fit <no-reply@fit.app>' }, overrides);
}

const MESSAGE = {
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello</p>',
  text: 'Hello',
};

describe('MailerService', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    configure();
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is unconfigured and no-ops (resolving { sent: false }) without a RESEND_API_KEY', async () => {
    const mailer = new MailerService();
    expect(mailer.isConfigured).toBe(false);

    const result = await mailer.send(MESSAGE);

    expect(result).toEqual({ sent: false, id: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to Resend with auth, the default sender, recipient and bodies; returns the id', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    const mailer = new MailerService();

    const result = await mailer.send(MESSAGE);

    expect(result).toEqual({ sent: true, id: 'msg-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_123');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.from).toBe('Fit <no-reply@fit.app>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Hello');
    expect(body.reply_to).toBeUndefined();
  });

  it('honours a per-message from and reply_to override', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    const mailer = new MailerService();

    await mailer.send({ ...MESSAGE, from: 'Sales <sales@fit.app>', replyTo: 'lead@gym.com' });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;
    expect(body.from).toBe('Sales <sales@fit.app>');
    expect(body.reply_to).toBe('lead@gym.com');
  });

  it('throws when Resend returns a non-2xx response', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const mailer = new MailerService();

    await expect(mailer.send(MESSAGE)).rejects.toThrow(/429/);
  });

  it('still resolves { sent: true } with a null id when Resend returns no id', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    const mailer = new MailerService();

    const result = await mailer.send(MESSAGE);
    expect(result).toEqual({ sent: true, id: null });
  });
});
