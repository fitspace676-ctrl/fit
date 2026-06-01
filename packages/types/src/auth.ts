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

/** Successful `POST /auth/register` response. */
export interface RegisterResponse {
  message: string;
}

/**
 * A signed session: a short-lived access JWT plus an opaque, rotating refresh
 * token. Returned by `GET /auth/verify` (and, from T2.3 onward, by login).
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
