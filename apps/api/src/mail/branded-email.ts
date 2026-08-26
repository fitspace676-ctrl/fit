/**
 * Shared transactional-email presentation primitives (the formacore look).
 *
 * Extracted so every transactional email (the auth/receipt/digest mails in
 * {@link EmailService} and the notification-pipeline mails, T8.2) renders in one
 * branded shell instead of each re-implementing the markup. Kept dependency-free
 * (pure string builders) so it is trivially unit-testable and safe to import from
 * anywhere in the API.
 *
 * Everything here is table-based with fully inline styles: email clients strip
 * `<style>` blocks, ignore flex/grid, and Outlook still lays out with the Word
 * engine. `border-radius` and `max-width` are progressive enhancement - a client
 * that drops them still gets a readable, correctly ordered email.
 */

import { env } from '../config/env';
import { DEFAULT_EMAIL_LOCALE, type EmailLocale } from './email-locale';
import { emailStrings } from './email-strings';

/**
 * The formacore "Lime Block" tokens the transactional emails render with,
 * mirroring the member portal's sign-in screen: a warm charcoal ink ramp, one
 * lime, and nothing else chromatic. `brand` is the lime block colour; it only
 * ever appears as a fill (the header mark, the button) because lime text on
 * white is ~1.3:1 and unreadable. Text on the lime is always `ink` - white on
 * lime is ~1.5:1, so the button label is ink too. `link` is the lime *as ink*
 * (brand-700, the portal's text-accent token on light) for inline text links,
 * which is the only way lime can sit on the white card and still be read.
 * Kept inline (email clients strip `<style>` blocks and don't load web fonts)
 * so the shell renders consistently.
 */
export const EMAIL_BRAND = {
  brand: '#E4F26A',
  link: '#63701D',
  ink: '#131312',
  body: '#3E3E3B',
  muted: '#6C6C68',
  border: '#DCDCDA',
  canvas: '#F7F7F6',
  card: '#FFFFFF',
  danger: '#C2410C',
  font: "'Manrope', 'Noto Sans Georgian', 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;

/** The card's outer width. 600px is the widest layout every major client shows
 *  without horizontal scrolling on desktop; on phones the table shrinks to fit. */
const CARD_WIDTH = 600;

/** Escape the few characters that would break out of an HTML text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The single letter the header mark carries: the sender's first letter, upper-cased,
 * so a gym's emails open with its own initial in the lime block the way the
 * FormaCore "F" mark does (Latin upper-cased, Georgian as written). Falls back
 * to "F" for a blank or symbol-only name.
 * `senderName` arrives already HTML-escaped, so an entity such as `&amp;` is
 * skipped rather than read as its first character.
 */
function senderInitial(senderName: string): string {
  const match = senderName.replace(/&[^;]+;/g, ' ').match(/\p{L}|\p{N}/u);
  const initial = match?.[0] ?? 'F';
  // Only Latin is upper-cased: Georgian Mkhedruli is caseless in practice, and
  // `toUpperCase()` would turn it into Mtavruli, which the mark set does not carry.
  return /[a-z]/.test(initial) ? initial.toUpperCase() : initial;
}

/**
 * The pre-rendered lime marks the web app serves at `/email-marks/u<hex>.png`:
 * Latin capitals, digits and the Georgian alphabet, generated from the same
 * Noto Sans Georgian ExtraBold the invoices use. A letter outside the set falls
 * back to the FormaCore "F".
 */
function markImagePath(initial: string): string {
  const code = initial.codePointAt(0) ?? 0x46;
  const known =
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x10d0 && code <= 0x10f0);
  return `/email-marks/u${(known ? code : 0x46).toString(16).padStart(4, '0')}.png`;
}

/**
 * The header mark: the sender's initial on the lime block. Rendered as a hosted
 * PNG when the web app's URL is configured, because an image is the one thing
 * the Gmail app's dark mode never recolours (it inverts every text and
 * background colour, and ignores `color-scheme`), so the brand lime survives
 * there. Without a base URL (local dev, tests) the same block is drawn in CSS.
 */
function renderMark(senderName: string, size: number, radius: number): string {
  const B = EMAIL_BRAND;
  const initial = senderInitial(senderName);
  const base = env.WEB_URL?.replace(/\/+$/, '');
  if (base) {
    return `<img src="${base}${markImagePath(initial)}" width="${size}" height="${size}" alt="${initial}" style="display:block;width:${size}px;height:${size}px;border:0;border-radius:${radius}px;" />`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:${radius}px;background:${B.brand};color:${B.ink};font-size:${Math.round(size / 2)}px;line-height:${size}px;font-weight:800;text-align:center;letter-spacing:-0.02em;">${initial}</div>`;
}

/** The platform's own name; the one sender whose band carries the logo. */
const PLATFORM_SENDER = 'FormaCore';

/**
 * What the charcoal header band carries: the sender's initial on the lime block
 * beside their name for a gym, and the FormaCore dark-ground wordmark (white
 * "Forma", green "Core", the same PNG the portal serves) when the platform
 * itself is the sender and the web app's URL is known. Without a base URL the
 * platform falls back to the mark and name too, rather than a broken image.
 * `imageOnly` tells the shell the band carries no text, so it may pin the band
 * dark for the Gmail app (see the gradient note in {@link renderBrandedEmail}).
 */
function renderBandContent(senderName: string): { html: string; imageOnly: boolean } {
  const B = EMAIL_BRAND;
  const base = env.WEB_URL?.replace(/\/+$/, '');
  if (senderName === PLATFORM_SENDER && base) {
    return {
      imageOnly: true,
      html: `<img src="${base}/logodark.png" width="150" alt="${PLATFORM_SENDER}" style="display:block;width:150px;height:auto;border:0;" />`,
    };
  }
  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr>` +
    `<td style="width:40px;vertical-align:middle;">${renderMark(senderName, 40, 12)}</td>` +
    `<td style="padding-left:14px;vertical-align:middle;">` +
    `<div style="font-size:17px;line-height:22px;font-weight:800;letter-spacing:-0.01em;color:${B.card};">${senderName}</div>` +
    `</td>` +
    `</tr></table>`;
  return { html, imageOnly: false };
}

/**
 * The dark-mode palette, as a `<style>` block clients that honour
 * `prefers-color-scheme` (Apple Mail, iOS Mail, Outlook) apply on top of the
 * inline light styles. It is the portal's dark theme rather than an inversion:
 * a near-black canvas, a charcoal card, light ink, and the same lime with ink
 * type on the button, so the brand reads the same on both grounds. Every rule
 * carries `!important` because it must beat the inline style it overrides. The
 * `[data-ogsc]` / `[data-ogsb]` twins are Outlook.com's dark-mode hooks. The
 * Gmail app ignores all of this and recolours on its own; the image mark is
 * what carries the brand there.
 */
const DARK_MODE_CSS =
  `:root{color-scheme:light dark;supported-color-schemes:light dark;}` +
  `@media (prefers-color-scheme:dark){` +
  `.em-canvas{background:#0D0D0C !important;}` +
  `.em-card{background:#1B1B19 !important;border-color:#2E2E2A !important;}` +
  `.em-band{background:#131312 !important;border-bottom:1px solid #2E2E2A;}` +
  `.em-ink,.em-ink *{color:#F2F2EF !important;}` +
  `.em-body{color:#CFCFC9 !important;}` +
  `.em-muted{color:#9C9C96 !important;}` +
  `.em-link{color:#E4F26A !important;}` +
  `.em-panel{background:#131312 !important;border-color:#2E2E2A !important;color:#CFCFC9 !important;}` +
  `.em-button,.em-button a{background:#E4F26A !important;color:#131312 !important;}` +
  `td,th{border-color:#2E2E2A !important;}` +
  `}` +
  `[data-ogsc] .em-ink,[data-ogsc] .em-ink *{color:#F2F2EF !important;}` +
  `[data-ogsc] .em-body{color:#CFCFC9 !important;}` +
  `[data-ogsc] .em-muted{color:#9C9C96 !important;}` +
  `[data-ogsb] .em-canvas{background:#0D0D0C !important;}` +
  `[data-ogsb] .em-card{background:#1B1B19 !important;}` +
  `[data-ogsb] .em-button,[data-ogsb] .em-button a{background:#E4F26A !important;color:#131312 !important;}`;

/**
 * Wrap an email body in the shared branded shell (the formacore Lime Block
 * look): a charcoal header band carrying a lime block mark with the sender's
 * initial beside the `senderName` wordmark, the same always-dark brand panel
 * the sign-in screen leads with, above a white card on the warm-grey canvas,
 * with an optional tracked uppercase `eyebrow`, a heavy tightly-tracked heading
 * like the portal titles, and a footer below the card that signs the mail and
 * names the platform. When the platform itself is the sender, the band carries
 * the FormaCore wordmark (the dark-ground logo) instead of the initial mark and
 * name, provided the web app's URL is configured. The caller is responsible for escaping any user-supplied
 * text it interpolates into `contentHtml`, `senderName`, `heading`, `eyebrow`
 * and `footerNote`.
 *
 * The result is a complete HTML document: the `<head>` declares
 * `color-scheme` so mail clients that support dark mode use the palette in
 * {@link DARK_MODE_CSS} instead of inverting the inline colours on their own.
 *
 * `preheader` is the sentence inbox lists show after the subject; it is rendered
 * invisibly at the top of the body so clients that build the preview from the
 * first text they find pick it up instead of the greeting. It is always plain
 * text, so it is escaped here rather than by the caller.
 */
export function renderBrandedEmail(options: {
  senderName: string;
  heading: string;
  contentHtml: string;
  eyebrow?: string;
  footerNote?: string;
  preheader?: string;
  /** The language of the fixed chrome (the footer tagline) and the document. Defaults to English. */
  locale?: EmailLocale;
}): string {
  const { senderName, heading, contentHtml, eyebrow, footerNote, preheader } = options;
  const B = EMAIL_BRAND;
  const locale = options.locale ?? DEFAULT_EMAIL_LOCALE;
  const strings = emailStrings(locale);
  // The Gmail app's dark mode inverts every colour except images and
  // background-image gradients. A band that holds only the logo image is pinned
  // charcoal with a flat gradient so the white wordmark keeps its ground; a band
  // with the gym's name is left alone, because its text would invert to black on
  // the pinned dark ground and vanish.
  const band = renderBandContent(senderName);

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;mso-hide:all;">${escapeHtml(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(24)}</div>`
    : '';

  const eyebrowHtml = eyebrow
    ? `<div class="em-muted" style="margin:0 0 10px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${B.muted};">${eyebrow}</div>`
    : '';

  const footerNoteHtml = footerNote
    ? `<p class="em-muted" style="margin:0 0 8px;font-size:12px;line-height:18px;color:${B.muted};">${footerNote}</p>`
    : '';

  return (
    `<!DOCTYPE html>` +
    `<html lang="${locale}" xmlns="http://www.w3.org/1999/xhtml">` +
    `<head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="color-scheme" content="light dark" />` +
    `<meta name="supported-color-schemes" content="light dark" />` +
    `<title>${heading}</title>` +
    `<style>${DARK_MODE_CSS}</style>` +
    `</head>` +
    `<body class="em-canvas" style="margin:0;padding:0;background:${B.canvas};">` +
    `<div class="em-canvas" style="margin:0;padding:32px 16px;background:${B.canvas};font-family:${B.font};-webkit-text-size-adjust:100%;">` +
    preheaderHtml +
    // The card.
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="em-card" style="width:100%;max-width:${CARD_WIDTH}px;margin:0 auto;border-collapse:separate;background:${B.card};border:1px solid ${B.border};border-radius:20px;overflow:hidden;">` +
    // Header band: lime mark + wordmark on charcoal.
    `<tr><td class="em-band" style="padding:22px 32px;background:${B.ink};${band.imageOnly ? `background-image:linear-gradient(${B.ink},${B.ink});` : ''}border-radius:19px 19px 0 0;">` +
    band.html +
    `</td></tr>` +
    // Body.
    `<tr><td style="padding:36px 32px 32px;">` +
    eyebrowHtml +
    `<h1 class="em-ink" style="margin:0;font-size:26px;line-height:32px;letter-spacing:-0.02em;color:${B.ink};font-weight:800;">${heading}</h1>` +
    `<div class="em-body" style="margin-top:18px;font-size:15px;line-height:24px;color:${B.body};">${contentHtml}</div>` +
    `</td></tr>` +
    `</table>` +
    // Footer, outside the card.
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:${CARD_WIDTH}px;margin:0 auto;border-collapse:collapse;">` +
    `<tr><td style="padding:24px 32px 8px;text-align:center;">` +
    footerNoteHtml +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:collapse;"><tr>` +
    `<td style="vertical-align:middle;">${renderMark('FormaCore', 14, 4)}</td>` +
    `<td style="padding-left:6px;vertical-align:middle;font-size:12px;line-height:18px;">` +
    `<span class="em-ink" style="font-weight:700;color:${B.ink};">FormaCore</span>` +
    `<span class="em-muted" style="color:${B.muted};">&nbsp;&middot;&nbsp;${strings.shell.platformTagline}</span>` +
    `</td></tr></table>` +
    `</td></tr>` +
    `</table>` +
    `</div>` +
    `</body></html>`
  );
}

/**
 * Render a call-to-action button as a table-wrapped, inline-styled anchor: the
 * lime block with ink type, exactly like the portal's primary action. Email
 * clients don't honour `<button>` styling and Outlook ignores padding on `<a>`,
 * so the colour and rounding live on the cell and the anchor fills it. The
 * caller escapes `label`; `url` is a trusted absolute URL.
 */
export function renderEmailButton(url: string, label: string): string {
  const B = EMAIL_BRAND;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border-collapse:separate;">` +
    `<tr><td class="em-button" style="border-radius:12px;background:${B.brand};">` +
    `<a href="${url}" style="display:inline-block;padding:14px 26px;border-radius:12px;background:${B.brand};color:${B.ink};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;">${label}</a>` +
    `</td></tr></table>`
  );
}

/**
 * The plain-URL fallback that belongs under every button: a client that blocks
 * styled links, a screen reader, or someone forwarding the mail can still reach
 * the page. `url` is a trusted absolute URL; it is escaped for display because a
 * token can carry `&`. The label comes from the locale's copy set.
 */
export function renderEmailLinkFallback(
  url: string,
  locale: EmailLocale = DEFAULT_EMAIL_LOCALE,
): string {
  const B = EMAIL_BRAND;
  const label = emailStrings(locale).shell.copyLink;
  const shown = escapeHtml(url);
  return (
    `<p class="em-muted" style="margin:16px 0 0;font-size:12px;line-height:18px;color:${B.muted};">${label}<br />` +
    `<a href="${url}" class="em-link" style="color:${B.link};text-decoration:underline;word-break:break-all;">${shown}</a>` +
    `</p>`
  );
}

/**
 * An inline text link in the lime-as-ink colour with an underline, for the
 * secondary "view full reports"-style links that sit in running text. The
 * caller escapes `label`; `url` is a trusted absolute URL.
 */
export function renderEmailTextLink(url: string, label: string): string {
  return `<a href="${url}" class="em-link" style="color:${EMAIL_BRAND.link};font-weight:700;text-decoration:underline;">${label}</a>`;
}

/**
 * A quiet panel on the canvas grey for the one fact the reader must not miss:
 * how long a link lasts, what to do if they did not ask for it. The caller
 * escapes what it puts in `contentHtml`.
 */
export function renderEmailPanel(contentHtml: string): string {
  const B = EMAIL_BRAND;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0 0;border-collapse:separate;">` +
    `<tr><td class="em-panel" style="padding:14px 18px;border-radius:12px;background:${B.canvas};border:1px solid ${B.border};font-size:13px;line-height:20px;color:${B.body};">${contentHtml}</td></tr>` +
    `</table>`
  );
}

/** One line of a label/value list (a daily summary metric, a lead's phone). */
export interface EmailRow {
  label: string;
  value: string;
  /** Render the value heavy and in ink - the total, the headline figure. */
  emphasis?: boolean;
  /** Render the value in the warning colour - a zero stock, a failed payment. */
  danger?: boolean;
}

/**
 * A label/value list as a ruled two-column table: muted labels left, values
 * right-aligned in ink. Labels and values are escaped here, so callers pass raw
 * strings.
 */
export function renderEmailRows(rows: readonly EmailRow[]): string {
  const B = EMAIL_BRAND;
  const body = rows
    .map((row, index) => {
      const top = index === 0 ? '' : `border-top:1px solid ${B.border};`;
      const valueColor = row.danger ? B.danger : B.ink;
      const valueWeight = row.emphasis || row.danger ? 700 : 600;
      return (
        `<tr>` +
        `<td class="em-muted" style="padding:10px 0;${top}font-size:14px;line-height:20px;color:${B.muted};vertical-align:top;">${escapeHtml(row.label)}</td>` +
        `<td class="${row.danger ? '' : 'em-ink'}" style="padding:10px 0 10px 16px;${top}font-size:14px;line-height:20px;text-align:right;font-weight:${valueWeight};color:${valueColor};vertical-align:top;">${escapeHtml(row.value)}</td>` +
        `</tr>`
      );
    })
    .join('');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0 0;border-collapse:collapse;">` +
    `<tbody>${body}</tbody></table>`
  );
}

/** A column header cell for a data table (digest, low stock): small, tracked, muted. */
export function renderEmailTh(label: string, align: 'left' | 'right'): string {
  const B = EMAIL_BRAND;
  return `<th class="em-muted" style="padding:0 8px 8px;text-align:${align};font-size:11px;line-height:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${B.muted};border-bottom:1px solid ${B.border};">${label}</th>`;
}

/**
 * A body cell for a data table. `html` is already escaped by the caller; `style`
 * appends to (and can override) the default cell styling.
 */
export function renderEmailTd(html: string, align: 'left' | 'right', style = ''): string {
  const B = EMAIL_BRAND;
  const tone = style.includes(`color:${B.muted}`)
    ? 'em-muted'
    : style.includes('color:')
      ? ''
      : 'em-ink';
  return `<td class="${tone}" style="padding:9px 8px;text-align:${align};font-size:13px;line-height:18px;color:${B.ink};border-bottom:1px solid ${B.border};${style}">${html}</td>`;
}

/**
 * Turn plain text into paragraphs: blank lines separate `<p>`s, single line
 * breaks become `<br />`. This is how every plain-text body staff write (a
 * settings template, a one-off member email, an automation message, an invoice
 * note) becomes HTML, so no one has to write markup to change a sentence. The
 * text is escaped here.
 */
export function renderEmailParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:24px;">${escapeHtml(part).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}
