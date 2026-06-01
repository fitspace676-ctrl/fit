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

  // ── Google OAuth (Sign in with Google) ──
  // Comma-separated list of accepted Google OAuth client IDs — the `aud` claim
  // of an inbound ID token must match one of these. Typically holds the web,
  // iOS, and Android client IDs (each platform's Google Sign-In mints tokens
  // for its own client). Optional so the API boots without it; POST /auth/google
  // then returns 503, mirroring how JWT_SECRET / R2 degrade when unconfigured.
  GOOGLE_CLIENT_IDS: z.string().optional(),

  // ── Email verification ──
  // TTL (seconds) of a one-time email-verification token held in Redis.
  // Default 24 hours.
  EMAIL_VERIFICATION_TTL: z.coerce.number().int().positive().default(86_400),
  // Base URL the verification token is appended to in the email deep link
  // (`<base>?token=…`). Unset → derived from WEB_URL (`<WEB_URL>/auth/verify`).
  EMAIL_VERIFICATION_URL: z.string().url().optional(),

  // ── Email delivery (Resend — optional) ──
  // Unset disables outbound mail: registration still succeeds and the
  // verification link is logged instead of sent, so the API works in CI / local
  // dev without a Resend account.
  RESEND_API_KEY: z.string().optional(),
  // `From` address for transactional mail. Must be a verified Resend sender.
  EMAIL_FROM: z.string().default('Fit <no-reply@fit.app>'),

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
