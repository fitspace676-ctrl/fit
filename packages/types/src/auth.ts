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
