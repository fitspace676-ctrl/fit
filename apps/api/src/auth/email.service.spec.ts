import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import type { PosReceipt, ReportDigest } from '@fit/types';
import {
  EmailService,
  buildDailySummaryEmail,
  buildLowStockDigestEmail,
  buildReceiptEmail,
  buildReportDigestEmail,
  buildVerificationUrl,
  buildPasswordResetUrl,
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildOwnerOnboardingEmail,
  buildStaffInviteEmail,
  type DailySummary,
  type LowStockDigest,
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
  Object.assign(mockEnv, { EMAIL_FROM: 'FormaCore <no-reply@fit.app>' }, overrides);
}

/** A weekly digest fixture: one money report, one percent report, one empty. */
const weeklyDigest: ReportDigest = {
  gymName: 'Downtown',
  cadence: 'weekly',
  range: '7d',
  sections: [
    {
      key: 'revenue-by-channel',
      name: 'Revenue by channel',
      range: '7d',
      currency: 'USD',
      columns: [
        { key: 'channel', label: 'Channel', type: 'text' },
        { key: 'orders', label: 'Orders', type: 'number' },
        { key: 'net', label: 'Net', type: 'money' },
      ],
      rows: [
        { channel: 'POS', orders: 3, net: 4500 },
        { channel: 'ONLINE', orders: 1, net: 1999 },
      ],
    },
    {
      key: 'no-show-rate',
      name: 'No-show rate',
      range: '7d',
      currency: 'USD',
      columns: [
        { key: 'trainer', label: 'Trainer', type: 'text' },
        { key: 'completed', label: 'Completed bookings', type: 'number' },
        { key: 'noShowRate', label: 'No-show rate', type: 'percent' },
      ],
      rows: [{ trainer: 'Alex', completed: 10, noShowRate: 12.5 }],
    },
    {
      key: 'attendance-by-class',
      name: 'Attendance by class',
      range: '7d',
      currency: 'USD',
      columns: [
        { key: 'class', label: 'Class', type: 'text' },
        { key: 'attendanceRate', label: 'Attendance rate', type: 'percent' },
      ],
      rows: [],
    },
  ],
};

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
    expect(body.from).toBe('FormaCore <no-reply@fit.app>');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Verify your email');
    expect(String(body.html)).toContain('https://app.fit/member/verify?token=tok123');
    expect(String(body.text)).toContain('https://app.fit/member/verify?token=tok123');
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
    expect(String(body.html)).toContain('https://app.fit/member/reset-password?token=tok123');
    expect(String(body.text)).toContain('https://app.fit/member/reset-password?token=tok123');
    // House copy rule: no em-dashes or double hyphens in member-facing text.
    expect(String(body.html)).not.toMatch(/—|--/);
    expect(String(body.text)).not.toMatch(/—|--/);
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
    expect(body.subject).toBe('Welcome to FormaCore - finish setting up Downtown');
    // Reuses the same verify deep link plain verification uses.
    expect(String(body.html)).toContain('https://app.fit/member/verify?token=tok123');
    expect(String(body.html)).toContain('Downtown');
    expect(String(body.text)).toContain('https://app.fit/member/verify?token=tok123');
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

describe('account email builders', () => {
  const URL = 'https://app.fit/member/verify?token=tok&x=1';

  it('renders the verification mail in the branded shell with a button and a copyable link', () => {
    const { subject, html, text } = buildVerificationEmail(URL, 'Sam');
    expect(subject).toBe('Verify your email');
    expect(html).toContain('Hi Sam,');
    expect(html).toContain('#E4F26A');
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('Verify my email');
    expect(html).toContain('Or copy this link');
    expect(html).toContain('expires in 24 hours');
    expect(text).toContain(URL);
  });

  it('greets namelessly without a dangling space', () => {
    const { html } = buildVerificationEmail(URL);
    expect(html).toContain('Hi,');
    expect(html).not.toContain('Hi ,');
  });

  it('renders the reset mail with the 1 hour notice and no em-dashes', () => {
    const { subject, html, text } = buildPasswordResetEmail(URL, 'Sam');
    expect(subject).toBe('Reset your password');
    expect(html).toContain('Reset my password');
    expect(html).toContain('expires in 1 hour');
    expect(html).not.toMatch(/—|--/);
    expect(text).not.toMatch(/—|--/);
  });

  it('frames the owner onboarding mail around the gym and escapes its name', () => {
    const { subject, html } = buildOwnerOnboardingEmail(URL, '<b>Downtown</b>', 'Olivia');
    expect(subject).toBe('Welcome to FormaCore - finish setting up <b>Downtown</b>');
    expect(html).toContain('&lt;b&gt;Downtown&lt;/b&gt; is ready');
    expect(html).not.toContain('<b>Downtown</b>');
    expect(html).toContain('Hi Olivia,');
    expect(html).toContain('Verify email and get started');
  });

  it('sends the staff invite from the gym, naming the role', () => {
    const { subject, html, text } = buildStaffInviteEmail(URL, 'Downtown', 'MANAGER');
    expect(subject).toBe("You're invited to join Downtown on FormaCore");
    expect(html).toContain('Join Downtown as a manager');
    expect(html).toContain('Accept invitation');
    expect(html).toContain('expires in 7 days');
    expect(text).toContain('as a manager');
  });
});

describe('account email builders in Georgian', () => {
  const URL = 'https://app.fit/member/verify?token=tok';

  it('renders the verification mail entirely in Georgian, with no English chrome left over', () => {
    const { subject, html, text } = buildVerificationEmail(URL, 'ნინო', 'ka');
    expect(subject).toBe('დაადასტურეთ ელფოსტა');
    expect(html).toContain('გამარჯობა, ნინო,');
    expect(html).toContain('ელფოსტის დადასტურება');
    expect(html).toContain('24 საათში');
    expect(html).toContain('დააკოპირეთ');
    expect(html).toContain('მართვის პლატფორმა');
    expect(html).not.toContain('Or copy this link');
    expect(html).not.toContain('Management platform');
    expect(text).toContain(URL);
    expect(`${subject}${html}${text}`).not.toMatch(/—|--/);
  });

  it('renders the reset, onboarding and invite mails in Georgian', () => {
    expect(buildPasswordResetEmail(URL, undefined, 'ka').subject).toBe('პაროლის აღდგენა');
    expect(buildPasswordResetEmail(URL, undefined, 'ka').html).toContain('1 საათში');
    const onboarding = buildOwnerOnboardingEmail(URL, 'Downtown', 'გიორგი', 'ka');
    expect(onboarding.html).toContain('Downtown</strong> FormaCore-ზე მზადაა');
    const invite = buildStaffInviteEmail(URL, 'Downtown', 'TRAINER', 'ka');
    expect(invite.subject).toBe('მოწვევა: შემოუერთდით Downtown-ს FormaCore-ზე');
    expect(invite.html).toContain('მწვრთნელის როლით');
    expect(invite.text).toContain('7 დღეში');
  });

  it('renders the receipt with Georgian labels and ka-GE money formatting', () => {
    const { subject, html, text } = buildReceiptEmail(cashReceipt, 'Downtown', undefined, 'ka');
    expect(subject).toBe('თქვენი ჩეკი - Downtown');
    expect(html).toContain('გადახდის მეთოდი: ნაღდი.');
    expect(html).toContain('მიღებული ნაღდი');
    expect(text).toContain('სულ: ');
    expect(html).not.toContain('Paid by');
  });

  it('renders the ops digests in Georgian', () => {
    const digest = buildReportDigestEmail(weeklyDigest, { locale: 'ka' });
    expect(digest.subject).toBe('ყოველკვირეული ანგარიშების შეჯამება - Downtown');
    expect(digest.html).toContain('ამ პერიოდში აქტივობა არ ყოფილა.');

    const daily = buildDailySummaryEmail({
      gymName: 'Downtown',
      date: '2026-08-25',
      currency: 'GEL',
      revenue: 184500,
      orders: 23,
      checkIns: 141,
      newMembers: 4,
      lowStockProducts: 0,
      locale: 'ka',
    });
    expect(daily.subject).toBe('დღის შეჯამება 2026-08-25 - Downtown');
    expect(daily.html).toContain('25 აგვისტო');
    expect(daily.html).toContain('შემოსავალი');
  });
});

describe('buildVerificationUrl', () => {
  afterEach(() => configure());

  it('prefers an explicit EMAIL_VERIFICATION_URL', () => {
    configure({ EMAIL_VERIFICATION_URL: 'https://m.fit/verify', WEB_URL: 'https://app.fit' });
    expect(buildVerificationUrl('abc')).toBe('https://m.fit/verify?token=abc');
  });

  it('derives <WEB_URL>/member/verify when no explicit base is set', () => {
    configure({ WEB_URL: 'https://app.fit/' });
    expect(buildVerificationUrl('abc')).toBe('https://app.fit/member/verify?token=abc');
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

  it('derives <WEB_URL>/member/reset-password when no explicit base is set', () => {
    configure({ WEB_URL: 'https://app.fit/' });
    expect(buildPasswordResetUrl('abc')).toBe('https://app.fit/member/reset-password?token=abc');
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
  it('prints the gym’s contact details so the buyer can reach it about the sale', () => {
    const { html, text } = buildReceiptEmail(cashReceipt, 'Downtown', {
      address: '12 Rustaveli Ave',
      phone: '+995 322 00 00 00',
      email: 'hello@downtown.example',
      website: 'downtown.example',
    });

    expect(html).toContain('12 Rustaveli Ave');
    expect(html).toContain('hello@downtown.example');
    expect(text).toContain('+995 322 00 00 00');
    expect(text).toContain('downtown.example');
  });

  it('omits the contact block when the gym has filled none in', () => {
    const { html, text } = buildReceiptEmail(cashReceipt, 'Downtown', {
      address: null,
      phone: null,
      email: null,
      website: null,
    });

    expect(html).toContain('Paid by Cash.');
    expect(text.trimEnd().endsWith('Paid by Cash.')).toBe(true);
  });

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

  it('names the attached member and falls back to "FormaCore" without a gym name', () => {
    const { subject, html } = buildReceiptEmail({ ...cashReceipt, memberName: 'Sam Rivera' });
    expect(subject).toBe('Your receipt from FormaCore');
    expect(html).toContain('Charged to Sam Rivera');
  });

  it('wraps the receipt in the branded shell — brand wordmark + heading', () => {
    const { html } = buildReceiptEmail(cashReceipt, 'Downtown');
    // Formacore brand violet + the seller wordmark and the receipt heading.
    expect(html).toContain('#E4F26A');
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

describe('buildReportDigestEmail', () => {
  it('subjects the digest with the cadence label and gym name', () => {
    const { subject } = buildReportDigestEmail(weeklyDigest);
    expect(subject).toBe('Weekly report digest - Downtown');

    const monthly = buildReportDigestEmail({ ...weeklyDigest, cadence: 'monthly', range: '30d' });
    expect(monthly.subject).toBe('Monthly report digest - Downtown');
  });

  it('renders each section title, its money in the section currency, and percents', () => {
    const { html, text } = buildReportDigestEmail(weeklyDigest);
    expect(html).toContain('Revenue by channel');
    expect(html).toContain('No-show rate');
    // Money minor units formatted to the section currency.
    expect(html).toContain('$45.00');
    expect(text).toContain('$19.99');
    // Percent gets a % suffix.
    expect(html).toContain('12.5%');
  });

  it('shows an empty-state line for a report with no rows', () => {
    const { html, text } = buildReportDigestEmail(weeklyDigest);
    expect(html).toContain('Attendance by class');
    expect(html).toContain('No activity in this period.');
    expect(text).toContain('No activity in this period.');
  });

  it('renders the reports link only when a reportsUrl is supplied', () => {
    const without = buildReportDigestEmail(weeklyDigest);
    expect(without.html).not.toContain('View full reports');

    const withLink = buildReportDigestEmail(weeklyDigest, {
      reportsUrl: 'https://admin.fit/reports',
    });
    expect(withLink.html).toContain('https://admin.fit/reports');
    expect(withLink.html).toContain('View full reports');
    expect(withLink.text).toContain('View full reports: https://admin.fit/reports');
  });

  it('wraps the digest in the branded shell and escapes the gym name', () => {
    const { html } = buildReportDigestEmail({ ...weeklyDigest, gymName: '<b>Gym</b>' });
    expect(html).toContain('#E4F26A');
    expect(html).not.toContain('<b>Gym</b>');
    expect(html).toContain('&lt;b&gt;Gym&lt;/b&gt;');
  });
});

describe('EmailService.sendReportDigestEmail', () => {
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

  it('resolves false without sending when Resend is unconfigured', async () => {
    const service = new EmailService();
    const sent = await service.sendReportDigestEmail('owner@example.com', weeklyDigest);
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the digest to Resend and resolves true when configured', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    const service = new EmailService();

    const sent = await service.sendReportDigestEmail('owner@example.com', weeklyDigest, {
      reportsUrl: 'https://admin.fit/reports',
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;
    expect(body.to).toEqual(['owner@example.com']);
    expect(body.subject).toBe('Weekly report digest - Downtown');
    expect(String(body.html)).toContain('https://admin.fit/reports');
  });

  it('throws when Resend returns a non-2xx response', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const service = new EmailService();

    await expect(service.sendReportDigestEmail('owner@example.com', weeklyDigest)).rejects.toThrow(
      /500/,
    );
  });
});

/** A low-stock digest fixture: two products, one with a zero-stock variant. */
const lowStockDigest: LowStockDigest = {
  gymName: 'Downtown',
  threshold: 5,
  products: [
    {
      name: 'Protein bar',
      variants: [
        { label: 'Chocolate', stock: 0 },
        { label: 'Vanilla', stock: 3 },
      ],
      lowestStock: 0,
    },
    { name: 'Shaker', variants: [{ label: '600ml', stock: 5 }], lowestStock: 5 },
  ],
};

/** An end-of-day summary fixture with a non-quiet day. */
const dailySummary: DailySummary = {
  gymName: 'Downtown',
  date: '2026-07-05',
  currency: 'USD',
  revenue: 12500,
  orders: 4,
  checkIns: 27,
  newMembers: 2,
  lowStockProducts: 3,
};

describe('buildLowStockDigestEmail', () => {
  it('subjects the mail with the low-line count and gym name', () => {
    const { subject } = buildLowStockDigestEmail(lowStockDigest);
    // Three low variant lines across the two products.
    expect(subject).toBe('Low stock: 3 items to reorder - Downtown');
  });

  it('singularises the subject for a single low line', () => {
    const single: LowStockDigest = {
      ...lowStockDigest,
      products: [{ name: 'Shaker', variants: [{ label: '600ml', stock: 2 }], lowestStock: 2 }],
    };
    expect(buildLowStockDigestEmail(single).subject).toBe(
      'Low stock: 1 item to reorder - Downtown',
    );
  });

  it('renders a row per low variant with product, variant, and on-hand count', () => {
    const { html, text } = buildLowStockDigestEmail(lowStockDigest);
    expect(html).toContain('Protein bar');
    expect(html).toContain('Chocolate');
    expect(html).toContain('600ml');
    expect(html).toContain('threshold of 5');
    expect(text).toContain('Protein bar - Chocolate: 0 on hand');
    expect(text).toContain('Shaker - 600ml: 5 on hand');
  });

  it('renders the products link only when a productsUrl is supplied', () => {
    expect(buildLowStockDigestEmail(lowStockDigest).html).not.toContain('Manage products');
    const withLink = buildLowStockDigestEmail({
      ...lowStockDigest,
      productsUrl: 'https://admin.fit/products',
    });
    expect(withLink.html).toContain('https://admin.fit/products');
    expect(withLink.text).toContain('Manage products: https://admin.fit/products');
  });

  it('wraps the digest in the branded shell and escapes gym-supplied text', () => {
    const { html } = buildLowStockDigestEmail({
      ...lowStockDigest,
      gymName: '<b>Gym</b>',
      products: [{ name: '<i>Bar</i>', variants: [{ label: 'x', stock: 0 }], lowestStock: 0 }],
    });
    expect(html).toContain('#E4F26A');
    expect(html).not.toContain('<b>Gym</b>');
    expect(html).toContain('&lt;i&gt;Bar&lt;/i&gt;');
  });
});

describe('buildDailySummaryEmail', () => {
  it('subjects the mail with the business day and gym name', () => {
    expect(buildDailySummaryEmail(dailySummary).subject).toBe(
      'Daily summary 2026-07-05 - Downtown',
    );
  });

  it('renders revenue in the gym currency and every metric', () => {
    const { html, text } = buildDailySummaryEmail(dailySummary);
    expect(html).toContain('$125.00');
    expect(html).toContain('Paid orders');
    expect(html).toContain('Check-ins');
    expect(html).toContain('New members');
    expect(text).toContain('Revenue: $125.00');
    expect(text).toContain('Check-ins: 27');
    expect(text).toContain('New members: 2');
  });

  it('renders the dashboard link only when a dashboardUrl is supplied', () => {
    expect(buildDailySummaryEmail(dailySummary).html).not.toContain('Open dashboard');
    const withLink = buildDailySummaryEmail({
      ...dailySummary,
      dashboardUrl: 'https://admin.fit/dashboard',
    });
    expect(withLink.html).toContain('https://admin.fit/dashboard');
    expect(withLink.text).toContain('Open dashboard: https://admin.fit/dashboard');
  });

  it('wraps the summary in the branded shell and escapes the gym name', () => {
    const { html } = buildDailySummaryEmail({ ...dailySummary, gymName: '<b>Gym</b>' });
    expect(html).toContain('#E4F26A');
    expect(html).not.toContain('<b>Gym</b>');
    expect(html).toContain('&lt;b&gt;Gym&lt;/b&gt;');
  });
});

describe('EmailService ops-alert senders', () => {
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

  it('sendLowStockDigestEmail resolves false without sending when unconfigured', async () => {
    const sent = await new EmailService().sendLowStockDigestEmail(
      'owner@example.com',
      lowStockDigest,
    );
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendLowStockDigestEmail POSTs to Resend and resolves true when configured', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    const sent = await new EmailService().sendLowStockDigestEmail(
      'owner@example.com',
      lowStockDigest,
    );
    expect(sent).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;
    expect(body.to).toEqual(['owner@example.com']);
    expect(body.subject).toBe('Low stock: 3 items to reorder - Downtown');
  });

  it('sendDailySummaryEmail POSTs to Resend and resolves true when configured', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    const sent = await new EmailService().sendDailySummaryEmail('owner@example.com', dailySummary);
    expect(sent).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;
    expect(body.subject).toBe('Daily summary 2026-07-05 - Downtown');
  });

  it('an ops sender throws when Resend returns a non-2xx response', async () => {
    configure({ RESEND_API_KEY: 're_123' });
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      new EmailService().sendDailySummaryEmail('owner@example.com', dailySummary),
    ).rejects.toThrow(/500/);
  });
});
