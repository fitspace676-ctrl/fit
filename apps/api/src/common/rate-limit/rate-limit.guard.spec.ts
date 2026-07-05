import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { RedisService } from '../../redis/redis.service';
import { RATE_LIMITS, type RateLimitOptions } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';

// A mutable env stand-in so the `RATE_LIMIT_ENABLED` switch can be toggled per
// test. `vi.mock` is hoisted above the imports, so the guard closes over this.
const mockEnv = vi.hoisted(() => ({ env: { RATE_LIMIT_ENABLED: true } }));
vi.mock('../../config/env', () => mockEnv);

interface Harness {
  eval: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  reflectorValue: RateLimitOptions | undefined;
  context: ExecutionContext;
  guard: InstanceType<typeof RateLimitGuard>;
}

function setup(reflectorValue: RateLimitOptions | undefined): Harness {
  const evalFn = vi.fn();
  const setHeader = vi.fn();
  const redis = { client: { eval: evalFn } } as unknown as RedisService;
  const reflector = { getAllAndOverride: vi.fn(() => reflectorValue) } as unknown as Reflector;
  const request = { headers: {}, ip: '203.0.113.5', socket: {} };
  const response = { setHeader };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;

  return {
    eval: evalFn,
    setHeader,
    reflectorValue,
    context,
    guard: new RateLimitGuard(redis, reflector),
  };
}

describe('RateLimitGuard', () => {
  beforeEach(() => {
    mockEnv.env.RATE_LIMIT_ENABLED = true;
  });
  afterEach(() => vi.clearAllMocks());

  it('passes routes that declare no rate-limit policy without touching Redis', async () => {
    const h = setup(undefined);
    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.eval).not.toHaveBeenCalled();
  });

  it('allows a request under the limit and reports the remaining budget', async () => {
    const h = setup(RATE_LIMITS.auth); // limit 10 / 60s
    h.eval.mockResolvedValue([3, 45_000]);

    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    expect(h.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 7);
    expect(h.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', 45);
  });

  it('keys the counter on the bucket name and client IP', async () => {
    const h = setup(RATE_LIMITS.checkIn);
    h.eval.mockResolvedValue([1, 60_000]);

    await h.guard.canActivate(h.context);
    const call = h.eval.mock.calls[0] as unknown[];
    expect(call[1]).toBe(1); // numKeys
    expect(call[2]).toBe('rl:check-in:203.0.113.5'); // key
    expect(call[3]).toBe(String(RATE_LIMITS.checkIn.windowSec * 1000)); // window ms
  });

  it('admits the exact boundary hit (count === limit) with zero remaining', async () => {
    const h = setup(RATE_LIMITS.auth);
    h.eval.mockResolvedValue([10, 5_000]);

    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
  });

  it('rejects the first request over the limit with a 429 + Retry-After', async () => {
    const h = setup(RATE_LIMITS.auth);
    h.eval.mockResolvedValue([11, 12_000]);

    await expect(h.guard.canActivate(h.context)).rejects.toBeInstanceOf(HttpException);
    const error = await h.guard.canActivate(h.context).catch((e: unknown) => e as HttpException);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(h.setHeader).toHaveBeenCalledWith('Retry-After', 12);
  });

  it('fails open (allows the request) when the Redis round-trip throws', async () => {
    const h = setup(RATE_LIMITS.auth);
    h.eval.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.setHeader).not.toHaveBeenCalled();
  });

  it('is a no-op when RATE_LIMIT_ENABLED is off', async () => {
    mockEnv.env.RATE_LIMIT_ENABLED = false;
    const h = setup(RATE_LIMITS.auth);

    await expect(h.guard.canActivate(h.context)).resolves.toBe(true);
    expect(h.eval).not.toHaveBeenCalled();
  });
});
