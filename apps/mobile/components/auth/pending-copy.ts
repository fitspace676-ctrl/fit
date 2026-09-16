// ===========================================================================
// TODO(i18n) — COPY THAT DOES NOT EXIST YET. THIS FILE IS A DEBT, NOT A PATTERN.
// ===========================================================================
//
// Plan §6 requires an **offline** state on every screen, and WP-16 found that
// there are ZERO `offline` keys anywhere in either catalogue — the definition of
// done has a state with no copy behind it. The same is true of the 429
// cool-down: `register`, `forgot-password` and `reset-password` sit behind
// `authStrict` (5 requests / 900s), the API returns `Retry-After`, and no
// namespace carries a sentence to render beside a countdown.
//
// The instruction for this stage was explicit: build the branch STRUCTURALLY and
// mark it, rather than invent Georgian copy. So:
//
//   * these strings are English placeholders and are **not** translated;
//   * they live in ONE module, so closing the gap is a delete plus five `t()`
//     calls rather than a hunt through five screens;
//   * every call site carries its own `TODO(i18n)` comment naming the key it is
//     waiting for, so the debt is visible where it is paid, not only here.
//
// THE KEYS OWED (namespace chosen to match where the screens already read):
//
//   | key                        | English placeholder                          |
//   |----------------------------|----------------------------------------------|
//   | `common.offline.title`     | You're offline                               |
//   | `common.offline.body`      | Check your connection and try again.         |
//   | `auth.errors.rateLimited`  | Too many attempts. Try again in a moment.    |
//   | `auth.errors.retryIn`      | Try again in {seconds}s                      |
//   | `auth.errors.retryInOne`   | Try again in 1 second   (plural sibling)     |
//   | `auth.errors.retryInOther` | Try again in {count} seconds (plural sibling)|
//
// The last pair is the `…One` / `…Other` shape `plural()` selects on. Once the
// keys land, `retryIn` becomes `plural('auth.errors.retryIn', seconds)` and the
// bare `{seconds}s` form below goes away — Georgian has one plural class, so the
// sibling pair matters for English, not for `ka`.
//
// DELETE THIS FILE when WP-16's follow-up lands.

/** The offline advisory, and the 429 cool-down copy. English-only, on purpose. */
export const PENDING_COPY = {
  /** TODO(i18n) `common.offline.title` */
  offlineTitle: "You're offline",
  /** TODO(i18n) `common.offline.body` */
  offlineBody: 'Check your connection and try again.',
  /** TODO(i18n) `auth.errors.rateLimited` */
  rateLimited: 'Too many attempts. Try again in a moment.',
} as const;

/**
 * "Try again in 42s".
 *
 * TODO(i18n) `auth.errors.retryInOne` / `auth.errors.retryInOther`, via
 * `plural()`. Interpolating a number into an English template here is the exact
 * thing the typed catalogue exists to prevent; it is written as a function so
 * the replacement is a one-line swap at every call site.
 */
export function pendingRetryIn(seconds: number): string {
  return `Try again in ${String(seconds)}s`;
}
