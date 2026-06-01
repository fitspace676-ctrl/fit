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
import type {
  LoginInput,
  RefreshInput,
  RegisterInput,
  RegisterResponse,
  TokenPair,
} from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from './email.service';
import { TokenService } from './token.service';

/** Redis key namespace for one-time email-verification tokens. */
const VERIFY_KEY_PREFIX = 'email-verify:';

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

    return this.tokens.issueTokenPair(userId);
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

    return this.tokens.issueTokenPair(user.id);
  }

  /**
   * Exchange a refresh token for a fresh session, rotating the refresh token in
   * the process. Delegates the rotation + reuse-detection rules to
   * {@link TokenService.rotateRefreshToken}.
   */
  async refresh(input: RefreshInput): Promise<TokenPair> {
    return this.tokens.rotateRefreshToken(input.refreshToken);
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
