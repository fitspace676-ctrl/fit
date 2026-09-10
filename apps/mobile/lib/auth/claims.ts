// @fit/mobile — read-only access-token claim decoding.
//
// The client never *verifies* a token (the API owns that, in
// `apps/api/src/auth/token.service.ts`); it only reads claims off a token it was
// itself issued and stored. Two of those claims are load-bearing:
//
//   - `gymId` — the tenant every gym-scoped query key is prefixed with. The
//     login response is a bare `TokenPair` (see `packages/types/src/auth.ts`):
//     **no user, no role, no gym**. Decoding the JWT is the *only* way the app
//     learns which tenant the session landed on, which is also how a `gymSlug`
//     mismatch (D4) becomes detectable.
//   - `exp` — so the session can be refreshed proactively rather than paying a
//     401 every 15 minutes (`JWT_ACCESS_TTL` is 900s).
//
// Everything here is total: no input, however hostile, throws. The token comes
// from the keychain, but it also comes from a network response during refresh,
// and a decoder that throws on a truncated body would turn a bad response into
// a crash on the render path.

/** The access-token claims the client reads. Mirrors the API's `AccessTokenClaims`. */
export interface SessionClaims {
  /** The user id (JWT `sub`). */
  readonly sub: string;
  /**
   * The gym this session is scoped to.
   *
   * The API **omits** `gymId` entirely for a platform account with no gym
   * membership (`token.service.ts`: `...(claims.gymId ? { gymId } : {})`). Such
   * a session cannot drive the member app — every screen is gym-scoped — so
   * {@link decodeSessionClaims} treats its absence as "no usable session".
   */
  readonly gymId: string;
  /** The user's role in that gym. `MEMBER` for the app's own users. */
  readonly role: string | undefined;
  /** The session-invalidation counter stamped at issuance. */
  readonly tokenVersion: number | undefined;
  /** Expiry, in seconds since the epoch. */
  readonly exp: number | undefined;
  /** Issued-at, in seconds since the epoch. */
  readonly iat: number | undefined;
}

/** Base64 alphabet lookup, built once. Index = char code, value = 6-bit group. */
const BASE64_INDEX: Readonly<Record<string, number>> = (() => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table: Record<string, number> = {};
  for (let i = 0; i < alphabet.length; i += 1) {
    table[alphabet[i] as string] = i;
  }
  return table;
})();

/**
 * Decode a base64url segment to its UTF-8 text, or `null` when the input is not
 * valid base64url.
 *
 * Hand-rolled rather than using `atob`: Hermes' `atob` availability has moved
 * between React Native releases, and `atob` returns a *binary string* that still
 * needs UTF-8 decoding (a Georgian display name in a claim would otherwise come
 * back mojibake). Doing both steps here keeps the decoder hermetic — the spec
 * fuzzes it with no globals stubbed.
 */
export function decodeBase64Url(segment: string): string | null {
  if (typeof segment !== 'string' || segment.length === 0) {
    return null;
  }

  // Reject anything outside the base64url alphabet up front; a lenient decoder
  // would happily turn `"....."` into an empty string and then "succeed".
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    return null;
  }
  const normalised = segment.replace(/-/g, '+').replace(/_/g, '/');
  // 4n+1 is not a producible base64 length — one leftover char encodes nothing.
  if (normalised.length % 4 === 1) {
    return null;
  }

  const bytes: number[] = [];
  for (let i = 0; i < normalised.length; i += 4) {
    const chunk = normalised.slice(i, i + 4);
    let bits = 0;
    for (let j = 0; j < 4; j += 1) {
      const char = chunk[j];
      bits = (bits << 6) | (char === undefined ? 0 : (BASE64_INDEX[char] as number));
    }
    // A 4-char chunk yields 3 bytes; a 3-char tail yields 2; a 2-char tail, 1.
    const produced = chunk.length - 1;
    bytes.push((bits >> 16) & 0xff, (bits >> 8) & 0xff, bits & 0xff);
    bytes.length -= 3 - produced;
  }

  try {
    // Percent-decoding is the dependency-free way to turn raw UTF-8 bytes into a
    // JS string; `decodeURIComponent` throws on an invalid sequence, which is
    // exactly the "not really UTF-8" signal we want.
    let percent = '';
    for (const byte of bytes) {
      percent += `%${byte.toString(16).padStart(2, '0')}`;
    }
    return decodeURIComponent(percent);
  } catch {
    return null;
  }
}

/**
 * Decode a JWT's payload segment into a plain object without verifying its
 * signature, or `null` for anything that is not a well-formed JWT carrying a
 * JSON object payload. Never throws, for any input.
 *
 * The escape hatch behind {@link decodeSessionClaims}, for the rare caller that
 * wants a claim this app does not model.
 */
export function decodeJwtPayload(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string') {
    return null;
  }
  const segments = token.split('.');
  // A JWS is exactly three segments. Accepting two would also accept an
  // arbitrary `a.b` string, which is not a token and should not decode.
  if (segments.length !== 3) {
    return null;
  }
  const payload = segments[1];
  if (payload === undefined) {
    return null;
  }
  const json = decodeBase64Url(payload);
  if (json === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Decode an access token into the claims the app needs, or `null` when the token
 * is malformed **or carries no `gymId`**.
 *
 * The `gymId` requirement is not pedantry: it is segment [1] of every gym-scoped
 * query key, and a session without one would key every cache entry under
 * `undefined`, merging two tenants' data into one bucket. Returning `null`
 * makes that unrepresentable — a scopeless platform token simply is not a
 * member-app session.
 */
export function decodeSessionClaims(token: unknown): SessionClaims | null {
  const payload = decodeJwtPayload(token);
  if (payload === null) {
    return null;
  }
  const { sub, gymId, role, tokenVersion, exp, iat } = payload;
  if (typeof sub !== 'string' || sub.length === 0) {
    return null;
  }
  if (typeof gymId !== 'string' || gymId.length === 0) {
    return null;
  }
  return {
    sub,
    gymId,
    role: typeof role === 'string' ? role : undefined,
    tokenVersion: typeof tokenVersion === 'number' ? tokenVersion : undefined,
    exp: typeof exp === 'number' ? exp : undefined,
    iat: typeof iat === 'number' ? iat : undefined,
  };
}

/**
 * How long the access token remains valid, in milliseconds — negative once it
 * has expired, and `null` when the token carries no `exp`.
 */
export function msUntilExpiry(
  claims: SessionClaims | null,
  now: number = Date.now(),
): number | null {
  if (claims?.exp === undefined) {
    return null;
  }
  return claims.exp * 1000 - now;
}

/**
 * The margin before `exp` at which a token is treated as already expired.
 *
 * `JWT_ACCESS_TTL` is 900s, so refreshing 60s early costs one extra refresh per
 * ~15 minutes of continuous use and removes the 401-round-trip that would
 * otherwise front every request made in the last minute of a token's life.
 */
export const EXPIRY_SKEW_MS = 60_000;

/**
 * True when the token is expired, or will be within {@link EXPIRY_SKEW_MS}.
 * A token with no `exp` is treated as *not* expired — the API is the authority,
 * and guessing "expired" here would sign the user out of a perfectly good session.
 */
export function isExpired(
  claims: SessionClaims | null,
  now: number = Date.now(),
  skewMs: number = EXPIRY_SKEW_MS,
): boolean {
  const remaining = msUntilExpiry(claims, now);
  if (remaining === null) {
    return false;
  }
  return remaining <= skewMs;
}
