import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { RedisService } from '../../redis/redis.service';
import { clientIp } from './client-ip';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';

/**
 * Atomic fixed-window counter. `INCR` creates the key at 1 and every subsequent
 * hit bumps it; the window's expiry is set once, on the first hit, so the bucket
 * self-resets `windowSec` after it opened. Returns `[count, ttlMs]` so the guard
 * can both decide and populate the client-facing reset headers in a single
 * round-trip. Running it as a script keeps INCR + PEXPIRE indivisible under
 * concurrency across every API replica sharing the Redis instance.
 */
const INCR_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

/**
 * Global, opt-in rate limiter (T9.7). Registered once as an `APP_GUARD`, it runs
 * on every route but only acts on handlers that declare a policy via
 * {@link RateLimit}; unmarked routes pass straight through. Counters are per
 * client IP and shared in Redis, so the limit holds across a multi-replica
 * deployment rather than per instance.
 *
 * **Fails open.** If the policy lookup or the Redis round-trip fails (Redis down,
 * a script error), the request is allowed and a warning is logged — availability
 * over strictness, matching how the rest of the app degrades when an optional
 * datastore is unreachable. A hard limiter that 500s every login when Redis
 * blips would be worse than the abuse it prevents.
 *
 * Toggle the whole limiter off with `RATE_LIMIT_ENABLED="false"` (e.g. in tests
 * or a load-test run); it defaults on.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector = new Reflector(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!env.RATE_LIMIT_ENABLED) return true;

    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No policy declared → this route is unlimited.
    if (!options) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const key = `rl:${options.name}:${clientIp(request)}`;

    let count: number;
    let ttlMs: number;
    try {
      const [rawCount, rawTtl] = (await this.redis.client.eval(
        INCR_WINDOW_LUA,
        1,
        key,
        String(options.windowSec * 1000),
      )) as [number, number];
      count = rawCount;
      ttlMs = rawTtl;
    } catch (error) {
      // Fail open — never let a limiter outage take down the endpoint it guards.
      this.logger.warn(
        `Rate-limit check skipped (Redis unavailable) for ${options.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    }

    const remaining = Math.max(0, options.limit - count);
    const resetSeconds = Math.ceil((ttlMs > 0 ? ttlMs : options.windowSec * 1000) / 1000);
    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', resetSeconds);

    if (count > options.limit) {
      response.setHeader('Retry-After', resetSeconds);
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests — please slow down and try again shortly.',
          details: null,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
