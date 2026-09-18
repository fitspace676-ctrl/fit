import { createHmac, randomBytes, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@fit/db';
import type { TokenPair } from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Base64url-encode a buffer or string (no padding) per RFC 7515. */
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Decode a base64url segment back to its UTF-8 string. */
function base64urlDecode(segment: string): string {
  return Buffer.from(segment, 'base64url').toString('utf8');
}

/**
 * The tenant + role scope a session is bound to, stamped into every access
 * token so the {@link TenantMiddleware} can establish a request's gym and role
 * without a database read. Resolved from the user's gym membership at issuance
 * (and re-resolved on each refresh, so a role or suspension change takes effect
 * within one access-token lifetime). `gymId` is `null` for a platform-level
 * account with no active gym membership.
 */
export interface SessionClaims {
  /** The gym this session is scoped to, or `null` for a platform account. */
  gymId: string | null;
  /**
   * That gym's subdomain slug, or `null` alongside a `null` `gymId`. Stamped so a
   * request can be checked against the tenant host it arrived on without a
   * database read (see `assertSessionMatchesTenantHost`).
   */
  gymSlug: string | null;
  /** The user's role in that gym (or `MEMBER` for a scopeless account). */
  role: Role;
  /** The user's session-invalidation counter at issuance (see `User.tokenVersion`). */
  tokenVersion: number;
}

/** What a live refresh token says about its session, read without spending it. */
export interface RefreshTokenSession {
  /** The user the token belongs to. */
  userId: string;
  /** The gym the session is pinned to, or `null` (platform session / legacy row). */
  gymId: string | null;
}

/** Claims carried by an access token. */
export interface AccessTokenClaims {
  /** Subject — the user id. */
  sub: string;
  /** Token kind, so a refresh token can never be replayed as an access token. */
  type: 'access';
  /** Role the request runs as. */
  role: Role;
  /** Session-invalidation counter stamped at issuance. */
  tokenVersion: number;
  /** Gym the session is scoped to; omitted entirely for a platform account. */
  gymId?: string;
  /** Subdomain slug of that gym; omitted alongside `gymId`. */
  gymSlug?: string;
}

/**
 * The verified claim set returned by {@link TokenService.verifyAccessToken}.
 *
 * The API's own session tokens carry `{ sub, type, role, tokenVersion }` plus a
 * `gymId` when the session is gym-scoped — the {@link TenantMiddleware} reads
 * `role` + `gymId` to establish a request's gym and role. The `fit` CLI mints
 * equivalent test tokens, using `gym` (a slug) as an alias for `gymId`. Every
 * tenant field is still typed optional here: a platform-account token omits
 * `gymId`, and a CLI token may omit `type`, so the verifier tolerates their
 * absence rather than assuming a fixed shape.
 */
export interface VerifiedAccessClaims {
  /** Subject — the user id. */
  sub: string;
  /** Token kind when present; the CLI omits it, the API stamps `'access'`. */
  type?: string;
  /** Role claim, when the token carries one (e.g. CLI test tokens). */
  role?: string;
  /** Gym id claim — the tenant this token is scoped to, when present. */
  gymId?: string;
  /** Gym slug claim as minted by `fit token --gym <slug>`; alias for `gymId`. */
  gym?: string;
  /**
   * Subdomain slug of the session's gym, stamped by the API alongside `gymId`.
   * Absent on platform sessions, CLI tokens, and tokens issued before the claim
   * existed — which is why the host check it feeds treats absence as "no opinion".
   */
  gymSlug?: string;
  /** Remaining standard claims (`iat`, `exp`, `iss`, …) passed through verbatim. */
  [claim: string]: unknown;
}

/**
 * Issues the API's session credentials: a short-lived HS256 access JWT plus an
 * opaque, persisted refresh token.
 *
 * The access token is signed with Node's built-in crypto (no `jsonwebtoken`
 * dependency) exactly as the `fit` CLI mints test tokens, so both verify against
 * the same `JWT_SECRET`. The refresh token is a high-entropy random string
 * returned to the client in plaintext but stored only as a SHA-256 hash, grouped
 * by a `familyId` so T2.3 can layer rotation + reuse-detection on top without a
 * schema change.
 *
 * `JWT_SECRET` is optional (see `config/env.ts`) so the API boots without it;
 * every issuing call then throws {@link ServiceUnavailableException} rather than
 * minting a token nothing can verify — mirroring how the storage service degrades
 * when R2 is unconfigured.
 */
@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** True when a signing secret is configured and tokens can be issued. */
  get isConfigured(): boolean {
    return Boolean(env.JWT_SECRET);
  }

  /**
   * Sign an access JWT for `userId`, valid for `JWT_ACCESS_TTL` seconds, scoped
   * to the supplied {@link SessionClaims}. The `role` + `gymId` (+ `tokenVersion`)
   * claims are what the {@link TenantMiddleware} reads to bind the request to a
   * gym and role — without them every request would resolve to the unscoped
   * default (`MEMBER`, no gym), which is exactly the gap this closes. `gymId` and
   * `gymSlug` are each omitted from the payload when `null` (a platform account).
   */
  signAccessToken(
    userId: string,
    claims: SessionClaims,
    issuedAt: number = Math.floor(Date.now() / 1000),
  ): string {
    const secret = this.requireSecret();
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: AccessTokenClaims & { iat: number; exp: number; iss: string } = {
      sub: userId,
      type: 'access',
      role: claims.role,
      tokenVersion: claims.tokenVersion,
      ...(claims.gymId ? { gymId: claims.gymId } : {}),
      ...(claims.gymSlug ? { gymSlug: claims.gymSlug } : {}),
      iat: issuedAt,
      exp: issuedAt + env.JWT_ACCESS_TTL,
      iss: env.JWT_ISSUER,
    };

    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = base64url(createHmac('sha256', secret).update(signingInput).digest());
    return `${signingInput}.${signature}`;
  }

  /**
   * Sign a **tenant-scoped** access JWT — one carrying `role` + `gymId` claims
   * the {@link TenantMiddleware} reads to bind the request to a gym and role,
   * the way the `fit` CLI's test tokens do. Used by SuperAdmin owner
   * impersonation (T2.12) to mint a short-lived token that acts as a specific
   * gym's OWNER. `ttlSeconds` overrides the default access-token lifetime so the
   * impersonation token can be far shorter-lived than a normal session.
   */
  signScopedAccessToken(
    params: { userId: string; role: Role; gymId: string; gymSlug: string; ttlSeconds: number },
    issuedAt: number = Math.floor(Date.now() / 1000),
  ): string {
    const secret = this.requireSecret();
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: params.userId,
      type: 'access' as const,
      role: params.role,
      gymId: params.gymId,
      gymSlug: params.gymSlug,
      iat: issuedAt,
      exp: issuedAt + params.ttlSeconds,
      iss: env.JWT_ISSUER,
    };

    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = base64url(createHmac('sha256', secret).update(signingInput).digest());
    return `${signingInput}.${signature}`;
  }

  /**
   * Verify an access JWT and return its claims. Checks the HS256 signature
   * (constant-time) against `JWT_SECRET`, that the token has not expired, and —
   * when present — that the `type` claim is `access` so an opaque refresh token
   * can never be smuggled in (they are not JWTs, but a future JWT refresh token
   * still couldn't be replayed here). Tokens the `fit` CLI mints carry no
   * `type`, which is accepted. Every failure collapses to a single `401` so the
   * verifier reveals nothing about *why* a token was rejected.
   *
   * Throws {@link ServiceUnavailableException} when no signing secret is
   * configured, mirroring issuance — a request can't be authenticated against a
   * secret that doesn't exist.
   */
  verifyAccessToken(token: string): VerifiedAccessClaims {
    const secret = this.requireSecret();

    const parts = token.split('.');
    const [encodedHeader, encodedPayload, providedSignature] = parts;
    if (parts.length !== 3 || !encodedHeader || !encodedPayload || !providedSignature) {
      throw invalidAccessToken();
    }

    const expected = base64url(
      createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest(),
    );
    // Constant-time compare so a forged token can't be tuned byte-by-byte from
    // timing. `timingSafeEqual` throws on length mismatch — treat that as a
    // failed verification rather than a 500.
    const a = Buffer.from(providedSignature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw invalidAccessToken();
    }

    let claims: VerifiedAccessClaims;
    try {
      const decoded: unknown = JSON.parse(base64urlDecode(encodedPayload));
      if (typeof decoded !== 'object' || decoded === null) {
        throw new Error('payload is not an object');
      }
      claims = decoded as VerifiedAccessClaims;
    } catch {
      throw invalidAccessToken();
    }

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw invalidAccessToken();
    }
    if (claims.type !== undefined && claims.type !== 'access') {
      throw invalidAccessToken();
    }
    if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
      throw invalidAccessToken();
    }

    return claims;
  }

  /**
   * Issue a fresh {@link TokenPair} for `userId`: a signed access token and a
   * new refresh-token lineage (its own `familyId`). The refresh secret is
   * returned once, in plaintext; only its hash is persisted.
   */
  async issueTokenPair(
    userId: string,
    claims: SessionClaims,
    deviceFingerprint?: string,
  ): Promise<TokenPair> {
    const accessToken = this.signAccessToken(userId, claims);
    const refreshToken = await this.persistRefreshToken(
      userId,
      randomUUID(),
      claims.gymId,
      deviceFingerprint,
    );
    return { accessToken, refreshToken };
  }

  /**
   * Rotate a refresh token: spend the presented one and return a brand-new
   * {@link TokenPair} whose refresh token continues the same `familyId`.
   *
   * The presented token is matched by hash and must be live (unrevoked and
   * unexpired). Each refresh revokes the token it consumed, so a refresh token
   * is single-use; presenting one twice is the signature of a stolen token
   * being replayed (the legitimate client already rotated it). On that reuse —
   * or on losing the rotate race to a concurrent request — the **entire family
   * is revoked**, logging out the attacker and the victim alike and forcing a
   * fresh login. Unknown / expired / already-revoked tokens all surface as a
   * `401` so the endpoint never reveals which condition held.
   */
  async rotateRefreshToken(
    presentedToken: string,
    claims: SessionClaims,
    deviceFingerprint?: string,
  ): Promise<TokenPair> {
    // Fail fast and identically to issuance if we couldn't sign the successor.
    this.requireSecret();

    const existing = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(presentedToken) },
    });
    if (!existing) {
      throw invalidRefreshToken();
    }

    // A token presented after it was already spent means the lineage leaked.
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      throw invalidRefreshToken();
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw invalidRefreshToken();
    }

    // Spend the presented token, guarding on it still being unrevoked so two
    // concurrent refreshes can't both mint a successor. The loser sees zero
    // rows updated and is treated as a reuse (revoke the whole family).
    const spent = await this.prisma.client.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (spent.count === 0) {
      await this.revokeFamily(existing.familyId);
      throw invalidRefreshToken();
    }

    const accessToken = this.signAccessToken(existing.userId, claims);
    // The successor is pinned to the gym the new access token is scoped to — the
    // same gym as its predecessor whenever the refresh honoured the pin.
    const refreshToken = await this.persistRefreshToken(
      existing.userId,
      existing.familyId,
      claims.gymId,
      deviceFingerprint ?? existing.deviceFingerprint ?? undefined,
    );
    return { accessToken, refreshToken };
  }

  /**
   * Resolve who a (still-live) refresh token belongs to and which gym it is
   * pinned to, without spending it — `null` for an unknown, revoked, or expired
   * token. Lets a caller make pre-rotation decisions (T2.12's gym-suspension
   * gate, re-scoping to the pinned gym) before {@link rotateRefreshToken}
   * mutates anything; the single-use rotation rules still apply when the token
   * is actually spent.
   */
  async sessionForRefreshToken(presentedToken: string): Promise<RefreshTokenSession | null> {
    const existing = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(presentedToken) },
      select: { userId: true, gymId: true, revokedAt: true, expiresAt: true },
    });
    if (!existing || existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return { userId: existing.userId, gymId: existing.gymId ?? null };
  }

  /**
   * Revoke the refresh-token family the presented token belongs to (logout).
   * Idempotent and silent about whether the token existed: an unknown token is
   * a no-op so logout never doubles as a token-probing oracle.
   */
  async revokeRefreshToken(presentedToken: string): Promise<void> {
    const existing = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(presentedToken) },
      select: { familyId: true },
    });
    if (existing) {
      await this.revokeFamily(existing.familyId);
    }
  }

  /**
   * Revoke every still-live refresh token a user holds, across all families and
   * devices. Used when an event invalidates all existing sessions at once — a
   * password reset, where any session an attacker may hold must be cut along
   * with the user's own. Idempotent: a user with no live tokens is a no-op.
   *
   * With `gymId` (a per-gym password change, T1.25) only the sessions pinned to
   * that gym go — a Downtown reset must not sign the person out of Riverside —
   * plus any token with no pin at all, which predates pinning and could be a
   * session on any gym: revoking too much is safe, revoking too little is not.
   */
  async revokeAllForUser(userId: string, gymId?: string | null): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(gymId ? { OR: [{ gymId }, { gymId: null }] } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Persist a refresh token under `familyId` and return its plaintext secret
   * (stored only as a hash). Shared by issuance (new family) and rotation
   * (continuing an existing family).
   */
  private async persistRefreshToken(
    userId: string,
    familyId: string,
    gymId: string | null,
    deviceFingerprint?: string,
  ): Promise<string> {
    const refreshToken = base64url(randomBytes(32));
    await this.prisma.client.refreshToken.create({
      data: {
        userId,
        gymId,
        tokenHash: hashRefreshToken(refreshToken),
        familyId,
        deviceFingerprint: deviceFingerprint ?? null,
        expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL * 1000),
      },
    });
    return refreshToken;
  }

  /** Revoke every still-live token in a family. */
  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private requireSecret(): string {
    if (!env.JWT_SECRET) {
      throw new ServiceUnavailableException('Session signing is not configured (JWT_SECRET unset)');
    }
    return env.JWT_SECRET;
  }
}

/**
 * Hash a refresh-token secret for storage / lookup. SHA-256 is sufficient here:
 * the token is already 256 bits of uniform randomness (unlike a low-entropy
 * password), so there is nothing for a slow hash to defend against.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The single `401` every refresh-token failure collapses to — unknown,
 * expired, and reused tokens are indistinguishable to the caller so the
 * endpoint can't be used to probe which tokens exist or have been revoked.
 * Exported so a refresh refused for a session-level reason (its pinned gym
 * membership is gone) looks the same as a dead token.
 */
export function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Refresh token is invalid or has expired',
    code: 'REFRESH_TOKEN_INVALID',
  });
}

/**
 * The single `401` every access-token failure collapses to — bad signature,
 * malformed payload, wrong `type`, and expiry are indistinguishable to the
 * caller so the verifier can't be used to probe a token's exact defect.
 */
function invalidAccessToken(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Access token is invalid or has expired',
    code: 'ACCESS_TOKEN_INVALID',
  });
}
