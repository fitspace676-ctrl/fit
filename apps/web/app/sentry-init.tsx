'use client';

import * as Sentry from '@sentry/nextjs';

// Browser SDK bootstrap. Runs once when this client module is first evaluated
// (guarded against fast-refresh / re-render double-init). No-op without a public
// DSN, so the bundle is inert until one is configured. Web is on Next 15.1,
// which predates `instrumentation-client.ts`, so initialise from a layout-level
// client component instead.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn && !Sentry.getClient()) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.1,
  });
}

/** Renders nothing — its sole job is to pull the init above into the client. */
export function SentryInit(): null {
  return null;
}
