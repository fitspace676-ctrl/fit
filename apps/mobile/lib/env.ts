// @fit/mobile — build-time configuration.
//
// Expo inlines `process.env.EXPO_PUBLIC_*` into the bundle at build time, but
// **only for literal member expressions** — `process.env.EXPO_PUBLIC_API_URL`
// is replaced, `process.env[name]` is not. Every read below is therefore
// written out longhand, and this module is the only place they are read, so a
// missing variable surfaces once, here, instead of as `undefined` deep inside a
// fetch.
//
// Nothing here is a secret: an `EXPO_PUBLIC_*` value ships inside the `.ipa` /
// `.apk` and can be read out of it. Secrets live on the API.

/**
 * How long a single HTTP attempt may run before it is aborted.
 *
 * The old client had no timeout at all, so a request made on a dead radio (a
 * lift, a gym basement) hung until the OS gave up minutes later, with the
 * spinner still turning. 15s is well above the API's slowest seeded response
 * and well below a user's patience. Applied *per attempt*, so a 401 → refresh →
 * retry sequence gets a fresh budget for each leg rather than sharing one.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Normalise a configured API base URL: trim surrounding whitespace and strip
 * every trailing slash, so `join(base, '/cart')` can never produce `//cart`
 * (which some proxies 301 and React Native then re-issues as a GET, silently
 * dropping a POST body). Exported for the spec — the trailing-slash bug is
 * exactly the kind that only shows up against a real deployment.
 */
export function normaliseApiUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return DEFAULT_API_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

/** Dev fallback: the API's default local port, per `apps/api` `.env.example`. */
const DEFAULT_API_URL = 'http://localhost:3000';

/** Normalise an optional string var: blank / whitespace-only reads as unset. */
function optional(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** The resolved, validated build configuration. */
export interface MobileEnv {
  /** Base URL of `@fit/api`, with no trailing slash. */
  readonly apiUrl: string;
  /**
   * The tenant this build signs into. Sent as `gymSlug` on every password login
   * (D4). The API *ignores* an unknown slug and falls back to the user's primary
   * gym, so the client is the only place a "asked for X, got Y" mismatch can be
   * noticed — see WP-4.
   */
  readonly gymSlug: string | undefined;
  /** Sentry DSN, or `undefined` to disable error reporting. */
  readonly sentryDsn: string | undefined;
  /** Sentry environment tag (`production` | `preview` | `development`). */
  readonly sentryEnvironment: string | undefined;
  /** Per-attempt HTTP timeout in milliseconds. */
  readonly requestTimeoutMs: number;
}

/**
 * The app's configuration, resolved once at module load.
 *
 * Deliberately not lazy: a bad `EXPO_PUBLIC_API_URL` should be visible on the
 * first screen, not on the first request.
 */
export const env: MobileEnv = {
  apiUrl: normaliseApiUrl(process.env.EXPO_PUBLIC_API_URL),
  gymSlug: optional(process.env.EXPO_PUBLIC_GYM_SLUG),
  sentryDsn: optional(process.env.EXPO_PUBLIC_SENTRY_DSN),
  sentryEnvironment: optional(process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT),
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
};
