import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { RegisterResponse, TokenPair } from '@fit/types';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

function setup() {
  const register = vi.fn<(input: unknown) => Promise<RegisterResponse>>(() =>
    Promise.resolve({ message: 'verification email sent' }),
  );
  const verifyEmail = vi.fn<(token: string) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'a', refreshToken: 'r' }),
  );
  const auth = { register, verifyEmail } as unknown as AuthService;
  return { controller: new AuthController(auth), register, verifyEmail };
}

describe('AuthController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('POST /auth/register', () => {
    it('parses the body and delegates to the service', async () => {
      const result = await ctx.controller.register({
        email: 'A@B.com',
        password: 'supersecret',
        name: '  Alice  ',
      });

      expect(result).toEqual({ message: 'verification email sent' });
      // Email is normalised (trim + lowercase) and name trimmed before the service.
      expect(ctx.register).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'supersecret',
        name: 'Alice',
      });
    });

    it('rejects a malformed body with a 400 listing each failing field', async () => {
      const error = await ctx.controller
        .register({ email: 'not-an-email', password: 'short', name: '' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const details = (error as BadRequestException).getResponse() as { message: string[] };
      expect(details.message.length).toBeGreaterThanOrEqual(2);
      expect(details.message.join(' ')).toMatch(/email/);
      expect(ctx.register).not.toHaveBeenCalled();
    });

    it('rejects a non-object body', async () => {
      await expect(ctx.controller.register(null)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('GET /auth/verify', () => {
    it('parses the token query and delegates to the service', async () => {
      const result = await ctx.controller.verify({ token: ' tok123 ' });

      expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
      expect(ctx.verifyEmail).toHaveBeenCalledWith('tok123');
    });

    it('rejects a missing token with a 400', async () => {
      await expect(ctx.controller.verify({})).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.verifyEmail).not.toHaveBeenCalled();
    });
  });
});
