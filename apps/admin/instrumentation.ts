import * as Sentry from '@sentry/nextjs';

/**
 * Server/edge Sentry bootstrap. Next.js calls `register()` once per runtime
 * before any request is handled. No-op when `SENTRY_DSN` is unset, so local dev
 * and preview builds run without an account.
 */
export function register(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT,
      tracesSampleRate: 0.1,
    });
  }
}

/** Forwards errors thrown in Server Components / route handlers to Sentry. */
export const onRequestError = Sentry.captureRequestError;
