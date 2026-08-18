// @fit/superadmin — isomorphic session core (edge / server safe).
//
// The single source of truth for "who is this request" on the platform operator
// console. The whole app is SUPER_ADMIN-only, so this is deliberately narrower
// than the staff admin's equivalent: it verifies the same HS256 access token the
// @fit/api mints (see `apps/api/src/auth/token.service.ts`) and exposes a single
// gate — {@link isSuperAdmin}. Used by:
//   • `middleware.ts`   (Edge runtime) — verifies the cookie + asserts the role
//   • `lib/session.ts`  (Server)       — `getServerSession()` for RSC / actions
//
// Must stay free of `next/headers`, React, and any Node-only API so it runs
// unchanged in the Edge middleware runtime — it uses Web Crypto, not `node:crypto`.

/**
 * The operator session's cookies — deliberately NOT `accessToken` /
 * `refreshToken`.
 *
 * Those names belong to the tenant surfaces, which set them on the PARENT domain
 * (`COOKIE_DOMAIN=.formacore.io`) so one sign-in covers `<slug>.formacore.io` and
 * its `/admin`. This console lives on `superadmin.formacore.io`, inside that same
 * parent — so writing `accessToken` here would overwrite the operator's own
 * tenant sessions, and, once one-click impersonation lands, an impersonated gym
 * session would overwrite the operator's SUPER_ADMIN one and log them out of the
 * console they launched it from.
 *
 * Separate names, written host-only (no `domain` attribute — see
 * `lib/session-refresh.ts`), keep the two identities independent: the operator
 * can hold a SUPER_ADMIN session here and a gym session in another tab at once,
 * and signing out of either leaves the other alone.
 */
export const ACCESS_TOKEN_COOKIE = 'opsAccessToken';

/** Cookie holding the rotating refresh token for the operator session. */
export const REFRESH_TOKEN_COOKIE = 'opsRefreshToken';

/** The roles the platform recognises, mirroring the Prisma `Role` enum. */
export const ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'RECEPTIONIST',
  'TRAINER',
  'MEMBER',
] as const;

export type Role = (typeof ROLES)[number];

/** The resolved identity of a request. */
export interface Session {
  userId: string;
  gymId: string | null;
  role: Role;
}

/** The JWT claim set we care about; everything else is passed through. */
interface AccessClaims {
  sub: string;
  type?: string;
  role?: string;
  gymId?: string;
  /** Gym slug claim as minted by `fit token --gym <slug>`; alias for `gymId`. */
  gym?: string;
  exp?: number;
  [claim: string]: unknown;
}

/**
 * The one authorization gate for the operator console: only `SUPER_ADMIN` may
 * use it. The @fit/api stamps the caller's `role` into every access token, so a
 * platform admin (a `User.isSuperAdmin` account) logs in normally and arrives
 * with a token whose `role` is `SUPER_ADMIN` — exactly what the API's
 * cross-tenant guard also requires.
 */
export function isSuperAdmin(role: Role): boolean {
  return role === 'SUPER_ADMIN';
}

/** Narrow an arbitrary value to a known {@link Role}, or `undefined`. */
function parseRole(value: unknown): Role | undefined {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : undefined;
}

/** Project verified/decoded claims onto a {@link Session} (role defaults to MEMBER). */
export function sessionFromClaims(claims: AccessClaims): Session {
  const rawGym = claims.gymId ?? claims.gym;
  return {
    userId: claims.sub,
    gymId: typeof rawGym === 'string' && rawGym.length > 0 ? rawGym : null,
    role: parseRole(claims.role) ?? 'MEMBER',
  };
}

const encoder = new TextEncoder();

/** Decode a base64url segment to its raw bytes (ArrayBuffer-backed for Web Crypto). */
function base64urlToBytes(segment: string): Uint8Array<ArrayBuffer> {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Decode a base64url segment to a UTF-8 string. */
function base64urlToString(segment: string): string {
  return new TextDecoder().decode(base64urlToBytes(segment));
}

/** Parse a JWT payload into validated {@link AccessClaims}, or `null` if malformed. */
function parseClaims(encodedPayload: string): AccessClaims | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(base64urlToString(encodedPayload));
  } catch {
    return null;
  }
  if (typeof decoded !== 'object' || decoded === null) {
    return null;
  }
  const claims = decoded as AccessClaims;
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    return null;
  }
  // A refresh token must never be replayed as an access token.
  if (claims.type !== undefined && claims.type !== 'access') {
    return null;
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
    return null;
  }
  return claims;
}

/**
 * Verify an access token's HS256 signature against `secret` and return its
 * claims, or `null` on any failure (bad shape, bad signature, wrong type,
 * expired). Uses Web Crypto so it runs unchanged in the Edge middleware runtime
 * and on the server.
 */
export async function verifyAccessToken(token: string, secret: string): Promise<Session | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  let valid: boolean;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBytes(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return null;
  }
  if (!valid) {
    return null;
  }

  const claims = parseClaims(encodedPayload);
  return claims ? sessionFromClaims(claims) : null;
}
