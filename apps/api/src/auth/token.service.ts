import { createHmac, randomBytes, createHash, randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
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

/** Claims carried by an access token. */
export interface AccessTokenClaims {
  /** Subject — the user id. */
  sub: string;
  /** Token kind, so a refresh token can never be replayed as an access token. */
  type: 'access';
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

  /** Sign an access JWT for `userId`, valid for `JWT_ACCESS_TTL` seconds. */
  signAccessToken(userId: string, issuedAt: number = Math.floor(Date.now() / 1000)): string {
    const secret = this.requireSecret();
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: AccessTokenClaims & { iat: number; exp: number; iss: string } = {
      sub: userId,
      type: 'access',
      iat: issuedAt,
      exp: issuedAt + env.JWT_ACCESS_TTL,
      iss: env.JWT_ISSUER,
    };

    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = base64url(createHmac('sha256', secret).update(signingInput).digest());
    return `${signingInput}.${signature}`;
  }

  /**
   * Issue a fresh {@link TokenPair} for `userId`: a signed access token and a
   * new refresh-token lineage (its own `familyId`). The refresh secret is
   * returned once, in plaintext; only its hash is persisted.
   */
  async issueTokenPair(userId: string, deviceFingerprint?: string): Promise<TokenPair> {
    const accessToken = this.signAccessToken(userId);
    const refreshToken = await this.persistRefreshToken(userId, randomUUID(), deviceFingerprint);
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
  async rotateRefreshToken(presentedToken: string, deviceFingerprint?: string): Promise<TokenPair> {
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

    const accessToken = this.signAccessToken(existing.userId);
    const refreshToken = await this.persistRefreshToken(
      existing.userId,
      existing.familyId,
      deviceFingerprint ?? existing.deviceFingerprint ?? undefined,
    );
    return { accessToken, refreshToken };
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
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
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
    deviceFingerprint?: string,
  ): Promise<string> {
    const refreshToken = base64url(randomBytes(32));
    await this.prisma.client.refreshToken.create({
      data: {
        userId,
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
 */
function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Refresh token is invalid or has expired',
    code: 'REFRESH_TOKEN_INVALID',
  });
}
