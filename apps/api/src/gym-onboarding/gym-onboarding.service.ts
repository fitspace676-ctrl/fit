import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type GymOnboarding } from '@fit/db';
import {
  GYM_ONBOARDING_STEPS,
  GYM_ONBOARDING_STEP_SCHEMAS,
  ONBOARDING_LINK_INVALID_CODE,
  ONBOARDING_LINK_EXPIRED_CODE,
  ONBOARDING_COMPLETED_CODE,
  ONBOARDING_ACCOUNT_ALREADY_SET_CODE,
  ONBOARDING_ACCOUNT_REQUIRED_CODE,
  gymSettingsStoredSchema,
  locationHoursSchema,
  gymOnboardingAccountSchema,
  gymOnboardingBusinessSchema,
  gymOnboardingLocationSchema,
  type AdminGymOnboarding,
  type GymOnboardingState,
  type GymOnboardingStep,
  type GymOnboardingStatus,
  type CompleteGymOnboardingResponse,
} from '@fit/types';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

export const GYM_ONBOARDING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const invalid = () =>
  new NotFoundException({ message: 'Invalid onboarding link', code: ONBOARDING_LINK_INVALID_CODE });
const completed = () =>
  new ConflictException({ message: 'Onboarding is completed', code: ONBOARDING_COMPLETED_CODE });

@Injectable()
export class GymOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Fail before provisioning a gym if signing is unavailable. */
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

  private token(row: GymOnboarding): string {
    const signature = createHmac('sha256', this.secret())
      .update(`gym-onboarding:${row.id}:${row.nonce}`)
      .digest('base64url');
    return `${row.id}.${signature}`;
  }

  private status(row: GymOnboarding): GymOnboardingStatus {
    if (row.completedAt) return 'COMPLETED';
    if (row.expiresAt.getTime() < Date.now()) return 'EXPIRED';
    return row.startedAt ? 'IN_PROGRESS' : 'PENDING';
  }

  private steps(row: GymOnboarding, hasPassword: boolean): GymOnboardingStep[] {
    return GYM_ONBOARDING_STEPS.filter((step) =>
      step === 'account' ? hasPassword : row.completedSteps.includes(step),
    );
  }

  private async owner(row: GymOnboarding, db: Prisma.TransactionClient) {
    const gym = await db.gym.findUnique({ where: { id: row.gymId } });
    if (!gym?.ownerId) throw invalid();
    const [user, credential] = await Promise.all([
      db.user.findUnique({ where: { id: gym.ownerId } }),
      db.gymCredential.findUnique({
        where: { userId_gymId: { userId: gym.ownerId, gymId: gym.id } },
      }),
    ]);
    if (!user || !credential) throw invalid();
    return { gym, user, credential };
  }

  private async adminState(
    row: GymOnboarding,
    db: Prisma.TransactionClient,
  ): Promise<AdminGymOnboarding> {
    const { credential } = await this.owner(row, db);
    return {
      status: this.status(row),
      token: row.completedAt ? null : this.token(row),
      completedSteps: this.steps(row, Boolean(credential.passwordHash)),
      totalSteps: GYM_ONBOARDING_STEPS.length,
      expiresAt: row.expiresAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getAdminState(gymId: string): Promise<AdminGymOnboarding | null> {
    const row = await this.prisma.client.gymOnboarding.findUnique({ where: { gymId } });
    return row ? this.adminState(row, this.prisma.client) : null;
  }

  /** Gym lock serializes regeneration, completion and all step saves. */
  async regenerate(gymId: string, actorId: string): Promise<AdminGymOnboarding> {
    this.assertConfigured();
    return this.prisma.client.$transaction(async (db) => {
      await db.$queryRaw`SELECT "id" FROM "gyms" WHERE "id" = ${gymId} FOR UPDATE`;
      const gym = await db.gym.findUnique({ where: { id: gymId } });
      if (!gym) throw new NotFoundException({ message: 'Gym not found', code: 'GYM_NOT_FOUND' });
      const existing = await db.gymOnboarding.findUnique({ where: { gymId } });
      if (existing?.completedAt) throw completed();
      const data = {
        nonce: randomBytes(32).toString('base64url'),
        expiresAt: new Date(Date.now() + GYM_ONBOARDING_TTL_MS),
      };
      const row = await db.gymOnboarding.upsert({
        where: { gymId },
        create: { gymId, createdByUserId: actorId, ...data },
        update: data,
      });
      return this.adminState(row, db);
    });
  }

  private async resolve(token: string, db: Prisma.TransactionClient): Promise<GymOnboarding> {
    if (!/^[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9_-]{43}$/.test(token)) throw invalid();
    const row = await db.gymOnboarding.findUnique({
      where: { id: token.slice(0, token.indexOf('.')) },
    });
    if (!row) throw invalid();
    // Compare canonical encoded signatures: alternate base64 encodings are invalid too.
    const expected = Buffer.from(this.token(row));
    const supplied = Buffer.from(token);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw invalid();
    if (this.status(row) === 'EXPIRED')
      throw new GoneException({
        message: 'Onboarding link expired',
        code: ONBOARDING_LINK_EXPIRED_CODE,
      });
    return row;
  }

  private async state(
    row: GymOnboarding,
    db: Prisma.TransactionClient,
  ): Promise<GymOnboardingState> {
    const { gym, user, credential } = await this.owner(row, db);
    const settings = gymSettingsStoredSchema.parse(gym.settings ?? {});
    const location = await db.location.findFirst({ where: { gymId: row.gymId, isDefault: true } });
    const hours = locationHoursSchema.safeParse(location?.hours ?? {});
    return {
      status: this.status(row),
      gym: { name: gym.name, subdomainSlug: gym.slug },
      owner: {
        email: user.email,
        name: credential.name,
        hasPassword: Boolean(credential.passwordHash),
      },
      steps: [...GYM_ONBOARDING_STEPS],
      completedSteps: this.steps(row, Boolean(credential.passwordHash)),
      values: {
        business: {
          gymName: gym.name,
          address: settings.business.address,
          phone: settings.business.phone,
          email: settings.business.email,
          website: settings.business.website,
        },
        brand: { primaryColor: settings.brand.primaryColor },
        payments: settings.payments,
        location: {
          name: location?.name ?? gym.name,
          address: location?.address ?? '',
          phone: location?.phone ?? null,
          hours: hours.success ? hours.data : locationHoursSchema.parse({}),
        },
      },
      expiresAt: row.expiresAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  async getState(token: string): Promise<GymOnboardingState> {
    return this.state(await this.resolve(token, this.prisma.client), this.prisma.client);
  }

  private async write<T>(
    token: string,
    action: (row: GymOnboarding, db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const initial = await this.resolve(token, this.prisma.client);
    return this.prisma.client.$transaction(async (db) => {
      await db.$queryRaw`SELECT "id" FROM "gyms" WHERE "id" = ${initial.gymId} FOR UPDATE`;
      // Recheck after acquiring the lock: a rotation/completion may have won the race.
      const row = await this.resolve(token, db);
      if (row.completedAt) throw completed();
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
        throw new BadRequestException(parsed.error.issues.map((issue) => issue.message));
      const { gym, credential } = await this.owner(row, db);
      if (step === 'account') {
        if (credential.passwordHash)
          throw new ConflictException({
            message: 'Owner already has a password',
            code: ONBOARDING_ACCOUNT_ALREADY_SET_CODE,
          });
        const input = gymOnboardingAccountSchema.parse(parsed.data);
        await this.auth.activateOnboardingOwner(
          credential.userId,
          gym.id,
          input.ownerName,
          input.password,
          db,
        );
      } else if (step === 'location') {
        const input = gymOnboardingLocationSchema.parse(parsed.data);
        const location = await db.location.findFirst({ where: { gymId: gym.id, isDefault: true } });
        const data = { ...input, hours: input.hours as Prisma.InputJsonValue };
        if (location) await db.location.update({ where: { id: location.id }, data });
        else await db.location.create({ data: { ...data, gymId: gym.id, isDefault: true } });
      } else {
        const current = gymSettingsStoredSchema.parse(gym.settings ?? {});
        let name = gym.name;
        let section: unknown = parsed.data;
        if (step === 'business') {
          const { gymName, ...business } = gymOnboardingBusinessSchema.parse(parsed.data);
          name = gymName;
          section = business;
        }
        const merged = gymSettingsStoredSchema.safeParse({
          ...current,
          [step]: { ...current[step], ...(section as Record<string, unknown>) },
        });
        if (!merged.success)
          throw new BadRequestException(merged.error.issues.map((issue) => issue.message));
        await db.gym.update({
          where: { id: gym.id },
          data: { name, settings: merged.data as unknown as Prisma.InputJsonValue },
        });
      }
      const updated = await db.gymOnboarding.update({
        where: { id: row.id },
        data: {
          startedAt: row.startedAt ?? new Date(),
          completedSteps: [...new Set([...row.completedSteps, step])],
        },
      });
      return this.state(updated, db);
    });
  }

  async complete(token: string): Promise<CompleteGymOnboardingResponse> {
    return this.write(token, async (row, db) => {
      const { user, credential } = await this.owner(row, db);
      if (!credential.passwordHash)
        throw new BadRequestException({
          message: 'Set the owner password first',
          code: ONBOARDING_ACCOUNT_REQUIRED_CODE,
        });
      await db.gymOnboarding.update({
        where: { id: row.id },
        data: {
          completedAt: new Date(),
          startedAt: row.startedAt ?? new Date(),
          completedSteps: this.steps(row, true),
        },
      });
      return { email: user.email };
    });
  }
}
