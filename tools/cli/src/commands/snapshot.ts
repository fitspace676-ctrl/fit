import { basename } from 'node:path';
import type { InfraEnv } from '@fit/env';
import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import { delegate } from '../util/exec';

/**
 * Pre-deploy database snapshot / restore — the safety net the production deploy
 * pipeline (`.github/workflows/deploy.yml`) takes *before* every `migrate deploy`
 * so a bad migration can be rolled back to a known-good dump (see `ROLLBACK.md`).
 *
 * The dump is `pg_dump`'s custom format (compressed, restore-ready with
 * `pg_restore`). When R2 is configured the dump is also copied to the bucket via
 * the S3-compatible API (`aws s3`), so snapshots survive the ephemeral CI runner.
 * Credentials for that copy come from the standard `AWS_*` env the workflow maps
 * from the `R2_*` secrets — this module only builds the argv and resolves the
 * endpoint, keeping every function pure and unit-testable like `deploy.ts`.
 */

/** Object-store prefix under the R2 bucket where dumps are kept. */
export const SNAPSHOT_PREFIX = 'db-snapshots';

/**
 * Query params Prisma appends to `DATABASE_URL` that the native libpq tools
 * (`pg_dump` / `pg_restore` / `psql`) do not understand and reject outright —
 * `?schema=public` being the common one.
 */
const PRISMA_ONLY_PARAMS = new Set([
  'schema',
  'connection_limit',
  'pool_timeout',
  'pgbouncer',
  'socket_timeout',
  'statement_cache_size',
  'sslaccept',
]);

/**
 * Strip Prisma-only query params from a connection string so the libpq CLIs
 * accept it. Prisma tolerates `?schema=public`; `pg_dump` errors on it. Returns
 * the input unchanged if it doesn't parse as a URL.
 */
export function libpqUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (PRISMA_ONLY_PARAMS.has(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

/**
 * `pg_dump` argv for a compressed, restore-ready custom-format dump to `file`.
 * `--no-owner`/`--no-privileges` keep the dump portable across roles so it can
 * be restored into a fresh Railway database without matching ownership.
 */
export function pgDumpArgs(databaseUrl: string, file: string): string[] {
  return ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}`, databaseUrl];
}

/**
 * `pg_restore` argv that cleanly replaces the target database's objects from
 * `file`. `--clean --if-exists` drops existing objects first so a restore is
 * idempotent; `--single-transaction` makes it all-or-nothing.
 */
export function pgRestoreArgs(databaseUrl: string, file: string): string[] {
  return [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--single-transaction',
    `--dbname=${databaseUrl}`,
    file,
  ];
}

/** R2's S3-compatible endpoint host for an account. */
export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** `aws s3 cp` argv for moving a dump between the local runner and R2. */
export function r2CopyArgs(endpoint: string, source: string, dest: string): string[] {
  return ['s3', 'cp', source, dest, '--endpoint-url', endpoint];
}

/** Where a dump lives in R2: the bucket plus its S3 endpoint. */
export interface R2Location {
  bucket: string;
  endpoint: string;
}

/**
 * Resolve R2 storage for snapshots, or `undefined` when it isn't configured (in
 * which case the dump stays a local/CI-artifact file — still a valid snapshot).
 * Credentials are intentionally *not* read here: `aws` picks up `AWS_*` from the
 * environment, which the deploy workflow maps from the `R2_*` secrets.
 */
export function resolveR2(env: InfraEnv): R2Location | undefined {
  if (!env.R2_ACCOUNT_ID || !env.R2_BUCKET) return undefined;
  return { bucket: env.R2_BUCKET, endpoint: r2Endpoint(env.R2_ACCOUNT_ID) };
}

/** `s3://bucket/db-snapshots/<name>` key for a dump file. */
export function snapshotKey(location: R2Location, file: string): string {
  return `s3://${location.bucket}/${SNAPSHOT_PREFIX}/${basename(file)}`;
}

/** A UTC, filesystem-safe default dump name, e.g. `fit-20260705T073000Z.dump`. */
function defaultDumpName(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  return `fit-${stamp}.dump`;
}

/**
 * `fit db snapshot [--out <file>]` — dump the production database to a
 * restore-ready file and, when R2 is configured, copy it to the bucket. Exits
 * non-zero (and does not upload) if `pg_dump` fails, so the pipeline halts
 * before it migrates.
 */
export async function runSnapshot(args: ParsedArgs): Promise<CommandResult> {
  const env = loadInfraEnv('local');
  const file = stringFlag(args.flags, 'out') ?? defaultDumpName();

  const dumpCode = await delegate('pg_dump', pgDumpArgs(libpqUrl(env.DATABASE_URL), file));
  if (dumpCode !== 0) {
    throw new CommandError('pg_dump failed', {
      code: 'SNAPSHOT_FAILED',
      detail: { file, exitCode: dumpCode },
    });
  }

  const location = resolveR2(env);
  let uploaded: string | undefined;
  if (location) {
    const key = snapshotKey(location, file);
    const copyCode = await delegate('aws', r2CopyArgs(location.endpoint, file, key));
    if (copyCode !== 0) {
      throw new CommandError('snapshot upload to R2 failed', {
        code: 'SNAPSHOT_UPLOAD_FAILED',
        detail: { file, key, exitCode: copyCode },
      });
    }
    uploaded = key;
  }

  return { data: { ok: true, file, uploaded: uploaded ?? null } };
}

/**
 * `fit db restore <file|s3://…>` — restore the database from a dump. When given
 * an `s3://` URI the object is first copied down from R2, then applied with
 * `pg_restore`. This is the destructive half of the rollback runbook and is
 * intended to be run deliberately, against an explicit target.
 */
export async function runRestore(args: ParsedArgs): Promise<CommandResult> {
  const source = args.positionals[0];
  if (!source) {
    throw new CommandError('Missing <file|s3://…> to restore from', {
      code: 'BAD_ARGUMENT',
      detail: 'usage: fit db restore <file|s3://bucket/key>',
    });
  }

  const env = loadInfraEnv('local');

  let file = source;
  if (source.startsWith('s3://')) {
    const location = resolveR2(env);
    if (!location) {
      throw new CommandError('R2 is not configured; cannot fetch an s3:// dump', {
        code: 'R2_NOT_CONFIGURED',
      });
    }
    file = basename(source);
    const downloadCode = await delegate('aws', r2CopyArgs(location.endpoint, source, file));
    if (downloadCode !== 0) {
      throw new CommandError('snapshot download from R2 failed', {
        code: 'SNAPSHOT_DOWNLOAD_FAILED',
        detail: { source, exitCode: downloadCode },
      });
    }
  }

  const restoreCode = await delegate('pg_restore', pgRestoreArgs(libpqUrl(env.DATABASE_URL), file));
  if (restoreCode !== 0) {
    throw new CommandError('pg_restore failed', {
      code: 'RESTORE_FAILED',
      detail: { file, exitCode: restoreCode },
    });
  }

  return { data: { ok: true, restoredFrom: source }, exitCode: 0 };
}
