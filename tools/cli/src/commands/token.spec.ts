import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../args';
import { CommandError } from '../output';
import { isRole, run } from './token';

describe('isRole', () => {
  it('accepts known roles and rejects others', () => {
    expect(isRole('MANAGER')).toBe(true);
    expect(isRole('SUPER_ADMIN')).toBe(true);
    expect(isRole('GUEST')).toBe(false);
  });
});

describe('token run', () => {
  const saved = { ...process.env };
  let sandbox: string;

  // `run` resolves its config through `loadInfraEnv('local')`, which merges the
  // repo's `.env` / `.env.local` from disk *before* overlaying `process.env`.
  // Scrubbing `process.env` alone therefore does not hide a value — a developer
  // whose own `.env.local` sets `JWT_SECRET` would still see one, and the
  // "fails when absent" case below would mint a token and fail. (CI has no
  // `.env.local`, so it passed there and only broke on real machines.)
  //
  // Point `process.cwd()` at an empty directory instead: `findRepoRoot` walks up
  // from there, finds no `pnpm-workspace.yaml`, falls back to that directory,
  // and reads no dotenv files. The command under test runs its real code path —
  // only the filesystem it looks at is controlled.
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'fit-cli-token-'));
    vi.spyOn(process, 'cwd').mockReturnValue(sandbox);
    process.env.DATABASE_URL = 'postgresql://localhost:5432/fit';
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it('mints a JWT for a valid role + gym', async () => {
    const result = await run(parseArgs(['--role', 'MANAGER', '--gym', 'demo']));
    const data = result.data as { token: string; role: string; gym: string };
    expect(data.role).toBe('MANAGER');
    expect(data.gym).toBe('demo');
    expect(data.token.split('.')).toHaveLength(3);
  });

  it('rejects an unknown role', async () => {
    await expect(run(parseArgs(['--role', 'GUEST', '--gym', 'demo']))).rejects.toBeInstanceOf(
      CommandError,
    );
  });

  it('fails when JWT_SECRET is absent', async () => {
    delete process.env.JWT_SECRET;
    await expect(run(parseArgs(['--role', 'MANAGER', '--gym', 'demo']))).rejects.toMatchObject({
      payload: { code: 'MISSING_ENV' },
    });
  });
});
