/**
 * Shared transactional-email presentation primitives (the formacore look).
 *
 * Extracted so every transactional email — the auth/receipt/digest mails in
 * {@link EmailService} and the notification-pipeline mails (T8.2) — renders in one
 * branded shell instead of each re-implementing the markup. Kept dependency-free
 * (pure string builders) so it is trivially unit-testable and safe to import from
 * anywhere in the API.
 */

/**
 * The formacore "Lime Block" tokens the transactional emails render with,
 * mirroring the member portal's sign-in screen: a warm charcoal ink ramp, one
 * lime, and nothing else chromatic. `brand` is the lime block colour; it only
 * ever appears on the charcoal header band (as the wordmark) and as a button
 * fill, because lime text on white is ~1.3:1 and unreadable. Text on the lime
 * is always `ink` — white on lime is ~1.5:1, so the button label is ink too.
 * Kept inline (email clients strip `<style>` blocks and don't load web fonts)
 * so the shell renders consistently.
 */
export const EMAIL_BRAND = {
  brand: '#E4F26A',
  ink: '#131312',
  body: '#3E3E3B',
  muted: '#6C6C68',
  border: '#DCDCDA',
  canvas: '#F7F7F6',
  card: '#FFFFFF',
  font: "'Manrope', 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;

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
 * Wrap an email body in the shared branded shell (the formacore Lime Block
 * look): a charcoal header band carrying the `senderName` wordmark in lime —
 * the same always-dark brand panel the sign-in screen leads with — above a
 * white card on the warm-grey canvas, with a heavy, tightly-tracked heading
 * like the portal titles. Table-based with fully inline styles so it survives
 * the CSS stripping and lack of flex/grid layout in email clients. The caller
 * is responsible for escaping any user-supplied text it interpolates into
 * `contentHtml`, `senderName`, `heading`.
 */
export function renderBrandedEmail(options: {
  senderName: string;
  heading: string;
  contentHtml: string;
  footerNote?: string;
}): string {
  const { senderName, heading, contentHtml, footerNote } = options;
  const footerHtml = footerNote
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:${EMAIL_BRAND.muted};">${footerNote}</p>`
    : '';
  return (
    `<div style="margin:0;padding:24px;background:${EMAIL_BRAND.canvas};font-family:${EMAIL_BRAND.font};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;margin:0 auto;background:${EMAIL_BRAND.card};border:1px solid ${EMAIL_BRAND.border};border-radius:16px;overflow:hidden;">` +
    `<tr><td style="padding:20px 28px;background:${EMAIL_BRAND.ink};border-radius:15px 15px 0 0;">` +
    `<div style="font-size:16px;font-weight:800;letter-spacing:-0.01em;color:${EMAIL_BRAND.brand};">${senderName}</div>` +
    `</td></tr>` +
    `<tr><td style="padding:24px 28px 28px;">` +
    `<h1 style="margin:0;font-size:22px;line-height:28px;letter-spacing:-0.02em;color:${EMAIL_BRAND.ink};font-weight:800;">${heading}</h1>` +
    `<div style="margin-top:14px;font-size:14px;line-height:22px;color:${EMAIL_BRAND.body};">${contentHtml}</div>` +
    footerHtml +
    `</td></tr>` +
    `</table>` +
    `</div>`
  );
}

/**
 * Render a call-to-action button as an inline-styled anchor: the lime block
 * with ink type, exactly like the portal's primary action. Email clients don't
 * honour `<button>` styling, so a padded, rounded `<a>` is the portable
 * primitive. The caller escapes `label`; `url` is a trusted absolute URL.
 */
export function renderEmailButton(url: string, label: string): string {
  return (
    `<p style="margin:20px 0 0;">` +
    `<a href="${url}" style="display:inline-block;padding:11px 20px;border-radius:10px;` +
    `background:${EMAIL_BRAND.brand};color:${EMAIL_BRAND.ink};font-size:14px;font-weight:700;text-decoration:none;">${label}</a>` +
    `</p>`
  );
}
