import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));
import {
  EMAIL_BRAND,
  escapeHtml,
  renderBrandedEmail,
  renderEmailButton,
  renderEmailLinkFallback,
  renderEmailPanel,
  renderEmailParagraphs,
  renderEmailRows,
  renderEmailTextLink,
} from './branded-email';

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

  it('renders the lime block mark with the sender initial beside the wordmark on the charcoal band', () => {
    expect(html).toContain('Downtown Gym');
    expect(html).toContain(`background:${EMAIL_BRAND.ink}`);
    expect(html).toMatch(/background:#E4F26A;color:#131312;[^>]*>D</);
  });

  it('falls back to the FormaCore "F" when the sender name has no letter', () => {
    const bare = renderBrandedEmail({ senderName: '&amp;', heading: 'Hi', contentHtml: 'x' });
    expect(bare).toMatch(/background:#E4F26A;color:#131312;[^>]*>F</);
  });

  it('renders the tracked uppercase eyebrow only when given', () => {
    expect(html).not.toContain('text-transform:uppercase');
    const withEyebrow = renderBrandedEmail({
      senderName: 'Gym',
      heading: 'Hi',
      contentHtml: 'x',
      eyebrow: 'Password reset',
    });
    expect(withEyebrow).toMatch(/text-transform:uppercase[^>]*>Password reset</);
  });

  it('hides the preheader from the visible body but keeps it for inbox previews', () => {
    const withPreheader = renderBrandedEmail({
      senderName: 'Gym',
      heading: 'Hi',
      contentHtml: 'x',
      preheader: 'Your link expires in 1 hour.',
    });
    expect(withPreheader).toMatch(/display:none[^>]*>Your link expires in 1 hour\./);
    expect(html).not.toContain('mso-hide:all;">');
  });

  it('signs the footer with the FormaCore mark under the card, in the mail language', () => {
    expect(html).toContain('FormaCore');
    expect(html).toContain('Management platform');
    const georgian = renderBrandedEmail({
      senderName: 'Gym',
      heading: 'Hi',
      contentHtml: 'x',
      locale: 'ka',
    });
    expect(georgian).toContain('მართვის პლატფორმა');
    expect(georgian).not.toContain('Management platform');
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

describe('renderBrandedEmail as a document', () => {
  afterEach(() => {
    for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  });

  it('is a complete HTML document declaring both colour schemes and a dark palette', () => {
    const html = renderBrandedEmail({
      senderName: 'Gym',
      heading: 'Hi',
      contentHtml: 'x',
      locale: 'ka',
    });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="ka"');
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).toContain('<meta name="supported-color-schemes" content="light dark" />');
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toContain('.em-card{background:#1B1B19 !important;');
    expect(html).toContain(
      '.em-button,.em-button a{background:#E4F26A !important;color:#131312 !important;}',
    );
    expect(html.endsWith('</body></html>')).toBe(true);
  });

  it('draws the mark in CSS when no web URL is configured', () => {
    const html = renderBrandedEmail({ senderName: 'Gym', heading: 'Hi', contentHtml: 'x' });
    expect(html).not.toContain('<img');
    expect(html).toMatch(/background:#E4F26A;color:#131312;[^>]*>G</);
  });

  it('serves the mark as a hosted PNG the Gmail app cannot recolour when WEB_URL is set', () => {
    mockEnv.WEB_URL = 'https://app.fit/';
    const html = renderBrandedEmail({ senderName: 'ირონვორქსი', heading: 'Hi', contentHtml: 'x' });
    expect(html).toContain(
      '<img src="https://app.fit/email-marks/u10d8.png" width="40" height="40" alt="ი"',
    );
    // The footer signs with the FormaCore "F" from the same set.
    expect(html).toContain('src="https://app.fit/email-marks/u0046.png" width="14"');
  });

  it('puts the FormaCore dark-ground wordmark in the band when the platform is the sender', () => {
    mockEnv.WEB_URL = 'https://app.fit';
    const html = renderBrandedEmail({ senderName: 'FormaCore', heading: 'Hi', contentHtml: 'x' });
    expect(html).toContain('<img src="https://app.fit/logodark.png" width="150" alt="FormaCore"');
    expect(html).not.toContain('/email-marks/u0046.png" width="40"');
    expect(html).not.toContain('logolight.png');
  });

  it('keeps the initial mark and name in the band for a gym sender', () => {
    mockEnv.WEB_URL = 'https://app.fit';
    const html = renderBrandedEmail({ senderName: 'Downtown', heading: 'Hi', contentHtml: 'x' });
    expect(html).not.toContain('logodark.png');
    expect(html).toContain('/email-marks/u0044.png" width="40"');
    expect(html).toContain('>Downtown</div>');
  });

  it('falls back to the mark and name for the platform without a web URL', () => {
    const html = renderBrandedEmail({ senderName: 'FormaCore', heading: 'Hi', contentHtml: 'x' });
    expect(html).not.toContain('logodark.png');
    expect(html).toMatch(/background:#E4F26A;color:#131312;[^>]*>F</);
  });

  it('falls back to the FormaCore F image for an initial outside the glyph set', () => {
    mockEnv.WEB_URL = 'https://app.fit';
    const html = renderBrandedEmail({ senderName: 'Ünique', heading: 'Hi', contentHtml: 'x' });
    expect(html).toContain('/email-marks/u0046.png" width="40"');
  });
});

describe('Gmail dark-mode holding', () => {
  const html = renderBrandedEmail({ senderName: 'Gym', heading: 'Hi', contentHtml: '<p>x</p>' });

  it('pins the band and the card body with flat gradients Gmail cannot invert', () => {
    expect(html).toContain('background:#131312;background-image:linear-gradient(#131312,#131312);');
    expect(html).toContain('background:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);');
  });

  it('wraps the band and body in two difference layers painted in their ground colour', () => {
    const inkLayer = 'class="em-hold" style="background:#131312;mix-blend-mode:difference;"';
    const cardLayer = 'class="em-hold" style="background:#FFFFFF;mix-blend-mode:difference;"';
    expect(html.split(inkLayer)).toHaveLength(3);
    expect(html.split(cardLayer)).toHaveLength(3);
    expect(html).toMatch(
      new RegExp(`<div ${cardLayer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}><div [^>]*><h1`),
    );
  });

  it('switches the holding layers off in the designed dark palette', () => {
    expect(html).toContain(
      '.em-hold{mix-blend-mode:normal !important;background:transparent !important;}',
    );
    expect(html).toContain('.em-card-body{background:#1B1B19 !important;}');
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

describe('renderEmailLinkFallback', () => {
  it('shows the escaped URL as a readable lime-ink link', () => {
    const fallback = renderEmailLinkFallback('https://app.fit/go?token=a&b=c');
    expect(renderEmailLinkFallback('https://app.fit/go', 'ka')).toContain('დააკოპირეთ');
    expect(fallback).toContain('href="https://app.fit/go?token=a&b=c"');
    expect(fallback).toContain('https://app.fit/go?token=a&amp;b=c<');
    expect(fallback).toContain(`color:${EMAIL_BRAND.link}`);
    expect(fallback).toContain('Or copy this link');
  });
});

describe('renderEmailTextLink', () => {
  it('never puts the block lime on white; text links use the lime-as-ink tone', () => {
    const link = renderEmailTextLink('https://app.fit/reports', 'View reports');
    expect(link).toContain(`color:${EMAIL_BRAND.link}`);
    expect(link).not.toContain(`color:${EMAIL_BRAND.brand}`);
  });
});

describe('renderEmailPanel', () => {
  it('wraps the note in a canvas-grey bordered panel', () => {
    const panel = renderEmailPanel('Expires soon');
    expect(panel).toContain('Expires soon');
    expect(panel).toContain(`background:${EMAIL_BRAND.canvas}`);
    expect(panel).toContain(`border:1px solid ${EMAIL_BRAND.border}`);
  });
});

describe('renderEmailRows', () => {
  it('escapes labels and values and marks the emphasised and danger rows', () => {
    const rows = renderEmailRows([
      { label: 'Revenue', value: '$1,200', emphasis: true },
      { label: 'Low <stock>', value: '3', danger: true },
    ]);
    expect(rows).toContain('Revenue');
    expect(rows).toContain('Low &lt;stock&gt;');
    expect(rows).toMatch(/font-weight:700;color:#131312[^>]*>\$1,200</);
    expect(rows).toMatch(/font-weight:700;color:#C2410C[^>]*>3</);
  });
});

describe('renderEmailParagraphs', () => {
  it('splits on blank lines, keeps single breaks, and escapes the text', () => {
    const html = renderEmailParagraphs('Hi <Sam>,\n\nLine one\nLine two\n\n\nBye');
    expect(html).toBe(
      '<p style="margin:0 0 14px;font-size:15px;line-height:24px;">Hi &lt;Sam&gt;,</p>' +
        '<p style="margin:0 0 14px;font-size:15px;line-height:24px;">Line one<br />Line two</p>' +
        '<p style="margin:0 0 14px;font-size:15px;line-height:24px;">Bye</p>',
    );
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that would break out of a text node', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});
