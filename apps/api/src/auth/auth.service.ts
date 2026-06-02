import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { GymMemberStatus, GymStatus, Prisma, Role } from '@fit/db';
import type {
  AppleAuthInput,
  AppleProfile,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  GoogleAuthInput,
  LoginInput,
  RefreshInput,
  RegisterGymInput,
  RegisterGymResponse,
  RegisterInput,
  RegisterResponse,
  ResetPasswordInput,
  TokenPair,
} from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppleOAuthService } from './apple-oauth.service';
import { EmailService } from './email.service';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService, type SessionClaims } from './token.service';

/** Redis key namespace for one-time email-verification tokens. */
const VERIFY_KEY_PREFIX = 'email-verify:';

/** Redis key namespace for one-time password-reset tokens. */
const RESET_KEY_PREFIX = 'password-reset:';

/**
 * A valid argon2id digest of a throwaway string. `login` verifies the supplied
 * password against this when no account (or no password hash) matches, so an
 * unknown email costs the same KDF work as a known one — closing the timing
 * side channel that would otherwise let an attacker enumerate registered
 * addresses. The string it hashes is irrelevant; only the constant work is.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$jCFjgDT0SdnSZzDWAmc5IQ$lzgkwiupuASuJMpOlkrAgMK0D3FbA421Uqof/m7orCQ';

/** Build the Redis key holding the user id a verification token resolves to. */
function verifyKey(token: string): string {
  return `${VERIFY_KEY_PREFIX}${token}`;
}

/** Build the Redis key holding the user id a reset token resolves to. */
function resetKey(token: string): string {
  return `${RESET_KEY_PREFIX}${token}`;
}

/**
 * Email/password registration, verification, and session login.
 *
 * Registration ({@link register}) creates the {@link User} with an argon2 hash
 * and emits a single-use verification token (kept in Redis, never in the user
 * row) that the verification email links to. Verification ({@link verifyEmail})
 * consumes that token, stamps `emailVerifiedAt`, and issues the user's first
 * session. {@link login} authenticates an existing user — refusing until that
 * `emailVerifiedAt` stamp is set — and {@link refresh} / {@link logout} drive
 * the rotating refresh-token lifecycle ({@link TokenService}).
 *
 * Every flow is written to not leak whether an email is registered beyond the
 * unavoidable `409` on a duplicate: login spends constant KDF work on unknown
 * accounts and collapses every credential failure to one `401`.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly google: GoogleOAuthService,
    private readonly apple: AppleOAuthService,
  ) {}

  /**
   * Register a new user. Hashes the password, persists the user, mints a
   * single-use verification token in Redis, and sends the verification email.
   * Throws `409 EMAIL_TAKEN` when the address already exists.
   */
  async register(input: RegisterInput): Promise<RegisterResponse> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      // The address is unavoidably revealed as taken here, but no further detail
      // (e.g. whether it's verified) leaks.
      throw new ConflictException({ message: 'Email is already registered', code: 'EMAIL_TAKEN' });
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    const user = await this.prisma.client.user.create({
      data: { email: input.email, name: input.name, passwordHash },
      select: { id: true },
    });

    const token = generateVerificationToken();
    await this.redis.client.set(verifyKey(token), user.id, 'EX', env.EMAIL_VERIFICATION_TTL);

    // Delivery is best-effort: the account + token already exist, so a transient
    // mail failure must not 500 the request (which would orphan an account that
    // then collides on a retry). Log and let registration succeed.
    try {
      await this.email.sendVerificationEmail(input.email, token, input.name);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${input.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { message: 'verification email sent' };
  }

  /**
   * Provision a new gym tenant and onboard its first OWNER
   * (`POST /auth/register-gym`).
   *
   * The gym (the tenant root), the owner {@link User}, and the OWNER
   * {@link GymMember} are created together in a transaction so a half-provisioned
   * tenant can never exist. The owner is resolved by email: an existing account
   * is reused (we never touch its credentials — overwriting them would be an
   * account-takeover vector), otherwise a new account is created with the
   * optional supplied name/password. A slug already in use is rejected with
   * `409 SLUG_TAKEN`; the pre-check is backed by the DB unique constraint so a
   * race still collapses to the same error rather than a 500.
   *
   * This runs on the **unscoped** {@link PrismaService}: provisioning a tenant
   * inherently precedes any tenant context (the route is excluded from
   * `TenantMiddleware`), and `GymMember` is a tenant-scoped model that would fail
   * closed under the tenant Prisma extension with no gym in scope.
   *
   * No session is issued. A not-yet-verified owner receives an onboarding email
   * whose link runs the standard {@link verifyEmail} flow — verifying the address
   * and issuing the first session — mirroring how plain registration defers the
   * session to verification. An already-verified existing owner needs no email.
   */
  async registerGym(input: RegisterGymInput): Promise<RegisterGymResponse> {
    const existingGym = await this.prisma.client.gym.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (existingGym) {
      throw new ConflictException({ message: 'Gym slug is already taken', code: 'SLUG_TAKEN' });
    }

    const existingOwner = await this.prisma.client.user.findUnique({
      where: { email: input.ownerEmail },
      select: { id: true, emailVerifiedAt: true, name: true },
    });

    // Hash outside the transaction — argon2 is deliberately slow and there's no
    // need to hold a DB transaction open across it.
    const passwordHash =
      !existingOwner && input.ownerPassword
        ? await argon2.hash(input.ownerPassword, { type: argon2.argon2id })
        : undefined;

    let provisioned: { gymId: string; ownerId: string; ownerVerified: boolean };
    try {
      provisioned = await this.prisma.client.$transaction(async (tx) => {
        let ownerId: string;
        let ownerVerified: boolean;
        if (existingOwner) {
          ownerId = existingOwner.id;
          ownerVerified = existingOwner.emailVerifiedAt !== null;
        } else {
          const created = await tx.user.create({
            data: {
              email: input.ownerEmail,
              name: input.ownerName ?? null,
              passwordHash: passwordHash ?? null,
            },
            select: { id: true },
          });
          ownerId = created.id;
          ownerVerified = false;
        }

        const gym = await tx.gym.create({
          data: { name: input.name, slug: input.slug, ownerId },
          select: { id: true },
        });

        await tx.gymMember.create({
          data: {
            userId: ownerId,
            gymId: gym.id,
            role: Role.OWNER,
            status: GymMemberStatus.ACTIVE,
          },
        });

        return { gymId: gym.id, ownerId, ownerVerified };
      });
    } catch (error) {
      // Lost the slug race against a concurrent provision — same outcome as the
      // pre-check, surfaced identically rather than as an opaque 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ message: 'Gym slug is already taken', code: 'SLUG_TAKEN' });
      }
      throw error;
    }

    let message: string;
    if (provisioned.ownerVerified) {
      // The owner already proved inbox control on a prior account — nothing to
      // onboard, they can sign in immediately.
      message = 'gym created; owner can sign in with their existing account';
    } else {
      const token = generateVerificationToken();
      await this.redis.client.set(
        verifyKey(token),
        provisioned.ownerId,
        'EX',
        env.EMAIL_VERIFICATION_TTL,
      );

      // Best-effort, exactly like registration: the gym + owner already exist, so
      // a transient mail failure must not 500 a request that already succeeded.
      try {
        await this.email.sendOwnerOnboardingEmail(
          input.ownerEmail,
          token,
          input.name,
          existingOwner?.name ?? input.ownerName,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send owner onboarding email to ${input.ownerEmail}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      message = 'gym created; owner onboarding email sent';
    }

    return {
      gym: { id: provisioned.gymId, name: input.name, slug: input.slug },
      owner: { id: provisioned.ownerId, email: input.ownerEmail },
      message,
    };
  }

  /**
   * Verify an email-verification token: resolve it to a user, stamp
   * `emailVerifiedAt`, delete the token (single-use), and issue the first
   * session. Throws `400 TOKEN_INVALID_OR_EXPIRED` for an unknown / expired
   * token.
   */
  async verifyEmail(token: string): Promise<TokenPair> {
    const key = verifyKey(token);
    const userId = await this.redis.client.get(key);
    if (!userId) {
      throw new BadRequestException({
        message: 'Verification token is invalid or has expired',
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
    }

    // Delete first so a token can't be redeemed twice even if two requests race
    // (DEL returns the number removed: 0 means another request already won).
    const removed = await this.redis.client.del(key);
    if (removed === 0) {
      throw new BadRequestException({
        message: 'Verification token is invalid or has expired',
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
    }

    // Only stamp the timestamp on first verification so re-verifying (were it
    // possible) wouldn't reset it; `updateMany` tolerates a missing row.
    await this.prisma.client.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });

    return this.tokens.issueTokenPair(userId, await this.resolveSessionScope(userId));
  }

  /**
   * Begin a password reset: mint a single-use token in Redis and email the user
   * a reset deep link. The response is deliberately generic and identical
   * whether or not the address matches an account, so the endpoint can't be used
   * to enumerate registered emails. Delivery is best-effort for the same reason
   * registration's is — the token already exists, so a transient mail failure is
   * logged rather than surfaced (which would itself leak that the email exists).
   */
  async requestPasswordReset(input: ForgotPasswordInput): Promise<ForgotPasswordResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true },
    });

    if (user) {
      const token = generateVerificationToken();
      await this.redis.client.set(resetKey(token), user.id, 'EX', env.PASSWORD_RESET_TTL);

      try {
        await this.email.sendPasswordResetEmail(input.email, token, user.name ?? undefined);
      } catch (error) {
        this.logger.error(
          `Failed to send password-reset email to ${input.email}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { message: 'If an account exists for that address, a reset link has been sent' };
  }

  /**
   * Complete a password reset: resolve the single-use token to a user, set the
   * new argon2 password hash, delete the token (single-use), and issue a fresh
   * session. Throws `400 TOKEN_INVALID_OR_EXPIRED` for an unknown / expired token.
   *
   * Two security properties beyond simply rewriting the hash: completing a reset
   * proves control of the inbox, so an unverified account is stamped verified
   * here (a user who reset but still couldn't log in would be a dead end); and
   * every existing session is revoked before the new one is issued, so a reset
   * cuts any session an attacker may hold — the whole point of resetting a
   * possibly-compromised password.
   */
  async resetPassword(input: ResetPasswordInput): Promise<TokenPair> {
    const key = resetKey(input.token);
    const userId = await this.redis.client.get(key);
    if (!userId) {
      throw new BadRequestException({
        message: 'Reset token is invalid or has expired',
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
    }

    // Delete first so a token can't be redeemed twice even if two requests race
    // (DEL returns the number removed: 0 means another request already won).
    const removed = await this.redis.client.del(key);
    if (removed === 0) {
      throw new BadRequestException({
        message: 'Reset token is invalid or has expired',
        code: 'TOKEN_INVALID_OR_EXPIRED',
      });
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    // Set the new hash, and stamp verification only when it was never set — a
    // completed reset proves inbox control just as email verification does, but
    // re-stamping an already-verified account would needlessly move the timestamp.
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.prisma.client.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });

    // Revoke every existing session before minting the new one, so the reset
    // logs out all other devices (including an attacker's) but the caller — who
    // just proved inbox control — walks away signed in.
    await this.tokens.revokeAllForUser(userId);
    return this.tokens.issueTokenPair(userId, await this.resolveSessionScope(userId));
  }

  /**
   * Authenticate an email/password pair and issue a session. Verifies the
   * password against the stored argon2 hash (or a dummy hash, in constant time,
   * when no matching account exists) and collapses every credential failure —
   * unknown email, OAuth-only account, wrong password — to a single
   * `401 INVALID_CREDENTIALS` so the endpoint reveals nothing. A correct but
   * unverified account is rejected with `403 EMAIL_NOT_VERIFIED`.
   */
  async login(input: LoginInput): Promise<TokenPair> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true, emailVerifiedAt: true },
    });

    // Always verify against *some* hash so a missing user / OAuth-only account
    // takes the same time as a real one. `verify` returns false on mismatch and
    // throws on a malformed digest — treat both as a failed login.
    const passwordOk = await argon2
      .verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password)
      .catch(() => false);

    if (!user || !user.passwordHash || !passwordOk) {
      throw new UnauthorizedException({
        message: 'Email or password is incorrect',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Email address has not been verified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    await this.assertGymAccessNotSuspended(user.id);

    return this.tokens.issueTokenPair(user.id, await this.resolveSessionScope(user.id));
  }

  /**
   * Authenticate a "Sign in with Google" flow and issue a session. The client
   * (web or mobile) supplies the Google-issued ID token; {@link GoogleOAuthService}
   * verifies its signature, issuer, audience, and expiry before we trust any
   * claim. The verified Google identity is then resolved to a local user —
   * matched by `googleId`, else linked onto an existing same-email account, else
   * created — and a {@link TokenPair} is issued.
   *
   * Unlike email/password login this needs no separate verification step: Google
   * only federates an address it has already verified, so a Google account whose
   * `email_verified` claim is false is rejected with `403 GOOGLE_EMAIL_NOT_VERIFIED`
   * rather than allowed to silently claim a local identity.
   */
  async loginWithGoogle(input: GoogleAuthInput): Promise<TokenPair> {
    const profile = await this.google.verifyIdToken(input.idToken);

    if (!profile.emailVerified) {
      throw new ForbiddenException({
        message: 'Google account email is not verified',
        code: 'GOOGLE_EMAIL_NOT_VERIFIED',
      });
    }

    const userId = await this.resolveGoogleUser(profile);
    return this.tokens.issueTokenPair(userId, await this.resolveSessionScope(userId));
  }

  /**
   * Resolve a verified {@link GoogleProfile} to a local user id, in precedence
   * order: an account already linked by `googleId`; else an existing account
   * with the same (Google-verified) email, which we link the `googleId` onto —
   * stamping `emailVerifiedAt` if it was never verified locally; else a brand-new
   * OAuth-only account (no password hash).
   */
  private async resolveGoogleUser(profile: {
    googleId: string;
    email: string;
    name?: string;
  }): Promise<string> {
    const byGoogleId = await this.prisma.client.user.findUnique({
      where: { googleId: profile.googleId },
      select: { id: true },
    });
    if (byGoogleId) {
      return byGoogleId.id;
    }

    const byEmail = await this.prisma.client.user.findUnique({
      where: { email: profile.email },
      select: { id: true, emailVerifiedAt: true },
    });
    if (byEmail) {
      // Link Google onto the existing account. The email is Google-verified, so
      // a previously-unverified local account becomes verified by this sign-in.
      await this.prisma.client.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        },
      });
      return byEmail.id;
    }

    const created = await this.prisma.client.user.create({
      data: {
        email: profile.email,
        name: profile.name ?? null,
        googleId: profile.googleId,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Authenticate a "Sign in with Apple" flow and issue a session. The client
   * (web or mobile) supplies the Apple-issued ID token; {@link AppleOAuthService}
   * verifies its signature, issuer, audience, and expiry before we trust any
   * claim. The verified Apple identity is then resolved to a local user and a
   * {@link TokenPair} is issued.
   *
   * Apple's flow differs from Google's in two ways {@link resolveAppleUser}
   * handles: the ID token omits the user's name (so the client forwards it in
   * `input.name`, used only when creating an account), and a returning sign-in
   * may carry no `email` (so a known user is matched by `appleId` alone — the
   * email is only required to establish a *new* identity).
   */
  async loginWithApple(input: AppleAuthInput): Promise<TokenPair> {
    const profile = await this.apple.verifyIdToken(input.idToken);
    const userId = await this.resolveAppleUser(profile, input.name);
    return this.tokens.issueTokenPair(userId, await this.resolveSessionScope(userId));
  }

  /**
   * Resolve a verified {@link AppleProfile} to a local user id, in precedence
   * order: an account already linked by `appleId`; else — needing the
   * (Apple-verified) email to establish identity — an existing same-email account
   * the `appleId` is linked onto (stamping `emailVerifiedAt` if never verified
   * locally); else a brand-new OAuth-only account (no password hash).
   *
   * A returning user is matched by `appleId` before email is even consulted, so
   * the email Apple omits on later sign-ins is never needed. When no `appleId`
   * matches we *do* need the email: an Apple account that withholds it (or whose
   * address Apple reports unverified) can't be linked or created, so it is
   * rejected rather than allowed to silently claim a local identity.
   */
  private async resolveAppleUser(profile: AppleProfile, fallbackName?: string): Promise<string> {
    const byAppleId = await this.prisma.client.user.findUnique({
      where: { appleId: profile.appleId },
      select: { id: true },
    });
    if (byAppleId) {
      return byAppleId.id;
    }

    // No linked account yet — we need a verified email to link or create one.
    if (!profile.email) {
      throw new ForbiddenException({
        message: 'Apple did not provide an email to establish an account',
        code: 'APPLE_EMAIL_UNAVAILABLE',
      });
    }
    if (!profile.emailVerified) {
      throw new ForbiddenException({
        message: 'Apple account email is not verified',
        code: 'APPLE_EMAIL_NOT_VERIFIED',
      });
    }

    const byEmail = await this.prisma.client.user.findUnique({
      where: { email: profile.email },
      select: { id: true, emailVerifiedAt: true },
    });
    if (byEmail) {
      // Link Apple onto the existing account. The email is Apple-verified, so a
      // previously-unverified local account becomes verified by this sign-in.
      await this.prisma.client.user.update({
        where: { id: byEmail.id },
        data: {
          appleId: profile.appleId,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        },
      });
      return byEmail.id;
    }

    const created = await this.prisma.client.user.create({
      data: {
        email: profile.email,
        name: fallbackName ?? null,
        appleId: profile.appleId,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Exchange a refresh token for a fresh session, rotating the refresh token in
   * the process. Delegates the rotation + reuse-detection rules to
   * {@link TokenService.rotateRefreshToken}.
   *
   * Before rotating, the token's owner is gated against gym suspension (T2.12):
   * a member whose every gym has been suspended cannot mint a new session, so a
   * suspension takes effect on the member's next refresh (their short-lived
   * access token expires shortly after). The presented token is left untouched
   * when blocked — reactivating the gym lets the same token refresh again.
   */
  async refresh(input: RefreshInput): Promise<TokenPair> {
    const userId = await this.tokens.userIdForRefreshToken(input.refreshToken);
    if (userId) {
      await this.assertGymAccessNotSuspended(userId);
    }
    // Re-resolve scope so a role change or gym suspension since the last refresh
    // takes effect now. For an unknown/expired token `userId` is null and the
    // rotation below rejects it before these placeholder claims are ever signed.
    const scope: SessionClaims = userId
      ? await this.resolveSessionScope(userId)
      : { gymId: null, role: Role.MEMBER, tokenVersion: 0 };
    return this.tokens.rotateRefreshToken(input.refreshToken, scope);
  }

  /**
   * Resolve the tenant + role a freshly-issued session is scoped to.
   *
   * Every access token must carry the `gymId` + `role` claims the
   * {@link TenantMiddleware} reads — without them the request resolves to the
   * unscoped default (`MEMBER`, no gym), so tenant scoping fails closed and RBAC
   * sees everyone as a `MEMBER`. We pick that scope from the user's gym
   * memberships:
   *
   *   • A `SUPER_ADMIN` membership wins outright — it is a platform-wide role,
   *     independent of any single gym's status.
   *   • Otherwise the session binds to the user's "home" gym: the earliest-joined
   *     active membership in an active gym. A user who belongs to several gyms
   *     lands on one per session; an explicit gym switcher (re-scoping to another
   *     of their gyms) is future work — there is no UI for it yet.
   *   • A user with no active gym membership is a platform-level account: no
   *     tenant, least privilege.
   *
   * Re-resolved on every refresh, so a role change or gym suspension takes effect
   * within one access-token lifetime rather than only at the next full login.
   */
  private async resolveSessionScope(userId: string): Promise<SessionClaims> {
    const [user, memberships] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { tokenVersion: true },
      }),
      this.prisma.client.gymMember.findMany({
        where: { userId, status: GymMemberStatus.ACTIVE },
        select: { gymId: true, role: true, joinedAt: true, gym: { select: { status: true } } },
      }),
    ]);

    const tokenVersion = user?.tokenVersion ?? 0;

    const superAdmin = memberships.find((m) => m.role === Role.SUPER_ADMIN);
    if (superAdmin) {
      return { gymId: superAdmin.gymId, role: Role.SUPER_ADMIN, tokenVersion };
    }

    const primary = memberships
      .filter((m) => m.gym.status === GymStatus.ACTIVE)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
    if (primary) {
      return { gymId: primary.gymId, role: primary.role, tokenVersion };
    }

    return { gymId: null, role: Role.MEMBER, tokenVersion };
  }

  /**
   * Refuse a session to a user whose gym access is wholly suspended.
   *
   * The rule: a user with at least one gym membership must have at least one in
   * a non-suspended gym, or login/refresh is rejected with `403 GYM_SUSPENDED`.
   * A user with no memberships at all (a platform-level account, e.g. a
   * SUPER_ADMIN) is never gated — suspension is a tenant-level lock, not an
   * account one. This gate runs *before* {@link resolveSessionScope} pins the
   * session to one gym, so it asks the session-level question "are all my gyms
   * suspended?" rather than inspecting the about-to-be-issued gym claim; for a
   * single-gym member — the common case — the two are equivalent.
   */
  private async assertGymAccessNotSuspended(userId: string): Promise<void> {
    const [anyMembership, activeMembership] = await Promise.all([
      this.prisma.client.gymMember.findFirst({ where: { userId }, select: { id: true } }),
      this.prisma.client.gymMember.findFirst({
        where: { userId, gym: { status: GymStatus.ACTIVE } },
        select: { id: true },
      }),
    ]);

    if (anyMembership && !activeMembership) {
      throw new ForbiddenException({
        message: 'This gym has been suspended',
        code: 'GYM_SUSPENDED',
      });
    }
  }

  /**
   * End the session the refresh token belongs to by revoking its whole family.
   * Idempotent — an unknown / already-revoked token still resolves cleanly.
   */
  async logout(input: RefreshInput): Promise<void> {
    await this.tokens.revokeRefreshToken(input.refreshToken);
  }
}

/**
 * A high-entropy, URL-safe single-use token (32 chars). `randomBytes` is the
 * right tool for a security token — uniform, unguessable, and dependency-free.
 */
export function generateVerificationToken(): string {
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
