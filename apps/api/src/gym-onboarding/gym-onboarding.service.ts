import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type GymOnboarding } from '@fit/db';
import {
  GYM_ONBOARDING_STEPS,
  GYM_ONBOARDING_STEP_SCHEMAS,
  gymSettingsStoredSchema,
  locationHoursSchema,
  gymOnboardingAccountSchema,
  type AdminGymRequest,
  type AdminGymRequestSummary,
  type GymOnboardingState,
  type GymOnboardingStep,
  type GymOnboardingStatus,
} from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../auth/email.service';

export const GYM_ONBOARDING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_COOLDOWN_MS = 60 * 1000;
const invalid = () =>
  new NotFoundException({ message: 'Invalid onboarding link', code: 'ONBOARDING_LINK_INVALID' });
export const submitted = () =>
  new ConflictException({ message: 'Request already submitted', code: 'ONBOARDING_SUBMITTED' });

@Injectable()
export class GymOnboardingService {
  private readonly logger = new Logger(GymOnboardingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  assertConfigured(): void {
    this.secret();
  }
  private secret(): string {
    if (!env.JWT_SECRET)
      throw new ServiceUnavailableException(
        'Onboarding signing is not configured (JWT_SECRET unset)',
      );
    return env.JWT_SECRET;
  }
  token(row: GymOnboarding): string {
    return `${row.id}.${createHmac('sha256', this.secret()).update(`gym-onboarding:${row.id}:${row.nonce}`).digest('base64url')}`;
  }
  status(row: GymOnboarding): GymOnboardingStatus {
    if (row.approvedAt) return 'APPROVED';
    if (row.rejectedAt) return 'REJECTED';
    if (row.submittedAt) return 'SUBMITTED';
    if (row.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
    if (row.codeSentAt) return 'CODE_SENT';
    return row.startedAt ? 'IN_PROGRESS' : 'PENDING';
  }
  isSubmitted(row: GymOnboarding): boolean {
    return Boolean(row.submittedAt || row.approvedAt || row.rejectedAt);
  }
  rotation() {
    return {
      nonce: randomBytes(32).toString('base64url'),
      expiresAt: new Date(Date.now() + GYM_ONBOARDING_TTL_MS),
      codeHash: null,
      codeExpiresAt: null,
      codeSentAt: null,
      codeAttempts: 0,
    };
  }
  state(row: GymOnboarding): GymOnboardingState {
    const defaults = gymSettingsStoredSchema.parse({});
    const draft = row.draft as Partial<GymOnboardingState['values']>;
    return {
      status: this.status(row),
      gym: { name: row.gymName, subdomainSlug: row.subdomainSlug },
      owner: { email: row.ownerEmail, name: row.ownerName, hasPassword: Boolean(row.passwordHash) },
      steps: [...GYM_ONBOARDING_STEPS],
      completedSteps: GYM_ONBOARDING_STEPS.filter((step) =>
        step === 'account' ? Boolean(row.passwordHash) : row.completedSteps.includes(step),
      ),
      values: {
        business: draft.business ?? { gymName: row.gymName, ...defaults.business },
        brand: draft.brand ?? { primaryColor: defaults.brand.primaryColor },
        payments: draft.payments ?? defaults.payments,
        location: draft.location ?? {
          name: row.gymName,
          address: '',
          phone: null,
          hours: locationHoursSchema.parse({}),
        },
      },
      expiresAt: row.expiresAt.toISOString(),
      codeSentAt: row.codeSentAt?.toISOString() ?? null,
      codeResendAvailableAt: row.codeSentAt
        ? new Date(row.codeSentAt.getTime() + CODE_COOLDOWN_MS).toISOString()
        : null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
    };
  }
  summary(row: GymOnboarding): AdminGymRequestSummary {
    return {
      id: row.id,
      gymName: row.gymName,
      subdomainSlug: row.subdomainSlug,
      ownerEmail: row.ownerEmail,
      ownerName: row.ownerName,
      status: this.status(row),
      completedSteps: this.state(row).completedSteps.length,
      totalSteps: GYM_ONBOARDING_STEPS.length,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      decidedAt: (row.approvedAt ?? row.rejectedAt)?.toISOString() ?? null,
      gymId: row.gymId,
    };
  }
  adminState(row: GymOnboarding): AdminGymRequest {
    const state = this.state(row);
    return {
      ...this.summary(row),
      token: this.isSubmitted(row) ? null : this.token(row),
      steps: state.steps,
      completedStepKeys: state.completedSteps,
      values: state.values,
      startedAt: row.startedAt?.toISOString() ?? null,
      codeSentAt: state.codeSentAt,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
    };
  }
  private async resolve(token: string, db: Prisma.TransactionClient): Promise<GymOnboarding> {
    if (!/^[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9_-]{43}$/.test(token)) throw invalid();
    const row = await db.gymOnboarding.findUnique({ where: { id: token.split('.')[0] } });
    if (!row) throw invalid();
    const expected = Buffer.from(this.token(row));
    const supplied = Buffer.from(token);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw invalid();
    if (this.status(row) === 'EXPIRED')
      throw new GoneException({
        message: 'Onboarding link expired',
        code: 'ONBOARDING_LINK_EXPIRED',
      });
    return row;
  }
  async getState(token: string): Promise<GymOnboardingState> {
    return this.state(await this.resolve(token, this.prisma.client));
  }
  private async write<T>(
    token: string,
    action: (row: GymOnboarding, db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const initial = await this.resolve(token, this.prisma.client);
    return this.prisma.client.$transaction(async (db) => {
      await db.$queryRaw`SELECT "id" FROM "gym_onboardings" WHERE "id" = ${initial.id} FOR UPDATE`;
      const row = await this.resolve(token, db);
      if (this.isSubmitted(row)) throw submitted();
      return action(row, db);
    });
  }
  async saveStep(
    token: string,
    step: GymOnboardingStep,
    body: unknown,
  ): Promise<GymOnboardingState> {
    return this.write(token, async (row, db) => {
      const parsed = GYM_ONBOARDING_STEP_SCHEMAS[step].safeParse(body);
      if (!parsed.success)
        throw new BadRequestException({
          message: parsed.error.issues.map((i) => i.message).join(', '),
          code: 'ONBOARDING_STEP_INVALID',
        });
      const data: Prisma.GymOnboardingUpdateInput = {
        startedAt: row.startedAt ?? new Date(),
        completedSteps: [...new Set([...row.completedSteps, step])],
      };
      if (step === 'account') {
        const account = gymOnboardingAccountSchema.parse(parsed.data);
        data.ownerName = account.ownerName;
        data.passwordHash = await argon2.hash(account.password, { type: argon2.argon2id });
      } else
        data.draft = {
          ...(row.draft as Prisma.JsonObject),
          [step]: parsed.data as Prisma.InputJsonValue,
        };
      return this.state(await db.gymOnboarding.update({ where: { id: row.id }, data }));
    });
  }
  private codeHash(id: string, code: string): string {
    return createHmac('sha256', this.secret())
      .update(`gym-onboarding-code:${id}:${code}`)
      .digest('hex');
  }
  async submit(token: string): Promise<GymOnboardingState> {
    const result = await this.write(token, async (row, db) => {
      if (!row.passwordHash)
        throw new BadRequestException({
          message: 'Set the owner password first',
          code: 'ONBOARDING_ACCOUNT_REQUIRED',
        });
      if (row.codeSentAt && Date.now() < row.codeSentAt.getTime() + CODE_COOLDOWN_MS)
        throw new HttpException(
          { message: 'Wait before resending the code', code: 'ONBOARDING_CODE_COOLDOWN' },
          429,
        );
      const code = randomInt(0, 1000000).toString().padStart(6, '0');
      const updated = await db.gymOnboarding.update({
        where: { id: row.id },
        data: {
          codeHash: this.codeHash(row.id, code),
          codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
          codeSentAt: new Date(),
          codeAttempts: 0,
        },
      });
      return { row: updated, code };
    });
    try {
      await this.email.sendOnboardingCodeEmail(result.row.ownerEmail, result.code);
    } catch (error) {
      this.logger.error(
        `Failed to send onboarding code: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return this.state(result.row);
  }
  async verify(token: string, code: string): Promise<GymOnboardingState> {
    // Return errors from the transaction: throwing inside it would roll back failed attempts.
    const result = await this.write(token, async (row, db) => {
      if (!row.codeHash || !row.codeExpiresAt || row.codeExpiresAt.getTime() <= Date.now())
        return { error: 'ONBOARDING_CODE_EXPIRED' } as const;
      const expected = Buffer.from(row.codeHash, 'hex');
      const supplied = Buffer.from(this.codeHash(row.id, code), 'hex');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        const attempts = row.codeAttempts + 1;
        await db.gymOnboarding.update({
          where: { id: row.id },
          data: {
            codeAttempts: attempts,
            ...(attempts >= 5 ? { codeHash: null, codeExpiresAt: null } : {}),
          },
        });
        return { error: 'ONBOARDING_CODE_INVALID' } as const;
      }
      return {
        state: this.state(
          await db.gymOnboarding.update({
            where: { id: row.id },
            data: { submittedAt: new Date(), codeHash: null, codeExpiresAt: null },
          }),
        ),
      };
    });
    if ('error' in result)
      throw new BadRequestException({
        message: result.error === 'ONBOARDING_CODE_EXPIRED' ? 'Request a new code' : 'Invalid code',
        code: result.error,
      });
    return result.state;
  }
}
