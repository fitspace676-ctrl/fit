import { validateEnv, z } from '@fit/env';

/**
 * The platform (marketing / owner-signup) app's environment, validated once at
 * boot (imported by `instrumentation.ts`). The API base URL (the signup form
 * posts to `register-gym`) and the platform root domain, used to build the
 * `<slug>.<root>/admin` redirect a freshly provisioned owner is sent to. Both
 * optional with a format check; the app degrades gracefully when unconfigured.
 */
export const env = validateEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    // Server-side API base URL, used by the `/api/leads` route handler that
    // forwards the marketing forms to the backend. Separate from the public one
    // because that has to be present at *build* time to be inlined into the
    // bundle, while this is read per request — so the lead forms keep working on
    // a deploy that only ever set a server variable.
    API_URL: z.string().url().optional(),
    // Platform root domain (`fit.ge`, or `localhost` in dev). Used to build the
    // tenant admin URL a new owner is redirected to after signup.
    NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
    // Sentry — every var optional so error reporting is off until a DSN is set.
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
  }),
);
