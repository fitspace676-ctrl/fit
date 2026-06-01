import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { infraEnvSchema, validateEnv, type InfraEnv } from '@fit/env';

/** The environment a command targets. */
export type EnvTarget = 'local' | 'preview' | 'prod';

export const ENV_TARGETS: readonly EnvTarget[] = ['local', 'preview', 'prod'];

export function isEnvTarget(value: string): value is EnvTarget {
  return (ENV_TARGETS as readonly string[]).includes(value);
}

/**
 * Walk up from `start` until a directory containing `pnpm-workspace.yaml` is
 * found — that's the monorepo root, where the shared `.env*` files live. Falls
 * back to `start` if no marker is found (so the CLI still runs standalone).
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/**
 * Minimal `.env` parser: `KEY=value` per line, `#` comments, blank lines
 * ignored, surrounding single/double quotes stripped. Intentionally tiny — we
 * don't pull in `dotenv` for a few lines, and the apps validate the result
 * anyway via the shared schema.
 */
export function parseDotenv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key === '') continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * The `.env` files consulted for a target, in increasing precedence. `local`
 * reads the developer's `.env.local` then `.env`; `preview`/`prod` read a
 * matching `.env.<target>` if present. In every case `process.env` wins last —
 * that's where a CI run or a `vercel env pull` / `railway run` injects the real
 * remote values, so the CLI reads the same source the apps boot from.
 */
export function envFilesFor(target: EnvTarget): string[] {
  switch (target) {
    case 'local':
      return ['.env', '.env.local'];
    case 'preview':
      return ['.env', '.env.preview'];
    case 'prod':
      return ['.env', '.env.production'];
  }
}

/** Merge the on-disk `.env` files for `target`, then overlay `process.env`. */
export function loadRawEnv(
  target: EnvTarget,
  root: string = findRepoRoot(),
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of envFilesFor(target)) {
    const path = resolve(root, file);
    if (existsSync(path)) {
      Object.assign(merged, parseDotenv(readFileSync(path, 'utf8')));
    }
  }
  // `process.env` is the source of truth at runtime (CI / vendor-injected).
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * Load and validate the infra environment for `target` against the shared
 * {@link infraEnvSchema}. Throwing on invalid input is the caller's signal to
 * exit non-zero — there is no second copy of the validation logic here.
 */
export function loadInfraEnv(target: EnvTarget, root?: string): InfraEnv {
  return validateEnv(infraEnvSchema, loadRawEnv(target, root));
}
