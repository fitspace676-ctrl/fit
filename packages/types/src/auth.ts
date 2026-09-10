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
/**
 * An optional staff-invite token (T4.7) carried through registration and login.
 * When present and matching a live invitation for the same address, completing
 * the flow redeems it — creating the gym-staff `GymMember` with the invited role.
 * An absent / unknown / expired token is simply ignored, so a normal sign-up or
 * sign-in is unaffected; the token is therefore never a credential, only context.
 */
export const inviteTokenSchema = z.string().trim().min(1).max(128).optional();

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  name: z.string().trim().min(1).max(100),
  inviteToken: inviteTokenSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** Query for `GET /auth/verify`. */
export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** Query for `GET /auth/accept-invite` — the single-use token from the emailed link. */
export const acceptInviteSchema = z.object({
  token: z.string().trim().min(1),
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/**
 * The tenant a session-issuing call asks to be scoped to — optional context, not
 * a credential. When the sign-in happens on a tenant subdomain (`<slug>.fit.ge`)
 * the client forwards that slug so the issued session binds to *that* gym rather
 * than the user's earliest-joined "primary" one. It is held only to loose
 * DNS-label shape (the real authority is whether the user actually has a
 * membership in the named gym); a slug the user doesn't belong to at all is
 * ignored and the session falls back to the primary gym, so a crafted value can
 * never escalate scope. The full {@link gymSlugSchema} lives in `./gyms`, but is
 * re-derived loosely here to avoid an import cycle.
 *
 * Shared by every flow that mints a session on a subdomain — password login and
 * both OAuth providers — so "which gym did I sign in on?" is one contract rather
 * than one per provider.
 */
export const sessionGymSlugSchema = z.string().trim().toLowerCase().min(1).max(63).optional();

/**
 * Body for `POST /auth/login`. Email is normalised the same way registration
 * normalises it so the lookup matches the stored row. The password is only
 * required to be non-empty here — the registration policy (length bounds) is
 * irrelevant to verifying an already-stored credential, and re-asserting it
 * would needlessly leak the policy to an attacker probing the endpoint.
 *
 * `gymSlug` is the subdomain the sign-in happened on — see
 * {@link sessionGymSlugSchema}.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  gymSlug: sessionGymSlugSchema,
  inviteToken: inviteTokenSchema,
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
 * `403` code returned when the caller explicitly named a gym (a subdomain
 * sign-in) they *do* hold a membership in, but that membership is not `ACTIVE` —
 * invited-but-not-yet-joined, or suspended by the gym.
 *
 * Distinct from a slug the user has no membership in at all, which stays a silent
 * fallback to the primary gym ({@link sessionGymSlugSchema}): asking for a gym you
 * belong to and being quietly signed into a *different* one is the failure this
 * code exists to make visible. The client turns it into "your membership here
 * isn't active yet" rather than a mysterious wrong-tenant session.
 */
export const MEMBERSHIP_NOT_ACTIVE_CODE = 'MEMBERSHIP_NOT_ACTIVE';

/**
 * Body for `POST /auth/forgot-password`. Email is normalised the same way
 * registration normalises it so the lookup matches the stored row. The endpoint
 * never reveals whether the address is registered — it always returns the same
 * generic acknowledgement — so no password policy is asserted here either.
 */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Body for `POST /auth/reset-password`. Carries the single-use reset token from
 * the emailed deep link plus the replacement password, which is held to the same
 * length bounds registration enforces (the reset is where a password is *set*,
 * so the registration policy applies — unlike login, which only verifies one).
 */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Body for `POST /auth/activate` — the gym owner's onboarding link (T2.x). Carries
 * the single-use verification token from the onboarding email plus the password
 * the owner is choosing, held to the same length bounds registration enforces.
 *
 * This is the reset schema's shape, deliberately kept as its own contract: the two
 * endpoints redeem tokens from *different* Redis namespaces and answer differently
 * (a reset signs you in, an activation does not), so a shared alias would invite
 * a client to send one where the other is meant.
 */
export const activateAccountSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export type ActivateAccountInput = z.infer<typeof activateAccountSchema>;

/**
 * Response of `POST /auth/activate`. Deliberately NOT a {@link TokenPair}: setting
 * the password does not sign the owner in. The address is echoed back only so the
 * console can pre-fill the sign-in field it sends them to next — the owner types
 * the password they just chose, which is what makes the first sign-in a real one.
 */
export interface ActivateAccountResponse {
  email: string;
}

/**
 * Body for `POST /auth/google`. Carries the Google-issued ID token (a signed
 * JWT) the web / mobile client obtained from Google Sign-In. The API verifies
 * the token against Google's public keys, then issues its own session — so the
 * client never sees, and the API never trusts, anything but a Google-signed JWT.
 *
 * `gymSlug` carries the subdomain the sign-in happened on, exactly as
 * {@link loginSchema} does — a social sign-in on `<slug>.fit.ge` has to land on
 * the same tenant a password sign-in there would ({@link sessionGymSlugSchema}).
 */
export const googleAuthSchema = z.object({
  idToken: z.string().trim().min(1),
  gymSlug: sessionGymSlugSchema,
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
 *
 * `gymSlug` carries the subdomain the sign-in happened on, exactly as
 * {@link loginSchema} does — a social sign-in on `<slug>.fit.ge` has to land on
 * the same tenant a password sign-in there would ({@link sessionGymSlugSchema}).
 */
export const appleAuthSchema = z.object({
  idToken: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  gymSlug: sessionGymSlugSchema,
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
 * Successful `POST /auth/forgot-password` response. Deliberately generic: it is
 * returned identically whether or not the email matched an account, so the
 * endpoint can't be used to enumerate which addresses are registered.
 */
export interface ForgotPasswordResponse {
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
