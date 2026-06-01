import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { EmailService, buildVerificationUrl, buildPasswordResetUrl } from './email.service';

function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, { EMAIL_FROM: 'Fit <no-reply@fit.app>' }, overrides);
}

describe('EmailService', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    configure();
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not send (only logs) when RESEND_API_KEY is unset', async () => {
    const service = new EmailService();
    expect(service.isConfigured).toBe(false);

    await service.sendVerificationEmail('user@example.com', 'tok123', 'Sam');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to Resend with auth, sender, recipient, and the verification link', async () => {
    configure({ RESEND_API_KEY: 're_123', WEB_URL: 'https://app.fit' });
    const service = new EmailService();

    await service.sendVerificationEmail('user@example.com', 'tok123', 'Sam');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_123');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.from).toBe('Fit <no-reply@fit.app>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Verify your email');
    expect(String(body.html)).toContain('https://app.fit/auth/verify?token=tok123');
    expect(String(body.text)).toContain('https://app.fit/auth/verify?token=tok123');
  });

  it('throws when Resend returns a non-2xx response', async () => {
    configure({ RESEND_API_KEY: 're_123', WEB_URL: 'https://app.fit' });
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const service = new EmailService();

    await expect(service.sendVerificationEmail('user@example.com', 'tok123')).rejects.toThrow(
      /429/,
    );
  });
});

describe('EmailService.sendPasswordResetEmail', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    configure();
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not send (only logs) when RESEND_API_KEY is unset', async () => {
    const service = new EmailService();
    expect(service.isConfigured).toBe(false);

    await service.sendPasswordResetEmail('user@example.com', 'tok123', 'Sam');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to Resend with the reset subject, recipient, and reset link', async () => {
    configure({ RESEND_API_KEY: 're_123', WEB_URL: 'https://app.fit' });
    const service = new EmailService();

    await service.sendPasswordResetEmail('user@example.com', 'tok123', 'Sam');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_123');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Reset your password');
    expect(String(body.html)).toContain('https://app.fit/auth/reset-password?token=tok123');
    expect(String(body.text)).toContain('https://app.fit/auth/reset-password?token=tok123');
  });

  it('throws when Resend returns a non-2xx response', async () => {
    configure({ RESEND_API_KEY: 're_123', WEB_URL: 'https://app.fit' });
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const service = new EmailService();

    await expect(service.sendPasswordResetEmail('user@example.com', 'tok123')).rejects.toThrow(
      /429/,
    );
  });
});

describe('EmailService.sendOwnerOnboardingEmail', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    configure();
    fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not send (only logs) when RESEND_API_KEY is unset', async () => {
    const service = new EmailService();
    expect(service.isConfigured).toBe(false);

    await service.sendOwnerOnboardingEmail('owner@example.com', 'tok123', 'Downtown', 'Olivia');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to Resend with a gym-framed subject, recipient, and the verification link', async () => {
    configure({ RESEND_API_KEY: 're_123', WEB_URL: 'https://app.fit' });
    const service = new EmailService();

    await service.sendOwnerOnboardingEmail('owner@example.com', 'tok123', 'Downtown', 'Olivia');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_123');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.to).toEqual(['owner@example.com']);
    expect(body.subject).toBe('Welcome to Fit — finish setting up Downtown');
    // Reuses the same verify deep link plain verification uses.
    expect(String(body.html)).toContain('https://app.fit/auth/verify?token=tok123');
    expect(String(body.html)).toContain('Downtown');
    expect(String(body.text)).toContain('https://app.fit/auth/verify?token=tok123');
  });

  it('throws when Resend returns a non-2xx response', async () => {
    configure({ RESEND_API_KEY: 're_123', WEB_URL: 'https://app.fit' });
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const service = new EmailService();

    await expect(
      service.sendOwnerOnboardingEmail('owner@example.com', 'tok123', 'Downtown'),
    ).rejects.toThrow(/429/);
  });
});

describe('buildVerificationUrl', () => {
  afterEach(() => configure());

  it('prefers an explicit EMAIL_VERIFICATION_URL', () => {
    configure({ EMAIL_VERIFICATION_URL: 'https://m.fit/verify', WEB_URL: 'https://app.fit' });
    expect(buildVerificationUrl('abc')).toBe('https://m.fit/verify?token=abc');
  });

  it('derives <WEB_URL>/auth/verify when no explicit base is set', () => {
    configure({ WEB_URL: 'https://app.fit/' });
    expect(buildVerificationUrl('abc')).toBe('https://app.fit/auth/verify?token=abc');
  });

  it('url-encodes the token', () => {
    configure({ EMAIL_VERIFICATION_URL: 'https://m.fit/verify' });
    expect(buildVerificationUrl('a b+c')).toBe('https://m.fit/verify?token=a%20b%2Bc');
  });
});

describe('buildPasswordResetUrl', () => {
  afterEach(() => configure());

  it('prefers an explicit PASSWORD_RESET_URL', () => {
    configure({ PASSWORD_RESET_URL: 'https://m.fit/reset', WEB_URL: 'https://app.fit' });
    expect(buildPasswordResetUrl('abc')).toBe('https://m.fit/reset?token=abc');
  });

  it('derives <WEB_URL>/auth/reset-password when no explicit base is set', () => {
    configure({ WEB_URL: 'https://app.fit/' });
    expect(buildPasswordResetUrl('abc')).toBe('https://app.fit/auth/reset-password?token=abc');
  });

  it('url-encodes the token', () => {
    configure({ PASSWORD_RESET_URL: 'https://m.fit/reset' });
    expect(buildPasswordResetUrl('a b+c')).toBe('https://m.fit/reset?token=a%20b%2Bc');
  });
});
