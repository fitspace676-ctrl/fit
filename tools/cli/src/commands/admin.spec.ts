import { afterEach, describe, expect, it, vi } from 'vitest';

const { findUnique, update, findMany, disconnect } = vi.hoisted(() => ({
  findUnique: vi.fn<(args: unknown) => Promise<unknown>>(),
  update: vi.fn<(args: unknown) => Promise<unknown>>(() => Promise.resolve({})),
  findMany: vi.fn<(args: unknown) => Promise<unknown[]>>(() => Promise.resolve([])),
  disconnect: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('@fit/db', () => ({
  PrismaClient: vi.fn(() => ({
    user: { findUnique, update, findMany },
    $disconnect: disconnect,
  })),
}));

vi.mock('../env-source', () => ({
  loadInfraEnv: () => ({ DATABASE_URL: 'postgresql://localhost:5432/fit' }),
}));

import { parseArgs } from '../args';
import { CommandError } from '../output';
import { run } from './admin';

/** Build the ParsedArgs the dispatcher would hand a command. */
function args(...argv: string[]) {
  return parseArgs(argv);
}

describe('fit admin', () => {
  afterEach(() => vi.clearAllMocks());

  it('grants SUPER_ADMIN to an existing user (normalising the email) and disconnects', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', isSuperAdmin: false });

    const result = await run(args('grant', '--email', '  Owner@Example.com '));

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'owner@example.com' } }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isSuperAdmin: true },
    });
    expect(result.data).toEqual({
      email: 'owner@example.com',
      userId: 'user-1',
      isSuperAdmin: true,
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('revokes SUPER_ADMIN from an existing user', async () => {
    findUnique.mockResolvedValue({ id: 'user-1', isSuperAdmin: true });

    const result = await run(args('revoke', '--email', 'owner@example.com'));

    expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { isSuperAdmin: false } });
    expect(result.data).toMatchObject({ isSuperAdmin: false });
  });

  it('rejects a grant with no --email and never touches the DB', async () => {
    const error = await run(args('grant')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommandError);
    expect((error as CommandError).payload.code).toBe('BAD_ARGUMENT');
    expect(update).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('rejects granting an unknown user with USER_NOT_FOUND', async () => {
    findUnique.mockResolvedValue(null);

    const error = await run(args('grant', '--email', 'ghost@example.com')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommandError);
    expect((error as CommandError).payload.code).toBe('USER_NOT_FOUND');
    expect(update).not.toHaveBeenCalled();
  });

  it('lists the current platform SUPER_ADMINs', async () => {
    findMany.mockResolvedValue([{ id: 'user-1', email: 'admin@fit.ge', name: 'Admin' }]);

    const result = await run(args('list'));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isSuperAdmin: true } }),
    );
    expect(result.data).toEqual({
      superAdmins: [{ id: 'user-1', email: 'admin@fit.ge', name: 'Admin' }],
    });
  });

  it('rejects an unknown subcommand', async () => {
    const error = await run(args('frobnicate')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommandError);
    expect((error as CommandError).payload.code).toBe('BAD_ARGUMENT');
  });
});
