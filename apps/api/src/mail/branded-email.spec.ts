import { describe, expect, it } from 'vitest';
import { EMAIL_BRAND, escapeHtml, renderBrandedEmail, renderEmailButton } from './branded-email';

describe('EMAIL_BRAND', () => {
  it('carries the Lime Block palette, not the retired violet', () => {
    expect(EMAIL_BRAND.brand).toBe('#E4F26A');
    expect(EMAIL_BRAND.ink).toBe('#131312');
    expect(EMAIL_BRAND.muted).toBe('#6C6C68');
    expect(EMAIL_BRAND.border).toBe('#DCDCDA');
    expect(EMAIL_BRAND.canvas).toBe('#F7F7F6');
    expect(JSON.stringify(EMAIL_BRAND)).not.toContain('#6257E3');
  });
});

describe('renderBrandedEmail', () => {
  const html = renderBrandedEmail({
    senderName: 'Downtown Gym',
    heading: 'Welcome aboard',
    contentHtml: '<p>Hello there</p>',
    footerNote: 'Sent by FormaCore',
  });

  it('renders the wordmark in lime on the charcoal header band', () => {
    expect(html).toContain('Downtown Gym');
    expect(html).toContain(`background:${EMAIL_BRAND.ink}`);
    expect(html).toContain(`color:${EMAIL_BRAND.brand}`);
  });

  it('lays the white card on the warm-grey canvas', () => {
    expect(html).toContain(`background:${EMAIL_BRAND.canvas}`);
    expect(html).toContain(`background:${EMAIL_BRAND.card}`);
  });

  it('sets the heading heavy and in ink, like the portal titles', () => {
    expect(html).toContain('Welcome aboard');
    expect(html).toMatch(/font-weight:800[^>]*>Welcome aboard/);
  });

  it('renders content and the muted footer note', () => {
    expect(html).toContain('<p>Hello there</p>');
    expect(html).toContain('Sent by FormaCore');
    expect(html).toContain(`color:${EMAIL_BRAND.muted}`);
  });

  it('omits the footer block when no note is given', () => {
    const bare = renderBrandedEmail({
      senderName: 'Gym',
      heading: 'Hi',
      contentHtml: '<p>x</p>',
    });
    expect(bare).not.toContain('Sent by');
  });

  it('contains no trace of the retired violet', () => {
    expect(html).not.toContain('#6257E3');
  });
});

describe('renderEmailButton', () => {
  it('renders a lime button with ink text (white on lime is unreadable)', () => {
    const button = renderEmailButton('https://app.fit/go', 'Open portal');
    expect(button).toContain('href="https://app.fit/go"');
    expect(button).toContain('Open portal');
    expect(button).toContain(`background:${EMAIL_BRAND.brand}`);
    expect(button).toContain(`color:${EMAIL_BRAND.ink}`);
    expect(button).not.toContain('color:#FFFFFF');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that would break out of a text node', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});
