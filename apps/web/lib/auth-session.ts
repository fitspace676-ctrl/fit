// @fit/web — isomorphic session core (edge / server / browser safe).
//
// The single source of truth for "who is this request" on the web app. Used by
// three different runtimes, so it must stay free of `next/headers`, React, and
// any Node-only API:
//   • `middleware.ts`          (Edge runtime) — verifies the cookie before a route runs
//   • `lib/session.ts`         (Server)       — `getServerSession()` for RSC / route handlers
//   • `hooks/use-session.ts`   (Browser)      — `useSession()` decodes the cookie for nav
//
// The access token is the same HS256 JWT the @fit/api mints (see
// `apps/api/src/auth/token.service.ts`): signed with the shared `JWT_SECRET`,
// carrying `{ sub, type:'access', role, tokenVersion, iat, exp, iss }` plus
// `gymId` when the session is gym-scoped. The `MEMBER` default below is only a
// fallback for a token that happens to omit the `role` claim.

/** The cookie the access token is persisted under (readable by middleware). */
export const ACCESS_TOKEN_COOKIE = 'accessToken';

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

/** Privilege ranking — higher outranks lower. Used by route-permission gates. */
export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 100,
  OWNER: 80,
  MANAGER: 60,
  RECEPTIONIST: 40,
  TRAINER: 20,
  MEMBER: 0,
};

/** The resolved identity of a request: who, which tenant, what role. */
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

/** True when `role` is at least as privileged as `min`. */
export function hasRoleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
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
 * expired). Uses Web Crypto so it runs unchanged in the Edge middleware
 * runtime, on the server, and — were it ever needed — in the browser.
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
