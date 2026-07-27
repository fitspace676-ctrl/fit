// @fit/admin — root-relative URLs that survive the app's basePath.
//
// The console is served under a basePath (`/admin` by default, see
// `next.config.mjs`). Next applies it automatically to `<Link>`, router navigations
// and assets — but **not** to a raw `<a href>` or a `fetch`. So a hand-written
// root-relative URL like `/payments/invoices/x/pdf` resolves to the origin root and
// 404s, even though the route exists one prefix down.
//
// That bites exactly where `<Link>` cannot be used: route handlers that stream a file
// (invoice PDFs, report exports), where a plain anchor is what makes the browser
// download rather than client-navigate.

/**
 * The basePath the app is mounted at, injected at build time by `next.config.mjs`.
 * Empty when the console is served from the origin root.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

/**
 * Prefix a root-relative in-app URL with the console's basePath.
 *
 * Use for any URL the browser resolves itself — `<a href>`, `fetch`, `window.open` —
 * pointing at one of this app's own route handlers. Do **not** use it with `<Link>`
 * or `router.push`, which apply the basePath themselves and would double it.
 *
 * @example
 * adminPath('/payments/invoices/abc/pdf') // → '/admin/payments/invoices/abc/pdf'
 */
export function adminPath(path: string): string {
  if (!path.startsWith('/')) {
    // Relative URLs resolve against the current page, which already carries the
    // basePath — prefixing would corrupt them.
    return path;
  }
  return `${BASE_PATH}${path}`;
}
