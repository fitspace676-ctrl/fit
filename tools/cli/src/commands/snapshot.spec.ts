import { describe, expect, it } from 'vitest';
import type { InfraEnv } from '@fit/env';
import {
  libpqUrl,
  pgDumpArgs,
  pgRestoreArgs,
  r2CopyArgs,
  r2Endpoint,
  resolveR2,
  snapshotKey,
  SNAPSHOT_PREFIX,
} from './snapshot';

const DB = 'postgresql://postgres:secret@db.internal:5432/fit';

describe('libpqUrl', () => {
  it('strips Prisma-only params libpq rejects', () => {
    expect(libpqUrl(`${DB}?schema=public`)).toBe(DB);
    expect(libpqUrl(`${DB}?schema=public&connection_limit=5&pgbouncer=true`)).toBe(DB);
  });

  it('keeps params libpq understands (e.g. sslmode)', () => {
    expect(libpqUrl(`${DB}?sslmode=require&schema=public`)).toBe(`${DB}?sslmode=require`);
  });

  it('returns clean URLs and non-URLs unchanged', () => {
    expect(libpqUrl(DB)).toBe(DB);
    expect(libpqUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('pgDumpArgs', () => {
  it('produces a restore-ready custom-format dump to the target file', () => {
    expect(pgDumpArgs(DB, '/tmp/fit.dump')).toEqual([
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file=/tmp/fit.dump',
      DB,
    ]);
  });
});

describe('pgRestoreArgs', () => {
  it('drops existing objects and restores in a single transaction', () => {
    const args = pgRestoreArgs(DB, '/tmp/fit.dump');
    expect(args).toContain('--clean');
    expect(args).toContain('--if-exists');
    expect(args).toContain('--single-transaction');
    expect(args).toContain(`--dbname=${DB}`);
    expect(args[args.length - 1]).toBe('/tmp/fit.dump');
  });
});

describe('r2Endpoint', () => {
  it('builds the account S3 endpoint host', () => {
    expect(r2Endpoint('acc123')).toBe('https://acc123.r2.cloudflarestorage.com');
  });
});

describe('r2CopyArgs', () => {
  it('targets the R2 endpoint for an s3 cp', () => {
    expect(r2CopyArgs('https://acc123.r2.cloudflarestorage.com', 'a.dump', 's3://b/k')).toEqual([
      's3',
      'cp',
      'a.dump',
      's3://b/k',
      '--endpoint-url',
      'https://acc123.r2.cloudflarestorage.com',
    ]);
  });
});

describe('resolveR2', () => {
  it('returns bucket + endpoint when account and bucket are set', () => {
    const env = { R2_ACCOUNT_ID: 'acc123', R2_BUCKET: 'fit-prod' } as unknown as InfraEnv;
    expect(resolveR2(env)).toEqual({
      bucket: 'fit-prod',
      endpoint: 'https://acc123.r2.cloudflarestorage.com',
    });
  });

  it('is undefined when R2 is not fully configured', () => {
    expect(resolveR2({ R2_ACCOUNT_ID: 'acc123' } as unknown as InfraEnv)).toBeUndefined();
    expect(resolveR2({ R2_BUCKET: 'fit-prod' } as unknown as InfraEnv)).toBeUndefined();
    expect(resolveR2({} as unknown as InfraEnv)).toBeUndefined();
  });
});

describe('snapshotKey', () => {
  it('places dumps under the snapshot prefix by basename', () => {
    const key = snapshotKey(
      { bucket: 'fit-prod', endpoint: 'https://acc123.r2.cloudflarestorage.com' },
      '/tmp/fit-20260705T073000Z.dump',
    );
    expect(key).toBe(`s3://fit-prod/${SNAPSHOT_PREFIX}/fit-20260705T073000Z.dump`);
  });
});
