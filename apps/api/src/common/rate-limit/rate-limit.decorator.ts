import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Reflector metadata key carrying a route's {@link RateLimitOptions}. */
export const RATE_LIMIT_KEY = 'rateLimit';

/** A single fixed-window rate-limit policy applied per client IP. */
export interface RateLimitOptions {
  /**
   * Bucket name. Requests to routes sharing a name share one per-IP counter, so
   * the limit spans the whole family (e.g. every `/auth/*` credential route
   * counts against one `auth` budget). Kept short — it becomes part of the Redis
   * key (`rl:<name>:<ip>`).
   */
  name: string;
  /** Maximum requests permitted per IP within {@link windowSec}. */
  limit: number;
  /** Fixed-window length in seconds. */
  windowSec: number;
}

/**
 * Rate-limit a handler (or whole controller) per client IP, enforced by the
 * global {@link RateLimitGuard}. Routes carrying no `@RateLimit` are unlimited —
 * the guard is a no-op for them — so throttling is always an explicit, auditable
 * opt-in on the abuse-prone surfaces (auth, enrolment, check-in), mirroring how
 * `@RequirePermissions` opts a route into the deny-by-default authorization gate.
 *
 * Pass one of the shared {@link RATE_LIMITS} presets so related routes stay in
 * sync, or an inline policy for a one-off.
 *
 * @example
 *   @RateLimit(RATE_LIMITS.auth)
 *   @Post('login')
 *   login() { ... }
 */
export const RateLimit = (options: RateLimitOptions): CustomDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Shared rate-limit presets for the security-sensitive surfaces (T9.7). Centralised
 * so the same budget is applied consistently and tuned in one place.
 *
 * The windows are deliberately generous enough for legitimate bursts (a member
 * retrying a login, a receptionist scanning a class-start rush) while cutting off
 * credential-stuffing and enumeration. Limits are **per client IP**, so a shared
 * office / NAT egress counts collectively — acceptable for the pilot's scale.
 */
export const RATE_LIMITS = {
  /**
   * Interactive credential routes — login, refresh, the OAuth exchanges. Frequent
   * enough for real retries, tight enough to blunt online password guessing.
   */
  auth: { name: 'auth', limit: 10, windowSec: 60 } satisfies RateLimitOptions,
  /**
   * Account-mutating / email-sending auth routes — register, gym provisioning,
   * password forgot/reset. Rarer and more abusable (each can send mail or create
   * records), so a much tighter budget over a longer window.
   */
  authStrict: { name: 'auth-strict', limit: 5, windowSec: 900 } satisfies RateLimitOptions,
  /**
   * Subscription enrolment — both the member self-checkout (`POST /subscriptions`)
   * and the staff enrol (`POST /admin/subscriptions/enroll`). A write that creates
   * a subscription and can touch a payment provider, so it is capped well below
   * ordinary read traffic.
   */
  enroll: { name: 'enroll', limit: 20, windowSec: 60 } satisfies RateLimitOptions,
  /**
   * Reception check-in recording. Sized for a busy front desk scanning members at
   * a class-start rush (≈2/s) without letting a single desk hammer the endpoint.
   */
  checkIn: { name: 'check-in', limit: 120, windowSec: 60 } satisfies RateLimitOptions,
} as const;
