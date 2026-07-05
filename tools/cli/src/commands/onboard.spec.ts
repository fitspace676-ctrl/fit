import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The Prisma surface `runOnboard` touches, hoisted so the `@fit/db` mock and the
 * assertions share one set of spies. Model helpers default to resolving an object
 * with an `id` so upsert/create chains flow without per-test wiring.
 */
const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn<(a: unknown) => Promise<unknown>>(() => Promise.resolve({ id: 'x' })),
    findFirst: vi.fn<(a: unknown) => Promise<unknown>>(() => Promise.resolve(null)),
    upsert: vi.fn<(a: unknown) => Promise<unknown>>(() => Promise.resolve({ id: 'x' })),
    create: vi.fn<(a: unknown) => Promise<unknown>>(() => Promise.resolve({ id: 'x' })),
    update: vi.fn<(a: unknown) => Promise<unknown>>(() => Promise.resolve({ id: 'x' })),
    count: vi.fn<(a: unknown) => Promise<number>>(() => Promise.resolve(0)),
  });
  return {
    user: model(),
    gym: model(),
    gymMember: model(),
    subscriptionPlan: model(),
    classTemplate: model(),
    classInstance: model(),
    subscription: model(),
    disconnect: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    generateClassInstances: vi.fn<(p: unknown) => Promise<unknown>>(() =>
      Promise.resolve({ instancesCreated: 12 }),
    ),
  };
});

vi.mock('@fit/db', () => ({
  PrismaClient: vi.fn(() => ({
    user: db.user,
    gym: db.gym,
    gymMember: db.gymMember,
    subscriptionPlan: db.subscriptionPlan,
    classTemplate: db.classTemplate,
    classInstance: db.classInstance,
    subscription: db.subscription,
    $disconnect: db.disconnect,
  })),
  Role: {
    OWNER: 'OWNER',
    MANAGER: 'MANAGER',
    RECEPTIONIST: 'RECEPTIONIST',
    TRAINER: 'TRAINER',
    MEMBER: 'MEMBER',
  },
  GymMemberStatus: { ACTIVE: 'ACTIVE', INVITED: 'INVITED' },
  SubscriptionStatus: { ACTIVE: 'ACTIVE', PAST_DUE: 'PAST_DUE', FROZEN: 'FROZEN' },
  SubscriptionInterval: { MONTH: 'MONTH', YEAR: 'YEAR' },
  generateClassInstances: db.generateClassInstances,
  initialBillingPeriod: (start: Date) => ({
    currentPeriodStart: start,
    currentPeriodEnd: new Date(start.getTime() + 30 * 86_400_000),
  }),
}));

vi.mock('../env-source', () => ({
  loadInfraEnv: () => ({ DATABASE_URL: 'postgresql://localhost:5432/fit' }),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => '[]'),
}));

import { readFileSync } from 'node:fs';
import { parseArgs } from '../args';
import { CommandError } from '../output';
import {
  runOnboard,
  parseOnboardArgs,
  parseRoster,
  generatedRoster,
  resolvePlanName,
  normalizeEmail,
  PILOT_MEMBER_FLOOR,
  DEFAULT_PLANS,
} from './onboard';

function args(...argv: string[]) {
  return parseArgs(argv);
}

const OWNER = [
  '--name',
  'Iron House',
  '--slug',
  'iron-house',
  '--owner-email',
  'Owner@Iron.ge',
] as const;

describe('parseOnboardArgs', () => {
  it('normalises inputs and defaults members to the pilot floor', () => {
    const p = parseOnboardArgs(args(...OWNER));
    expect(p).toMatchObject({
      name: 'Iron House',
      slug: 'iron-house',
      ownerEmail: 'owner@iron.ge',
      members: PILOT_MEMBER_FLOOR,
      dryRun: false,
    });
  });

  it('requires name, slug and owner-email', () => {
    const err = (() => {
      try {
        parseOnboardArgs(args('--name', 'x'));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(CommandError);
    expect((err as CommandError).payload.code).toBe('BAD_ARGUMENT');
  });

  it('rejects a non-DNS-safe slug', () => {
    const err = (() => {
      try {
        parseOnboardArgs(args('--name', 'x', '--slug', 'Bad Slug!', '--owner-email', 'a@b.ge'));
      } catch (e) {
        return e;
      }
    })();
    expect((err as CommandError).payload.code).toBe('BAD_ARGUMENT');
  });

  it('rejects a non-positive-integer --members', () => {
    const err = (() => {
      try {
        parseOnboardArgs(args(...OWNER, '--members', '0'));
      } catch (e) {
        return e;
      }
    })();
    expect((err as CommandError).payload.code).toBe('BAD_ARGUMENT');
  });
});

describe('roster helpers', () => {
  it('generates a deterministic, plan-cycled placeholder roster', () => {
    const roster = generatedRoster(4, 'iron-house');
    expect(roster).toHaveLength(4);
    expect(roster[0]).toEqual({
      name: 'Pilot Member 1',
      email: 'member-01@iron-house.pilot',
      plan: DEFAULT_PLANS[0].name,
    });
    expect(roster[3]!.plan).toBe(DEFAULT_PLANS[3 % DEFAULT_PLANS.length]!.name);
  });

  it('parses a valid JSON roster and normalises emails', () => {
    const rows = parseRoster('[{"name":"Nino","email":"Nino@X.ge","plan":"Premium"}]');
    expect(rows).toEqual([{ name: 'Nino', email: 'nino@x.ge', plan: 'Premium' }]);
  });

  it('rejects malformed roster JSON and rows missing name/email', () => {
    expect(() => parseRoster('not json')).toThrow(CommandError);
    expect(() => parseRoster('{}')).toThrow(CommandError);
    expect(() => parseRoster('[{"email":"a@b.ge"}]')).toThrow(CommandError);
  });

  it('falls back to a round-robin plan when the row plan is absent or unknown', () => {
    expect(resolvePlanName({ name: 'a', email: 'a@b.ge' }, 1)).toBe(DEFAULT_PLANS[1].name);
    expect(resolvePlanName({ name: 'a', email: 'a@b.ge', plan: 'Bogus' }, 0)).toBe(
      DEFAULT_PLANS[0].name,
    );
    expect(resolvePlanName({ name: 'a', email: 'a@b.ge', plan: 'Student' }, 0)).toBe('Student');
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  A@B.GE ')).toBe('a@b.ge');
  });
});

describe('runOnboard', () => {
  afterEach(() => vi.clearAllMocks());

  it('previews a run without touching the database on --dry-run', async () => {
    const result = await runOnboard(args(...OWNER, '--members', '12', '--dry-run'));
    expect(result.data).toMatchObject({
      dryRun: true,
      members: 12,
      meetsPilotFloor: true,
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.disconnect).not.toHaveBeenCalled();
  });

  it('flags a sub-floor member count in the dry-run preview', async () => {
    const result = await runOnboard(args(...OWNER, '--members', '5', '--dry-run'));
    expect(result.data).toMatchObject({ members: 5, meetsPilotFloor: false });
  });

  it('errors OWNER_NOT_FOUND when the owner account does not exist, and disconnects', async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    const err = await runOnboard(args(...OWNER)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect((err as CommandError).payload.code).toBe('OWNER_NOT_FOUND');
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(db.gym.upsert).not.toHaveBeenCalled();
  });

  it('errors OWNER_MISMATCH when the gym is already owned by another account', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'owner-1', name: 'O' });
    db.gym.upsert.mockResolvedValueOnce({ id: 'gym-1', ownerId: 'someone-else' });
    const err = await runOnboard(args(...OWNER)).catch((e: unknown) => e);
    expect((err as CommandError).payload.code).toBe('OWNER_MISMATCH');
    expect(db.disconnect).toHaveBeenCalledOnce();
  });

  it('provisions owner, staff, plans, schedule and members, then reports counts', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'owner-1', name: 'Owner' });
    db.gym.upsert.mockResolvedValueOnce({ id: 'gym-1', ownerId: null });
    db.gymMember.count.mockResolvedValueOnce(10);
    db.classInstance.count.mockResolvedValueOnce(36);

    const result = (await runOnboard(args(...OWNER, '--members', '10'))) as {
      data: Record<string, unknown>;
    };

    // owner (1) + 3 staff + 10 members are upserted as gym members.
    expect(db.gymMember.upsert).toHaveBeenCalledTimes(1 + 3 + 10);
    // Every plan and every member subscription was created (findFirst → null default).
    expect(db.subscriptionPlan.create).toHaveBeenCalledTimes(DEFAULT_PLANS.length);
    expect(db.subscription.create).toHaveBeenCalledTimes(10);
    expect(db.generateClassInstances).toHaveBeenCalledOnce();
    expect(result.data).toMatchObject({
      gym: { id: 'gym-1', slug: 'iron-house' },
      owner: { id: 'owner-1', email: 'owner@iron.ge' },
      plans: DEFAULT_PLANS.length,
      staff: 3,
      members: 10,
      subscriptions: 10,
      activeMembers: 10,
      classInstances: 36,
      generatedInstances: 12,
      meetsPilotFloor: true,
    });
    expect(db.disconnect).toHaveBeenCalledOnce();
  });

  it('reads and imports a roster file when --roster is given', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      '[{"name":"Nino","email":"nino@iron.ge","plan":"Premium"},{"name":"Luka","email":"luka@iron.ge"}]',
    );
    db.user.findUnique.mockResolvedValueOnce({ id: 'owner-1', name: 'Owner' });
    db.gym.upsert.mockResolvedValueOnce({ id: 'gym-1', ownerId: null });

    const result = (await runOnboard(args(...OWNER, '--roster', 'roster.json'))) as {
      data: Record<string, unknown>;
    };

    expect(readFileSync).toHaveBeenCalledWith('roster.json', 'utf8');
    expect(db.subscription.create).toHaveBeenCalledTimes(2);
    expect(result.data).toMatchObject({ members: 2, meetsPilotFloor: false });
  });

  it('does not stack a second subscription when a live one already exists', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'owner-1', name: 'Owner' });
    db.gym.upsert.mockResolvedValueOnce({ id: 'gym-1', ownerId: null });
    // Plan lookups return null (created); the member's live-subscription probe returns a row.
    db.subscription.findFirst.mockResolvedValue({ id: 'sub-1' });

    const result = (await runOnboard(args(...OWNER, '--members', '10'))) as {
      data: Record<string, unknown>;
    };

    expect(db.subscription.create).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ members: 10, subscriptions: 0 });
  });
});
