import { z } from 'zod';

/**
 * Canonical schema for the cross-cutting **infrastructure** environment shared
 * by every workspace: the datastores, object storage, API location, and the
 * signing secret used to mint test tokens. It is intentionally a subset of any
 * single app's schema — apps layer their own concerns (CORS, Sentry, logging)
 * on top — but the shared infra keys live here once so the `fit` CLI and the
 * apps never diverge on how `DATABASE_URL`, `REDIS_URL`, or the `R2_*` vars are
 * validated.
 *
 * Every field is coerced/bounded so consumers can trust the types without
 * re-parsing `process.env`. Secrets are plain strings — validation never logs
 * their values.
 */
export const infraEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ── Datastores ──
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // ── API service ──
  // Base URL the CLI talks to for introspection that only the API can answer
  // (signed uploads, gym provisioning). Local dev default keeps `fit` usable
  // without extra config.
  API_URL: z.string().url().default('http://localhost:3000'),

  // ── Auth (test-token signing) ──
  // HS256 secret the API signs JWTs with; `fit token` reuses it so the minted
  // token authenticates against protected endpoints. Optional so `fit env
  // check` still passes in environments that don't mint tokens.
  JWT_SECRET: z.string().min(1).optional(),
  JWT_ISSUER: z.string().default('fit'),

  // ── Object storage (Cloudflare R2 — S3-compatible) ──
  // All optional: unset disables storage-dependent commands rather than failing
  // the whole environment, so `fit` stays usable in CI / local dev without R2.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  R2_SIGNED_URL_TTL: z.coerce.number().int().positive().max(604800).default(900),
});

export type InfraEnv = z.infer<typeof infraEnvSchema>;

/**
 * Keys whose values are secret and must never be printed except by an explicit,
 * single-key request (e.g. `fit env get JWT_SECRET`). Bulk commands (`env
 * check`, `r2 config`) redact these.
 */
export const SECRET_INFRA_KEYS: ReadonlySet<string> = new Set<keyof InfraEnv>([
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
]);

/** True when `key` holds a secret value that should be redacted in bulk output. */
export function isSecretInfraKey(key: string): boolean {
  return SECRET_INFRA_KEYS.has(key);
}
