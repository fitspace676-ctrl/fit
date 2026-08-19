import { validateEnv, z } from '@fit/env';

/**
 * The web app's environment, validated once at boot (imported by
 * `instrumentation.ts`). `NEXT_PUBLIC_*` vars are inlined into the client
 * bundle; the server-only vars (`JWT_SECRET`, `COOKIE_DOMAIN`) back the
 * middleware / `getServerSession()`. Every var is optional — the app degrades
 * gracefully when an integration is unconfigured (mirroring the API's env
 * philosophy) — so boot fails fast only on a *malformed* value (a bad URL, an
 * empty secret), never on a missing optional one.
 */
export const env = validateEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    // Platform root domain (`fit.ge`, or `localhost` in dev). The member site is
    // served at `<slug>.<root>`; the active gym is derived from the request Host
    // against this value. Unset → no tenant in scope (apex / preview URL).
    NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
    // Dev-only escape hatch: the gym slug to fall back to when the request Host
    // carries none (`localhost:3001` instead of `downtown.localhost:3001`). Some
    // local browsers/preview panes refuse to resolve `<slug>.localhost`, which
    // would otherwise leave the whole portal tenant-less. Never set in
    // production — the Host is the only source of truth there.
    NEXT_PUBLIC_DEV_GYM_SLUG: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_APPLE_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_APPLE_REDIRECT_URI: z.string().url().optional(),
    // ── Feature flag: online payments (T10.8) ──
    // Gates the not-yet-ready online-payment surface in the purchase wizard.
    // There is no real payment gateway yet — reaching the checkout response is
    // treated as "captured" (the stub, T8.8) — so with this off (the default)
    // the final step is honest: it reserves the membership and tells the buyer
    // to complete payment at the gym's front desk rather than implying a card
    // was charged online. A production deploy that has wired a real gateway sets
    // it "true" to restore the "Pay now" flow. Anything other than "true" (incl.
    // unset) leaves online payments disabled. `NEXT_PUBLIC_*` so the client
    // bundle can branch on it. Mirrors the API's `SUBSCRIPTION_BILLING_ENABLED`.
    NEXT_PUBLIC_PAYMENTS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    NEXT_PUBLIC_COOKIE_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    COOKIE_DOMAIN: z.string().optional(),
    JWT_SECRET: z.string().min(1).optional(),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
  }),
);
