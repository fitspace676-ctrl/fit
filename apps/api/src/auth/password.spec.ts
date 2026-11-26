import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { PasswordController } from './password.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { hashRefreshToken } from './token.service';
vi.mock('argon2', () => ({
  verify: vi.fn((_hash: string, password: string) => Promise.resolve(password === 'correctpass')),
  hash: vi.fn(() => Promise.resolve('new-hash')),
  argon2id: 2,
}));

function setup() {
  const updateMany = vi.fn(() => Promise.resolve({ count: 1 }));
  const revoke = vi.fn(() => Promise.resolve({ count: 2 }));
  const client = {
    gymCredential: {
      findUnique: vi.fn(() => Promise.resolve({ passwordHash: 'old-hash' })),
      updateMany,
    },
    refreshToken: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          userId: 'u',
          gymId: 'g',
          familyId: 'current',
          expiresAt: new Date(Date.now() + 100000),
        }),
      ),
      findFirst: vi.fn(() => Promise.resolve({ id: 'live' })),
      updateMany: revoke,
    },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb(client))),
  };
  const tokens = {
    sessionForRefreshToken: vi.fn(() => Promise.resolve({ userId: 'u', gymId: 'g' })),
  };
  const service = new AuthService(
    { client } as never,
    {} as never,
    tokens as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, client, tokens, updateMany, revoke };
}
const input = { currentPassword: 'correctpass', password: 'newpassword', refreshToken: 'refresh' };
describe('staff password change', () => {
  it('changes only this gym credential and preserves only the current refresh family', async () => {
    const { service, client, updateMany, revoke } = setup();
    await expect(service.changePassword('u', 'g', input)).resolves.toEqual({ success: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'u', gymId: 'g', passwordHash: 'old-hash' },
      data: { passwordHash: 'new-hash' },
    });
    expect(client.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('refresh') },
    });
    expect(revoke).toHaveBeenCalledWith({
      where: { userId: 'u', familyId: { not: 'current' }, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });
  it.each([
    { ...input, currentPassword: 'wrong' },
    { ...input, password: 'short' },
  ])('rejects invalid passwords without writes', async (body) => {
    const { service, updateMany, revoke } = setup();
    await expect(service.changePassword('u', 'g', body)).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
  it('rejects refresh tokens from another user or gym', async () => {
    const { service, updateMany } = setup();
    await expect(service.changePassword('other', 'g', input)).rejects.toThrow();
    await expect(service.changePassword('u', 'other', input)).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('rejects a revoked family even if it was live before the transaction', async () => {
    const { service, client, updateMany } = setup();
    client.refreshToken.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.changePassword('u', 'g', input)).rejects.toThrow();
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('declares staff-only authorization and is not public', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Object.getOwnPropertyDescriptor(PasswordController.prototype, 'change')?.value as object,
      ),
    ).toEqual(['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER']);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PasswordController)).toBeUndefined();
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        Object.getOwnPropertyDescriptor(PasswordController.prototype, 'change')?.value as object,
      ),
    ).toBeUndefined();
  });
  it('validates password policy at the controller boundary', async () => {
    const auth = { changePassword: vi.fn() };
    const controller = new PasswordController(auth as never, { userId: 'u', gymId: 'g' } as never);
    await expect(controller.change({ ...input, password: 'short' })).rejects.toThrow();
    expect(auth.changePassword).not.toHaveBeenCalled();
  });
});
