import type { Request } from 'express';

/**
 * Best-effort real client IP for a request, used to key per-IP rate limiting.
 *
 * The API runs behind a proxy (Railway's edge, plus any CDN), so `req.ip` /
 * `req.socket.remoteAddress` is the *proxy's* address — every request would share
 * it and throttle collectively. The proxy records the originating address in
 * `X-Forwarded-For` (a `client, proxy1, proxy2` chain), whose left-most entry is
 * the original client, so we prefer that. We intentionally do not enable Express
 * `trust proxy` (which would also rewrite `req.ip` for the rest of the app);
 * reading the header here keeps the behaviour local to rate limiting.
 *
 * Note: `X-Forwarded-For` is client-spoofable when the request does not actually
 * transit a trusted proxy that overwrites it. For rate limiting that only means a
 * determined attacker can rotate the key — the same as rotating source IPs — which
 * this fixed-window limiter does not claim to defeat; it exists to blunt naive
 * abuse and accidental hammering. Falls back to the socket address, then a
 * constant so a missing address never crashes the guard (it degrades to a shared
 * bucket rather than throwing).
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
