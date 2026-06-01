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
  // Lifetime (seconds) of generated presigned URLs. Bounded to a week (the S3
  // SigV4 maximum) so a typo can't mint an effectively unbounded URL.
  R2_SIGNED_URL_TTL: z.coerce.number().int().positive().max(604800).default(900),

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
