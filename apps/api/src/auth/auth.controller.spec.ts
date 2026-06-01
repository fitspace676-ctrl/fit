import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ForgotPasswordResponse, RegisterResponse, TokenPair } from '@fit/types';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

function setup() {
  const register = vi.fn<(input: unknown) => Promise<RegisterResponse>>(() =>
    Promise.resolve({ message: 'verification email sent' }),
  );
  const verifyEmail = vi.fn<(token: string) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'a', refreshToken: 'r' }),
  );
  const login = vi.fn<(input: unknown) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'a', refreshToken: 'r' }),
  );
  const requestPasswordReset = vi.fn<(input: unknown) => Promise<ForgotPasswordResponse>>(() =>
    Promise.resolve({
      message: 'If an account exists for that address, a reset link has been sent',
    }),
  );
  const resetPassword = vi.fn<(input: unknown) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'arp', refreshToken: 'rrp' }),
  );
  const loginWithGoogle = vi.fn<(input: unknown) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'ag', refreshToken: 'rg' }),
  );
  const loginWithApple = vi.fn<(input: unknown) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'aa', refreshToken: 'ra' }),
  );
  const refresh = vi.fn<(input: unknown) => Promise<TokenPair>>(() =>
    Promise.resolve({ accessToken: 'a2', refreshToken: 'r2' }),
  );
  const logout = vi.fn<(input: unknown) => Promise<void>>(() => Promise.resolve());
  const auth = {
    register,
    verifyEmail,
    login,
    requestPasswordReset,
    resetPassword,
    loginWithGoogle,
    loginWithApple,
    refresh,
    logout,
  } as unknown as AuthService;
  return {
    controller: new AuthController(auth),
    register,
    verifyEmail,
    login,
    requestPasswordReset,
    resetPassword,
    loginWithGoogle,
    loginWithApple,
    refresh,
    logout,
  };
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

  describe('POST /auth/login', () => {
    it('normalises the body and delegates to the service', async () => {
      const result = await ctx.controller.login({ email: 'A@B.com', password: 'supersecret' });

      expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
      expect(ctx.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'supersecret' });
    });

    it('rejects a malformed body with a 400', async () => {
      await expect(ctx.controller.login({ email: 'nope', password: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.login).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('normalises the email and delegates to the service', async () => {
      const result = await ctx.controller.forgotPassword({ email: '  A@B.com ' });

      expect(result).toEqual({
        message: 'If an account exists for that address, a reset link has been sent',
      });
      expect(ctx.requestPasswordReset).toHaveBeenCalledWith({ email: 'a@b.com' });
    });

    it('rejects a malformed email with a 400', async () => {
      await expect(ctx.controller.forgotPassword({ email: 'nope' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.requestPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/reset-password', () => {
    it('parses the token + password and delegates to the service', async () => {
      const result = await ctx.controller.resetPassword({
        token: ' reset-tok ',
        password: 'brand-new-secret',
      });

      expect(result).toEqual({ accessToken: 'arp', refreshToken: 'rrp' });
      expect(ctx.resetPassword).toHaveBeenCalledWith({
        token: 'reset-tok',
        password: 'brand-new-secret',
      });
    });

    it('rejects a too-short password with a 400', async () => {
      await expect(
        ctx.controller.resetPassword({ token: 'reset-tok', password: 'short' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.resetPassword).not.toHaveBeenCalled();
    });

    it('rejects a missing token with a 400', async () => {
      await expect(
        ctx.controller.resetPassword({ password: 'brand-new-secret' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/google', () => {
    it('parses the id token and delegates to the service', async () => {
      const result = await ctx.controller.google({ idToken: ' google-id-token ' });

      expect(result).toEqual({ accessToken: 'ag', refreshToken: 'rg' });
      expect(ctx.loginWithGoogle).toHaveBeenCalledWith({ idToken: 'google-id-token' });
    });

    it('rejects a missing id token with a 400', async () => {
      await expect(ctx.controller.google({})).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.loginWithGoogle).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/apple', () => {
    it('parses the id token (and optional name) and delegates to the service', async () => {
      const result = await ctx.controller.apple({ idToken: ' apple-id-token ', name: '  Alice  ' });

      expect(result).toEqual({ accessToken: 'aa', refreshToken: 'ra' });
      expect(ctx.loginWithApple).toHaveBeenCalledWith({ idToken: 'apple-id-token', name: 'Alice' });
    });

    it('accepts a body without a name', async () => {
      await ctx.controller.apple({ idToken: 'apple-id-token' });

      expect(ctx.loginWithApple).toHaveBeenCalledWith({ idToken: 'apple-id-token' });
    });

    it('rejects a missing id token with a 400', async () => {
      await expect(ctx.controller.apple({})).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.loginWithApple).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/refresh', () => {
    it('parses the token and delegates to the service', async () => {
      const result = await ctx.controller.refresh({ refreshToken: ' rt-secret ' });

      expect(result).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
      expect(ctx.refresh).toHaveBeenCalledWith({ refreshToken: 'rt-secret' });
    });

    it('rejects a missing refresh token with a 400', async () => {
      await expect(ctx.controller.refresh({})).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.refresh).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/logout', () => {
    it('parses the token and delegates to the service', async () => {
      await ctx.controller.logout({ refreshToken: 'rt-secret' });

      expect(ctx.logout).toHaveBeenCalledWith({ refreshToken: 'rt-secret' });
    });

    it('rejects a missing refresh token with a 400', async () => {
      await expect(ctx.controller.logout({})).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.logout).not.toHaveBeenCalled();
    });
  });
});
