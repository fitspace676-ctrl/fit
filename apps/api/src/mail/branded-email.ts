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
 * The formacore brand tokens the transactional emails render with (mirroring the
 * admin/member Tailwind theme): the brand violet, the ink text ramp, the hairline
 * border, the tinted canvas, and the sans stack. Kept inline (email clients strip
 * `<style>` blocks and don't load web fonts) so the shell renders consistently.
 */
export const EMAIL_BRAND = {
  brand: '#6257E3',
  ink: '#151926',
  muted: '#646D82',
  border: '#D8DCE4',
  canvas: '#F6F7F9',
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
 * Wrap an email body in the shared branded shell (the formacore look, T4.11): a
 * centered white card on the tinted canvas, a brand-violet `senderName` wordmark
 * above a heading, the caller's `contentHtml`, and an optional muted footer note.
 * Table-based with fully inline styles so it survives the CSS stripping and lack
 * of fl/grid layout in email clients. The caller is responsible for escaping any
 * user-supplied text it interpolates into `contentHtml`, `senderName`, `heading`.
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
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;margin:0 auto;background:${EMAIL_BRAND.card};border:1px solid ${EMAIL_BRAND.border};border-radius:16px;">` +
    `<tr><td style="padding:28px 28px 20px;">` +
    `<div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${EMAIL_BRAND.brand};">${senderName}</div>` +
    `<h1 style="margin:6px 0 0;font-size:20px;line-height:28px;font-weight:700;color:${EMAIL_BRAND.ink};">${heading}</h1>` +
    `<div style="margin-top:16px;font-size:14px;line-height:22px;color:${EMAIL_BRAND.ink};">${contentHtml}</div>` +
    footerHtml +
    `</td></tr>` +
    `</table>` +
    `</div>`
  );
}

/**
 * Render a call-to-action button as an inline-styled anchor in the brand violet.
 * Email clients don't honour `<button>` styling, so a padded, rounded `<a>` is the
 * portable primitive. The caller escapes `label`; `url` is a trusted absolute URL.
 */
export function renderEmailButton(url: string, label: string): string {
  return (
    `<p style="margin:20px 0 0;">` +
    `<a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:10px;` +
    `background:${EMAIL_BRAND.brand};color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">${label}</a>` +
    `</p>`
  );
}
