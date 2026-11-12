import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { Prisma } from '@fit/db';
import { type GymOnboarding, type Location } from '@fit/db';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from '../auth/auth.service';
import { GymOnboardingService, GYM_ONBOARDING_TTL_MS } from './gym-onboarding.service';

vi.mock('../config/env', () => ({ env: { JWT_SECRET: 'onboarding-test-secret' } }));

function setup(options: { password?: string; expired?: boolean; completed?: boolean } = {}) {
  const now = new Date();
  let row: GymOnboarding = {
    id: 'onboarding1',
    gymId: 'gym1',
    nonce: 'initial-nonce',
    completedSteps: [],
    startedAt: null,
    completedAt: options.completed ? now : null,
    expiresAt: new Date(now.getTime() + (options.expired ? -1000 : GYM_ONBOARDING_TTL_MS)),
    createdByUserId: 'operator1',
    createdAt: now,
    updatedAt: now,
  };
  const gym = {
    id: 'gym1',
    name: 'Gym',
    slug: 'gym',
    ownerId: 'owner1',
    settings: {} as Prisma.JsonValue,
  };
  const credential = {
    userId: 'owner1',
    gymId: 'gym1',
    name: 'Owner',
    passwordHash: options.password ?? null,
  };
  const locationFind = vi.fn<() => Promise<Location | null>>(() => Promise.resolve(null));
  const locationCreate = vi.fn(() => Promise.resolve({ id: 'location1' }));
  const locationUpdate = vi.fn(() => Promise.resolve({ id: 'location1' }));
  const gymUpdate = vi.fn(({ data }: { data: { name: string; settings: Prisma.JsonValue } }) => {
    Object.assign(gym, data);
    return Promise.resolve(gym);
  });
  const db = {
    $queryRaw: vi.fn(() => Promise.resolve([{ id: gym.id }])),
    gym: { findUnique: vi.fn(() => Promise.resolve(gym)), update: gymUpdate },
    user: {
      findUnique: vi.fn(() =>
        Promise.resolve({ id: 'owner1', email: 'owner@example.com', name: 'Owner' }),
      ),
    },
    gymCredential: { findUnique: vi.fn(() => Promise.resolve(credential)) },
    location: { findFirst: locationFind, create: locationCreate, update: locationUpdate },
    gymOnboarding: {
      findUnique: vi.fn(({ where }: { where: { id?: string; gymId?: string } }) =>
        Promise.resolve(where.id && where.id !== row.id ? null : row),
      ),
      update: vi.fn(({ data }: { data: Partial<GymOnboarding> }) => {
        row = { ...row, ...data };
        return Promise.resolve(row);
      }),
      upsert: vi.fn(({ update }: { update: Partial<GymOnboarding> }) => {
        row = { ...row, ...update };
        return Promise.resolve(row);
      }),
    },
  };
  const prisma = {
    client: {
      ...db,
      $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
        fn(db as unknown as Prisma.TransactionClient),
    },
  } as unknown as PrismaService;
  const activateOnboardingOwner = vi.fn(() => {
    credential.passwordHash = 'hashed';
    return Promise.resolve();
  });
  const auth = { activateOnboardingOwner } as unknown as AuthService;
  const token = `${row.id}.${createHmac('sha256', 'onboarding-test-secret').update(`gym-onboarding:${row.id}:${row.nonce}`).digest('base64url')}`;
  return {
    service: new GymOnboardingService(prisma, auth),
    token,
    db,
    gym,
    credential,
    activateOnboardingOwner,
    locationCreate,
    locationUpdate,
    gymUpdate,
  };
}

const account = { ownerName: 'New Owner', password: 'new-password' };
const error = (status: number, code: string) => ({ status, response: { code } });

describe('GymOnboardingService', () => {
  it('round-trips a derived token and returns defaults without exposing credential hashes', async () => {
    const { service, token } = setup();
    expect((await service.getAdminState('gym1'))?.token).toBe(token);
    const state = await service.getState(token);
    expect(state).toMatchObject({
      status: 'PENDING',
      owner: { hasPassword: false },
      completedSteps: [],
      values: { brand: { primaryColor: '#4f46e5' }, location: { name: 'Gym' } },
    });
    expect(JSON.stringify(state)).not.toContain('passwordHash');
  });

  it('refuses garbled, unknown, and forged tokens', async () => {
    const { service, token } = setup();
    for (const invalid of [
      'garbled',
      token.replace('onboarding1', 'unknown'),
      `${token.slice(0, -1)}!`,
      `${token.slice(0, -43)}${'a'.repeat(43)}`,
    ]) {
      await expect(service.getState(invalid)).rejects.toMatchObject(
        error(404, 'ONBOARDING_LINK_INVALID'),
      );
    }
  });

  it('rotates the nonce, invalidates the old link and keeps saved progress', async () => {
    const { service, token } = setup();
    await service.saveStep(token, 'brand', { primaryColor: '#123456' });
    const regenerated = await service.regenerate('gym1', 'operator1');
    expect(regenerated.token).not.toBe(token);
    expect(regenerated.completedSteps).toEqual(['brand']);
    await expect(service.getState(token)).rejects.toMatchObject(
      error(404, 'ONBOARDING_LINK_INVALID'),
    );
    expect((await service.getState(regenerated.token!)).status).toBe('IN_PROGRESS');
  });

  it('rejects expired links but lets the operator regenerate them', async () => {
    const { service, token } = setup({ expired: true });
    await expect(service.getState(token)).rejects.toMatchObject(
      error(410, 'ONBOARDING_LINK_EXPIRED'),
    );
    expect((await service.getAdminState('gym1'))?.status).toBe('EXPIRED');
    const regenerated = await service.regenerate('gym1', 'operator1');
    await expect(service.getState(regenerated.token!)).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('rechecks token validity inside the write transaction', async () => {
    const { service, token, db } = setup();
    db.$queryRaw.mockImplementationOnce(async () => {
      await db.gymOnboarding.update({ data: { nonce: 'rotated-by-concurrent-request' } });
      return [{ id: 'gym1' }];
    });
    await expect(
      service.saveStep(token, 'brand', { primaryColor: '#123456' }),
    ).rejects.toMatchObject(error(404, 'ONBOARDING_LINK_INVALID'));
    expect(db.gym.update).not.toHaveBeenCalled();
  });

  it('sets the account through AuthService and makes it complete', async () => {
    const { service, token, activateOnboardingOwner, db } = setup();
    const state = await service.saveStep(token, 'account', account);
    expect(activateOnboardingOwner).toHaveBeenCalledWith(
      'owner1',
      'gym1',
      'New Owner',
      'new-password',
      db,
    );
    expect(state.completedSteps).toEqual(['account']);
    expect(state.status).toBe('IN_PROGRESS');
  });

  it('counts an already activated owner as complete and refuses to overwrite the password', async () => {
    const { service, token, activateOnboardingOwner } = setup({ password: 'existing' });
    expect((await service.getState(token)).completedSteps).toEqual(['account']);
    await expect(service.saveStep(token, 'account', account)).rejects.toMatchObject(
      error(409, 'ONBOARDING_ACCOUNT_ALREADY_SET'),
    );
    expect(activateOnboardingOwner).not.toHaveBeenCalled();
  });

  it('requires the account, but allows all optional steps to be skipped', async () => {
    const { service, token } = setup();
    await expect(service.complete(token)).rejects.toMatchObject(
      error(400, 'ONBOARDING_ACCOUNT_REQUIRED'),
    );
    await service.saveStep(token, 'account', account);
    expect(await service.complete(token)).toEqual({ email: 'owner@example.com' });
    expect((await service.getAdminState('gym1'))?.token).toBeNull();
  });

  it('allows completed GET even past expiry; refuses all writes and regeneration', async () => {
    const { service, token } = setup({ completed: true, expired: true, password: 'existing' });
    expect((await service.getState(token)).status).toBe('COMPLETED');
    await expect(
      service.saveStep(token, 'brand', { primaryColor: '#123456' }),
    ).rejects.toMatchObject(error(409, 'ONBOARDING_COMPLETED'));
    await expect(service.complete(token)).rejects.toMatchObject(error(409, 'ONBOARDING_COMPLETED'));
    await expect(service.regenerate('gym1', 'operator1')).rejects.toMatchObject(
      error(409, 'ONBOARDING_COMPLETED'),
    );
  });

  it('merges real settings and gym name while retaining other sections', async () => {
    const { service, token, gym } = setup();
    gym.settings = {
      brand: { primaryColor: '#abcdef', secondaryColor: '#112233' },
      business: { address: 'Old' },
    };
    await service.saveStep(token, 'brand', { primaryColor: '#123456' });
    await service.saveStep(token, 'business', {
      gymName: 'New Gym',
      address: 'New',
      phone: null,
      email: null,
      website: null,
    });
    const state = await service.getState(token);
    expect(state.gym.name).toBe('New Gym');
    expect(state.values.business.address).toBe('New');
    expect(gym.settings).toMatchObject({
      brand: { primaryColor: '#123456', secondaryColor: '#112233' },
    });
  });

  it('creates the default location with a full week of hours', async () => {
    const { service, token, locationCreate } = setup();
    await service.saveStep(token, 'location', {
      name: 'Main',
      address: '',
      phone: null,
      hours: {},
    });
    expect(locationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gymId: 'gym1',
        isDefault: true,
        hours: expect.objectContaining({
          mon: expect.any(Object) as object,
          sun: expect.any(Object) as object,
        }) as object,
      }) as object,
    });
  });
  it('updates the existing default location rather than creating a second default', async () => {
    const { service, token, db, locationCreate, locationUpdate } = setup();
    db.location.findFirst.mockResolvedValue({
      id: 'default1',
      name: 'Old',
      address: '',
      phone: null,
      hours: {},
    } as Location);
    await service.saveStep(token, 'location', {
      name: 'New branch',
      address: 'Street',
      phone: null,
      hours: {},
    });
    expect(locationUpdate).toHaveBeenCalledWith({
      where: { id: 'default1' },
      data: expect.objectContaining({ name: 'New branch', address: 'Street' }) as object,
    });
    expect(locationCreate).not.toHaveBeenCalled();
  });

  it('persists brand and payment methods and rejects invalid step bodies', async () => {
    const { service, token, gymUpdate } = setup();
    await expect(service.saveStep(token, 'brand', { primaryColor: 'red' })).rejects.toMatchObject({
      status: 400,
    });
    expect(gymUpdate).not.toHaveBeenCalled();
    const brand = { primaryColor: '#112233' };
    const payments = {
      acceptCash: true,
      acceptCard: false,
      acceptBankTransfer: true,
      acceptPrepaidCredits: false,
    };
    await service.saveStep(token, 'brand', brand);
    await service.saveStep(token, 'payments', payments);
    const state = await service.getState(token);
    expect(state.values).toMatchObject({ brand, payments });
    // Language, currency and time zone are not part of onboarding: the gym keeps
    // its defaults and the owner changes them in Settings.
    expect(state.steps).not.toContain('locale');
    expect(state.values).not.toHaveProperty('locale');
  });
});
