// @fit/types — authentication contracts.
//
// Single source of truth for the shapes crossing the API boundary for auth
// flows: the API validates inbound bodies with these Zod schemas and the web /
// mobile clients reuse the inferred types so request/response shapes never
// drift between sender and receiver.

import { z } from 'zod';

/** Minimum password length enforced everywhere a password is set. */
export const PASSWORD_MIN_LENGTH = 8;
/**
 * Upper bound on password length. argon2 hashes the raw input, so an
 * unbounded password is a cheap denial-of-service vector (hashing megabytes of
 * input). 256 is comfortably above any real passphrase.
 */
export const PASSWORD_MAX_LENGTH = 256;

/**
 * Body for `POST /auth/register`. Email is lower-cased and trimmed so a single
 * identity can't be registered twice under differing case; the password is only
 * length-bounded (composition rules add friction without much security).
 */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  name: z.string().trim().min(1).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** Query for `GET /auth/verify`. */
export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Body for `POST /auth/login`. Email is normalised the same way registration
 * normalises it so the lookup matches the stored row. The password is only
 * required to be non-empty here — the registration policy (length bounds) is
 * irrelevant to verifying an already-stored credential, and re-asserting it
 * would needlessly leak the policy to an attacker probing the endpoint.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Body for `POST /auth/refresh` and `POST /auth/logout`. Carries the opaque
 * refresh token the client received from a previous session-issuing call.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

/**
 * Body for `POST /auth/google`. Carries the Google-issued ID token (a signed
 * JWT) the web / mobile client obtained from Google Sign-In. The API verifies
 * the token against Google's public keys, then issues its own session — so the
 * client never sees, and the API never trusts, anything but a Google-signed JWT.
 */
export const googleAuthSchema = z.object({
  idToken: z.string().trim().min(1),
});

export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

/**
 * The verified subset of a Google ID token's claims the API consumes once the
 * token's signature, issuer, audience, and expiry have been validated. `email`
 * is normalised lower-case to match how local accounts store it.
 */
export interface GoogleProfile {
  /** Google's stable, unique account identifier (the `sub` claim). */
  googleId: string;
  /** The account's email address, lower-cased. */
  email: string;
  /** Whether Google has verified the address (`email_verified` claim). */
  emailVerified: boolean;
  /** The account's display name, when Google supplies one. */
  name?: string;
}

/**
 * Body for `POST /auth/apple`. Carries the Apple-issued ID token (a signed JWT)
 * the web / mobile client obtained from Sign in with Apple. The API verifies the
 * token against Apple's public keys, then issues its own session.
 *
 * Apple never includes the user's name in the ID token — it returns it once,
 * out-of-band, on the first authorization — so the client forwards it in the
 * optional `name` field, used only when creating a brand-new account.
 */
export const appleAuthSchema = z.object({
  idToken: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100).optional(),
});

export type AppleAuthInput = z.infer<typeof appleAuthSchema>;

/**
 * The verified subset of an Apple ID token's claims the API consumes once the
 * token's signature, issuer, audience, and expiry have been validated.
 *
 * Unlike {@link GoogleProfile} the `email` is optional: Apple only includes it on
 * the first authorization (and for some private-relay setups), so a returning
 * sign-in is resolved by `appleId` alone. There is no `name` — Apple never puts
 * it in the token.
 */
export interface AppleProfile {
  /** Apple's stable, unique account identifier (the `sub` claim). */
  appleId: string;
  /** The account's email address, lower-cased — absent on returning sign-ins. */
  email?: string;
  /** Whether Apple has verified the address (`email_verified` claim). */
  emailVerified: boolean;
}

/** Successful `POST /auth/register` response. */
export interface RegisterResponse {
  message: string;
}

/**
 * A signed session: a short-lived access JWT plus an opaque, rotating refresh
 * token. Returned by `GET /auth/verify`, `POST /auth/login`, and
 * `POST /auth/refresh` (which rotates the refresh token on each call).
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
