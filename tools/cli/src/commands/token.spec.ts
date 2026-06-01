import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/fit';
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
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
