import { validateEnv, z } from '@fit/env';

/**
 * The admin app's environment, validated once at boot (imported by
 * `instrumentation.ts`). `NEXT_PUBLIC_*` vars are inlined into the client
 * bundle; the server-only vars (`JWT_SECRET`, `COOKIE_DOMAIN`) back the
 * middleware / `getServerSession()` role gate. Every var is optional — the app
 * degrades gracefully when unconfigured — so boot fails fast only on a
 * *malformed* value, never on a missing optional one.
 */
export const env = validateEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_COOKIE_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    COOKIE_DOMAIN: z.string().optional(),
    JWT_SECRET: z.string().min(1).optional(),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
  }),
);
