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
import { GymMemberStatus, GymStatus, LocationStatus, Prisma, Role } from '@fit/db';
import {
  ALREADY_MEMBER_CODE,
  EMAIL_TAKEN_CODE,
  GYM_SELECTION_REQUIRED_CODE,
  MEMBERSHIP_NOT_ACTIVE_CODE,
  NOT_A_MEMBER_CODE,
  TENANT_MISMATCH_CODE,
  gymPublicMemberIntake,
  gymPublicStartDatePolicy,
  gymPublicTimezone,
  gymSettingsStoredSchema,
  missingSignupIntakeFields,
} from '@fit/types';
import { DEFAULT_EMAIL_LOCALE, resolveEmailLocale, type EmailLocale } from '../mail/email-locale';
import type {
  ActivateAccountInput,
  ActivateAccountResponse,
  AppleAuthInput,
  AppleProfile,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  GoogleAuthInput,
  LoginInput,
  MemberSignupInput,
  RefreshInput,
  RegisterGymInput,
  RegisterGymResponse,
  RegisterInput,
  RegisterResponse,
  ResetPasswordInput,
  ResetPasswordResponse,
  TokenPair,
} from '@fit/types';
import { env } from '../config/env';
import { buildMemberUrl } from '../common/console-url';
import { assertStartDateWithinPolicy } from '../gyms/start-date-policy.util';
import { findDefaultLocationId } from '../locations/default-location';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppleOAuthService } from './apple-oauth.service';
import { EmailService } from './email.service';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService, invalidRefreshToken, type SessionClaims } from './token.service';
import { syncTrainerProfile, type TrainerSyncClient } from '../staff/trainer-profile-sync';

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

/** Build the Redis key holding the subject a verification token resolves to. */
function verifyKey(token: string): string {
  return `${VERIFY_KEY_PREFIX}${token}`;
}

/** Build the Redis key holding the subject a reset token resolves to. */
function resetKey(token: string): string {
  return `${RESET_KEY_PREFIX}${token}`;
}

/**
 * What an emailed single-use token (verification, activation, reset) acts on:
 * the account, and — since credentials became per-gym (T1.25) — the one gym
 * whose credential it verifies or resets. `gymId: null` is the whole identity:
 * a token minted before credentials were per-gym, or a reset asked for with no
 * gym in scope by a member of several (see {@link AuthService.requestPasswordReset}).
 */
interface TokenSubject {
  userId: string;
  gymId: string | null;
}

/** Serialise a token subject for Redis. */
function encodeTokenSubject(subject: TokenSubject): string {
  return JSON.stringify(subject);
}

/**
 * Read a token subject back. A value that is not JSON is a token minted before
 * subjects carried a gym — a bare user id, which reads as the whole identity so a
 * link mailed just before the deploy still works for the length of its TTL.
 */
function decodeTokenSubject(raw: string): TokenSubject {
  if (raw.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const { userId, gymId } = parsed as { userId?: unknown; gymId?: unknown };
        if (typeof userId === 'string' && userId.length > 0) {
          return { userId, gymId: typeof gymId === 'string' && gymId.length > 0 ? gymId : null };
        }
      }
    } catch {
      // Fall through: treat as a legacy bare id.
    }
  }
  return { userId: raw, gymId: null };
}

/**
 * A gym's credential as the sign-in paths project it: the password to check and
 * the verification stamp, plus enough of the gym to name it back to the client.
 */
interface StoredCredential {
  gymId: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  gym: { slug: string; name: string; status: GymStatus };
}

/** The single `401` every password failure collapses to. */
function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Email or password is incorrect',
    code: 'INVALID_CREDENTIALS',
  });
}

/** The single `400` every dead emailed token collapses to. */
function tokenInvalid(what: 'Verification' | 'Activation' | 'Reset'): BadRequestException {
  return new BadRequestException({
    message: `${what} token is invalid or has expired`,
    code: 'TOKEN_INVALID_OR_EXPIRED',
  });
}

/** One of the user's gym memberships, as the session-scope resolver projects it. */
interface ScopeMembership {
  gymId: string;
  role: Role;
  joinedAt: Date;
  gym: { status: GymStatus; slug: string };
}

/**
 * How a caller names the gym a session should bind to, as a predicate over the
 * user's own memberships — the single place the "which of my gyms?" question is
 * expressed, so a second way of asking it (an explicit gym id, rather than the
 * subdomain slug) is a sibling of this rather than another branch inside
 * {@link AuthService.resolveSessionScope}.
 */
function bySlug(gymSlug: string): (membership: ScopeMembership) => boolean {
  return (membership) => membership.gym.slug === gymSlug;
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
 *
 * ## Credentials are per gym (T1.25)
 *
 * The {@link User} is the identity — the address, the OAuth subject ids. What a
 * person signs in to a gym *with* is that gym's {@link GymCredential}: its own
 * password, its own verification stamp, its own name and phone. So the same
 * address can belong to several gyms with a different password in each, a reset
 * on one gym leaves the others alone, and a gym can onboard an address that
 * already exists elsewhere. Every flow below that checks or sets a password
 * therefore first answers "which gym?" — from the request's gym (`gymSlug`, the
 * tenant host, the token's subject) — and only then touches a credential.
 *
 * `User.passwordHash` / `emailVerifiedAt` are still written for a brand-new
 * account and remain the **platform credential**: what a super-admin, or a bare
 * `/auth/register` account with no gym, signs in with. Nothing gym-scoped reads
 * them any more.
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
   *
   * The one exception to that `409` is a staff invitation (T4.7) for an address
   * that already has an account: the invitee is choosing the password for the
   * *inviting* gym, which is a new credential rather than a second account, so
   * the invite is redeemed onto the existing user — with the password just typed
   * — and the request answers exactly as a brand-new registration does. No
   * verification mail goes out for that case: the invite was delivered to the
   * address and is single-use, which is the same proof of inbox control the
   * verification link would establish. A `register` with a stale or mismatched
   * invite on a taken address is still the plain `409`.
   */
  async register(
    input: RegisterInput,
    locale: EmailLocale | null = null,
  ): Promise<RegisterResponse> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      const redeemed = await this.redeemStaffInvite(existing.id, input.email, input.inviteToken, {
        passwordHash,
        name: input.name,
      });
      if (redeemed) {
        return { message: 'verification email sent' };
      }
      // The address is unavoidably revealed as taken here, but no further detail
      // (e.g. whether it's verified) leaks. Unlike {@link signupMember} there is
      // no gym in the request to qualify this with, so it stays the plain
      // "address taken" answer — a bare registration joins nothing.
      throw new ConflictException({
        message: 'Email is already registered',
        code: EMAIL_TAKEN_CODE,
      });
    }

    const user = await this.prisma.client.user.create({
      data: { email: input.email, name: input.name, passwordHash },
      select: { id: true },
    });

    // If this sign-up came from a staff invitation (T4.7), redeem it now so the
    // new account is added to the inviting gym with the invited role — and its
    // credential there carries the password just chosen. Best-effort and
    // self-contained: a bad / mismatched token simply leaves registration
    // unaffected (a normal account is still created). Redeemed first so the
    // verification link below can name the gym it lands on.
    const redeemed = await this.redeemStaffInvite(user.id, input.email, input.inviteToken, {
      passwordHash,
      name: input.name,
    });

    const token = generateVerificationToken();
    await this.redis.client.set(
      verifyKey(token),
      encodeTokenSubject({ userId: user.id, gymId: redeemed?.gymId ?? null }),
      'EX',
      env.EMAIL_VERIFICATION_TTL,
    );

    // Delivery is best-effort: the account + token already exist, so a transient
    // mail failure must not 500 the request (which would orphan an account that
    // then collides on a retry). Log and let registration succeed.
    try {
      await this.email.sendVerificationEmail(
        input.email,
        token,
        input.name,
        locale ?? DEFAULT_EMAIL_LOCALE,
        redeemed?.gymSlug,
      );
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
   * Public member self-signup on one gym (`POST /auth/signup`) — the join
   * wizard's step 3.
   *
   * Differs from {@link register} in three ways, all of which follow from this
   * being a *gym onboarding a paying member* rather than a bare account
   * creation: the `GymMember` is created alongside the `User` (with the profile
   * the front desk needs — phone, date of birth, gender, national id, and the
   * day the buyer says their membership begins), and a session is issued
   * immediately so the buyer walks straight into the portal after paying instead
   * of bouncing off the login screen.
   *
   * The address is still **unverified**: the verification email goes out here
   * exactly as it does for {@link register}, and `login` keeps rejecting an
   * unverified account. So the issued session is a grace period, not an
   * exemption — the member must click the emailed link before their next
   * sign-in. Delivery is best-effort for the same reason it is in `register`: the
   * account and token already exist, so a transient mail failure must not 500 a
   * request the buyer has already paid for.
   *
   * Runs on the **unscoped** Prisma client: `GymMember` is a tenant-scoped model
   * and `/auth/*` is excluded from `TenantMiddleware`, so there is no gym in
   * scope to satisfy the tenant extension — the same reasoning as
   * {@link registerGym}.
   */
  async signupMember(
    input: MemberSignupInput,
    locale: EmailLocale | null = null,
  ): Promise<TokenPair> {
    // Only a live tenant can be joined. An unknown / suspended gym is a 400
    // rather than a 404: `gymId` is client-supplied context resolved from the
    // subdomain, so a bad value is a malformed request, not a missing resource.
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: input.gymId, status: GymStatus.ACTIVE },
      select: { id: true, slug: true, settings: true },
    });
    if (!gym) {
      throw new BadRequestException({ message: 'Unknown gym', code: 'GYM_NOT_FOUND' });
    }

    // The gym decides which profile fields its join form demands (Settings →
    // Membership), exactly as it does for the staff console's Add-Member drawer.
    // Checked here rather than in the schema because only the server can read the
    // gym's settings, and a stale browser tab left open across a settings change
    // must not be able to post a body the current policy rejects.
    const missing = missingSignupIntakeFields(input, gymPublicMemberIntake(gym.settings));
    if (missing.length > 0) {
      throw new BadRequestException({
        message: `This gym’s join form requires: ${missing.join(', ')}`,
        code: 'MEMBER_INTAKE_REQUIRED',
        fields: missing,
      });
    }

    // A volunteered start date answers to the gym's window whether or not the
    // form asked for one — the check above only rejects *missing* fields, so a
    // body that skips the form entirely reaches this line with any date it likes.
    assertStartDateWithinPolicy(
      input.startDate,
      gymPublicStartDatePolicy(gym.settings),
      gymPublicTimezone(gym.settings),
    );

    const locationId = await this.signupHomeBranch(gym.id, input.locationId);

    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      // Someone who already belongs to *this* gym has nothing to join and should
      // just sign in. An address known from another gym (or a plain platform
      // account) is a normal signup: it gets this gym's own membership and its
      // own credential — its own password — below, and the response is the same
      // as for a brand-new address, so the join form cannot be used to learn
      // which addresses exist elsewhere.
      const alreadyMember = await this.prisma.client.gymMember.findUnique({
        where: { userId_gymId: { userId: existing.id, gymId: gym.id } },
        select: { id: true },
      });
      if (alreadyMember) {
        throw new ConflictException({
          message: 'You are already a member of this gym',
          code: ALREADY_MEMBER_CODE,
        });
      }
    }

    // Hash outside the transaction — argon2 is deliberately slow and there is no
    // reason to hold a DB transaction open across it.
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    // The account, the membership and the gym's credential are one unit: a `User`
    // with no `GymMember` would be a person who "joined" a gym they are not a
    // member of, and could not be recovered by retrying (the email would already
    // be taken); a membership with no credential is a member who can never sign in.
    const userId = await this.prisma.client.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            // Every profile field below is optional in the contract now: a gym that
            // asks for none of them gets a member with none of them on file.
            phone: input.phone ?? null,
            passwordHash,
          },
          select: { id: true },
        }));

      await tx.gymMember.create({
        data: {
          userId: user.id,
          gymId: gym.id,
          role: Role.MEMBER,
          status: GymMemberStatus.ACTIVE,
          // A calendar date, not an instant: parsed at UTC midnight so the stored
          // value round-trips to the same `YYYY-MM-DD` in every server timezone.
          dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
          gender: input.gender ?? null,
          personalId: input.personalId ?? null,
          // Same calendar-date treatment, and the same reason. Recorded only:
          // `joinedAt` is still stamped now and still what "starts today" means,
          // and no billing anchor is derived from this — see `GymMember.startDate`.
          startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
          locationId,
        },
      });

      await tx.gymCredential.create({
        data: {
          userId: user.id,
          gymId: gym.id,
          passwordHash,
          name: input.name,
          phone: input.phone ?? null,
        },
      });

      return user.id;
    });

    const token = generateVerificationToken();
    await this.redis.client.set(
      verifyKey(token),
      encodeTokenSubject({ userId, gymId: gym.id }),
      'EX',
      env.EMAIL_VERIFICATION_TTL,
    );
    try {
      // The language the visitor was reading wins; the gym's own language is the
      // fallback for a client that sent none.
      const gymLanguage = gymSettingsStoredSchema.parse(gym.settings ?? {}).locale.language;
      await this.email.sendVerificationEmail(
        input.email,
        token,
        input.name,
        locale ?? resolveEmailLocale(gymLanguage),
        // Verifying lands them back on the gym they just joined, not on
        // whichever site the platform-wide WEB_URL points at.
        gym.slug,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${input.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.tokens.issueTokenPair(userId, await this.resolveSessionScope(userId, gym.slug));
  }

  /**
   * The home branch a self-signup is filed under (decision D1): the branch the
   * body names, else the gym's default, else `null` for a gym with no default.
   * Without one the member sits outside every branch filter in the console.
   *
   * A named branch must be an ACTIVE one of `gymId`. Unknown, inactive and another
   * gym's all get the same `400 LOCATION_NOT_FOUND` — a 400 for the same reason an
   * unknown `gymId` is, and one answer for all three so the endpoint cannot be used
   * to probe which ids exist on other tenants. Both reads run on the base client,
   * so `gymId` is written in by hand.
   */
  private async signupHomeBranch(gymId: string, locationId?: string): Promise<string | null> {
    if (locationId === undefined) {
      return findDefaultLocationId(this.prisma.client, gymId);
    }
    const branch = await this.prisma.client.location.findFirst({
      where: { id: locationId, gymId, status: LocationStatus.ACTIVE },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException({ message: 'Unknown location', code: 'LOCATION_NOT_FOUND' });
    }
    return branch.id;
  }

  /**
   * Provision a new gym tenant and onboard its first OWNER
   * (`POST /auth/register-gym`).
   *
   * The gym (the tenant root), the owner {@link User}, the OWNER {@link GymMember}
   * and the owner's credential for the new gym are created together in a
   * transaction so a half-provisioned tenant can never exist. An `ownerEmail`
   * that already has an account is *reused* rather than refused: the new gym gets
   * its own credential (with the supplied password, or none until activation) and
   * the existing gyms are untouched — so the same person can own or belong to
   * several gyms, each with its own password. The onboarding link is what binds
   * the address to the gym; until it is followed the credential has no verified
   * stamp, so an address provisioned without its holder's knowledge can sign in
   * nowhere. A subdomain already in use is rejected with `409 SUBDOMAIN_TAKEN`;
   * the pre-check is backed by the DB unique constraint, so a race still
   * collapses to the same `409` rather than a `500`.
   *
   * `createdByUserId` records who provisioned the gym: the owner on self-signup,
   * and the acting SUPER_ADMIN when the operator console creates a gym on an
   * owner's behalf — which is what `createdBy` carries. That is the ONLY
   * difference between the two paths, deliberately: a gym is a gym, and letting
   * the operator route grow its own provisioning code is how a platform ends up
   * with two subtly different kinds of tenant.
   *
   * This runs on the **unscoped** {@link PrismaService}: provisioning a tenant
   * inherently precedes any tenant context (the route is excluded from
   * `TenantMiddleware`), and `GymMember` is a tenant-scoped model that would fail
   * closed under the tenant Prisma extension with no gym in scope.
   *
   * No session is issued. The owner receives an onboarding email whose link lands
   * on the new gym's own console (`https://<slug>.<root>/admin/activate`), where
   * {@link activateAccount} verifies the address and sets the first password in
   * one request. A supplied `password` is set on the new account up front.
   */
  async registerGym(
    input: RegisterGymInput,
    createdBy?: string,
    locale: EmailLocale | null = null,
  ): Promise<RegisterGymResponse> {
    const [existingGym, existingOwner] = await Promise.all([
      this.prisma.client.gym.findUnique({
        where: { slug: input.subdomainSlug },
        select: { id: true },
      }),
      this.prisma.client.user.findUnique({
        where: { email: input.ownerEmail },
        select: { id: true },
      }),
    ]);
    if (existingGym) {
      throw new ConflictException({
        message: 'Subdomain is already taken',
        code: 'SUBDOMAIN_TAKEN',
      });
    }

    // Hash outside the transaction — argon2 is deliberately slow and there's no
    // need to hold a DB transaction open across it.
    const passwordHash = input.password
      ? await argon2.hash(input.password, { type: argon2.argon2id })
      : null;

    let provisioned: { gymId: string; ownerId: string };
    try {
      provisioned = await this.prisma.client.$transaction(async (tx) => {
        const owner =
          existingOwner ??
          (await tx.user.create({
            data: {
              email: input.ownerEmail,
              name: input.ownerName ?? null,
              passwordHash,
            },
            select: { id: true },
          }));

        const gym = await tx.gym.create({
          data: {
            name: input.gymName,
            slug: input.subdomainSlug,
            ownerId: owner.id,
            createdByUserId: createdBy ?? owner.id,
          },
          select: { id: true },
        });

        await tx.gymMember.create({
          data: {
            userId: owner.id,
            gymId: gym.id,
            role: Role.OWNER,
            status: GymMemberStatus.ACTIVE,
          },
        });

        await tx.gymCredential.create({
          data: {
            userId: owner.id,
            gymId: gym.id,
            passwordHash,
            name: input.ownerName ?? null,
          },
        });

        return { gymId: gym.id, ownerId: owner.id };
      });
    } catch (error) {
      // Lost a unique-constraint race against a concurrent provision — surface
      // the same 409 the pre-check would, mapped to whichever target collided.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflictFromUniqueTarget(error);
      }
      throw error;
    }

    const token = generateVerificationToken();
    await this.redis.client.set(
      verifyKey(token),
      encodeTokenSubject({ userId: provisioned.ownerId, gymId: provisioned.gymId }),
      'EX',
      env.EMAIL_VERIFICATION_TTL,
    );

    // Best-effort, exactly like registration: the gym + owner already exist, so a
    // transient mail failure must not 500 a request that already succeeded.
    try {
      await this.email.sendOwnerOnboardingEmail(
        input.ownerEmail,
        token,
        input.gymName,
        input.ownerName,
        locale ?? DEFAULT_EMAIL_LOCALE,
        input.subdomainSlug,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send owner onboarding email to ${input.ownerEmail}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      gymId: provisioned.gymId,
      subdomainSlug: input.subdomainSlug,
      ownerUserId: provisioned.ownerId,
    };
  }

  /**
   * Verify an email-verification token: resolve it to its subject, stamp the
   * verification, delete the token (single-use), and issue the first session.
   * Throws `400 TOKEN_INVALID_OR_EXPIRED` for an unknown / expired token.
   *
   * A token minted for one gym stamps **that gym's credential** — the mail was
   * sent by that gym and lands on its site — and the session binds to that gym.
   * A whole-identity token (a bare registration, or one minted before credentials
   * were per-gym) stamps the user and every credential they hold.
   */
  async verifyEmail(token: string): Promise<TokenPair> {
    const key = verifyKey(token);
    const raw = await this.redis.client.get(key);
    if (!raw) {
      throw tokenInvalid('Verification');
    }

    // Delete first so a token can't be redeemed twice even if two requests race
    // (DEL returns the number removed: 0 means another request already won).
    const removed = await this.redis.client.del(key);
    if (removed === 0) {
      throw tokenInvalid('Verification');
    }

    const { userId, gymId } = decodeTokenSubject(raw);
    await this.stampVerified(userId, gymId);

    const gymSlug = gymId ? await this.gymSlugById(gymId) : undefined;
    return this.tokens.issueTokenPair(userId, await this.resolveSessionScope(userId, gymSlug));
  }

  /**
   * Record that the address was verified — for one gym's credential when `gymId`
   * names one, for the identity and every credential otherwise. Only a still-null
   * stamp is written, so re-verifying (were it possible) never moves an existing
   * timestamp; `updateMany` tolerates a missing row. The user's own stamp is set
   * alongside a per-gym one because it is still what a platform credential reads.
   */
  private async stampVerified(userId: string, gymId: string | null): Promise<void> {
    const now = new Date();
    await this.prisma.client.gymCredential.updateMany({
      where: { userId, ...(gymId ? { gymId } : {}), emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
    await this.prisma.client.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
  }

  /** The slug of a gym by id, or `undefined` once the gym is gone. */
  private async gymSlugById(gymId: string): Promise<string | undefined> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: gymId },
      select: { slug: true },
    });
    return gym?.slug;
  }

  /**
   * Activate a gym owner's account from their onboarding link: redeem the
   * single-use verification token, set the first password, and stamp
   * `emailVerifiedAt` — one request, so an owner never lands in the half-state of
   * a verified address with no credential to sign in with (which is exactly what
   * `POST /auth/register-gym` leaves behind when the operator console provisions a
   * gym without a password). Throws `400 TOKEN_INVALID_OR_EXPIRED` for an unknown
   * / expired token.
   *
   * **No session is issued, deliberately.** The owner is sent to the console's
   * sign-in with their address pre-filled and types the password they have just
   * chosen: the first sign-in is then a real one, and a link forwarded to the
   * wrong inbox cannot hand anybody a live console — only the password can.
   * {@link verifyEmail} keeps its own contract (verify + session), because mobile
   * and web registration are built on it.
   *
   * The password is written to the **new gym's credential** — the token names the
   * gym it was minted for — so an owner who already belongs to other gyms keeps
   * every other password they have. Every session on that gym is revoked before
   * returning, mirroring {@link resetPassword}: this endpoint sets a password
   * without proving knowledge of the previous one, so anything already signed in
   * there must go. For a fresh owner this is a no-op — the gym is minutes old.
   *
   * `tenantSlug` is the gym the request's host names (`<slug>.<root>/admin/activate`).
   * When there is one, it must be the token's own gym, or the request is refused
   * with `403 TENANT_MISMATCH` *before* the token is spent — a Downtown link
   * opened on Riverside's console must not set a password from Riverside's door.
   * No tenant host (localhost, the console's own deployment) → no check.
   */
  async activateAccount(
    input: ActivateAccountInput,
    tenantSlug?: string | null,
  ): Promise<ActivateAccountResponse> {
    const key = verifyKey(input.token);
    const raw = await this.redis.client.get(key);
    if (!raw) {
      throw tokenInvalid('Activation');
    }
    const { userId, gymId } = decodeTokenSubject(raw);

    if (tenantSlug) {
      const onHost = gymId
        ? (await this.gymSlugById(gymId)) === tenantSlug
        : // A whole-identity token (minted before tokens named a gym): the account
          // must at least belong to the host's gym.
          Boolean(
            await this.prisma.client.gymMember.findFirst({
              where: { userId, gym: { slug: tenantSlug } },
              select: { id: true },
            }),
          );
      if (!onHost) {
        throw new ForbiddenException({
          message: 'Activation link belongs to a different gym',
          code: TENANT_MISMATCH_CODE,
        });
      }
    }

    // Delete first so a token can't be redeemed twice even if two requests race
    // (DEL returns the number removed: 0 means another request already won).
    const removed = await this.redis.client.del(key);
    if (removed === 0) {
      throw tokenInvalid('Activation');
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.writePassword(userId, gymId, passwordHash);

    await this.tokens.revokeAllForUser(userId, gymId);
    return { email: user.email };
  }

  /**
   * Set a password from an emailed token, and stamp the address verified —
   * completing the flow proves inbox control just as the verification link does.
   *
   * With a gym: that gym's credential alone (created if the token outlived the
   * row, so the write can never be lost). Without one — a whole-identity token —
   * the user's own platform credential and every credential they hold, which is
   * what such a token meant when it was minted. Returns the address for the
   * caller's response.
   */
  private async writePassword(
    userId: string,
    gymId: string | null,
    passwordHash: string,
  ): Promise<{ email: string }> {
    if (gymId) {
      await this.prisma.client.gymCredential.upsert({
        where: { userId_gymId: { userId, gymId } },
        create: { userId, gymId, passwordHash },
        update: { passwordHash },
      });
      await this.stampVerified(userId, gymId);
      const user = await this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return { email: user?.email ?? '' };
    }

    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { email: true },
    });
    await this.prisma.client.gymCredential.updateMany({
      where: { userId },
      data: { passwordHash },
    });
    await this.stampVerified(userId, null);
    return user;
  }

  /**
   * Begin a password reset: mint a single-use token in Redis and email the user
   * a reset deep link. The response is deliberately generic and identical
   * whether or not the address matches an account, so the endpoint can't be used
   * to enumerate registered emails. Delivery is best-effort for the same reason
   * registration's is — the token already exists, so a transient mail failure is
   * logged rather than surfaced (which would itself leak that the email exists).
   *
   * The reset is for **one gym's credential**: the gym the body names
   * (`gymSlug`, the mobile app's remembered gym) or, failing that, the gym whose
   * site the request arrived on (`tenantSlug`). The token is minted only when the
   * account holds a credential there, and the link lands on that gym's site — the
   * gym is a caller-chosen selector, and without the check anyone could have a
   * stranger's single-use token mailed for a gym of their own choosing. With no
   * gym named at all (`app.<root>`), an account with exactly one credential gets
   * that one; an account with none (a platform account) or several gets a
   * whole-identity token that resets every password it has, mailed to the
   * platform-wide reset page — the pre-per-gym behaviour, kept only where there
   * is no gym to narrow to.
   */
  async requestPasswordReset(
    input: ForgotPasswordInput,
    locale: EmailLocale | null = null,
    tenantSlug: string | null = null,
  ): Promise<ForgotPasswordResponse> {
    const gymSlug = input.gymSlug ?? tenantSlug;
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        name: true,
        credentials: { select: { gymId: true, name: true, gym: { select: { slug: true } } } },
      },
    });

    const target = user ? resetTarget(user.credentials, gymSlug) : null;
    if (user && target) {
      const token = generateVerificationToken();
      await this.redis.client.set(
        resetKey(token),
        encodeTokenSubject({ userId: user.id, gymId: target.gymId }),
        'EX',
        env.PASSWORD_RESET_TTL,
      );

      try {
        await this.email.sendPasswordResetEmail(
          input.email,
          token,
          target.name ?? user.name ?? undefined,
          locale ?? DEFAULT_EMAIL_LOCALE,
          target.gymSlug,
        );
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
   *
   * The password written is the one the token was minted for: **that gym's
   * credential** alone, so a reset on Downtown leaves Riverside's password — and
   * Riverside's sessions — untouched. A whole-identity token (see
   * {@link requestPasswordReset}) rewrites every password the account has.
   *
   * The session is scoped by `tenantSlug`, the host the reset was completed on.
   * On a gym host it binds to *that* gym, and only when it is the token's own gym
   * and the account holds an active membership in it (in an active gym);
   * otherwise the password still changes but no session is issued
   * (`sessionIssued: false`) — never one on another gym, which would put a
   * `riverside` visitor on `downtown`. Scope is resolved after the write, so an
   * unusable membership cannot leave the password unchanged. A tenant-less host
   * (the mobile app) binds to the token's gym, or the primary gym for a
   * whole-identity token.
   */
  async resetPassword(
    input: ResetPasswordInput,
    tenantSlug?: string | null,
  ): Promise<ResetPasswordResponse> {
    const key = resetKey(input.token);
    const raw = await this.redis.client.get(key);
    if (!raw) {
      throw tokenInvalid('Reset');
    }

    // Delete first so a token can't be redeemed twice even if two requests race
    // (DEL returns the number removed: 0 means another request already won).
    const removed = await this.redis.client.del(key);
    if (removed === 0) {
      throw tokenInvalid('Reset');
    }

    const { userId, gymId } = decodeTokenSubject(raw);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.writePassword(userId, gymId, passwordHash);

    // Revoke every existing session on the gym(s) whose password just changed
    // before minting the new one, so the reset logs out all other devices
    // (including an attacker's) there but the caller — who just proved inbox
    // control — walks away signed in.
    await this.tokens.revokeAllForUser(userId, gymId);

    const tokenGymSlug = gymId ? await this.gymSlugById(gymId) : undefined;
    if (gymId && (!tokenGymSlug || (tenantSlug && tenantSlug !== tokenGymSlug))) {
      // The gym is gone, or the link was completed on another gym's site: the
      // password is set, but there is no session to hand out here.
      return { ok: true, sessionIssued: false };
    }
    const hostSlug = tokenGymSlug ?? tenantSlug;
    const scope = hostSlug
      ? await this.resetHostScope(userId, hostSlug)
      : await this.resolveSessionScope(userId);
    if (!scope) {
      return { ok: true, sessionIssued: false };
    }
    return { ...(await this.tokens.issueTokenPair(userId, scope)), sessionIssued: true };
  }

  /**
   * The session a reset completed on `gymSlug`'s host may carry: that gym's scope
   * when the account is an active member of it (and the gym is active), else
   * `null`. Checked up front so {@link resolveSessionScope} is never left to fall
   * back to the primary gym or to refuse an invited / suspended membership; the
   * final slug comparison also turns away a platform super-admin, whose scope is
   * tenant-less and does not belong on a gym host.
   */
  private async resetHostScope(userId: string, gymSlug: string): Promise<SessionClaims | null> {
    const membership = await this.prisma.client.gymMember.findFirst({
      where: {
        userId,
        status: GymMemberStatus.ACTIVE,
        gym: { slug: gymSlug, status: GymStatus.ACTIVE },
      },
      select: { id: true },
    });
    if (!membership) {
      return null;
    }
    const scope = await this.resolveSessionScope(userId, gymSlug);
    return scope.gymSlug === gymSlug ? scope : null;
  }

  /**
   * Authenticate an email/password pair and issue a session. Verifies the
   * password against the stored argon2 hash (or a dummy hash, in constant time,
   * when no matching credential exists) and collapses every credential failure —
   * unknown email, OAuth-only account, wrong password, no credential in the named
   * gym — to a single `401 INVALID_CREDENTIALS` so the endpoint reveals nothing.
   * A correct but unverified credential is rejected with `403 EMAIL_NOT_VERIFIED`.
   *
   * Which password is checked is the gym's (T1.25):
   *
   *   • On a gym host — `gymSlug` from the body, else `tenantSlug` from the host
   *     — **that gym's credential** and nothing else. A member of Downtown typing
   *     their Downtown password on Riverside's site is a `401`, not a Riverside
   *     session; there is no password to check there, and answering otherwise
   *     would say which gyms an address belongs to.
   *   • A platform super-admin always signs in with the platform credential
   *     (`User.passwordHash`) and lands tenant-less, whichever host it uses.
   *   • With no gym named at all (the mobile app, `app.<root>`), the password is
   *     checked against every credential in a live gym: one match signs in there;
   *     several — the same password at several gyms, which every account had the
   *     day credentials became per-gym — answer `409 GYM_SELECTION_REQUIRED`
   *     listing *only the gyms the password unlocked*, so the client can ask
   *     which one and sign in again naming it. An account with no gym credential
   *     at all (a bare registration) falls back to the platform credential.
   */
  async login(input: LoginInput, tenantSlug?: string | null): Promise<TokenPair> {
    const gymSlug = input.gymSlug ?? tenantSlug ?? undefined;
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        passwordHash: true,
        emailVerifiedAt: true,
        isSuperAdmin: true,
        credentials: {
          select: {
            gymId: true,
            passwordHash: true,
            emailVerifiedAt: true,
            gym: { select: { slug: true, name: true, status: true } },
          },
        },
      },
    });

    const credential = await this.matchCredential(user, gymSlug, input.password);
    if (!user || !credential) {
      throw invalidCredentials();
    }

    if (!credential.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Email address has not been verified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Redeem a staff invitation (T4.7) before scope resolution, so an existing
    // user signing in via the invite link picks up the new staff membership in
    // this same session. Best-effort: a bad / mismatched token leaves login
    // unchanged.
    await this.redeemStaffInvite(user.id, input.email, input.inviteToken);

    // The gym the session binds to: the one asked for, else the one whose
    // password matched (a platform credential names none).
    const sessionSlug = user.isSuperAdmin ? undefined : (gymSlug ?? credential.gymSlug);
    await this.assertGymAccessNotSuspended(user.id, sessionSlug);

    return this.tokens.issueTokenPair(
      user.id,
      await this.resolveSessionScope(user.id, sessionSlug, { signIn: true }),
    );
  }

  /**
   * The credential `password` unlocks for this sign-in, or `null` when none does.
   *
   * Always verifies against *some* hash — the matching credential's, or the dummy
   * when there is no user, no credential in the named gym, or no password on it —
   * so an unknown address, an unknown gym and an OAuth-only account all cost the
   * same KDF work as a real sign-in. `verify` returns false on mismatch and throws
   * on a malformed digest; both are a miss. The tenant-less case verifies every
   * live-gym credential in parallel and, when the password opens more than one,
   * answers `409 GYM_SELECTION_REQUIRED` with those gyms — after the password has
   * checked out, so the list is only ever handed to its owner.
   */
  private async matchCredential(
    user: {
      passwordHash: string | null;
      emailVerifiedAt: Date | null;
      isSuperAdmin: boolean;
      credentials: StoredCredential[];
    } | null,
    gymSlug: string | undefined,
    password: string,
  ): Promise<{ gymSlug?: string; emailVerifiedAt: Date | null } | null> {
    const verify = (hash: string | null): Promise<boolean> =>
      argon2.verify(hash ?? DUMMY_PASSWORD_HASH, password).then(
        (ok) => ok && hash !== null,
        () => false,
      );

    if (!user) {
      await verify(null);
      return null;
    }

    if (user.isSuperAdmin) {
      return (await verify(user.passwordHash)) ? { emailVerifiedAt: user.emailVerifiedAt } : null;
    }

    if (gymSlug) {
      const credential = user.credentials.find((c) => c.gym.slug === gymSlug) ?? null;
      return (await verify(credential?.passwordHash ?? null)) && credential
        ? { gymSlug, emailVerifiedAt: credential.emailVerifiedAt }
        : null;
    }

    const candidates = user.credentials.filter(
      (c) => c.passwordHash !== null && c.gym.status === GymStatus.ACTIVE,
    );
    if (candidates.length === 0) {
      return (await verify(user.passwordHash)) ? { emailVerifiedAt: user.emailVerifiedAt } : null;
    }

    const results = await Promise.all(candidates.map((c) => verify(c.passwordHash)));
    const matched = candidates.filter((_, index) => results[index]);
    if (matched.length === 0) {
      return null;
    }
    if (matched.length > 1) {
      throw new ConflictException({
        message: 'This password signs you in to more than one gym — choose one',
        code: GYM_SELECTION_REQUIRED_CODE,
        data: { gyms: matched.map((c) => ({ slug: c.gym.slug, name: c.gym.name })) },
      });
    }
    const [only] = matched;
    return { gymSlug: only!.gym.slug, emailVerifiedAt: only!.emailVerifiedAt };
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
    // Gate suspended tenants here too — otherwise a suspended gym's members
    // could keep getting fresh sessions via social login while email/password
    // login and refresh are blocked.
    await this.assertGymAccessNotSuspended(userId, input.gymSlug);
    const scope = await this.resolveSessionScope(userId, input.gymSlug, { signIn: true });
    await this.ensureSocialCredential(userId, scope.gymId, profile.name);
    return this.tokens.issueTokenPair(userId, scope);
  }

  /**
   * Make sure the gym a social sign-in lands on has a credential for the account
   * (T1.25): verified — the provider vouched for the address — and without a
   * password, which stays whatever the member set for that gym, if anything. A
   * membership can predate its credential only for a row written before
   * credentials existed and missed by the backfill, so this is a no-op almost
   * always; the name is only ever *filled in*, never overwritten. Nothing to do
   * for a tenant-less session.
   */
  private async ensureSocialCredential(
    userId: string,
    gymId: string | null,
    name?: string,
  ): Promise<void> {
    if (!gymId) {
      return;
    }
    const existing = await this.prisma.client.gymCredential.findUnique({
      where: { userId_gymId: { userId, gymId } },
      select: { emailVerifiedAt: true, name: true },
    });
    if (!existing) {
      await this.prisma.client.gymCredential.create({
        data: { userId, gymId, emailVerifiedAt: new Date(), name: name ?? null },
      });
      return;
    }
    if (!existing.emailVerifiedAt || (!existing.name && name)) {
      await this.prisma.client.gymCredential.update({
        where: { userId_gymId: { userId, gymId } },
        data: {
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          name: existing.name ?? name ?? null,
        },
      });
    }
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
    // Gate suspended tenants here too (see loginWithGoogle) so social login can't
    // sidestep a suspension that blocks email/password login and refresh.
    await this.assertGymAccessNotSuspended(userId, input.gymSlug);
    const scope = await this.resolveSessionScope(userId, input.gymSlug, { signIn: true });
    await this.ensureSocialCredential(userId, scope.gymId, input.name);
    return this.tokens.issueTokenPair(userId, scope);
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
   *
   * The session stays on the gym it was issued for. A refresh token pinned to a
   * gym re-resolves scope *within that gym* — never the user's primary one — so a
   * member signed in on `riverside` is still on riverside after a refresh. When
   * that is no longer possible the refresh is refused: the gym suspended is
   * `403 GYM_SUSPENDED` (as before), the membership gone or no longer active, or
   * the gym deleted, is the ordinary `401 REFRESH_TOKEN_INVALID`, sending the
   * client back to sign in. An unpinned token (a platform session, or one issued
   * before the pin existed) keeps the old behaviour, with `tenantSlug` — the
   * tenant host the refresh arrived on — choosing among the user's gyms the way
   * a subdomain sign-in does.
   */
  async refresh(input: RefreshInput, tenantSlug?: string | null): Promise<TokenPair> {
    const session = await this.tokens.sessionForRefreshToken(input.refreshToken);
    if (!session) {
      // Unknown / revoked / expired: the rotation rejects it (running reuse
      // detection on a revoked one) before these placeholder claims are signed.
      return this.tokens.rotateRefreshToken(input.refreshToken, {
        gymId: null,
        gymSlug: null,
        role: Role.MEMBER,
        tokenVersion: 0,
      });
    }

    // Re-resolve scope so a role change or gym suspension since the last refresh
    // takes effect now.
    const { userId, gymId: pinnedGymId } = session;
    if (pinnedGymId) {
      const pinned = await this.prisma.client.gym.findUnique({
        where: { id: pinnedGymId },
        select: { slug: true },
      });
      if (!pinned) {
        throw invalidRefreshToken();
      }
      await this.assertGymAccessNotSuspended(userId, pinned.slug);
      const scope = await this.resolveSessionScope(userId, pinned.slug, { pinned: true });
      return this.tokens.rotateRefreshToken(input.refreshToken, scope);
    }

    const gymSlug = tenantSlug ?? undefined;
    await this.assertGymAccessNotSuspended(userId, gymSlug);
    const scope = await this.resolveSessionScope(userId, gymSlug);
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
   *   • A platform `SUPER_ADMIN` (the `User.isSuperAdmin` flag) wins outright and
   *     resolves to a tenant-less session (`gymId = null`): the role is
   *     platform-wide, not gym-scoped, so it is never bound to one gym.
   *   • When `gymSlug` is supplied (the sign-in happened on a `<slug>.fit.ge`
   *     subdomain) and the user has an active membership in that active gym, the
   *     session binds to *that* gym — so a multi-gym user lands on the tenant they
   *     actually signed in on, not their earliest-joined one. The slug is only a
   *     selector among the user's own memberships, so it can never widen scope. A
   *     slug they *do* belong to but whose membership is not `ACTIVE` (invited,
   *     suspended) is refused with `403 MEMBERSHIP_NOT_ACTIVE`; on a sign-in
   *     (`signIn: true`) a slug they don't belong to at all is refused with
   *     `403 NOT_A_MEMBER` — silently signing them into a different gym than the
   *     one they asked for is the failure both gates exist to prevent.
   *   • Otherwise the session binds to the user's "home" gym: the earliest-joined
   *     active membership in an active gym. A user who belongs to several gyms
   *     lands on one per session; switching tenants is done by signing in on the
   *     other gym's subdomain.
   *   • A user with no active gym membership is a platform-level account: no
   *     tenant, least privilege.
   *
   * Re-resolved on every refresh, so a role change or gym suspension takes effect
   * within one access-token lifetime rather than only at the next full login.
   * A refresh passes the slug of the gym its token is pinned to with
   * `pinned: true`, which turns "not a member there" from a silent fallback to
   * the primary gym into `401 REFRESH_TOKEN_INVALID`: a session must never
   * change gyms on its own.
   */
  private async resolveSessionScope(
    userId: string,
    gymSlug?: string,
    options: { pinned?: boolean; signIn?: boolean } = {},
  ): Promise<SessionClaims> {
    const [user, memberships] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { tokenVersion: true, isSuperAdmin: true },
      }),
      this.prisma.client.gymMember.findMany({
        where: { userId, status: GymMemberStatus.ACTIVE },
        select: {
          gymId: true,
          role: true,
          joinedAt: true,
          gym: { select: { status: true, slug: true } },
        },
      }),
    ]);

    const tokenVersion = user?.tokenVersion ?? 0;

    if (user?.isSuperAdmin) {
      return { gymId: null, gymSlug: null, role: Role.SUPER_ADMIN, tokenVersion };
    }

    const active = memberships.filter((m) => m.gym.status === GymStatus.ACTIVE);
    const scopeOf = (m: ScopeMembership): SessionClaims => ({
      gymId: m.gymId,
      gymSlug: m.gym.slug,
      role: m.role,
      tokenVersion,
    });

    // Subdomain-scoped sign-in: bind to the named gym when the user belongs to it.
    if (gymSlug) {
      const onSubdomain = active.find(bySlug(gymSlug));
      if (onSubdomain) {
        return scopeOf(onSubdomain);
      }
      if (options.pinned) {
        // The session's own gym, and the user is no longer an active member of
        // it (or the gym is not active). Refuse rather than move gyms.
        throw invalidRefreshToken();
      }
      // Asked for a gym and didn't get it. A membership there that isn't usable
      // is refused; so, on a sign-in, is no membership there at all — handing
      // back a session for another gym is how gyms got mixed on one host.
      await this.assertRequestedMembershipActive(userId, gymSlug, options);
    }

    const primary = active.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
    if (primary) {
      return scopeOf(primary);
    }

    return { gymId: null, gymSlug: null, role: Role.MEMBER, tokenVersion };
  }

  /**
   * Refuse a session on a gym the caller explicitly asked for but cannot have:
   * a membership that is not `ACTIVE` — `403 MEMBERSHIP_NOT_ACTIVE` — or, on a
   * sign-in, no membership there at all — `403 NOT_A_MEMBER`.
   *
   * Only reached when {@link resolveSessionScope} could not honour a `gymSlug`,
   * so it costs one extra query on the miss path and none on the common one. A
   * sign-in with no membership in the named gym used to fall back to the primary
   * gym, which put another gym's session on this gym's host; now it is refused.
   * Anything else that passes an unpinned slug (a refresh token minted before
   * tokens were pinned) keeps that fallback.
   *
   * Note this asks only about the membership row. A gym that is itself suspended
   * is caught earlier by {@link assertGymAccessNotSuspended}, which reports the
   * tenant-level `GYM_SUSPENDED` rather than blaming the member's standing.
   */
  private async assertRequestedMembershipActive(
    userId: string,
    gymSlug: string,
    { signIn = false }: { signIn?: boolean } = {},
  ): Promise<void> {
    const membership = await this.prisma.client.gymMember.findFirst({
      where: { userId, gym: { slug: gymSlug } },
      select: { status: true },
    });

    if (!membership && signIn) {
      throw new ForbiddenException({
        message: 'This account is not a member of this gym',
        code: NOT_A_MEMBER_CODE,
      });
    }

    if (membership && membership.status !== GymMemberStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'Your membership in this gym is not active yet',
        code: MEMBERSHIP_NOT_ACTIVE_CODE,
      });
    }
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
   *
   * `gymSlug` sharpens exactly that gap for a multi-gym user. When the sign-in
   * names a tenant (a `<slug>.fit.ge` subdomain) and *that* gym is suspended, the
   * answer is `403 GYM_SUSPENDED` even though another of the user's gyms is
   * live — otherwise the session-level question says "yes, you have a live gym"
   * and the member is quietly signed into the wrong one, which reads as the
   * suspension having no effect. The named gym is checked on its own, not through
   * the user's memberships: a suspended tenant is closed to everyone, member or
   * not, and answering differently would leak who belongs to it.
   */
  private async assertGymAccessNotSuspended(userId: string, gymSlug?: string): Promise<void> {
    if (gymSlug) {
      const gym = await this.prisma.client.gym.findUnique({
        where: { slug: gymSlug },
        select: { status: true },
      });
      if (gym && gym.status !== GymStatus.ACTIVE) {
        throw new ForbiddenException({
          message: 'This gym has been suspended',
          code: 'GYM_SUSPENDED',
        });
      }
    }

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

  /**
   * Resolve a staff-invite token (T4.7) to the client URL the invitee should be
   * sent to (`GET /auth/accept-invite`). A live invite routes to the web
   * register flow for a brand-new address, or the login flow when the address
   * already has an account — both carrying the token so completing the flow
   * redeems it. An unknown / expired / already-used token routes to login with an
   * `inviteError` flag so the client can show a clear "this invitation is no
   * longer valid" message rather than an error page. The token is never spent
   * here — only redirected — so following the link is always safe to retry.
   *
   * Every redirect lands on the inviting gym's own host, where the staff session
   * the flow ends in belongs; only an unknown token, which names no gym, falls
   * back to `WEB_URL`.
   *
   * "Has an account" means a credential **for the inviting gym** (T1.25): an
   * address known only from another gym has no password here yet, so it is sent
   * to register — where the password it types becomes this gym's — rather than
   * to a sign-in it cannot complete.
   */
  async acceptInvite(token: string): Promise<{ url: string }> {
    const invite = await this.prisma.client.staffInvite.findUnique({
      where: { token },
      select: {
        email: true,
        usedAt: true,
        expiresAt: true,
        gymId: true,
        gym: { select: { slug: true } },
      },
    });

    if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
      return {
        url: buildInviteRedirectUrl('member/login', { inviteError: 'invalid' }, invite?.gym.slug),
      };
    }

    const existing = await this.prisma.client.gymCredential.findFirst({
      where: { gymId: invite.gymId, user: { email: invite.email } },
      select: { id: true },
    });
    const path = existing ? 'member/login' : 'member/register';
    return { url: buildInviteRedirectUrl(path, { inviteToken: token }, invite.gym.slug) };
  }

  /**
   * Redeem a staff invitation (T4.7) for a user who has just registered or logged
   * in with the invite token. Creates (or, for a returning person, upserts) the
   * gym-staff {@link GymMember} with the invited role and marks the invite used.
   *
   * Defensive by design and never throws into the auth flow it's called from:
   *   • A missing / expired / already-used token is a silent no-op — a normal
   *     sign-up or sign-in must not fail because an invite went stale.
   *   • The invite's `email` must match the account's, so a token can only ever
   *     add the *invited* address to a gym (a logged-in attacker can't redeem
   *     someone else's invite onto their own account).
   *   • The "mark used" update is guarded on `usedAt: null`, so two concurrent
   *     redemptions can't both succeed — the invite is strictly single-use.
   *
   * The inviting gym's credential (T1.25) is written alongside the membership.
   * From a registration, `credential` carries the password the invitee just
   * chose, which becomes this gym's password — set only when the gym has none
   * for them yet, so an existing member being promoted keeps the password they
   * already sign in with. From a sign-in there is no new password; the row is
   * created without one if it is missing (a reset then sets it). Either way the
   * credential is stamped verified: the invite was delivered to that address
   * and is single-use, which is the same proof the verification link gives.
   *
   * Returns the gym redeemed onto, or `null` when nothing was redeemed.
   *
   * Runs on the **unscoped** {@link PrismaService}: redemption happens during auth,
   * before any tenant context exists, and the target gym comes from the invite
   * itself rather than the request.
   */
  private async redeemStaffInvite(
    userId: string,
    email: string,
    token?: string,
    credential?: { passwordHash: string; name?: string },
  ): Promise<{ gymId: string; gymSlug: string } | null> {
    if (!token) {
      return null;
    }
    try {
      const invite = await this.prisma.client.staffInvite.findUnique({
        where: { token },
        include: { gym: { select: { slug: true } } },
      });
      if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      if (invite.email.toLowerCase() !== email.toLowerCase()) {
        return null;
      }

      const redeemed = await this.prisma.client.$transaction(async (tx) => {
        // Single-use guard: the loser of a race sees zero rows updated and stops.
        const claimed = await tx.staffInvite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count === 0) {
          return false;
        }
        const member = await tx.gymMember.upsert({
          where: { userId_gymId: { userId, gymId: invite.gymId } },
          create: {
            userId,
            gymId: invite.gymId,
            role: invite.role,
            status: GymMemberStatus.ACTIVE,
          },
          update: { role: invite.role, status: GymMemberStatus.ACTIVE },
          select: { id: true },
        });

        const existing = await tx.gymCredential.findUnique({
          where: { userId_gymId: { userId, gymId: invite.gymId } },
          select: { passwordHash: true, emailVerifiedAt: true, name: true },
        });
        if (!existing) {
          await tx.gymCredential.create({
            data: {
              userId,
              gymId: invite.gymId,
              passwordHash: credential?.passwordHash ?? null,
              name: credential?.name ?? null,
              emailVerifiedAt: new Date(),
            },
          });
        } else {
          await tx.gymCredential.update({
            where: { userId_gymId: { userId, gymId: invite.gymId } },
            data: {
              passwordHash: existing.passwordHash ?? credential?.passwordHash ?? null,
              name: existing.name ?? credential?.name ?? null,
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            },
          });
        }

        // An invited TRAINER used to get the role, a login and a Staff roster
        // row - and no coach profile at all, so they were missing from the
        // Trainers roster and from every class's trainer picker. The role-change
        // path has always closed that gap; this one never did.
        await syncTrainerProfile(tx as unknown as TrainerSyncClient, {
          gymId: invite.gymId,
          memberId: member.id,
          role: invite.role,
        });
        return true;
      });

      if (!redeemed) {
        return null;
      }
      this.logger.debug(`Redeemed staff invite ${invite.id} for user ${userId}`);
      return { gymId: invite.gymId, gymSlug: invite.gym.slug };
    } catch (error) {
      this.logger.error(
        `Failed to redeem staff invite for ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}

/**
 * Which credential a password reset is for — see
 * {@link AuthService.requestPasswordReset}. `null` means "mint nothing": a gym
 * was named and the account has no credential there. A `gymId: null` target is
 * the whole identity, linked at the platform-wide reset page.
 */
function resetTarget(
  credentials: { gymId: string; name: string | null; gym: { slug: string } }[],
  gymSlug: string | null | undefined,
): { gymId: string | null; gymSlug: string | null; name: string | null } | null {
  if (gymSlug) {
    const match = credentials.find((c) => c.gym.slug === gymSlug);
    return match ? { gymId: match.gymId, gymSlug, name: match.name } : null;
  }
  if (credentials.length === 1) {
    const [only] = credentials;
    return { gymId: only!.gymId, gymSlug: only!.gym.slug, name: only!.name };
  }
  return { gymId: null, gymSlug: null, name: null };
}

/**
 * Build a web-client deep link for the staff-invite accept flow (T4.7): the member
 * site's `path` with the given query params — e.g. `member/register?inviteToken=…`
 * — addressed by {@link buildMemberUrl}, so on the inviting gym's own host when
 * `gymSlug` is known and on `WEB_URL` (then the dev default) otherwise. The path
 * carries the member portal's `/member` base but no locale prefix; the web app's
 * i18n middleware adds the default locale on redirect, preserving the query string.
 */
function buildInviteRedirectUrl(
  path: string,
  params: Record<string, string>,
  gymSlug?: string | null,
): string {
  const qs = new URLSearchParams(params).toString();
  return `${buildMemberUrl(path, gymSlug)}?${qs}`;
}

/**
 * Map a `register-gym` P2002 (unique-constraint) race to the right `409`. Prisma
 * reports the violated columns in `meta.target`; an `email` collision is
 * `EMAIL_TAKEN`, anything else (the `slug` unique) is `SUBDOMAIN_TAKEN` — the
 * same codes the pre-checks emit, so a race is indistinguishable from a miss.
 */
function conflictFromUniqueTarget(error: Prisma.PrismaClientKnownRequestError): ConflictException {
  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target.filter((t): t is string => typeof t === 'string').join(',')
    : typeof target === 'string'
      ? target
      : '';
  if (fields.includes('email')) {
    return new ConflictException({ message: 'Email is already registered', code: 'EMAIL_TAKEN' });
  }
  return new ConflictException({ message: 'Subdomain is already taken', code: 'SUBDOMAIN_TAKEN' });
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
