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
    // Drop @sentry/nestjs's 'Nest' integration. Under NestJS 11 it wraps every
    // controller handler (and guard) in an OpenTelemetry span via
    // `handler.apply(this, arguments)` inside an async callback, which loses the
    // method's `this`/DI context — leaving injected deps (`this.auth`,
    // `this.reflector`) undefined and turning every request into a 500. Error
    // capture is done explicitly by AllExceptionsFilter, and HTTP/Express tracing
    // stays, so removing just this integration costs only Nest-specific spans.
    integrations: (integrations) =>
      integrations.filter((integration) => integration.name !== 'Nest'),
  });
}
