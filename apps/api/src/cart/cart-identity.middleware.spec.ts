import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { TokenService } from '../auth/token.service';
import type { RequestWithUser } from '../common/tenant/tenant.middleware';
import { CartIdentityMiddleware } from './cart-identity.middleware';

vi.mock('../config/env', () => ({ env: { PLATFORM_ROOT_DOMAIN: 'fit.ge' } }));

describe('CartIdentityMiddleware revocation', () => {
  it('still allows anonymous shopping', async () => {
    const tokens = { verifyAccessToken: vi.fn() } as unknown as TokenService;
    const next = vi.fn();
    await new CartIdentityMiddleware(tokens).use(
      { headers: {} } as RequestWithUser, {} as never, next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an old access token after account deletion', async () => {
    const tokens = {
      verifyAccessToken: vi.fn().mockReturnValue({ sub: 'u1', tokenVersion: 0 }),
      assertSessionActive: vi.fn().mockRejectedValue(new UnauthorizedException()),
    } as unknown as TokenService;
    const req = { headers: { authorization: 'Bearer old' } } as RequestWithUser;
    const next = vi.fn();
    await expect(new CartIdentityMiddleware(tokens).use(req, {} as never, next))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });
});
