import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { AppleProfile } from '@fit/types';
import { env } from '../config/env';

/** Apple's JWKS endpoint — the RSA public keys ID tokens are signed with. */
const APPLE_CERTS_URL = 'https://appleid.apple.com/auth/keys';

/** Accepted value of an ID token's `iss` claim. */
const APPLE_ISSUER = 'https://appleid.apple.com';

/** Tolerated clock skew (seconds) when checking `exp` against the local clock. */
const CLOCK_SKEW_SECONDS = 60;

/** Fallback cache lifetime (seconds) when Apple omits a usable `max-age`. */
const DEFAULT_CERTS_TTL_SECONDS = 3600;

/** A JWK as Apple publishes it (RSA, used for signature verification). */
interface AppleJwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

/** The ID-token claims this service reads after verifying the signature. */
interface AppleIdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean | string;
}

/**
 * Verifies Apple-issued ID tokens so the API can mint its own session from a
 * "Sign in with Apple" flow (web and mobile alike POST the token to
 * `POST /auth/apple`).
 *
 * The implementation is a near-twin of {@link GoogleOAuthService}: Node's
 * built-in crypto checks the token's RS256 signature against Apple's published
 * JWKS (fetched once and cached for its `Cache-Control` lifetime), then the
 * `iss`, `aud`, and `exp` claims are validated. Only a token that passes every
 * check yields an {@link AppleProfile}; everything else collapses to a single
 * `401 APPLE_TOKEN_INVALID` so the endpoint reveals nothing about which check
 * failed.
 *
 * Two Apple-specific quirks shape the result shape:
 * - Apple never puts the user's name in the ID token (it returns the name once,
 *   out-of-band, on the first authorization), so {@link AppleProfile} carries no
 *   name — the client forwards it separately when creating an account.
 * - Apple only includes `email` on the first authorization (and for some private
 *   relay setups); returning sign-ins may omit it. The email is therefore
 *   optional here, and {@link AuthService} resolves a returning user by `sub`
 *   alone.
 *
 * `APPLE_CLIENT_IDS` is optional (see `config/env.ts`) so the API boots without
 * it; verification then throws {@link ServiceUnavailableException}, mirroring how
 * {@link TokenService} degrades when `JWT_SECRET` is unset.
 */
@Injectable()
export class AppleOAuthService {
  /** Cached JWKS keyed by `kid`, with the epoch-ms the cache expires at. */
  private certsCache: { keys: Map<string, AppleJwk>; expiresAt: number } | null = null;

  /** True when at least one accepted client ID (audience) is configured. */
  get isConfigured(): boolean {
    return this.allowedAudiences().length > 0;
  }

  /**
   * Verify an Apple ID token and return its trustworthy claims. Throws
   * `401 APPLE_TOKEN_INVALID` for any malformed / unverifiable / expired token,
   * or `503` when Apple sign-in is not configured.
   */
  async verifyIdToken(idToken: string): Promise<AppleProfile> {
    const audiences = this.requireAudiences();

    const { header, claims, signingInput, signature } = decodeJwt(idToken);

    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw invalidToken();
    }

    const jwk = await this.publicKeyFor(header.kid);
    if (!jwk || !verifySignature(signingInput, signature, jwk)) {
      throw invalidToken();
    }

    if (claims.iss !== APPLE_ISSUER) {
      throw invalidToken();
    }
    if (!claims.aud || !audiences.includes(claims.aud)) {
      throw invalidToken();
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < now) {
      throw invalidToken();
    }
    if (!claims.sub) {
      throw invalidToken();
    }

    return {
      appleId: claims.sub,
      // Apple omits `email` on returning sign-ins; keep it optional and normalise
      // it the same way local accounts store it when present.
      email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : undefined,
      // The claim arrives as a real boolean from Apple but can be a string when a
      // token is reserialised; treat the string "true" as verified too.
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    };
  }

  /** The configured accepted audiences (parsed from the comma-separated env). */
  private allowedAudiences(): string[] {
    return (env.APPLE_CLIENT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }

  private requireAudiences(): string[] {
    const audiences = this.allowedAudiences();
    if (audiences.length === 0) {
      throw new ServiceUnavailableException(
        'Apple sign-in is not configured (APPLE_CLIENT_IDS unset)',
      );
    }
    return audiences;
  }

  /** Resolve the signing key for `kid`, fetching + caching Apple's JWKS. */
  private async publicKeyFor(kid: string): Promise<AppleJwk | undefined> {
    if (!this.certsCache || this.certsCache.expiresAt <= Date.now()) {
      this.certsCache = await fetchAppleCerts();
    }
    return this.certsCache.keys.get(kid);
  }
}

/** Base64url-decode to a Buffer (tolerates missing padding). */
function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/**
 * Split + decode a compact JWS into its header, claims, signing input (the
 * `header.payload` string the signature covers), and raw signature bytes.
 * Throws `401` on any structural problem so a junk token fails like a bad one.
 */
function decodeJwt(token: string): {
  header: { alg?: string; kid?: string };
  claims: AppleIdTokenClaims;
  signingInput: string;
  signature: Buffer;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw invalidToken();
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  try {
    const header = JSON.parse(base64urlDecode(encodedHeader).toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    const claims = JSON.parse(
      base64urlDecode(encodedPayload).toString('utf8'),
    ) as AppleIdTokenClaims;
    return {
      header,
      claims,
      signingInput: `${encodedHeader}.${encodedPayload}`,
      signature: base64urlDecode(encodedSignature),
    };
  } catch {
    throw invalidToken();
  }
}

/** Verify an RS256 signature over `signingInput` against an Apple JWK. */
function verifySignature(signingInput: string, signature: Buffer, jwk: AppleJwk): boolean {
  try {
    const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
    return createVerify('RSA-SHA256').update(signingInput).verify(key, signature);
  } catch {
    return false;
  }
}

/**
 * Fetch Apple's JWKS and index it by `kid`, deriving the cache lifetime from
 * the response's `Cache-Control: max-age` (falling back to one hour). A failed
 * fetch surfaces as `401` — an inbound token simply can't be verified right now.
 */
async function fetchAppleCerts(): Promise<{ keys: Map<string, AppleJwk>; expiresAt: number }> {
  let response: Response;
  try {
    response = await fetch(APPLE_CERTS_URL);
  } catch {
    throw invalidToken();
  }
  if (!response.ok) {
    throw invalidToken();
  }

  const body = (await response.json().catch(() => null)) as { keys?: AppleJwk[] } | null;
  const keys = new Map<string, AppleJwk>();
  for (const jwk of body?.keys ?? []) {
    if (jwk.kid) keys.set(jwk.kid, jwk);
  }

  const ttl = parseMaxAge(response.headers.get('cache-control')) ?? DEFAULT_CERTS_TTL_SECONDS;
  return { keys, expiresAt: Date.now() + ttl * 1000 };
}

/** Extract `max-age` (seconds) from a `Cache-Control` header, if present. */
function parseMaxAge(cacheControl: string | null): number | undefined {
  if (!cacheControl) return undefined;
  const match = /max-age=(\d+)/i.exec(cacheControl);
  if (!match) return undefined;
  const seconds = Number.parseInt(match[1]!, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * The single `401` every Apple-token failure collapses to — malformed,
 * wrong-audience, expired, and bad-signature tokens are indistinguishable to the
 * caller so the endpoint can't be probed for why a particular token was rejected.
 */
function invalidToken(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Apple token is invalid or has expired',
    code: 'APPLE_TOKEN_INVALID',
  });
}
