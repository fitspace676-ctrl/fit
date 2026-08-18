import { validateEnv, z } from '@fit/env';

/**
 * The operator console's environment, validated once at boot (imported by
 * `instrumentation.ts`). `NEXT_PUBLIC_*` vars are inlined into the bundle;
 * `JWT_SECRET` backs the SUPER_ADMIN cookie gate. Optional with format checks —
 * boot fails fast only on a malformed value.
 *
 * There is no `COOKIE_DOMAIN` here, and that absence is deliberate: the operator
 * session is host-only by design (see `lib/session-refresh.ts`), so a parent
 * domain is not something this app should be able to be configured into.
 */
export const env = validateEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    /**
     * The platform's root domain (e.g. `formacore.io`) — what a gym's
     * `<slug>.<root>` tenant URL is built from, so the roster can link to a gym's
     * portal and console. Unset locally falls back to `localhost`.
     */
    NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
    JWT_SECRET: z.string().min(1).optional(),
    // Sentry — every var optional so error reporting is off until a DSN is set.
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
  }),
);
