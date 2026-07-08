import { validateEnv, z } from '@fit/env';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

/**
 * Schema for the API's runtime environment.
 *
 * - Required secrets (`DATABASE_URL`) fail the boot immediately when absent or
 *   malformed.
 * - Optional integrations (Sentry, extra CORS origins) stay disabled when unset.
 * - Numeric / enum values are coerced and bounded so downstream code can trust
 *   the types without re-parsing `process.env`.
 *
 * Exported so it can be exercised in isolation by tests; `env` below is the
 * validated singleton the rest of the app imports.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // ── Datastores ──
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // ── CORS ──
  WEB_URL: z.string().url().optional(),
  ADMIN_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),

  // ── Public origins (deep links) ──
  // The API's own public base URL, used to build the staff-invite accept link
  // (`<API_PUBLIC_URL>/auth/accept-invite?token=…`) that lands on this API and
  // 302-redirects the invitee to the web register / login flow. Defaults to the
  // local dev API so invites work end-to-end without extra config.
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  // ── Multi-tenancy (subdomain resolution) ──
  // Root domain tenants live under as `<slug>.fit.ge`. The subdomain tenant
  // middleware strips this suffix off the request `Host` to recover the tenant
  // slug, so it must match the domain the gym subdomains are actually served on.
  // Lower-cased + bare (no scheme/port); default matches production.
  PLATFORM_ROOT_DOMAIN: z.string().trim().toLowerCase().default('fit.ge'),

  // ── Auth / sessions ──
  // HS256 secret the API signs session JWTs with. Optional so the API still
  // boots in CI / local dev without it; token issuance then returns 503 (see
  // TokenService) rather than minting tokens nothing can verify. The `fit` CLI
  // reuses the same secret so its test tokens authenticate against the API.
  JWT_SECRET: z.string().min(1).optional(),
  // `iss` claim stamped on issued tokens (matches the CLI default).
  JWT_ISSUER: z.string().default('fit'),
  // Access-token lifetime (seconds). Short by design — refresh tokens carry the
  // long-lived session. Default 15 minutes.
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  // Refresh-token lifetime (seconds). Default 30 days.
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  // Lifetime (seconds) of a SuperAdmin owner-impersonation token (T2.12). Kept
  // deliberately short — support access must be time-limited. Default 10 minutes.
  JWT_IMPERSONATION_TTL: z.coerce.number().int().positive().default(600),

  // ── Rate limiting (T9.7) ──
  // Master switch for the per-IP, Redis-backed rate limiter that throttles the
  // abuse-prone surfaces (auth credential routes, subscription enrolment,
  // reception check-in). On by default so production is protected without extra
  // config; set "false" to disable — useful for load tests or a local run where
  // the limiter would get in the way. Anything other than "false" (incl. unset)
  // leaves it enabled. The limiter also fails open on its own if Redis is down.
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // ── API documentation (T10.4) ──
  // Master switch for the self-hosted OpenAPI reference. When on, the interactive
  // Swagger UI is served at `GET /docs` and the raw OpenAPI 3 document at
  // `GET /docs-json`, both introspected from the live route table at boot. On by
  // default so a fresh clone gets browsable API docs with no extra config; set
  // "false" to withhold the surface on a public production deployment. Anything
  // other than "false" (incl. unset) leaves it enabled.
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // ── Google OAuth (Sign in with Google) ──
  // Comma-separated list of accepted Google OAuth client IDs — the `aud` claim
  // of an inbound ID token must match one of these. Typically holds the web,
  // iOS, and Android client IDs (each platform's Google Sign-In mints tokens
  // for its own client). Optional so the API boots without it; POST /auth/google
  // then returns 503, mirroring how JWT_SECRET / R2 degrade when unconfigured.
  GOOGLE_CLIENT_IDS: z.string().optional(),

  // ── Apple OAuth (Sign in with Apple) ──
  // Comma-separated list of accepted Apple client IDs — the `aud` claim of an
  // inbound ID token must match one. Holds the web Services ID and the native
  // app's bundle ID (Apple mints tokens for the Services ID on the web and for
  // the bundle ID on iOS). Optional so the API boots without it; POST /auth/apple
  // then returns 503, mirroring how GOOGLE_CLIENT_IDS / JWT_SECRET degrade.
  APPLE_CLIENT_IDS: z.string().optional(),

  // ── Email verification ──
  // TTL (seconds) of a one-time email-verification token held in Redis.
  // Default 24 hours.
  EMAIL_VERIFICATION_TTL: z.coerce.number().int().positive().default(86_400),
  // Base URL the verification token is appended to in the email deep link
  // (`<base>?token=…`). Unset → derived from WEB_URL (`<WEB_URL>/auth/verify`).
  EMAIL_VERIFICATION_URL: z.string().url().optional(),

  // ── Password reset ──
  // TTL (seconds) of a one-time password-reset token held in Redis. Shorter than
  // email verification by design — a reset link grants account takeover, so it
  // should live no longer than necessary. Default 1 hour.
  PASSWORD_RESET_TTL: z.coerce.number().int().positive().default(3_600),
  // Base URL the reset token is appended to in the email deep link
  // (`<base>?token=…`). Unset → derived from WEB_URL (`<WEB_URL>/auth/reset-password`).
  PASSWORD_RESET_URL: z.string().url().optional(),

  // ── Staff invitations (T4.7) ──
  // TTL (seconds) of a staff-invite token. The accept link is single-use and
  // expires after this window. Default 7 days.
  STAFF_INVITE_TTL: z.coerce.number().int().positive().default(604_800),

  // ── Email delivery (Resend — optional) ──
  // Unset disables outbound mail: registration still succeeds and the
  // verification link is logged instead of sent, so the API works in CI / local
  // dev without a Resend account.
  RESEND_API_KEY: z.string().optional(),
  // `From` address for transactional mail. Must be a verified Resend sender.
  EMAIL_FROM: z.string().default('Fit <no-reply@fit.app>'),
  // Destination inbox for platform sales-lead notifications (the marketing site's
  // trial/demo forms, T8.2). Unset → the best-effort team notification is skipped;
  // leads are still persisted either way, so none are lost.
  PLATFORM_LEADS_EMAIL: z.string().email().optional(),

  // ── Push delivery (Expo — optional) ──
  // Master switch for outbound Expo push (T8.3). Off by default so no real device
  // push ever fires in dev / CI / a preview environment; a production deploy sets
  // it true. When off the push channel logs and reports `pending` instead of
  // transmitting, so every notification flow still works end-to-end without an
  // Expo project (mirrors the Resend + report-digest "optional integration"
  // pattern). `"true"` enables; anything else (incl. unset) leaves it disabled.
  EXPO_PUSH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Optional Expo access token, sent as the `Authorization: Bearer` header on the
  // push request. Only required for Expo accounts that have enabled enhanced
  // security; unset works for projects that do not.
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // ── Scheduled report digests (T4.10) ──
  // Master switch for the weekly/monthly report-digest cron. Off by default so
  // the job never fires unexpectedly in dev / CI / a preview environment; a
  // production deploy sets it true. A single Redis lock guards the send, so it
  // is safe to enable on every replica of a multi-instance deployment (only one
  // wins each cadence window). `"true"` enables; anything else (incl. unset)
  // leaves it disabled.
  REPORT_DIGEST_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // ── Recurring subscription billing (T5.4) ──
  // Master switch for the daily renewal-billing cron that charges due
  // subscriptions and advances their period. Off by default so it never charges
  // in dev / CI / a preview environment; a production deploy sets it true. A
  // single Redis lock guards each daily window, so it is safe to enable on every
  // replica of a multi-instance deployment (only one wins). `"true"` enables;
  // anything else (incl. unset) leaves it disabled.
  SUBSCRIPTION_BILLING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Dunning retry ladder (T5.5): comma-separated, ascending whole-day offsets from
  // a subscription's elapsed period end at which a failed renewal charge is retried.
  // The member keeps access across the whole ladder (PAST_DUE is entitled); once the
  // last retry fails the subscription is expired, so the final offset is the grace
  // window. Default "2,5,7" → retry on day +2, +5, +7 then expire. An empty value
  // disables retries (expire on first failure).
  SUBSCRIPTION_BILLING_RETRY_OFFSET_DAYS: z
    .string()
    .default('2,5,7')
    .transform((value, ctx) => {
      const offsets = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => Number(part));
      if (offsets.some((n) => !Number.isInteger(n) || n < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'must be a comma-separated list of non-negative integers (e.g. "2,5,7")',
        });
        return z.NEVER;
      }
      // The ladder must be strictly ascending so each rung falls after the previous
      // one; a misordered list is a config error, not something to silently sort.
      if (offsets.some((n, i) => i > 0 && n <= offsets[i - 1]!)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'offsets must be strictly ascending (e.g. "2,5,7")',
        });
        return z.NEVER;
      }
      return offsets;
    }),
  // Trial-ending heads-up (T8.7): how many whole days before a free trial converts
  // the member is warned their first charge is coming. The daily billing sweep
  // notifies every TRIAL subscription whose trial end falls within this lead window
  // and hasn't been warned yet, so a longer lead simply widens that window. Defaults
  // to 3 (three days before). Bounded to 30 so a typo can't sweep every trial into
  // one run; the per-subscription dedupe key keeps it at-most-once regardless.
  SUBSCRIPTION_TRIAL_ENDING_LEAD_DAYS: z.coerce.number().int().positive().max(30).default(3),

  // ── Class booking reminders (T8.6) ──
  // Master switch for the booking-reminder cron that notifies members ahead of a
  // class they hold a confirmed seat for. Off by default so it never notifies in
  // dev / CI / a preview environment; a production deploy sets it true. A single
  // Redis lock guards each tick window, so it is safe to enable on every replica of
  // a multi-instance deployment (only one wins), and the per-booking dedupe key is
  // the independent at-most-once backstop. `"true"` enables; anything else (incl.
  // unset) leaves it disabled.
  BOOKING_REMINDERS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // How long before a class starts the reminder fires, in minutes. A tick reminds
  // every confirmed booking whose occurrence starts within the next window and has
  // not been reminded yet, so a longer lead simply widens that window. Defaults to
  // 120 (two hours before). Bounded to a week so a typo can't sweep the whole
  // calendar into one tick.
  BOOKING_REMINDER_LEAD_MINUTES: z.coerce.number().int().positive().max(10080).default(120),

  // ── Ops notifications (T8.8) ──
  // Master switch for the low-stock digest cron that emails each gym's
  // owners/managers a reorder heads-up when a product's on-hand stock has fallen to
  // or below the alert threshold. Off by default so it never mails in dev / CI /
  // preview; a production deploy sets it true. A single Redis lock guards each daily
  // window, so it is safe on every replica (only one wins). `"true"` enables;
  // anything else (incl. unset) leaves it disabled.
  OPS_LOW_STOCK_DIGEST_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Inclusive on-hand ceiling a product variant must be at or below to appear on the
  // low-stock digest. Mirrors the console's `DEFAULT_LOW_STOCK_THRESHOLD` (5) and is
  // bounded (0–1000) so a typo can't sweep the whole catalogue into one mail.
  OPS_LOW_STOCK_THRESHOLD: z.coerce.number().int().min(0).max(1000).default(5),
  // Master switch for the end-of-day summary cron that emails each gym's
  // owners/managers a recap of the day's takings, orders, check-ins and new members.
  // Off by default so it never mails in dev / CI / preview; a production deploy sets
  // it true. A single Redis lock guards each daily window, so it is safe on every
  // replica. `"true"` enables; anything else (incl. unset) leaves it disabled.
  OPS_DAILY_SUMMARY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // ── Automation executor (T12.5) ──
  // Master switch for the time-based automation scanner — the daily cron that
  // finds active `membership_expiring` rules and records a run per subscription
  // whose paid period ends within the rule's look-ahead window. Off by default so
  // it never runs in dev / CI / preview; a production deploy sets it true. A
  // single Redis lock guards each daily window, so it is safe on every replica
  // (only one wins). Event-driven triggers (e.g. `member_joined`) do not depend
  // on this flag — they fire inline with the domain action regardless. `"true"`
  // enables; anything else (incl. unset) leaves the scanner disabled.
  AUTOMATION_EXECUTOR_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // ── Object storage (Cloudflare R2 — S3-compatible) ──
  // All optional: unset disables the signed-upload service (the endpoint then
  // returns 503) so the API still boots in CI / local dev without R2 creds.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  // Public base URL for objects (custom domain or r2.dev), used to build the
  // final object URL returned to clients. Unset → no public URL is reported.
  R2_PUBLIC_URL: z.string().url().optional(),
  // Lifetime (seconds) of generated presigned URLs. Defaults to 5 minutes —
  // long enough to start an upload, short enough to limit a leaked URL. Bounded
  // to a week (the S3 SigV4 maximum) so a typo can't mint an unbounded URL.
  R2_SIGNED_URL_TTL: z.coerce.number().int().positive().max(604800).default(300),
  // Largest upload (bytes) a presigned PUT will accept. Enforced two ways: the
  // API rejects an over-sized declared `contentLength` with 400, and the signed
  // `Content-Length` binds the URL so the client can't upload more. Default 25 MiB.
  R2_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),

  // ── Logging ──
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

  // ── Sentry (optional — unset disables Sentry entirely) ──
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
});

export type ApiEnv = z.infer<typeof envSchema>;

/** Validated, typed view of `process.env`, resolved once at module load. */
export const env: ApiEnv = validateEnv(envSchema);
