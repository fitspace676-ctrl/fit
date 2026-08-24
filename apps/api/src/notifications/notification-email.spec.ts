import { describe, expect, it } from 'vitest';
import { NotificationCategory } from '@fit/db';
import { buildNotificationEmail, resolveEmailLocale } from './notification-email';

describe('resolveEmailLocale', () => {
  it('maps ka to ka and everything else to en', () => {
    expect(resolveEmailLocale('ka')).toBe('ka');
    expect(resolveEmailLocale('en')).toBe('en');
    expect(resolveEmailLocale('ru')).toBe('en');
    expect(resolveEmailLocale(null)).toBe('en');
    expect(resolveEmailLocale(undefined)).toBe('en');
  });
});

describe('buildNotificationEmail', () => {
  const input = {
    category: NotificationCategory.BOOKING,
    title: 'Booking confirmed',
    body: 'Morning HIIT · Mon 08:00',
    actionUrl: 'https://app.fit/bookings',
  };

  it('subjects the email with the notification title and wraps it in the branded shell', () => {
    const { subject, html } = buildNotificationEmail(input, {
      locale: 'en',
      senderName: 'Downtown',
      recipientName: 'Sam',
    });
    expect(subject).toBe('Booking confirmed');
    expect(html).toContain('#E4F26A'); // formacore brand lime
    expect(html).toContain('Downtown'); // sender wordmark
    expect(html).toContain('Booking confirmed'); // heading
    expect(html).toContain('Morning HIIT');
  });

  it('greets the recipient by name in English and renders the category CTA', () => {
    const { html, text } = buildNotificationEmail(input, {
      locale: 'en',
      senderName: 'Downtown',
      recipientName: 'Sam',
    });
    expect(html).toContain('Hi Sam,');
    expect(html).toContain('View booking');
    expect(html).toContain('https://app.fit/bookings');
    expect(text).toContain('Hi Sam,');
    expect(text).toContain('View booking: https://app.fit/bookings');
  });

  it('greets in Georgian and uses the Georgian CTA for the ka locale', () => {
    const { html } = buildNotificationEmail(input, {
      locale: 'ka',
      senderName: 'Downtown',
      recipientName: 'Nino',
    });
    expect(html).toContain('გამარჯობა Nino,');
    expect(html).toContain('ჯავშნის ნახვა');
  });

  it('falls back to a nameless greeting when no recipient name is given', () => {
    const { html } = buildNotificationEmail(input, { locale: 'en', senderName: 'Downtown' });
    expect(html).toContain('Hi,');
    expect(html).not.toContain('Hi ,');
  });

  it('omits the CTA button entirely when there is no action URL', () => {
    const { html, text } = buildNotificationEmail(
      { ...input, actionUrl: null },
      { locale: 'en', senderName: 'Downtown' },
    );
    expect(html).not.toContain('View booking');
    expect(text).not.toContain('View booking');
  });

  it('uses the billing CTA for a billing notification', () => {
    const { html } = buildNotificationEmail(
      {
        category: NotificationCategory.BILLING,
        title: 'Payment received',
        body: 'Your membership renewed.',
        actionUrl: 'https://app.fit/membership',
      },
      { locale: 'en', senderName: 'Downtown' },
    );
    expect(html).toContain('View membership');
  });

  it('escapes HTML in the title, body and sender name', () => {
    const { html } = buildNotificationEmail(
      {
        category: NotificationCategory.SYSTEM,
        title: '<b>Alert</b>',
        body: '<script>x</script>',
        actionUrl: null,
      },
      { locale: 'en', senderName: '<i>Gym</i>' },
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Alert&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;Gym&lt;/i&gt;');
  });

  it('renders a multi-line body as separate paragraphs', () => {
    const { html } = buildNotificationEmail(
      {
        category: NotificationCategory.SYSTEM,
        title: 'Notice',
        body: 'First line\nSecond line',
        actionUrl: null,
      },
      { locale: 'en', senderName: 'Downtown' },
    );
    expect(html).toContain('First line');
    expect(html).toContain('Second line');
  });
});
