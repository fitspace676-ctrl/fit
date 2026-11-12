import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import * as argon2 from 'argon2';
import { type GymOnboarding, type Prisma } from '@fit/db';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailService } from '../auth/email.service';
import { GymOnboardingService, GYM_ONBOARDING_TTL_MS } from './gym-onboarding.service';

vi.mock('../config/env', () => ({ env: { JWT_SECRET: 'onboarding-test-secret' } }));

function setup(overrides: Partial<GymOnboarding> = {}) {
  const now = new Date();
  let row: GymOnboarding = {
    id: 'request1',
    gymId: null,
    gymName: 'Gym',
    subdomainSlug: 'gym',
    ownerEmail: 'owner@example.com',
    ownerName: null,
    passwordHash: null,
    draft: {},
    nonce: 'nonce',
    completedSteps: [],
    startedAt: null,
    completedAt: null,
    expiresAt: new Date(now.getTime() + GYM_ONBOARDING_TTL_MS),
    createdByUserId: 'operator1',
    createdAt: now,
    updatedAt: now,
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
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === row.id ? row : null),
      ),
      update: vi.fn(({ data }: { data: Partial<GymOnboarding> }) =>
        Promise.resolve((row = { ...row, ...data })),
      ),
    },
  };
  const prisma = {
    client: {
      ...db,
      $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
        fn(db as unknown as Prisma.TransactionClient),
    },
  } as unknown as PrismaService;
  const sendOnboardingCodeEmail = vi.fn((_to: string, _code: string) => Promise.resolve());
  const service = new GymOnboardingService(prisma, {
    sendOnboardingCodeEmail,
  } as unknown as EmailService);
  const token = service.token(row);
  return {
    service,
    token,
    db,
    row: () => row,
    sendOnboardingCodeEmail,
    code: () => sendOnboardingCodeEmail.mock.calls.at(-1)![1],
  };
}
const error = (status: number, code: string) => ({ status, response: { code } });
const account = { ownerName: 'Owner', password: 'new-password' };

describe('GymOnboardingService requests', () => {
  it('returns defaults without any gym, user or location lookup', async () => {
    const { service, token } = setup();
    const state = await service.getState(token);
    expect(state).toMatchObject({
      status: 'PENDING',
      gym: { name: 'Gym', subdomainSlug: 'gym' },
      owner: { email: 'owner@example.com', hasPassword: false },
      values: { business: { gymName: 'Gym' }, location: { name: 'Gym' } },
    });
    expect(state).not.toHaveProperty('passwordHash');
    expect(state).not.toHaveProperty('codeHash');
  });
  it('stores draft steps and a replaceable argon2id password only on the request', async () => {
    const { service, token, row } = setup();
    await service.saveStep(token, 'brand', { primaryColor: '#abcdef' });
    await service.saveStep(token, 'account', account);
    expect(row().draft).toEqual({ brand: { primaryColor: '#abcdef' } });
    expect(row().passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(row().passwordHash!, account.password)).toBe(true);
    await service.saveStep(token, 'account', { ...account, password: 'replacement-password' });
    expect(await argon2.verify(row().passwordHash!, 'replacement-password')).toBe(true);
    expect(row().gymId).toBeNull();
  });
  it('requires account, sends to the fixed owner email, and enforces cooldown', async () => {
    const { service, token, row, sendOnboardingCodeEmail, code } = setup();
    await expect(service.submit(token)).rejects.toMatchObject(
      error(400, 'ONBOARDING_ACCOUNT_REQUIRED'),
    );
    await service.saveStep(token, 'account', account);
    expect((await service.submit(token)).status).toBe('CODE_SENT');
    expect(sendOnboardingCodeEmail).toHaveBeenCalledWith(
      'owner@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(row().codeHash).not.toBe(code());
    expect(row().codeExpiresAt!.getTime() - row().codeSentAt!.getTime()).toBeCloseTo(
      15 * 60 * 1000,
      -2,
    );
    await expect(service.submit(token)).rejects.toMatchObject(
      error(429, 'ONBOARDING_CODE_COOLDOWN'),
    );
  });
  it('resends after cooldown, replacing the code hash and resetting attempts', async () => {
    const { service, token, db, row, code } = setup({ passwordHash: 'hash' });
    await service.submit(token);
    await db.gymOnboarding.update({
      data: { codeSentAt: new Date(Date.now() - 61000), codeAttempts: 4 },
    });
    await service.submit(token);
    expect(row().codeAttempts).toBe(0);
    expect(row().codeHash).toBe(
      createHmac('sha256', 'onboarding-test-secret')
        .update(`gym-onboarding-code:request1:${code()}`)
        .digest('hex'),
    );
  });
  it('commits wrong attempts and voids the code after five guesses', async () => {
    const { service, token, row, code } = setup({ passwordHash: 'hash' });
    await service.submit(token);
    const wrong = code() === '000000' ? '000001' : '000000';
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(service.verify(token, wrong)).rejects.toMatchObject(
        error(400, 'ONBOARDING_CODE_INVALID'),
      );
      expect(row().codeAttempts).toBe(attempt);
    }
    expect(row().codeHash).toBeNull();
    await expect(service.verify(token, code())).rejects.toMatchObject(
      error(400, 'ONBOARDING_CODE_EXPIRED'),
    );
  });
  it('keeps the pending code valid across edits and submits only after verification', async () => {
    const { service, token, code, db } = setup({ passwordHash: 'hash' });
    await service.submit(token);
    expect((await service.saveStep(token, 'brand', { primaryColor: '#abcdef' })).status).toBe(
      'CODE_SENT',
    );
    expect((await service.verify(token, code())).status).toBe('SUBMITTED');
    await db.gymOnboarding.update({ data: { expiresAt: new Date(0) } });
    expect((await service.getState(token)).status).toBe('SUBMITTED');
    await expect(service.saveStep(token, 'account', account)).rejects.toMatchObject(
      error(409, 'ONBOARDING_SUBMITTED'),
    );
    await expect(service.submit(token)).rejects.toMatchObject(error(409, 'ONBOARDING_SUBMITTED'));
    await expect(service.verify(token, code())).rejects.toMatchObject(
      error(409, 'ONBOARDING_SUBMITTED'),
    );
  });
  it.each(['approvedAt', 'rejectedAt'] as const)(
    'reads terminal %s despite link TTL, but refuses writes',
    async (field) => {
      const { service, token } = setup({ [field]: new Date(), expiresAt: new Date(0) });
      expect((await service.getState(token)).status).toBe(
        field === 'approvedAt' ? 'APPROVED' : 'REJECTED',
      );
      await expect(service.submit(token)).rejects.toMatchObject(error(409, 'ONBOARDING_SUBMITTED'));
    },
  );
  it('expires an unsubmitted link and rejects unknown/altered tokens', async () => {
    const { service, token } = setup({ expiresAt: new Date(0) });
    await expect(service.getState(token)).rejects.toMatchObject(
      error(410, 'ONBOARDING_LINK_EXPIRED'),
    );
    await expect(service.getState('bad')).rejects.toMatchObject(
      error(404, 'ONBOARDING_LINK_INVALID'),
    );
    await expect(
      service.getState(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')),
    ).rejects.toMatchObject(error(404, 'ONBOARDING_LINK_INVALID'));
  });
  it('expires codes that were never sent or passed their fifteen minutes', async () => {
    const { service, token, db, code } = setup({ passwordHash: 'hash' });
    await expect(service.verify(token, '123456')).rejects.toMatchObject(
      error(400, 'ONBOARDING_CODE_EXPIRED'),
    );
    await service.submit(token);
    await db.gymOnboarding.update({ data: { codeExpiresAt: new Date(0) } });
    await expect(service.verify(token, code())).rejects.toMatchObject(
      error(400, 'ONBOARDING_CODE_EXPIRED'),
    );
  });
  it('invalidates the original token on rotation', async () => {
    const { service, token, db, row } = setup();
    await db.gymOnboarding.update({ data: service.rotation() });
    await expect(service.getState(token)).rejects.toMatchObject(
      error(404, 'ONBOARDING_LINK_INVALID'),
    );
    expect((await service.getState(service.token(row()))).status).toBe('PENDING');
  });
});
