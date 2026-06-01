import { createHmac, randomBytes, createHash, randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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

    const refreshToken = base64url(randomBytes(32));
    await this.prisma.client.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(refreshToken),
        familyId: randomUUID(),
        deviceFingerprint: deviceFingerprint ?? null,
        expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL * 1000),
      },
    });

    return { accessToken, refreshToken };
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
