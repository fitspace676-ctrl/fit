import { describe, expect, it, vi } from 'vitest';
import { Prisma, type GymOnboarding } from '@fit/db';
import { listAdminAuditLogQuerySchema, locationHoursSchema } from '@fit/types';
import { GymOnboardingService } from '../gym-onboarding/gym-onboarding.service';
import { AuthService } from '../auth/auth.service';
import type { EmailService } from '../auth/email.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokenService } from '../auth/token.service';
import type { RedisService } from '../redis/redis.service';
import { SuperAdminService } from './superadmin.service';

vi.mock('../config/env', () => ({ env: { JWT_SECRET: 'request-test-secret' } }));
const input = { gymName: 'Gym', subdomainSlug: 'gym', ownerEmail: 'owner@example.com' };
function setup(overrides: Partial<GymOnboarding> = {}) {
  let row: GymOnboarding = {
    ...input,
    id: 'request1',
    gymId: null,
    ownerName: 'Owner',
    passwordHash: null,
    draft: {},
    nonce: 'nonce',
    completedSteps: [],
    startedAt: null,
    completedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
    createdByUserId: 'operator',
    createdAt: new Date(),
    updatedAt: new Date(),
    codeHash: null,
    codeExpiresAt: null,
    codeSentAt: null,
    codeAttempts: 0,
    submittedAt: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectedByUserId: null,
    rejectionReason: null,
    ...overrides,
  };
  const db = {
    $queryRaw: vi.fn(() => Promise.resolve([])),
    gymOnboarding: {
      findUnique: vi.fn(() => Promise.resolve(row as GymOnboarding | null)),
      findMany: vi.fn(() => Promise.resolve([] as GymOnboarding[])),
      create: vi.fn(({ data }: { data: Partial<GymOnboarding> }) =>
        Promise.resolve((row = { ...row, ...data })),
      ),
      update: vi.fn(({ data }: { data: Partial<GymOnboarding> }) =>
        Promise.resolve((row = { ...row, ...data })),
      ),
      delete: vi.fn(() => Promise.resolve(row)),
    },
    gym: {
      findUnique: vi.fn(() => Promise.resolve(null as { id: string } | null)),
      create: vi.fn((_args: unknown) => Promise.resolve({ id: 'gym1' })),
    },
    user: {
      findUnique: vi.fn(() => Promise.resolve(null as { id: string } | null)),
      create: vi.fn((_args: unknown) => Promise.resolve({ id: 'owner1' })),
    },
    gymMember: { create: vi.fn((_args: unknown) => Promise.resolve({})) },
    gymCredential: { create: vi.fn((_args: unknown) => Promise.resolve({})) },
    location: { create: vi.fn((_args: unknown) => Promise.resolve({})) },
    auditLog: { create: vi.fn((_args: unknown) => Promise.resolve({})) },
  };
  const transaction = vi.fn(<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    fn(db as unknown as Prisma.TransactionClient),
  );
  const prisma = { client: { ...db, $transaction: transaction } } as unknown as PrismaService;
  const email = {
    sendOwnerLiveOnboardingEmail: vi.fn(() => Promise.resolve()),
    sendGymReadyEmail: vi.fn(() => Promise.resolve()),
  };
  const onboarding = new GymOnboardingService(prisma, email as unknown as EmailService);
  const auth = {
    provisionGym: vi.fn((...args: Parameters<AuthService['provisionGym']>) =>
      AuthService.prototype.provisionGym(...args),
    ),
  } as unknown as AuthService;
  const service = new SuperAdminService(
    prisma,
    {} as TokenService,
    {} as RedisService,
    auth,
    onboarding,
    email as unknown as EmailService,
  );
  return { service, db, row: () => row, email, transaction, onboarding, auth };
}
const failure = (code: string) => ({ status: 409, response: { code } });

describe('SuperAdmin gym requests', () => {
  it('creates only a request and sends its link without provisioning a tenant', async () => {
    const { service, db, email } = setup();
    const request = await service.createGymRequest('operator', input);
    expect(request).toMatchObject({
      status: 'PENDING',
      gymId: null,
      token: expect.any(String) as string,
    });
    expect(db.gym.create).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(email.sendOwnerLiveOnboardingEmail).toHaveBeenCalledWith(
      input.ownerEmail,
      request.token,
      'Gym',
      'Owner',
      undefined,
      'gym',
    );
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'gym-request.create',
        actorId: 'operator',
        targetId: 'request1',
      }) as object,
    });
  });
  it.each(['gym', 'user'] as const)('rejects an existing %s', async (model) => {
    const { service, db } = setup();
    db[model].findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.createGymRequest('operator', input)).rejects.toMatchObject(
      failure(model === 'gym' ? 'SUBDOMAIN_TAKEN' : 'EMAIL_TAKEN'),
    );
    expect(db.gymOnboarding.create).not.toHaveBeenCalled();
  });
  it.each(['slug', 'email'] as const)('rejects an open request reserving the %s', async (key) => {
    const { service, db, row } = setup(key === 'email' ? { subdomainSlug: 'different' } : {});
    db.gymOnboarding.findMany.mockResolvedValue([row()]);
    await expect(service.createGymRequest('operator', input)).rejects.toMatchObject(
      failure(key === 'slug' ? 'SUBDOMAIN_TAKEN' : 'EMAIL_TAKEN'),
    );
  });
  it.each(['expired', 'rejected'])(
    'reclaims a %s reservation within the create transaction',
    async (state) => {
      const { service, db, row, transaction } = setup(
        state === 'expired' ? { expiresAt: new Date(0) } : { rejectedAt: new Date() },
      );
      db.gymOnboarding.findMany.mockResolvedValue([row()]);
      await service.createGymRequest('operator', input);
      expect(db.gymOnboarding.delete).toHaveBeenCalledWith({ where: { id: 'request1' } });
      expect(transaction).toHaveBeenCalledOnce();
    },
  );
  it('does not expire a submitted reservation', async () => {
    const { service, db, row } = setup({ submittedAt: new Date(), expiresAt: new Date(0) });
    db.gymOnboarding.findMany.mockResolvedValue([row()]);
    await expect(service.createGymRequest('operator', input)).rejects.toMatchObject(
      failure('SUBDOMAIN_TAKEN'),
    );
  });
  it('maps unique races to the same conflicts', async () => {
    const { service, db } = setup();
    db.gymOnboarding.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['subdomainSlug'] },
      }),
    );
    await expect(service.createGymRequest('operator', input)).rejects.toMatchObject(
      failure('SUBDOMAIN_TAKEN'),
    );
  });
  it('rotates the link, invalidates the pending code and audits without credentials', async () => {
    const { service, row, db, onboarding } = setup({ codeHash: 'old', codeSentAt: new Date() });
    const original = onboarding.token(row());
    const rotated = await service.regenerateGymRequestLink('operator', 'request1');
    expect(rotated.token).not.toBe(original);
    expect(row().codeHash).toBeNull();
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: { action: 'gym-request.link.regenerate', actorId: 'operator', targetId: 'request1' },
    });
  });
  it('provisions verified credentials, draft settings and a default location in one transaction', async () => {
    const hours = locationHoursSchema.parse({});
    const { service, db, row, transaction, email } = setup({
      submittedAt: new Date(),
      passwordHash: 'chosen-argon2-hash',
      completedSteps: ['account', 'business', 'brand', 'location', 'payments'],
      draft: {
        business: {
          gymName: 'Submitted Name',
          address: 'Business address',
          phone: '123',
          email: null,
          website: null,
        },
        brand: { primaryColor: '#abcdef' },
        location: { name: 'Main', address: 'Location address', phone: '456', hours },
        payments: {
          acceptCash: false,
          acceptCard: true,
          acceptBankTransfer: true,
          acceptPrepaidCredits: false,
        },
      },
    });
    expect(await service.approveGymRequest('operator', 'request1')).toEqual({
      gymId: 'gym1',
      subdomainSlug: 'gym',
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: input.ownerEmail,
        name: 'Owner',
        passwordHash: 'chosen-argon2-hash',
        emailVerifiedAt: expect.any(Date) as Date,
      }) as object,
      select: { id: true },
    });
    expect(db.gym.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Submitted Name',
        slug: 'gym',
        ownerId: 'owner1',
        createdByUserId: 'operator',
        settings: expect.objectContaining({
          business: expect.objectContaining({ address: 'Business address' }) as object,
          brand: expect.objectContaining({ primaryColor: '#abcdef' }) as object,
          payments: expect.objectContaining({ acceptCash: false }) as object,
        }) as object,
      }) as object,
      select: { id: true },
    });
    expect(db.gymMember.create).toHaveBeenCalledWith({
      data: { userId: 'owner1', gymId: 'gym1', role: 'OWNER', status: 'ACTIVE' },
    });
    expect(db.gymCredential.create).toHaveBeenCalledWith({
      data: {
        userId: 'owner1',
        gymId: 'gym1',
        passwordHash: 'chosen-argon2-hash',
        name: 'Owner',
        emailVerifiedAt: expect.any(Date) as Date,
      },
    });
    expect(db.location.create).toHaveBeenCalledWith({
      data: {
        gymId: 'gym1',
        isDefault: true,
        name: 'Main',
        address: 'Location address',
        phone: '456',
        hours,
      },
    });
    expect(row()).toMatchObject({
      gymId: 'gym1',
      approvedByUserId: 'operator',
      approvedAt: expect.any(Date) as Date,
      completedAt: expect.any(Date) as Date,
    });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'gym.create',
        gymId: 'gym1',
        targetId: 'owner1',
      }) as object,
    });
    expect(email.sendGymReadyEmail).toHaveBeenCalledWith(input.ownerEmail, 'Submitted Name', 'gym');
  });
  it('creates a default location when skipped and survives ready-mail failure', async () => {
    const { service, db, email } = setup({ submittedAt: new Date(), passwordHash: 'hash' });
    email.sendGymReadyEmail.mockRejectedValueOnce(new Error('mail offline'));
    await expect(service.approveGymRequest('operator', 'request1')).resolves.toMatchObject({
      gymId: 'gym1',
    });
    expect(db.location.create).toHaveBeenCalledWith({
      data: {
        gymId: 'gym1',
        isDefault: true,
        name: 'Gym',
        address: '',
        phone: null,
        hours: locationHoursSchema.parse({}),
      },
    });
  });
  it('refuses approval before submission and link rotation after submission', async () => {
    const pending = setup();
    await expect(pending.service.approveGymRequest('operator', 'request1')).rejects.toMatchObject(
      failure('ONBOARDING_NOT_SUBMITTED'),
    );
    expect(pending.db.gym.create).not.toHaveBeenCalled();
    const submitted = setup({ submittedAt: new Date() });
    await expect(
      submitted.service.regenerateGymRequestLink('operator', 'request1'),
    ).rejects.toMatchObject(failure('ONBOARDING_SUBMITTED'));
  });
  it.each(['gym', 'user'] as const)('rechecks %s conflicts before approving', async (model) => {
    const { service, db } = setup({ submittedAt: new Date(), passwordHash: 'hash' });
    db[model].findUnique.mockResolvedValueOnce({ id: 'taken' });
    await expect(service.approveGymRequest('operator', 'request1')).rejects.toMatchObject(
      failure(model === 'gym' ? 'SUBDOMAIN_TAKEN' : 'EMAIL_TAKEN'),
    );
    expect(db.gym.create).not.toHaveBeenCalled();
  });
  it('rejects with a reason, no email, and refuses further decisions', async () => {
    const { service, row, email } = setup({ submittedAt: new Date() });
    expect(await service.rejectGymRequest('operator', 'request1', 'Duplicate')).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Duplicate',
      token: null,
    });
    expect(row().rejectedByUserId).toBe('operator');
    expect(email.sendGymReadyEmail).not.toHaveBeenCalled();
    await expect(service.rejectGymRequest('operator', 'request1')).rejects.toMatchObject(
      failure('ONBOARDING_SUBMITTED'),
    );
    await expect(service.approveGymRequest('operator', 'request1')).rejects.toMatchObject(
      failure('ONBOARDING_NOT_SUBMITTED'),
    );
  });
  it('lists newest first without exposing tokens and returns 404 for a missing request', async () => {
    const { service, db, row } = setup();
    db.gymOnboarding.findMany.mockResolvedValue([row()]);
    const list = await service.listGymRequests();
    expect(list.requests[0]).not.toHaveProperty('token');
    expect(db.gymOnboarding.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    db.gymOnboarding.findUnique.mockResolvedValueOnce(null);
    await expect(service.getGymRequest('missing')).rejects.toMatchObject({
      status: 404,
      response: { code: 'GYM_REQUEST_NOT_FOUND' },
    });
  });
  it.each(['gym-request.create', 'gym-request.link.regenerate', 'gym-request.reject'])(
    'allows audit filtering by %s without a closed whitelist',
    (action) => {
      expect(listAdminAuditLogQuerySchema.parse({ action }).action).toBe(action);
    },
  );
});
