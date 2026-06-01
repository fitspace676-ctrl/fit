// Sentry instrumentation — imported for its side effect at the very top of
// `main.ts`, before any other module loads. @sentry/nestjs auto-instruments
// HTTP, Express, and uncaught exceptions once `init` has run; importing it
// first ensures the instrumentation hooks are installed before Nest boots.
//
// No-op when SENTRY_DSN is unset (local dev / CI), so nothing is shipped to
// Sentry unless a DSN is explicitly configured.
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // Performance tracing — sample rate is conservative by default; override
    // via env per environment.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}
