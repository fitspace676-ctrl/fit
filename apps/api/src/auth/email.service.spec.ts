import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import type { PosReceipt } from '@fit/types';
import {
  EmailService,
  buildReceiptEmail,
  buildVerificationUrl,
  buildPasswordResetUrl,
} from './email.service';

/** A cash-sale receipt snapshot the receipt-email tests build on. */
const cashReceipt: PosReceipt = {
  currency: 'USD',
  items: [
    { name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 },
    { name: 'Shaker', quantity: 1, unitPrice: 999, amount: 999 },
  ],
  subtotal: 1499,
  discountTotal: 0,
  total: 1499,
  paymentMethod: 'cash',
  cashTendered: 2000,
  changeDue: 501,
};

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

describe('EmailService.sendReceiptEmail', () => {
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

  it('does not send (only logs) and resolves false when RESEND_API_KEY is unset', async () => {
    const service = new EmailService();

    const delivered = await service.sendReceiptEmail('buyer@example.com', cashReceipt, 'Downtown');

    expect(delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to Resend with the receipt subject, recipient, and totals; resolves true', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    const service = new EmailService();

    const delivered = await service.sendReceiptEmail('buyer@example.com', cashReceipt, 'Downtown');

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_123');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.to).toEqual(['buyer@example.com']);
    expect(body.subject).toBe('Your receipt from Downtown');
    expect(String(body.html)).toContain('$14.99');
    expect(String(body.text)).toContain('Total: $14.99');
  });

  it('throws when Resend returns a non-2xx response', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const service = new EmailService();

    await expect(service.sendReceiptEmail('buyer@example.com', cashReceipt)).rejects.toThrow(/429/);
  });
});

describe('buildReceiptEmail', () => {
  it('renders each line, the subtotal, and the total', () => {
    const { subject, html, text } = buildReceiptEmail(cashReceipt, 'Downtown');
    expect(subject).toBe('Your receipt from Downtown');
    expect(html).toContain('Protein bar');
    expect(html).toContain('&times; 2');
    expect(html).toContain('Shaker');
    expect(text).toContain('Protein bar x 2');
    expect(text).toContain('Subtotal: $14.99');
    expect(text).toContain('Total: $14.99');
  });

  it('includes the cash tendered and change lines for a cash sale', () => {
    const { html, text } = buildReceiptEmail(cashReceipt);
    expect(html).toContain('Cash received');
    expect(html).toContain('Change');
    expect(text).toContain('Cash received: $20.00');
    expect(text).toContain('Change: $5.01');
  });

  it('omits cash lines and shows the method for a card sale', () => {
    const { html, text } = buildReceiptEmail({
      ...cashReceipt,
      paymentMethod: 'card',
      cashTendered: 0,
      changeDue: 0,
    });
    expect(html).not.toContain('Cash received');
    expect(html).toContain('Paid by Card');
    expect(text).toContain('Paid by Card.');
  });

  it('shows the discount line only when a discount applied', () => {
    const noDiscount = buildReceiptEmail(cashReceipt);
    expect(noDiscount.text).not.toContain('Discount');

    const discounted = buildReceiptEmail({ ...cashReceipt, discountTotal: 100, total: 1399 });
    expect(discounted.text).toContain('Discount: -$1.00');
  });

  it('names the attached member and falls back to "Fit" without a gym name', () => {
    const { subject, html } = buildReceiptEmail({ ...cashReceipt, memberName: 'Sam Rivera' });
    expect(subject).toBe('Your receipt from Fit');
    expect(html).toContain('Charged to Sam Rivera');
  });

  it('wraps the receipt in the branded shell — brand wordmark + heading', () => {
    const { html } = buildReceiptEmail(cashReceipt, 'Downtown');
    // Formacore brand violet + the seller wordmark and the receipt heading.
    expect(html).toContain('#6257E3');
    expect(html).toContain('Downtown');
    expect(html).toContain('Your receipt');
  });

  it('escapes HTML in a product name', () => {
    const { html } = buildReceiptEmail({
      ...cashReceipt,
      items: [{ name: '<script>x</script>', quantity: 1, unitPrice: 100, amount: 100 }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
