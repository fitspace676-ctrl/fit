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
  activateAccountSchema,
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
  phoneLoginKey,
} from '@fit/types';
import { DEFAULT_EMAIL_LOCALE, resolveEmailLocale, type EmailLocale } from '../mail/email-locale';
import type {
  ActivateAccountInput,
  ActivateAccountResponse,
  AppleAuthInput,
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
import { buildConsoleUrl, buildMemberUrl } from '../common/console-url';
import { assertStartDateWithinPolicy } from '../gyms/start-date-policy.util';
import { findDefaultLocationId } from '../locations/default-location';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppleOAuthService } from './apple-oauth.service';
import { EmailService } from './email.service';
import { GoogleOAuthService } from './google-oauth.service';
import {
  TokenService,
  hashRefreshToken,
  invalidRefreshToken,
  type SessionClaims,
} from './token.service';
import { syncTrainerProfile, type TrainerSyncClient } from '../staff/trainer-profile-sync';
import {
  PLATFORM_REALM,
  audienceAllows,
  audienceOfRole,
  memberRealm,
  parseRealm,
  signInRealms,
  staffRealm,
  type AccountAudience,
} from './account-realm';

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
  phone: string | null;
  gym: { slug: string; name: string; status: GymStatus };
}

/**
 * One account with the signing-in address (or phone number), as the password
 * paths project it. Every realm's row for it is read in one query; which of them
 * a sign-in may use is decided in memory from `realm` (see `./account-realm`).
 *
 * An address names at most one account in a realm. A phone number is free text
 * nobody has verified and nothing keeps unique, so it can name several (a family
 * on one number); the password then picks, oldest account first.
 */
interface SignInAccount {
  id: string;
  realm: string;
  phone: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  isSuperAdmin: boolean;
  credentials: StoredCredential[];
}

/** The projection that fills a {@link SignInAccount}. */
const SIGN_IN_ACCOUNT_SELECT = {
  id: true,
  realm: true,
  phone: true,
  passwordHash: true,
  emailVerifiedAt: true,
  isSuperAdmin: true,
  credentials: {
    select: {
      gymId: true,
      passwordHash: true,
      emailVerifiedAt: true,
      phone: true,
      gym: { select: { slug: true, name: true, status: true } },
    },
  },
} satisfies Prisma.UserSelect;

/**
 * The most accounts one phone number is tried against at a sign-in. Bounds the
 * KDF work a single request can ask for; a number shared by more accounts than
 * this signs in the oldest ones only (the others still have their e-mail).
 */
const MAX_PHONE_SIGN_IN_ACCOUNTS = 8;

/** The account a password unlocked, and the gym its session binds to (none for a platform one). */
interface AccountMatch {
  userId: string;
  gymSlug?: string;
  emailVerifiedAt: Date | null;
}

/** A gym account's own credential: the one for the gym its realm names. */
function ownCredential(account: SignInAccount): StoredCredential | null {
  const realm = parseRealm(account.realm);
  if (realm?.kind !== 'gym') {
    return null;
  }
  return account.credentials.find((c) => c.gymId === realm.gymId) ?? null;
}

/** The single `401` every password failure collapses to. */
function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    message: 'Email or password is incorrect',
    code: 'INVALID_CREDENTIALS',
  });
}

/**
 * The `403` a sign-in on a gym the account does not belong to gets — shared by
 * the scope check and the social sign-ins that refuse before creating a user.
 */
function notAMember(): ForbiddenException {
  return new ForbiddenException({
    message: 'This account is not a member of this gym',
    code: NOT_A_MEMBER_CODE,
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
 *
 * ## Accounts are per realm
 *
 * Since the account split every {@link User} row belongs to one realm (see
 * `./account-realm`): the platform, one gym's staff, or one gym's members. Every
 * flow here that finds a user by address names the realm. The admin console
 * sends `audience: 'staff'`, the member portal and the mobile app send
 * `'member'`, and a client that sends nothing is matched against the member
 * account first and the staff account second. Registration and social sign-in
 * only ever create member or platform accounts; staff accounts come from gym
 * provisioning and staff invitations.
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
   * Register a new account. Hashes the password, persists the account, mints a
   * single-use verification token in Redis, and sends the verification email.
   *
   * With a gym (`gymSlug`) this is always a **member account** of that gym (see
   * {@link registerGymMember}): a staff account is never created by registration.
   * Without one it is a platform account, refused with `409 EMAIL_TAKEN` when the
   * address already holds any account, as before the split.
   *
   * A staff invitation (T4.7) is redeemed first: the invitee is choosing the
   * password of the *inviting gym's staff account*, which redemption finds or
   * creates (see {@link redeemStaffInvite}), and the request answers exactly as a
   * brand-new registration does. No verification mail goes out for that case: the
   * invite was delivered to the address and is single-use, which is the same proof
   * of inbox control the verification link would establish. A `register` with a
   * stale or mismatched invite falls back to the normal gym or platform rules.
   */
  async register(
    input: RegisterInput,
    locale: EmailLocale | null = null,
  ): Promise<RegisterResponse> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    if (input.inviteToken) {
      const redeemed = await this.redeemStaffInvite(input.email, input.inviteToken, {
        passwordHash,
        name: input.name,
      });
      if (redeemed) {
        return { message: 'verification email sent' };
      }
    }

    if (input.gymSlug) {
      return this.registerGymMember(input, passwordHash, locale);
    }

    // A bare registration joins nothing. It still refuses an address that holds
    // any account at all, the answer it gave before accounts were split: the
    // address is unavoidably revealed as taken, but not where.
    const existing = await this.prisma.client.user.findFirst({
      where: { email: input.email },
      select: { id: true },
    });
    const taken = () =>
      new ConflictException({
        message: 'Email is already registered',
        code: EMAIL_TAKEN_CODE,
      });
    if (existing) {
      throw taken();
    }

    const user = await this.prisma.client.user
      .create({
        data: { email: input.email, realm: PLATFORM_REALM, name: input.name, passwordHash },
        select: { id: true },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw taken();
        }
        throw error;
      });

    const token = generateVerificationToken();
    await this.redis.client.set(
      verifyKey(token),
      encodeTokenSubject({ userId: user.id, gymId: null }),
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
        undefined,
        undefined,
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
   * Register the member account of one active gym (its own row in the gym's
   * member realm) without exposing other gyms or the gym's staff accounts. A
   * member staff added without a password gets the password now.
   */
  private async registerGymMember(
    input: RegisterInput,
    passwordHash: string,
    locale: EmailLocale | null,
  ): Promise<RegisterResponse> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { slug: input.gymSlug, status: GymStatus.ACTIVE },
      select: { id: true, slug: true, name: true, settings: true },
    });
    if (!gym) {
      throw new BadRequestException({ message: 'Unknown gym', code: 'GYM_NOT_FOUND' });
    }
    const locationId = await this.signupHomeBranch(gym.id);
    const taken = () =>
      new ConflictException({
        message: 'Email is already registered in this gym',
        code: EMAIL_TAKEN_CODE,
      });

    const register = () =>
      this.prisma.client.$transaction(async (tx) => {
        // The gym's member account: an empty update keeps an existing one as it is.
        const realm = memberRealm(gym.id);
        const user = await tx.user.upsert({
          where: { email_realm: { email: input.email, realm } },
          create: { email: input.email, realm, name: input.name, passwordHash },
          update: {},
          select: { id: true },
        });
        const key = { userId: user.id, gymId: gym.id };
        const credential = await tx.gymCredential.findUnique({
          where: { userId_gymId: key },
          select: { passwordHash: true },
        });
        if (credential?.passwordHash != null) throw taken();

        // Keep a staff-added member's role, status and profile exactly as recorded.
        await tx.gymMember.upsert({
          where: { userId_gymId: key },
          create: { ...key, role: Role.MEMBER, status: GymMemberStatus.ACTIVE, locationId },
          update: {},
        });
        if (credential) {
          const changed = await tx.gymCredential.updateMany({
            where: { ...key, passwordHash: null },
            data: { passwordHash, name: input.name, emailVerifiedAt: null },
          });
          if (changed.count === 0) throw taken();
        } else {
          await tx.gymCredential.create({
            data: { ...key, passwordHash, name: input.name },
          });
        }
        return user.id;
      });
    const userId = await register().catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Prisma can emulate an empty-update User upsert with a read + insert. A
        // concurrent registration winning that race created this very account:
        // retry the rolled-back transaction, which then finds its credential.
        const target = error.meta?.target;
        if (Array.isArray(target) && target.includes('email')) return register();
        throw taken();
      }
      throw error;
    });

    const token = generateVerificationToken();
    await this.redis.client.set(
      verifyKey(token),
      encodeTokenSubject({ userId, gymId: gym.id }),
      'EX',
      env.EMAIL_VERIFICATION_TTL,
    );
    try {
      const gymLanguage = gymSettingsStoredSchema.parse(gym.settings ?? {}).locale.language;
      await this.email.sendVerificationEmail(
        input.email,
        token,
        input.name,
        locale ?? resolveEmailLocale(gymLanguage),
        gym.slug,
        gym.name,
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
   * Extends gym-scoped {@link register} with the profile the front desk needs
   * (phone, date of birth, gender, national id, and the membership start date),
   * and issues a session
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
      select: { id: true, slug: true, name: true, settings: true },
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

    // Only this gym's member account counts. An address known from another gym,
    // from this gym's staff, or as a platform account is a normal signup: it gets
    // a member account of its own below, and the response is the same as for a
    // brand-new address, so the join form cannot be used to learn which addresses
    // exist elsewhere.
    const realm = memberRealm(gym.id);
    const existing = await this.prisma.client.user.findUnique({
      where: { email_realm: { email: input.email, realm } },
      select: { id: true },
    });
    if (existing) {
      // A member of *this* gym has nothing to join and should just sign in. A
      // member account whose membership was purged joins again on the same row.
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
            realm,
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

      // An upsert: a member account rejoining after a purge may still hold the
      // credential of its earlier membership, which the new password replaces.
      const credential = {
        passwordHash,
        name: input.name,
        phone: input.phone ?? null,
      };
      await tx.gymCredential.upsert({
        where: { userId_gymId: { userId: user.id, gymId: gym.id } },
        create: { userId: user.id, gymId: gym.id, ...credential },
        update: { ...credential, emailVerifiedAt: null },
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
        // whichever site the platform-wide WEB_URL points at — and the gym, not
        // the platform, is who the mail is from.
        gym.slug,
        gym.name,
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
   * Shared transactional tenant provisioning; callers own the transaction and
   * email delivery. The owner is always a NEW staff account of the new gym (its
   * realm names a gym that did not exist a moment ago), whatever accounts the
   * address holds elsewhere: those stay exactly as they are.
   */
  async provisionGym(
    tx: Prisma.TransactionClient,
    input: RegisterGymInput,
    options: {
      passwordHash: string | null;
      createdBy?: string;
      emailVerifiedAt?: Date;
      settings?: Prisma.InputJsonValue;
    },
  ): Promise<{ gymId: string; ownerId: string }> {
    // The gym first: the owner's realm is built from its id.
    const created = await tx.gym.create({
      data: {
        name: input.gymName,
        slug: input.subdomainSlug,
        ...(options.settings ? { settings: options.settings } : {}),
      },
      select: { id: true },
    });

    const owner = await tx.user.create({
      data: {
        email: input.ownerEmail,
        realm: staffRealm(created.id),
        name: input.ownerName ?? null,
        passwordHash: options.passwordHash,
        ...(options.emailVerifiedAt ? { emailVerifiedAt: options.emailVerifiedAt } : {}),
      },
      select: { id: true },
    });

    const gym = await tx.gym.update({
      where: { id: created.id },
      data: { ownerId: owner.id, createdByUserId: options.createdBy ?? owner.id },
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
        passwordHash: options.passwordHash,
        name: input.ownerName ?? null,
        ...(options.emailVerifiedAt ? { emailVerifiedAt: options.emailVerifiedAt } : {}),
      },
    });

    return { gymId: gym.id, ownerId: owner.id };
  }

  /**
   * Provision a new gym tenant and onboard its first OWNER
   * (`POST /auth/register-gym`).
   *
   * The gym (the tenant root), the owner {@link User}, the OWNER {@link GymMember}
   * and the owner's credential for the new gym are created together in a
   * transaction so a half-provisioned tenant can never exist. The owner is always
   * a new staff account of the new gym (with the supplied password, or none until
   * activation): an `ownerEmail` that already holds accounts elsewhere keeps them
   * untouched, so the same person can own or belong to several gyms, each with
   * its own account and password. The onboarding link is what binds
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
    options: { skipOnboardingEmail?: boolean } = {},
  ): Promise<RegisterGymResponse> {
    const existingGym = await this.prisma.client.gym.findUnique({
      where: { slug: input.subdomainSlug },
      select: { id: true },
    });
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
        return this.provisionGym(tx, input, { passwordHash, createdBy });
      });
    } catch (error) {
      // Lost a unique-constraint race against a concurrent provision — surface
      // the same 409 the pre-check would, mapped to whichever target collided.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflictFromUniqueTarget(error);
      }
      throw error;
    }

    if (!options.skipOnboardingEmail) {
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
  private async stampVerified(
    userId: string,
    gymId: string | null,
    db: Prisma.TransactionClient = this.prisma.client,
  ): Promise<void> {
    const now = new Date();
    await db.gymCredential.updateMany({
      where: { userId, ...(gymId ? { gymId } : {}), emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
    await db.user.updateMany({
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
    db: Prisma.TransactionClient = this.prisma.client,
  ): Promise<{ email: string }> {
    if (gymId) {
      await db.gymCredential.upsert({
        where: { userId_gymId: { userId, gymId } },
        create: { userId, gymId, passwordHash },
        update: { passwordHash },
      });
      await this.stampVerified(userId, gymId, db);
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return { email: user?.email ?? '' };
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { email: true },
    });
    await db.gymCredential.updateMany({
      where: { userId },
      data: { passwordHash },
    });
    await this.stampVerified(userId, null, db);
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
   * Every token resets **one account** (the token names its user). Which one:
   *
   *   • With a gym (the body's `gymSlug`, the mobile app's remembered gym, else
   *     the host's `tenantSlug`): that gym's account in the requested `audience`,
   *     or, with no audience, its member account and failing that its staff
   *     account. No account there, no mail: the gym is a caller-chosen selector,
   *     and without the check anyone could have a stranger's token mailed for a
   *     gym of their choosing.
   *   • With no gym (`app.<root>`, the mobile app): one mail per gym account in
   *     the audience (no audience: the member accounts, or the staff accounts
   *     when there is no member one), each linked to its own gym's site. A
   *     super-admin's platform account is added when the audience is not
   *     `member`; an address with no gym account at all gets its platform
   *     account's reset, mailed to the platform-wide reset page.
   */
  async requestPasswordReset(
    input: ForgotPasswordInput,
    locale: EmailLocale | null = null,
    tenantSlug: string | null = null,
  ): Promise<ForgotPasswordResponse> {
    const gymSlug = input.gymSlug ?? tenantSlug;
    const accounts = await this.prisma.client.user.findMany({
      where: { email: input.email },
      select: {
        id: true,
        realm: true,
        name: true,
        isSuperAdmin: true,
        credentials: {
          select: { gymId: true, name: true, gym: { select: { slug: true, name: true } } },
        },
      },
    });
    const gym = gymSlug
      ? await this.prisma.client.gym.findUnique({
          where: { slug: gymSlug },
          select: { id: true, slug: true, name: true },
        })
      : null;

    const targets = gymSlug
      ? gym
        ? gymResetTargets(accounts, gym, input.audience)
        : []
      : tenantlessResetTargets(accounts, input.audience);

    for (const target of targets) {
      const token = generateVerificationToken();
      await this.redis.client.set(
        resetKey(token),
        encodeTokenSubject({ userId: target.userId, gymId: target.gymId }),
        'EX',
        env.PASSWORD_RESET_TTL,
      );

      try {
        await this.email.sendPasswordResetEmail(
          input.email,
          token,
          target.name ?? undefined,
          locale ?? DEFAULT_EMAIL_LOCALE,
          target.gymSlug,
          target.gymName,
          target.audience,
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
   * The password written is the one the token was minted for: **one account's**
   * credential alone, so a reset of a Downtown member leaves Downtown's staff
   * account and every Riverside account (and their sessions) untouched. A staff
   * account gets no session here (see below); it signs in to the console.
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

    // A staff account's reset completes on the member site's reset page (the
    // console has none), which refuses a staff session: the password is set and
    // the person signs in to the console with it.
    const account = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { realm: true },
    });
    const realm = account?.realm ? parseRealm(account.realm) : null;
    if (realm?.kind === 'gym' && realm.audience === 'staff') {
      return { ok: true, sessionIssued: false };
    }

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
   * Which account's password is checked (accounts are per realm, see
   * `./account-realm`):
   *
   *   • On a gym host (`gymSlug` from the body, else `tenantSlug` from the host):
   *     that gym's account in the requested `audience`, or, with no audience (a
   *     client from before the split), its member account first and its staff
   *     account second. Nothing else: a Downtown password typed on Riverside's
   *     site is a `401`, and so is a staff password typed with `audience:
   *     'member'`. A super-admin may still use the platform password on a gym
   *     host (any audience but `member`) and gets the tenant-less session.
   *   • With no gym named at all (the mobile app, `app.<root>`): the password is
   *     checked against every account in the audience (no audience: member and
   *     staff, member preferred within a gym) in a live gym. One gym matched
   *     signs in there; several answer `409 GYM_SELECTION_REQUIRED` listing
   *     *only the gyms the password unlocked*, so the client can ask which one
   *     and sign in again naming it. A super-admin's platform password wins when
   *     the audience is not `member`; an address with no gym account to check
   *     falls back to its platform account.
   */
  async login(input: LoginInput, tenantSlug?: string | null): Promise<TokenPair> {
    const gymSlug = input.gymSlug ?? tenantSlug ?? undefined;
    const accounts = input.phone
      ? await this.findAccountsByPhone(input.phone)
      : input.email
        ? await this.prisma.client.user.findMany({
            where: { email: input.email },
            select: SIGN_IN_ACCOUNT_SELECT,
          })
        : [];

    const match = gymSlug
      ? await this.matchGymAccount(accounts, gymSlug, input.audience, input.password)
      : await this.matchTenantlessAccount(accounts, input.audience, input.password);
    if (!match) {
      throw invalidCredentials();
    }

    if (!match.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Email address has not been verified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Redeem a staff invitation (T4.7) onto the inviting gym's staff account. The
    // password just proven for this address becomes that account's password when
    // it has none yet. Best-effort: a bad / mismatched token leaves login
    // unchanged, and the session below is still the account that signed in.
    // Never from a member sign-in: staff invitations are accepted through the
    // admin console (audience 'staff', or a client from before the split), so a
    // member portal / mobile sign-in can never create or touch a staff account.
    // An invitation is addressed to an e-mail, so only an e-mail sign-in redeems one.
    if (input.inviteToken && input.email && input.audience !== 'member') {
      await this.redeemStaffInvite(input.email, input.inviteToken, {
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
      });
    }

    await this.assertGymAccessNotSuspended(match.userId, match.gymSlug);

    return this.tokens.issueTokenPair(
      match.userId,
      await this.resolveSessionScope(match.userId, match.gymSlug, {
        signIn: true,
        gymCredential: Boolean(match.gymSlug),
      }),
    );
  }

  /**
   * The accounts that carry `phone`, oldest first, capped at
   * {@link MAX_PHONE_SIGN_IN_ACCOUNTS}.
   *
   * Numbers are stored as typed, so both sides are reduced to
   * {@link phoneLoginKey} — in SQL for the lookup (the expression the
   * `*_phone_login_key_idx` indexes are built on; keep the three in step) and
   * again in memory, where an account counts only by its own number: the one on
   * the account, or the one on the credential of the gym its realm names.
   */
  private async findAccountsByPhone(phone: string): Promise<SignInAccount[]> {
    const key = phoneLoginKey(phone);
    if (!key) {
      return [];
    }
    const rows = await this.prisma.client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM "users"
       WHERE right(regexp_replace("phone", '\\D', '', 'g'), 9) = ${key}
      UNION
      SELECT "userId" AS id FROM "gym_credentials"
       WHERE right(regexp_replace("phone", '\\D', '', 'g'), 9) = ${key}
      LIMIT 200
    `);
    if (rows.length === 0) {
      return [];
    }
    const accounts = await this.prisma.client.user.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SIGN_IN_ACCOUNT_SELECT,
    });
    return accounts
      .filter(
        (account) =>
          phoneLoginKey(account.phone) === key ||
          phoneLoginKey(ownCredential(account)?.phone) === key,
      )
      .slice(0, MAX_PHONE_SIGN_IN_ACCOUNTS);
  }

  /**
   * A password verifier that always spends one KDF: against `hash`, or against the
   * dummy when there is none, so a missing account costs what a real one does.
   * `verify` returns false on mismatch and throws on a malformed digest; both are
   * a miss.
   */
  private verifier(password: string): (hash: string | null) => Promise<boolean> {
    return (hash) =>
      argon2.verify(hash ?? DUMMY_PASSWORD_HASH, password).then(
        (ok) => ok && hash !== null,
        () => false,
      );
  }

  /**
   * The account `password` unlocks on the gym `gymSlug`, or `null`.
   *
   * Always runs the same number of verifications for a given audience (one per
   * realm tried, plus the super-admin slot), real or dummy, so the answer's timing
   * says nothing about which accounts exist on the gym. An unknown gym is the same
   * work and a miss. The gym's status is not checked here: a suspended gym's
   * correct password goes on to `403 GYM_SUSPENDED`, as before.
   */
  private async matchGymAccount(
    accounts: SignInAccount[],
    gymSlug: string,
    audience: AccountAudience | undefined,
    password: string,
  ): Promise<AccountMatch | null> {
    const verify = this.verifier(password);
    const gym = await this.prisma.client.gym.findUnique({
      where: { slug: gymSlug },
      select: { id: true },
    });

    const realms = gym ? signInRealms(gym.id, audience) : [];
    const slots = audience ? 1 : 2;
    const attempts: { hash: string | null; match: AccountMatch | null }[] = [];
    // One attempt per account in the slot, and one dummy for an empty slot. An
    // address has at most one account per slot; a phone number may have several.
    const NO_ACCOUNT = [undefined];
    for (let index = 0; index < slots; index += 1) {
      const realm = realms[index];
      const inRealm = realm ? accounts.filter((a) => a.realm === realm) : [];
      for (const account of inRealm.length > 0 ? inRealm : NO_ACCOUNT) {
        const credential = account ? ownCredential(account) : null;
        attempts.push({
          hash: credential?.passwordHash ?? null,
          match:
            account && credential
              ? { userId: account.id, gymSlug, emailVerifiedAt: credential.emailVerifiedAt }
              : null,
        });
      }
    }
    if (audience !== 'member') {
      const superAdmins = accounts.filter((a) => a.realm === PLATFORM_REALM && a.isSuperAdmin);
      for (const platform of superAdmins.length > 0 ? superAdmins : NO_ACCOUNT) {
        attempts.push({
          hash: platform?.passwordHash ?? null,
          match: platform
            ? { userId: platform.id, emailVerifiedAt: platform.emailVerifiedAt }
            : null,
        });
      }
    }

    const results = await Promise.all(attempts.map((attempt) => verify(attempt.hash)));
    return attempts.find((attempt, index) => results[index] && attempt.match)?.match ?? null;
  }

  /**
   * The account `password` unlocks with no gym named, or `null`; `409
   * GYM_SELECTION_REQUIRED` when it unlocks accounts at several gyms. The list is
   * built only after the password has checked out, so it is only ever handed to
   * its owner.
   */
  private async matchTenantlessAccount(
    accounts: SignInAccount[],
    audience: AccountAudience | undefined,
    password: string,
  ): Promise<AccountMatch | null> {
    const verify = this.verifier(password);
    // One for an address; possibly several for a phone number.
    const platforms = accounts.filter((a) => a.realm === PLATFORM_REALM);
    const platformMatch = (account: SignInAccount): AccountMatch => ({
      userId: account.id,
      emailVerifiedAt: account.emailVerifiedAt,
    });

    const withPassword = accounts
      .flatMap((account) => {
        const realm = parseRealm(account.realm);
        if (!audienceAllows(realm, audience)) {
          return [];
        }
        const credential = ownCredential(account);
        if (!credential?.passwordHash) {
          return [];
        }
        return [{ account, credential, audience: realm.audience }];
      })
      // Member accounts first, so a gym where both match lands on the member one.
      .sort((a, b) => Number(a.audience === 'staff') - Number(b.audience === 'staff'));
    const candidates = withPassword.filter((c) => c.credential.gym.status === GymStatus.ACTIVE);

    if (candidates.length === 0) {
      // No account in a live gym. The platform account is checked as before; so
      // are accounts of suspended gyms, so that their correct password still
      // answers 403 GYM_SUSPENDED (the caller's gate on the matched gym) rather
      // than looking like a wrong password. One is enough: it ends in that 403.
      const suspended = withPassword;
      const [platformResults, results] = await Promise.all([
        Promise.all(
          (platforms.length > 0 ? platforms : [null]).map((p) => verify(p?.passwordHash ?? null)),
        ),
        Promise.all(suspended.map((c) => verify(c.credential.passwordHash))),
      ]);
      const platform = platforms.find((_, index) => platformResults[index]);
      if (platform) {
        return platformMatch(platform);
      }
      const hit = suspended.find((_, index) => results[index]);
      return hit
        ? {
            userId: hit.account.id,
            gymSlug: hit.credential.gym.slug,
            emailVerifiedAt: hit.credential.emailVerifiedAt,
          }
        : null;
    }

    const superAdmins = audience !== 'member' ? platforms.filter((p) => p.isSuperAdmin) : [];
    const [superAdminResults, results] = await Promise.all([
      Promise.all(superAdmins.map((p) => verify(p.passwordHash))),
      Promise.all(candidates.map((c) => verify(c.credential.passwordHash))),
    ]);
    const superAdmin = superAdmins.find((_, index) => superAdminResults[index]);
    if (superAdmin) {
      return platformMatch(superAdmin);
    }

    const byGym = new Map<string, (typeof candidates)[number]>();
    candidates.forEach((candidate, index) => {
      if (results[index] && !byGym.has(candidate.credential.gymId)) {
        byGym.set(candidate.credential.gymId, candidate);
      }
    });
    const matched = [...byGym.values()];
    if (matched.length === 0) {
      return null;
    }
    if (matched.length > 1) {
      throw new ConflictException({
        message: 'This password signs you in to more than one gym — choose one',
        code: GYM_SELECTION_REQUIRED_CODE,
        data: {
          gyms: matched.map((c) => ({ slug: c.credential.gym.slug, name: c.credential.gym.name })),
        },
      });
    }
    const [only] = matched;
    return {
      userId: only!.account.id,
      gymSlug: only!.credential.gym.slug,
      emailVerifiedAt: only!.credential.emailVerifiedAt,
    };
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

    const userId = await this.resolveSocialUser(
      { provider: 'google', subject: profile.googleId, email: profile.email, name: profile.name },
      input.gymSlug,
      input.audience,
    );
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
   * Authenticate a "Sign in with Apple" flow and issue a session. The client
   * (web or mobile) supplies the Apple-issued ID token; {@link AppleOAuthService}
   * verifies its signature, issuer, audience, and expiry before we trust any
   * claim. The verified Apple identity is then resolved to a local user and a
   * {@link TokenPair} is issued.
   *
   * Apple's flow differs from Google's in two ways {@link resolveSocialUser}
   * handles: the ID token omits the user's name (so the client forwards it in
   * `input.name`, used only when creating an account), and a returning sign-in
   * may carry no `email` (so a known user is matched by `appleId` alone — the
   * email is only required to establish a *new* identity).
   */
  async loginWithApple(input: AppleAuthInput): Promise<TokenPair> {
    const profile = await this.apple.verifyIdToken(input.idToken);
    const userId = await this.resolveSocialUser(
      {
        provider: 'apple',
        subject: profile.appleId,
        // Only an Apple-verified address may establish or link an account.
        email: profile.email && profile.emailVerified ? profile.email : null,
        name: input.name,
        missingEmail: () =>
          new ForbiddenException(
            profile.email
              ? { message: 'Apple account email is not verified', code: 'APPLE_EMAIL_NOT_VERIFIED' }
              : {
                  message: 'Apple did not provide an email to establish an account',
                  code: 'APPLE_EMAIL_UNAVAILABLE',
                },
          ),
      },
      input.gymSlug,
      input.audience,
    );
    // Gate suspended tenants here too (see loginWithGoogle) so social login can't
    // sidestep a suspension that blocks email/password login and refresh.
    await this.assertGymAccessNotSuspended(userId, input.gymSlug);
    const scope = await this.resolveSessionScope(userId, input.gymSlug, { signIn: true });
    await this.ensureSocialCredential(userId, scope.gymId, input.name);
    return this.tokens.issueTokenPair(userId, scope);
  }

  /**
   * Resolve a verified Google / Apple identity to the local account it signs in
   * to, linking the provider's subject id onto an account found by its (provider-
   * verified) address and stamping it verified.
   *
   * Accounts are per realm, and so is the link: the subject id is unique per
   * realm, so one Google identity may be linked to a member account and a staff
   * account. Which account:
   *
   *   • On a gym host (`gymSlug`): that gym's account in the `audience`, or, with
   *     none, its member account and failing that its staff account; matched by
   *     subject id first, then by address. A super-admin's platform account
   *     answers when there is none and the audience is not `member` (it gets the
   *     tenant-less session, as before). No account at all is `403 NOT_A_MEMBER`,
   *     refused before anything is written: social sign-in never creates a gym
   *     account, and never a staff account anywhere.
   *   • With no gym (the mobile app): a super-admin's platform account when the
   *     audience is not `member`; else the earliest-joined gym account in the
   *     audience (no audience: member accounts, then staff ones), preferring live
   *     gyms; else the platform account; else a brand-new platform account (a
   *     member of no gym, exactly what a tenant-less social sign-up made before).
   *
   * Apple omits the address on later sign-ins, so a returning account is matched
   * by subject id alone; the address is needed only to link or create one, and
   * `missingEmail` says why it is unusable when it is.
   */
  private async resolveSocialUser(
    identity: {
      provider: 'google' | 'apple';
      subject: string;
      /** The provider-verified address, or `null` when there is none usable. */
      email: string | null;
      name?: string;
      missingEmail?: () => Error;
    },
    gymSlug: string | null | undefined,
    audience: AccountAudience | undefined,
  ): Promise<string> {
    const { provider, subject, email } = identity;
    const subjectWhere: Prisma.UserWhereInput =
      provider === 'google' ? { googleId: subject } : { appleId: subject };
    const accounts = await this.prisma.client.user.findMany({
      where: email ? { OR: [subjectWhere, { email }] } : subjectWhere,
      select: {
        id: true,
        realm: true,
        isSuperAdmin: true,
        emailVerifiedAt: true,
        googleId: true,
        appleId: true,
        memberships: { select: { joinedAt: true, gym: { select: { status: true } } } },
      },
    });
    type SocialAccount = (typeof accounts)[number];
    const linked = (account: SocialAccount) =>
      (provider === 'google' ? account.googleId : account.appleId) === subject;
    // One account per realm: the linked one over an address match.
    const inRealm = (realm: string): SocialAccount | undefined =>
      accounts
        .filter((a) => a.realm === realm)
        .sort((a, b) => Number(linked(b)) - Number(linked(a)))[0];
    const platform = inRealm(PLATFORM_REALM);
    const superAdmin = audience !== 'member' && platform?.isSuperAdmin ? platform : undefined;
    const unusable = () => (!email && identity.missingEmail ? identity.missingEmail() : null);

    let chosen: SocialAccount | undefined;
    if (gymSlug) {
      const gym = await this.prisma.client.gym.findUnique({
        where: { slug: gymSlug },
        select: { id: true },
      });
      for (const realm of gym ? signInRealms(gym.id, audience) : []) {
        chosen = inRealm(realm);
        if (chosen) break;
      }
      chosen ??= superAdmin;
      if (!chosen) {
        throw unusable() ?? notAMember();
      }
    } else if (superAdmin) {
      chosen = superAdmin;
    } else {
      const ofAudience = (wanted: AccountAudience) =>
        accounts
          .filter((a) => {
            const realm = parseRealm(a.realm);
            return realm?.kind === 'gym' && realm.audience === wanted && a.memberships.length > 0;
          })
          .map((a) => inRealm(a.realm)!)
          .filter((a, index, all) => all.indexOf(a) === index);
      const wanted: AccountAudience[] = audience ? [audience] : ['member', 'staff'];
      const joined = (a: SocialAccount) =>
        Math.min(...a.memberships.map((m) => m.joinedAt.getTime()));
      for (const set of wanted) {
        const pool = ofAudience(set);
        const live = pool.filter((a) =>
          a.memberships.some((m) => m.gym.status === GymStatus.ACTIVE),
        );
        chosen = (live.length > 0 ? live : pool).sort((a, b) => joined(a) - joined(b))[0];
        if (chosen) break;
      }
      chosen ??= platform;
    }

    if (!chosen) {
      if (!email) {
        throw unusable() ?? notAMember();
      }
      const created = await this.prisma.client.user.create({
        data: {
          email,
          realm: PLATFORM_REALM,
          name: identity.name ?? null,
          ...(provider === 'google' ? { googleId: subject } : { appleId: subject }),
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      });
      return created.id;
    }

    if (!linked(chosen)) {
      // Matched by its address, which the provider has verified: link the subject
      // id onto it, and a never-verified account becomes verified.
      await this.prisma.client.user.update({
        where: { id: chosen.id },
        data: {
          ...(provider === 'google' ? { googleId: subject } : { appleId: subject }),
          emailVerifiedAt: chosen.emailVerifiedAt ?? new Date(),
        },
      });
    }
    return chosen.id;
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
   *   • A platform `SUPER_ADMIN` stays tenant-less unless a named gym credential
   *     was matched, or a refresh token is already pinned to a gym. Those sessions
   *     use the active membership role, just like any other member.
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
    options: { pinned?: boolean; signIn?: boolean; gymCredential?: boolean } = {},
  ): Promise<SessionClaims> {
    const [user, memberships] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { tokenVersion: true, isSuperAdmin: true },
      }),
      this.prisma.client.gymMember.findMany({
        where: { userId, status: GymMemberStatus.ACTIVE, archivedAt: null },
        select: {
          gymId: true,
          role: true,
          joinedAt: true,
          gym: { select: { status: true, slug: true } },
        },
      }),
    ]);

    const tokenVersion = user?.tokenVersion ?? 0;

    if (user?.isSuperAdmin && !(gymSlug && (options.gymCredential || options.pinned))) {
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
      select: { status: true, archivedAt: true },
    });

    if (!membership && signIn) {
      throw notAMember();
    }

    if (membership && (membership.archivedAt || membership.status !== GymMemberStatus.ACTIVE)) {
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
      await this.assertGymNotSuspended(gymSlug);
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

  /** `403 GYM_SUSPENDED` when the gym `gymSlug` names exists and is not active. */
  private async assertGymNotSuspended(gymSlug: string): Promise<void> {
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

  /**
   * End the session the refresh token belongs to by revoking its whole family.
   * Idempotent — an unknown / already-revoked token still resolves cleanly.
   */
  async logout(input: RefreshInput): Promise<void> {
    await this.tokens.revokeRefreshToken(input.refreshToken);
  }

  /** Resolve without consuming: email scanners must never redeem invitations. */
  async acceptInvite(token: string): Promise<{ url: string }> {
    const invite = await this.prisma.client.staffInvite.findUnique({
      where: { token },
      select: { usedAt: true, expiresAt: true, gym: { select: { slug: true } } },
    });
    const invalid = !invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now();
    return {
      url: buildInviteRedirectUrl(
        'accept-invite',
        invalid ? { inviteError: 'invalid' } : { token },
        invite?.gym.slug,
      ),
    };
  }

  /** Keep the current refresh family, revoke every other device across gyms.
   * Access tokens on those devices expire normally; do not bump tokenVersion,
   * which would also invalidate the caller's current access token.
   */
  async changePassword(
    userId: string,
    gymId: string,
    input: {
      currentPassword: string;
      password: string;
      refreshToken: string;
    },
  ): Promise<{ success: true }> {
    if (!activateAccountSchema.shape.password.safeParse(input.password).success) {
      throw new BadRequestException({ code: 'PASSWORD_INVALID', message: 'Invalid password' });
    }
    const session = await this.tokens.sessionForRefreshToken(input.refreshToken);
    if (!session || session.userId !== userId || session.gymId !== gymId)
      throw invalidRefreshToken();
    const credential = await this.prisma.client.gymCredential.findUnique({
      where: { userId_gymId: { userId, gymId } },
      select: { passwordHash: true },
    });
    if (
      !credential?.passwordHash ||
      !(await argon2.verify(credential.passwordHash, input.currentPassword))
    ) {
      throw invalidCredentials();
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.prisma.client.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(input.refreshToken) },
      });
      if (
        !current ||
        current.userId !== userId ||
        current.gymId !== gymId ||
        current.expiresAt <= new Date()
      )
        throw invalidRefreshToken();
      const live = await tx.refreshToken.findFirst({
        where: { familyId: current.familyId, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!live) throw invalidRefreshToken();
      const updated = await tx.gymCredential.updateMany({
        where: { userId, gymId, passwordHash: credential.passwordHash },
        data: { passwordHash },
      });
      if (!updated.count) throw invalidCredentials();
      await tx.refreshToken.updateMany({
        where: { userId, familyId: { not: current.familyId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { success: true };
  }

  /** A gym credential without a password is still waiting for setup. */
  async inspectStaffInvite(token: string, tenantSlug?: string | null) {
    const invite = await this.prisma.client.staffInvite.findUnique({
      where: { token },
      include: { gym: { select: { slug: true, name: true } } },
    });
    if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
      throw tokenInvalid('Activation');
    }
    if (tenantSlug && tenantSlug !== invite.gym.slug) {
      throw new BadRequestException({ code: 'TENANT_MISMATCH', message: 'Wrong gym' });
    }
    // The inviting gym's STAFF account: a member account of the same address in
    // the same gym is a different account and plays no part in the invitation.
    const credential = await this.prisma.client.gymCredential.findFirst({
      where: {
        gymId: invite.gymId,
        user: { email: normalizeEmail(invite.email), realm: staffRealm(invite.gymId) },
      },
      select: { passwordHash: true },
    });
    return {
      invite,
      needsPassword: !credential?.passwordHash,
      passwordHash: credential?.passwordHash,
    };
  }

  /** Existing gym credentials require proof of the current password before redemption. */
  async completeStaffInvite(
    input: { token: string; password?: string; currentPassword?: string },
    tenantSlug?: string | null,
  ): Promise<TokenPair> {
    const { invite, needsPassword, passwordHash } = await this.inspectStaffInvite(
      input.token,
      tenantSlug,
    );
    if (needsPassword && !input.password) {
      throw new BadRequestException({ code: 'PASSWORD_REQUIRED', message: 'Choose a password' });
    }
    if (needsPassword && !activateAccountSchema.shape.password.safeParse(input.password).success) {
      throw new BadRequestException({ code: 'PASSWORD_INVALID', message: 'Invalid password' });
    }
    if (
      !needsPassword &&
      (!input.currentPassword || !(await argon2.verify(passwordHash!, input.currentPassword)))
    ) {
      throw invalidCredentials();
    }
    // The staff account is found or created by the redemption itself, in its
    // transaction; a suspended gym is refused before anything is written.
    await this.assertGymNotSuspended(invite.gym.slug);
    const credential =
      needsPassword && input.password
        ? { passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) }
        : undefined;
    const redeemed = await this.redeemStaffInvite(
      invite.email,
      input.token,
      credential,
      passwordHash ?? null,
    );
    if (!redeemed) throw tokenInvalid('Activation');
    return this.tokens.issueTokenPair(
      redeemed.userId,
      await this.resolveSessionScope(redeemed.userId, invite.gym.slug, {
        pinned: true,
        gymCredential: true,
      }),
    );
  }

  /**
   * Redeem a staff invitation (T4.7) onto the inviting gym's **staff account** for
   * the invited address: found in the gym's staff realm, or created there. A
   * member account of the same address in the same gym is a different account and
   * is never touched. Upserts the staff {@link GymMember} with the invited role and
   * marks the invite used.
   *
   * Defensive by design and never throws into the auth flow it's called from:
   *   • A missing / expired / already-used token is a silent no-op — a normal
   *     sign-up or sign-in must not fail because an invite went stale.
   *   • The invite's `email` must match the caller's, so a token can only ever
   *     add the *invited* address to a gym.
   *   • The "mark used" update is guarded on `usedAt: null`, so two concurrent
   *     redemptions can't both succeed — the invite is strictly single-use.
   *   • An invite whose role is not a staff role redeems nothing.
   *
   * The staff account's credential (T1.25) is written alongside the membership.
   * `credential` carries a password the caller just proved or chose, which becomes
   * the account's password only when it has none yet, so a returning staff member
   * keeps the password they already sign in with. Either way the credential is
   * stamped verified: the invite was delivered to that address and is single-use,
   * which is the same proof the verification link gives.
   *
   * Returns the staff account and gym redeemed onto, or `null` when nothing was.
   *
   * Runs on the **unscoped** {@link PrismaService}: redemption happens during auth,
   * before any tenant context exists, and the target gym comes from the invite
   * itself rather than the request.
   */
  private async redeemStaffInvite(
    email: string,
    token?: string,
    credential?: { passwordHash: string; name?: string },
    expectedPasswordHash?: string | null,
  ): Promise<{ userId: string; gymId: string; gymSlug: string; gymName: string } | null> {
    if (!token) {
      return null;
    }
    try {
      const invite = await this.prisma.client.staffInvite.findUnique({
        where: { token },
        include: { gym: { select: { slug: true, name: true } } },
      });
      if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
        return null;
      }
      if (invite.role === Role.SUPER_ADMIN || audienceOfRole(invite.role) !== 'staff') {
        return null;
      }

      const userId = await this.prisma.client.$transaction(async (tx) => {
        const invitedName = [invite.firstName, invite.lastName].filter(Boolean).join(' ');
        const locationIds = [...new Set(invite.locationIds ?? [])];
        if (locationIds.length) {
          const validLocations = await tx.location.count({
            where: { gymId: invite.gymId, id: { in: locationIds } },
          });
          if (validLocations !== locationIds.length)
            throw new BadRequestException('LOCATION_INVALID');
        }
        // Single-use guard: the loser of a race sees zero rows updated and stops.
        const claimed = await tx.staffInvite.updateMany({
          where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count === 0) {
          return null;
        }
        const invitedProfile = {
          ...(invite.firstName != null ? { firstName: invite.firstName } : {}),
          ...(invite.lastName != null ? { lastName: invite.lastName } : {}),
          ...(locationIds.length ? { assignedLocationIds: locationIds } : {}),
        };
        const realm = staffRealm(invite.gymId);
        const address = normalizeEmail(invite.email);
        const account =
          (await tx.user.findUnique({
            where: { email_realm: { email: address, realm } },
            select: { id: true },
          })) ??
          (await tx.user.create({
            data: {
              email: address,
              realm,
              name: invitedName || credential?.name || null,
              passwordHash: credential?.passwordHash ?? null,
            },
            select: { id: true },
          }));
        const accountId = account.id;
        const member = await tx.gymMember.upsert({
          where: { userId_gymId: { userId: accountId, gymId: invite.gymId } },
          create: {
            userId: accountId,
            gymId: invite.gymId,
            role: invite.role,
            ...invitedProfile,
            status: GymMemberStatus.ACTIVE,
          },
          update: {
            role: invite.role,
            status: GymMemberStatus.ACTIVE,
            archivedAt: null,
            ...invitedProfile,
          },
          select: { id: true },
        });

        if (locationIds.length) {
          await tx.locationStaff.deleteMany({ where: { gymId: invite.gymId, staffId: member.id } });
          await tx.locationStaff.createMany({
            data: locationIds.map((locationId) => ({
              gymId: invite.gymId,
              staffId: member.id,
              locationId,
            })),
          });
        }
        const existing = await tx.gymCredential.findUnique({
          where: { userId_gymId: { userId: accountId, gymId: invite.gymId } },
          select: { passwordHash: true, emailVerifiedAt: true, name: true },
        });
        // A concurrent password reset/setup must not turn stale proof into a session.
        if (
          expectedPasswordHash !== undefined &&
          (existing?.passwordHash ?? null) !== expectedPasswordHash
        ) {
          throw invalidCredentials();
        }
        if (!existing) {
          await tx.gymCredential.create({
            data: {
              userId: accountId,
              gymId: invite.gymId,
              passwordHash: credential?.passwordHash ?? null,
              name: invitedName || credential?.name || null,
              emailVerifiedAt: new Date(),
            },
          });
        } else {
          await tx.gymCredential.update({
            where: { userId_gymId: { userId: accountId, gymId: invite.gymId } },
            data: {
              passwordHash: existing.passwordHash ?? credential?.passwordHash ?? null,
              name: invitedName || existing.name || credential?.name || null,
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
        return accountId;
      });

      if (!userId) {
        return null;
      }
      this.logger.debug(`Redeemed staff invite ${invite.id} for user ${userId}`);
      return { userId, gymId: invite.gymId, gymSlug: invite.gym.slug, gymName: invite.gym.name };
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

/** One account a password reset mails a token for — see {@link AuthService.requestPasswordReset}. */
interface ResetTarget {
  userId: string;
  /** The gym whose credential the token resets; `null` for a platform account. */
  gymId: string | null;
  gymSlug: string | null;
  gymName: string | null;
  name: string | null;
  /** Which page the link opens: the admin console's for a staff account. */
  audience: AccountAudience;
}

/** An account as the reset paths read it. */
interface ResetAccount {
  id: string;
  realm: string;
  name: string | null;
  isSuperAdmin: boolean;
  credentials: { gymId: string; name: string | null; gym: { slug: string; name: string } }[];
}

/** No more reset mails than this go out for one request, however many accounts match. */
const MAX_RESET_TARGETS = 10;

/** The reset target of one gym account, named by its own gym. */
function gymResetTarget(
  account: ResetAccount,
  gym: { id: string; slug: string; name: string },
): ResetTarget {
  const credential = account.credentials.find((c) => c.gymId === gym.id);
  const realm = parseRealm(account.realm);
  return {
    userId: account.id,
    gymId: gym.id,
    gymSlug: gym.slug,
    gymName: gym.name,
    name: credential?.name ?? account.name,
    audience: realm?.kind === 'gym' ? realm.audience : 'member',
  };
}

/** The one account a reset on a named gym is for: the audience's, member before staff. */
function gymResetTargets(
  accounts: ResetAccount[],
  gym: { id: string; slug: string; name: string },
  audience: AccountAudience | undefined,
): ResetTarget[] {
  for (const realm of signInRealms(gym.id, audience)) {
    const account = accounts.find((a) => a.realm === realm);
    if (account) {
      return [gymResetTarget(account, gym)];
    }
  }
  return [];
}

/** Every account a tenant-less reset mails, one token each. */
function tenantlessResetTargets(
  accounts: ResetAccount[],
  audience: AccountAudience | undefined,
): ResetTarget[] {
  const gymAccounts = (wanted: AccountAudience) =>
    accounts.flatMap((account) => {
      const realm = parseRealm(account.realm);
      if (realm?.kind !== 'gym' || realm.audience !== wanted) {
        return [];
      }
      const credential = account.credentials.find((c) => c.gymId === realm.gymId);
      return credential ? [gymResetTarget(account, { id: realm.gymId, ...credential.gym })] : [];
    });
  const members = audience === 'staff' ? [] : gymAccounts('member');
  const staff =
    audience === 'member' || (!audience && members.length > 0) ? [] : gymAccounts('staff');
  const targets = [...members, ...staff];

  const platform = accounts.find((a) => a.realm === PLATFORM_REALM);
  const platformTarget: ResetTarget | null = platform
    ? {
        userId: platform.id,
        gymId: null,
        gymSlug: null,
        gymName: null,
        name: platform.name,
        audience: 'member',
      }
    : null;
  if (
    platformTarget &&
    (targets.length === 0 || (platform!.isSuperAdmin && audience !== 'member'))
  ) {
    targets.unshift(platformTarget);
  }
  return targets.slice(0, MAX_RESET_TARGETS);
}

/** Staff invitations always land in the public console acceptance flow. */
function buildInviteRedirectUrl(
  path: string,
  params: Record<string, string>,
  gymSlug?: string | null,
): string {
  const qs = new URLSearchParams(params).toString();
  const url = buildConsoleUrl(path, gymSlug) ?? buildMemberUrl(`admin/${path}`, gymSlug);
  return `${url}?${qs}`;
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

/** An address as the sign-in contracts normalise it (trimmed, lower-cased). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
