import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GymMemberStatus, Role } from '@fit/db';
import { gymMemberIntakeSettingsSchema } from '@fit/types';
import type { CreateMemberInput, GymMemberIntakeSettings, ListMembersQuery } from '@fit/types';
import { MembersService } from './members.service';
import type { AutomationExecutorService } from '../automation/automation-executor.service';
import type { GymMemberIntakeService } from '../gyms/gym-member-intake.service';
import type { LoyaltyPointsService } from '../loyalty/loyalty-points.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { MailerService } from '../mail/mailer.service';

/**
 * A membership row as the service's projection selects it (superset of every
 * select). Carries the live `subscriptions` + latest `checkIns` the roster now
 * joins for the "formacore" plan / next-billing / last-visit cells.
 */
interface MemberRecord {
  id: string;
  userId: string;
  status: GymMemberStatus;
  joinedAt: Date;
  deletedAt: Date | null;
  dateOfBirth: Date | null;
  startDate: Date | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  medicalNotes: string | null;
  user: { name: string | null; email: string; phone: string | null };
  invoices: { amount: number; currency: string }[];
  subscriptions: Array<{
    id: string;
    planId: string | null;
    status: string;
    priceAmount: number;
    currency: string;
    interval: 'MONTH' | 'YEAR';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    plan: { name: string } | null;
  }>;
  checkIns: Array<{ checkedInAt: Date }>;
  /** Staff's pinned standing; `null` lets the derivation decide. */
  kindOverride: 'MEMBER' | 'GUEST' | 'INACTIVE' | null;
  /**
   * Every subscription ever held — what separates a lapsed member from a guest —
   * and the visit count behind `{{member_checkin_count}}` on the email path.
   */
  _count: { subscriptions: number; checkIns: number };
}

/** The subset of a Prisma `findMany` arg shape the assertions inspect. */
interface FindManyArgs {
  where?: {
    role?: unknown;
    status?: unknown;
    user?: unknown;
    subscriptions?: unknown;
    /** The kind segment's clause — an override branch plus a derived branch. */
    OR?: unknown[];
  };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown; role?: unknown; userId?: unknown };
  data?: Record<string, unknown>;
}

function setup(overrides?: {
  findMany?: MemberRecord[];
  count?: number;
  findFirst?: MemberRecord | null;
  /** What `location.findFirst` resolves to — the branch lookup on create/update. */
  location?: { id: string } | null;
  userFindUnique?: { id: string } | null;
  userCreate?: { id: string };
  gymMemberCreate?: { id: string };
  plan?: {
    id: string;
    priceAmount: number;
    currency: string;
    interval: 'MONTH' | 'YEAR';
    status: string;
  } | null;
  checkIns?: unknown[];
  orders?: unknown[];
  notes?: unknown[];
  tasks?: unknown[];
  taskFindFirst?: { id: string } | null;
  mailerConfigured?: boolean;
  /**
   * The newest loyalty ledger balance behind `{{member_points_balance}}`.
   * `undefined` means the member has no ledger row at all, which must read `0`.
   */
  pointsBalance?: number;
  /**
   * The gym's Settings → Membership toggles. Defaults to a gym that asks for
   * nothing beyond name + email, so the create tests below stay about creation
   * mechanics; the intake-policy tests opt fields in explicitly.
   */
  intake?: Partial<GymMemberIntakeSettings>;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<MemberRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<MemberRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const gymMemberCreate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve(overrides?.gymMemberCreate ?? { id: 'gm-1' }),
  );
  const gymMemberUpdate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'gm-1' }),
  );
  const gymMemberGroupBy = vi.fn<(args: unknown) => Promise<unknown[]>>(() => Promise.resolve([]));
  const userFindUnique = vi.fn<(args: WhereArgs) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.userFindUnique ?? null),
  );
  const userCreate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve(overrides?.userCreate ?? { id: 'u-new' }),
  );
  const userUpdate = vi.fn<(args: WhereArgs) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'u-1' }),
  );

  // Permissive stubs for the enrichment queries — the detail path aggregates over
  // these but the projection assertions don't depend on their shapes, so empty
  // results / zero sums are the safe defaults.
  const subscriptionGroupBy = vi.fn<(args: unknown) => Promise<unknown[]>>(() =>
    Promise.resolve([]),
  );
  const subscriptionFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() =>
    Promise.resolve([]),
  );
  const subscriptionCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'sub-new' }),
  );
  const subscriptionPlanFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() =>
    Promise.resolve([]),
  );
  const subscriptionPlanFindFirst = vi.fn<(args: unknown) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.plan ?? null),
  );
  const paymentAggregate = vi.fn<(args: unknown) => Promise<{ _sum: { amount: number | null } }>>(
    () => Promise.resolve({ _sum: { amount: null } }),
  );
  const paymentFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() => Promise.resolve([]));
  const checkInCount = vi.fn<(args: unknown) => Promise<number>>(() => Promise.resolve(0));
  const checkInFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.checkIns ?? []),
  );
  const bookingFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() => Promise.resolve([]));
  const invoiceFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() => Promise.resolve([]));
  const orderFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.orders ?? []),
  );
  const memberNoteFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.notes ?? []),
  );
  const memberNoteCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'note-new' }),
  );
  const memberTaskFindMany = vi.fn<(args: unknown) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.tasks ?? []),
  );
  const memberTaskCreate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'task-new' }),
  );
  const memberTaskFindFirst = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.taskFindFirst ?? null),
  );
  const memberTaskUpdate = vi.fn<(args: unknown) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'task-1' }),
  );

  const gymFindFirst = vi.fn<(args: unknown) => Promise<{ name: string } | null>>(() =>
    Promise.resolve({ name: 'Iron Gym' }),
  );

  // The loyalty ledger's newest row, for `{{member_points_balance}}`. No row is
  // the common case (a member who never earned any) and must resolve to 0.
  const loyaltyLedgerFindFirst = vi.fn<(args: unknown) => Promise<{ balanceAfter: number } | null>>(
    () =>
      Promise.resolve(
        overrides?.pointsBalance === undefined ? null : { balanceAfter: overrides.pointsBalance },
      ),
  );

  // The home-branch lookup: either the branch the caller named, or the gym's
  // default when they named none. Defaults to a hit, so every existing create
  // test keeps exercising the happy path.
  const locationFindFirst = vi.fn<(args: unknown) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.location === undefined ? { id: 'loc-default' } : overrides.location),
  );

  const client: Record<string, unknown> = {
    user: { findUnique: userFindUnique, create: userCreate, update: userUpdate },
    gym: { findFirst: gymFindFirst },
    location: { findFirst: locationFindFirst },
    gymMember: {
      findMany,
      count,
      findFirst,
      create: gymMemberCreate,
      update: gymMemberUpdate,
      groupBy: gymMemberGroupBy,
    },
    subscription: {
      groupBy: subscriptionGroupBy,
      findMany: subscriptionFindMany,
      create: subscriptionCreate,
    },
    subscriptionPlan: { findMany: subscriptionPlanFindMany, findFirst: subscriptionPlanFindFirst },
    payment: { aggregate: paymentAggregate, findMany: paymentFindMany },
    checkIn: { count: checkInCount, findMany: checkInFindMany },
    booking: { findMany: bookingFindMany },
    invoice: { findMany: invoiceFindMany },
    order: { findMany: orderFindMany },
    loyaltyLedgerEntry: { findFirst: loyaltyLedgerFindFirst },
    memberNote: { findMany: memberNoteFindMany, create: memberNoteCreate },
    memberTask: {
      findMany: memberTaskFindMany,
      create: memberTaskCreate,
      findFirst: memberTaskFindFirst,
      update: memberTaskUpdate,
    },
  };
  // Interactive transaction: run the callback against the same scoped client.
  client.$transaction = vi.fn((cb: (tx: typeof client) => unknown) => cb(client));

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  // Member creation fires the `member_joined` automation trigger (T12.5)
  // best-effort; a no-op executor keeps these tests focused on member behaviour.
  const automationDispatch = vi.fn(() => Promise.resolve(0));
  const automation = {
    dispatchForGym: automationDispatch,
  } as unknown as AutomationExecutorService;
  // Member creation also grants the loyalty signup bonus (T12.10) best-effort; a
  // no-op earn hook keeps these tests focused on member behaviour.
  const loyaltyAward = vi.fn(() => Promise.resolve());
  const loyalty = {
    awardSignupBonus: loyaltyAward,
  } as unknown as LoyaltyPointsService;
  // Outbound mail (T-member-email). `isConfigured` gates the send; default a
  // configured mailer that reports a successful dispatch.
  const mailerSend = vi.fn<(message: unknown) => Promise<{ sent: boolean; id: string | null }>>(
    () => Promise.resolve({ sent: true, id: 'email-1' }),
  );
  const mailer = {
    isConfigured: overrides?.mailerConfigured ?? true,
    send: mailerSend,
  } as unknown as MailerService;

  // Settings → Membership decides which intake fields a create must supply. All
  // toggles start off here so a test only pays for the policy it is asserting.
  const allOff = Object.fromEntries(
    Object.keys(gymMemberIntakeSettingsSchema.parse({})).map((field) => [field, false]),
  ) as GymMemberIntakeSettings;
  const intake = {
    get: vi.fn(() => Promise.resolve({ ...allOff, ...overrides?.intake })),
  } as unknown as GymMemberIntakeService;

  return {
    service: new MembersService(prisma, tenant, automation, loyalty, mailer, intake),
    automationDispatch,
    loyaltyAward,
    mailerSend,
    gymFindFirst,
    locationFindFirst,
    loyaltyLedgerFindFirst,
    findMany,
    count,
    findFirst,
    gymMemberGroupBy,
    gymMemberCreate,
    gymMemberUpdate,
    userFindUnique,
    userCreate,
    userUpdate,
    subscriptionCreate,
    subscriptionPlanFindFirst,
    memberNoteCreate,
    memberTaskCreate,
    memberTaskFindFirst,
    memberTaskUpdate,
  };
}

/** Build a full list query with defaults, overridable per test. */
function query(overrides?: Partial<ListMembersQuery>): ListMembersQuery {
  return {
    page: 1,
    limit: 20,
    sort: 'name',
    dir: 'asc',
    view: 'active',
    frozen: false,
    ...overrides,
  };
}

/** Build a full create body with defaults, overridable per test. */
function createInput(overrides?: Partial<CreateMemberInput>): CreateMemberInput {
  return {
    name: 'Nino Beridze',
    email: 'nino@example.com',
    phone: undefined,
    status: 'ACTIVE',
    ...overrides,
  };
}

const row = (over?: Partial<MemberRecord>): MemberRecord => ({
  id: 'gm-1',
  userId: 'u-1',
  status: GymMemberStatus.ACTIVE,
  joinedAt: new Date('2026-01-15T00:00:00.000Z'),
  deletedAt: null,
  dateOfBirth: null,
  startDate: null,
  gender: null,
  address: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  medicalNotes: null,
  user: { name: 'Nino Beridze', email: 'nino@example.com', phone: null },
  subscriptions: [],
  checkIns: [],
  invoices: [],
  kindOverride: null,
  _count: { subscriptions: 0, checkIns: 0 },
  ...over,
});

describe('MembersService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listMembers', () => {
    it('projects rows to denormalised MemberRows and echoes pagination totals', async () => {
      const { service } = setup({
        findMany: [
          row({
            user: { name: 'Nino Beridze', email: 'nino@example.com', phone: '+995 555 10 20 30' },
          }),
        ],
        count: 1,
      });

      const result = await service.listMembers(query());

      expect(result).toMatchObject({
        data: [
          {
            id: 'gm-1',
            name: 'Nino Beridze',
            email: 'nino@example.com',
            phone: '+995 555 10 20 30',
            status: 'ACTIVE',
            planName: null,
            plan: null,
            lastVisitAt: null,
            nextBillingAt: null,
            billingState: 'none',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        planMix: { total: 0, plans: [] },
        // `frozen` is a dedicated `gymMember.count` (live FROZEN subscription),
        // which shares the single `count` stub with the pagination total (1 here);
        // the other buckets come from the empty `groupBy` stub.
        counts: { all: 0, active: 0, frozen: 1, trial: 0, expired: 0 },
      });
    });

    it('projects the live plan, last visit and next billing from the joins', async () => {
      const { service } = setup({
        findMany: [
          row({
            subscriptions: [
              {
                id: 'sub-1',
                planId: 'plan-1',
                status: 'ACTIVE',
                priceAmount: 4500,
                currency: 'GEL',
                interval: 'MONTH',
                currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
                plan: { name: 'Premium' },
              },
            ],
            checkIns: [{ checkedInAt: new Date('2026-06-20T09:30:00.000Z') }],
          }),
        ],
        count: 1,
      });

      const result = await service.listMembers(query());
      const member = result.data[0];

      expect(member?.plan).toMatchObject({
        planId: 'plan-1',
        name: 'Premium',
        interval: 'MONTH',
        priceAmount: 4500,
        currency: 'GEL',
        detail: 'monthly',
      });
      expect(member?.planName).toBe('Premium');
      expect(member?.lastVisitAt).toBe('2026-06-20T09:30:00.000Z');
      expect(member?.nextBillingAt).toBe('2026-07-01T00:00:00.000Z');
      expect(member?.billingState).toBe('due');
    });

    it('reads a frozen subscription as a paused plan + next-billing cell', async () => {
      const { service } = setup({
        findMany: [
          row({
            subscriptions: [
              {
                id: 'sub-2',
                planId: 'plan-2',
                status: 'FROZEN',
                priceAmount: 4500,
                currency: 'GEL',
                interval: 'MONTH',
                currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
                plan: { name: 'Standard' },
              },
            ],
          }),
        ],
        count: 1,
      });

      const member = (await service.listMembers(query())).data[0];
      expect(member?.plan?.detail).toBe('paused');
      expect(member?.billingState).toBe('paused');
      expect(member?.nextBillingAt).toBeNull();
    });

    it('falls back to the email when the user has no name', async () => {
      const { service } = setup({
        findMany: [row({ user: { name: null, email: 'x@y.z', phone: null } })],
        count: 1,
      });

      const result = await service.listMembers(query());

      expect(result.data[0]?.name).toBe('x@y.z');
    });

    it('only ever lists MEMBER-role memberships', async () => {
      const { service, findMany, count } = setup();

      await service.listMembers(query());

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ role: Role.MEMBER });
      expect(count.mock.calls[0]?.[0]?.where).toMatchObject({ role: Role.MEMBER });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ status: 'SUSPENDED' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'SUSPENDED' });
    });

    it('narrows to members holding a live subscription on the given plan', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ planId: 'plan-1' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.subscriptions).toMatchObject({
        some: { planId: 'plan-1' },
      });
    });

    it('narrows to members with a FROZEN subscription for the Frozen tab', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ frozen: true }));

      expect(findMany.mock.calls[0]?.[0]?.where?.subscriptions).toMatchObject({
        some: { status: 'FROZEN' },
      });
    });

    it('combines the plan and Frozen filters via AND so neither clobbers the other', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ planId: 'plan-1', frozen: true }));

      const where = findMany.mock.calls[0]?.[0]?.where as {
        AND?: Array<{ subscriptions: { some: Record<string, unknown> } }>;
        subscriptions?: unknown;
      };
      expect(where.subscriptions).toBeUndefined();
      expect(where.AND).toHaveLength(2);
      expect(where.AND?.[0]).toMatchObject({ subscriptions: { some: { planId: 'plan-1' } } });
      expect(where.AND?.[1]).toEqual({ subscriptions: { some: { status: 'FROZEN' } } });
    });

    it('builds a case-insensitive name/email search', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ search: 'nino' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.user).toEqual({
        OR: [
          { name: { contains: 'nino', mode: 'insensitive' } },
          { email: { contains: 'nino', mode: 'insensitive' } },
        ],
      });
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listMembers(query({ sort: 'name', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ user: { name: 'desc' } });

      await service.listMembers(query({ sort: 'status', dir: 'asc' }));
      expect(findMany.mock.calls[1]?.[0]?.orderBy).toEqual({ status: 'asc' });

      // lastVisitAt has no scalar column → stable joinedAt fallback.
      await service.listMembers(query({ sort: 'lastVisitAt', dir: 'desc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ joinedAt: 'desc' });
    });
  });

  describe('getMember', () => {
    it('returns the detail with the projected phone and the formacore fields', async () => {
      const { service } = setup({
        findFirst: row({
          user: { name: 'Nino Beridze', email: 'nino@example.com', phone: '+995 555' },
        }),
      });

      const result = await service.getMember('gm-1');

      expect(result).toMatchObject({
        id: 'gm-1',
        name: 'Nino Beridze',
        email: 'nino@example.com',
        phone: '+995 555',
        status: 'ACTIVE',
        planName: null,
        plan: null,
        lastVisitAt: null,
        nextBillingAt: null,
        billingState: 'none',
        joinedAt: '2026-01-15T00:00:00.000Z',
        lifetimeValue: 0,
        totalVisits: 0,
        currentPlan: null,
        recentActivity: [
          { kind: 'milestone', title: 'Joined the gym', at: '2026-01-15T00:00:00.000Z' },
        ],
        subscriptions: [],
        bookings: [],
        payments: [],
        purchases: [],
        accessLog: [],
        notes: [],
        tasks: [],
      });
      // The attendance chart always frames a full 8 weeks.
      expect(result.attendance8w).toHaveLength(8);
    });

    it('scopes the lookup to MEMBER-role rows', async () => {
      const { service, findFirst } = setup({ findFirst: row() });

      await service.getMember('gm-1');

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'gm-1', role: Role.MEMBER });
    });

    it('throws 404 MEMBER_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getMember('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createMember', () => {
    it('mints a new user + MEMBER membership when the email is unknown', async () => {
      const { service, userFindUnique, userCreate, gymMemberCreate } = setup({
        userFindUnique: null,
        userCreate: { id: 'u-new' },
        gymMemberCreate: { id: 'gm-new' },
        // The post-create re-read resolves the new member's detail.
        findFirst: row({ id: 'gm-new', userId: 'u-new' }),
      });

      const result = await service.createMember(
        createInput({
          name: 'New Person',
          email: 'new@example.com',
          phone: '555',
          status: 'INVITED',
        }),
      );

      expect(userFindUnique.mock.calls[0]?.[0]?.where).toMatchObject({ email: 'new@example.com' });
      expect(userCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        name: 'New Person',
        email: 'new@example.com',
        phone: '555',
      });
      expect(gymMemberCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        userId: 'u-new',
        role: Role.MEMBER,
        status: 'INVITED',
      });
      expect(result.id).toBe('gm-new');
      expect(result.subscriptions).toEqual([]);
    });

    it('links an existing user (no duplicate user) when the email is already known', async () => {
      const { service, userCreate, gymMemberCreate, findFirst } = setup({
        userFindUnique: { id: 'u-existing' },
        findFirst: row({ id: 'gm-2', userId: 'u-existing' }),
        gymMemberCreate: { id: 'gm-2' },
      });
      // First `findFirst` is the duplicate-membership guard (must miss so the
      // create proceeds); the default row then satisfies the post-create re-read.
      findFirst.mockResolvedValueOnce(null);

      await service.createMember(createInput({ email: 'existing@example.com' }));

      expect(userCreate).not.toHaveBeenCalled();
      // Duplicate check is scoped to this gym by the tenant extension.
      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ userId: 'u-existing' });
      expect(gymMemberCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        userId: 'u-existing',
        role: Role.MEMBER,
      });
    });

    it('throws 409 MEMBER_EXISTS when the person is already a member of this gym', async () => {
      const { service, gymMemberCreate } = setup({
        userFindUnique: { id: 'u-existing' },
        findFirst: row({ userId: 'u-existing' }),
      });

      await expect(service.createMember(createInput())).rejects.toBeInstanceOf(ConflictException);
      expect(gymMemberCreate).not.toHaveBeenCalled();
    });
  });

  describe('updateMember', () => {
    it('updates the member’s user name + phone and returns the detail', async () => {
      const { service, findFirst, userUpdate } = setup({ findFirst: row() });

      const result = await service.updateMember('gm-1', { name: 'Renamed', phone: '777' });

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'gm-1', role: Role.MEMBER });
      expect(userUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'u-1' },
        data: { name: 'Renamed', phone: '777' },
      });
      expect(result.id).toBe('gm-1');
    });

    it('clears the phone when passed null', async () => {
      const { service, userUpdate } = setup({ findFirst: row() });

      await service.updateMember('gm-1', { name: 'Nino', phone: null });

      expect(userUpdate.mock.calls[0]?.[0]?.data).toMatchObject({ phone: null });
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, userUpdate } = setup({ findFirst: null });

      await expect(
        service.updateMember('missing', { name: 'X', phone: null }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deactivateMember / reactivateMember', () => {
    it('sets the status to SUSPENDED on deactivate', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: row() });

      await service.deactivateMember('gm-1');

      expect(gymMemberUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'gm-1' },
        data: { status: GymMemberStatus.SUSPENDED },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: row() });

      await service.reactivateMember('gm-1');

      expect(gymMemberUpdate.mock.calls[0]?.[0]?.data).toMatchObject({
        status: GymMemberStatus.ACTIVE,
      });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: null });

      await expect(service.deactivateMember('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });
  });

  describe('softDeleteMember / restoreMember (trash)', () => {
    it('stamps deletedAt when trashing a live member', async () => {
      const { service, findFirst, gymMemberUpdate } = setup({ findFirst: row() });

      await service.softDeleteMember('gm-1');

      // Guarded against LIVE members only (deletedAt: null in the require query).
      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
        id: 'gm-1',
        role: Role.MEMBER,
        deletedAt: null,
      });
      const data = gymMemberUpdate.mock.calls[0]?.[0]?.data as { deletedAt: unknown };
      expect(data.deletedAt).toBeInstanceOf(Date);
    });

    it('throws 404 without trashing when the member is unknown / already trashed', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: null });

      await expect(service.softDeleteMember('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });

    it('clears deletedAt when restoring a trashed member', async () => {
      const { service, findFirst, gymMemberUpdate } = setup({
        findFirst: row({ deletedAt: new Date('2026-07-01T00:00:00.000Z') }),
      });

      await service.restoreMember('gm-1');

      // Restore only resolves a currently-TRASHED member (deletedAt is set).
      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
        id: 'gm-1',
        role: Role.MEMBER,
        deletedAt: { not: null },
      });
      expect(gymMemberUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'gm-1' },
        data: { deletedAt: null },
      });
    });

    it('throws 404 without restoring when the member is not in trash', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: null });

      await expect(service.restoreMember('gm-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(gymMemberUpdate).not.toHaveBeenCalled();
    });

    it('lists only soft-deleted members in the trash view', async () => {
      const { service, findMany } = setup({ findMany: [], count: 0 });

      await service.listMembers(query({ view: 'trash' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({
        role: Role.MEMBER,
        deletedAt: { not: null },
      });
    });

    /**
     * The roster keeps its search box and Filter panel on screen in the trash
     * view, so they have to narrow it like they narrow any other view — a trash
     * that ignores them is a search box that does nothing. Only the `status`
     * segments are excluded, being the one axis the view itself replaces.
     */
    it('narrows the trash view by search and the plan filter', async () => {
      const { service, findMany } = setup({ findMany: [], count: 0 });

      await service.listMembers(query({ view: 'trash', search: 'nino', planId: 'plan-1' }));

      const where = findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({ deletedAt: { not: null } });
      expect(where?.user).toEqual({
        OR: [
          { name: { contains: 'nino', mode: 'insensitive' } },
          { email: { contains: 'nino', mode: 'insensitive' } },
        ],
      });
      expect(where?.subscriptions).toMatchObject({ some: { planId: 'plan-1' } });
    });

    it('excludes trashed members from the default (active) view', async () => {
      const { service, findMany } = setup({ findMany: [], count: 0 });

      await service.listMembers(query());

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({
        role: Role.MEMBER,
        deletedAt: null,
      });
    });
  });

  describe('createMember — trashed collision', () => {
    it('throws 409 MEMBER_TRASHED (not MEMBER_EXISTS) when the person is in trash', async () => {
      const { service, gymMemberCreate } = setup({
        userFindUnique: { id: 'u-existing' },
        findFirst: row({ id: 'gm-trashed', userId: 'u-existing', deletedAt: new Date() }),
      });

      await expect(service.createMember(createInput())).rejects.toMatchObject({
        response: { code: 'MEMBER_TRASHED', memberId: 'gm-trashed' },
      });
      expect(gymMemberCreate).not.toHaveBeenCalled();
    });
  });

  // Settings → Membership: a toggle that is on means the field is asked for *and*
  // required. The console renders it required, but rendering is not enforcement —
  // a stale tab, the till, or a direct POST all land here.
  describe('createMember — intake policy', () => {
    it('rejects a create missing a field the gym switched on, before touching the db', async () => {
      const { service, userFindUnique, gymMemberCreate } = setup({
        intake: { phone: true, personalId: true },
      });

      await expect(service.createMember(createInput({ phone: undefined }))).rejects.toMatchObject({
        response: { code: 'MEMBER_INTAKE_REQUIRED', fields: ['phone', 'personalId'] },
      });
      expect(userFindUnique).not.toHaveBeenCalled();
      expect(gymMemberCreate).not.toHaveBeenCalled();
    });

    it('accepts the same create once every switched-on field is supplied', async () => {
      const { service, gymMemberCreate } = setup({
        intake: { phone: true, personalId: true },
        userFindUnique: null,
        findFirst: row(),
      });

      await service.createMember(createInput({ phone: '555', personalId: '01001000000' }));

      expect(gymMemberCreate).toHaveBeenCalled();
    });

    it('ignores a blank field the gym switched off', async () => {
      const { service, gymMemberCreate } = setup({
        intake: { personalId: false },
        userFindUnique: null,
        findFirst: row(),
      });

      await service.createMember(createInput({ personalId: undefined }));

      expect(gymMemberCreate).toHaveBeenCalled();
    });

    // One toggle, two columns: a next of kin with no number is not a next of kin.
    it('demands both halves of the emergency contact', async () => {
      const { service } = setup({ intake: { emergencyContact: true } });

      await expect(
        service.createMember(
          createInput({ emergencyContactName: 'Data', emergencyContactPhone: undefined }),
        ),
      ).rejects.toMatchObject({
        response: { code: 'MEMBER_INTAKE_REQUIRED', fields: ['emergencyContact'] },
      });
    });

    // Whitespace is not an answer — otherwise a space bar defeats the whole setting.
    it('treats a whitespace-only value as missing', async () => {
      const { service } = setup({ intake: { address: true } });

      await expect(service.createMember(createInput({ address: '   ' }))).rejects.toMatchObject({
        response: { code: 'MEMBER_INTAKE_REQUIRED', fields: ['address'] },
      });
    });

    // The console folds surname into `name` before sending, so there is nothing
    // separate left here to find missing — enforcing it would reject every create.
    it('never blocks a create over surname, which arrives folded into name', async () => {
      const { service, gymMemberCreate } = setup({
        intake: { surname: true },
        userFindUnique: null,
        findFirst: row(),
      });

      await service.createMember(createInput({ name: 'Nino Beridze' }));

      expect(gymMemberCreate).toHaveBeenCalled();
    });

    // The enrolment block is hidden outright at the till, so requiring either of
    // these would make a walk-in impossible to create.
    it('never demands membershipPlan or paymentMethod', async () => {
      const { service, gymMemberCreate } = setup({
        intake: { membershipPlan: true, paymentMethod: true },
        userFindUnique: null,
        findFirst: row(),
      });

      await service.createMember(createInput({ planId: undefined, paymentMethod: undefined }));

      expect(gymMemberCreate).toHaveBeenCalled();
    });

    // The newest toggle behaves like every other one: on means asked for AND
    // required, and the exhaustive map in `assertIntakeSatisfied` is what keeps
    // it from being rendered as mandatory and never checked.
    it('demands a start date once the gym switches the toggle on', async () => {
      const { service } = setup({ intake: { startDate: true } });

      await expect(
        service.createMember(createInput({ startDate: undefined })),
      ).rejects.toMatchObject({
        response: { code: 'MEMBER_INTAKE_REQUIRED', fields: ['startDate'] },
      });
    });
  });

  describe('member start date', () => {
    const created = () =>
      setup({
        userFindUnique: null,
        gymMemberCreate: { id: 'gm-new' },
        findFirst: row({ id: 'gm-new' }),
      });

    it('records the day on the membership at UTC midnight', async () => {
      const { service, gymMemberCreate } = created();

      await service.createMember(createInput({ startDate: '2026-07-10' }));

      const data = (gymMemberCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data.startDate).toEqual(new Date('2026-07-10T00:00:00.000Z'));
    });

    it('writes no start date at all when the desk records none', async () => {
      const { service, gymMemberCreate } = created();

      await service.createMember(createInput());

      // Absent, not null: an omitted profile field leaves its column alone, which
      // is the same rule every other optional extra follows.
      const data = (gymMemberCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data).not.toHaveProperty('startDate');
    });

    // Backdating an enrolment is a staff correction — the start-date window bounds
    // what a signed-out visitor may pick, and the desk is deliberately outside it.
    it('lets the desk record a date the join wizard could never pick', async () => {
      const { service, gymMemberCreate } = created();

      await service.createMember(createInput({ startDate: '2020-01-01' }));

      const data = (gymMemberCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data.startDate).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    });

    it('edits the recorded day, and clears it when the field is emptied', async () => {
      const { service, gymMemberUpdate } = setup({ findFirst: row() });

      await service.updateMember('gm-1', {
        name: 'Nino Beridze',
        phone: null,
        startDate: '2026-08-01',
      });
      await service.updateMember('gm-1', { name: 'Nino Beridze', phone: null, startDate: null });

      expect(gymMemberUpdate.mock.calls[0]?.[0]).toMatchObject({
        data: { startDate: new Date('2026-08-01T00:00:00.000Z') },
      });
      expect(gymMemberUpdate.mock.calls[1]?.[0]).toMatchObject({ data: { startDate: null } });
    });

    it('reads the recorded day back onto the detail as an ISO instant', async () => {
      const { service } = setup({
        findFirst: row({ startDate: new Date('2026-07-10T00:00:00.000Z') }),
      });

      await expect(service.getMember('gm-1')).resolves.toMatchObject({
        startDate: '2026-07-10T00:00:00.000Z',
      });
    });

    it('reads back null for a membership recorded before the gym asked for one', async () => {
      const { service } = setup({ findFirst: row() });

      await expect(service.getMember('gm-1')).resolves.toMatchObject({ startDate: null });
    });
  });

  describe('getMember — new detail sections', () => {
    it('maps profile extras, access log, purchases, notes and tasks from the joins', async () => {
      const { service } = setup({
        findFirst: row({
          gender: 'FEMALE',
          address: '12 Rustaveli Ave',
          emergencyContactName: 'Data',
          emergencyContactPhone: '555',
          medicalNotes: 'None',
          dateOfBirth: new Date('1994-03-02T00:00:00.000Z'),
        }),
        checkIns: [{ id: 'ci-1', checkedInAt: new Date('2026-06-20T09:30:00.000Z') }],
        orders: [
          {
            id: 'o-1',
            createdAt: new Date('2026-06-19T10:00:00.000Z'),
            total: 1500,
            currency: 'GEL',
            locationId: 'loc-1',
            items: [{ label: 'Protein Bar', qty: 2 }],
            payment: { method: 'CASH' },
          },
        ],
        notes: [
          {
            id: 'n-1',
            authorName: 'Admin',
            body: 'Called back',
            createdAt: new Date('2026-06-18T00:00:00.000Z'),
          },
        ],
        tasks: [
          {
            id: 't-1',
            title: 'Follow up',
            dueDate: new Date('2026-07-01T00:00:00.000Z'),
            assignee: 'Front Desk',
            status: 'PENDING',
            createdAt: new Date('2026-06-17T00:00:00.000Z'),
          },
        ],
      });

      const result = await service.getMember('gm-1');

      expect(result).toMatchObject({
        gender: 'FEMALE',
        address: '12 Rustaveli Ave',
        emergencyContactName: 'Data',
        emergencyContactPhone: '555',
        medicalNotes: 'None',
        dateOfBirth: '1994-03-02T00:00:00.000Z',
        accessLog: [{ id: 'ci-1', at: '2026-06-20T09:30:00.000Z', location: null }],
        purchases: [
          {
            id: 'o-1',
            total: 1500,
            currency: 'GEL',
            method: 'CASH',
            location: 'loc-1',
            items: [{ label: 'Protein Bar', qty: 2 }],
          },
        ],
        notes: [{ id: 'n-1', author: 'Admin', body: 'Called back' }],
        tasks: [{ id: 't-1', title: 'Follow up', assignee: 'Front Desk', status: 'PENDING' }],
      });
    });
  });

  describe('createMember — plan enrolment', () => {
    it('creates an ACTIVE subscription with a computed period when a plan + start date are given', async () => {
      const { service, subscriptionCreate } = setup({
        userFindUnique: null,
        userCreate: { id: 'u-new' },
        gymMemberCreate: { id: 'gm-new' },
        findFirst: row({ id: 'gm-new', userId: 'u-new' }),
        plan: {
          id: 'plan-1',
          priceAmount: 4500,
          currency: 'GEL',
          interval: 'MONTH',
          status: 'ACTIVE',
        },
      });

      await service.createMember(createInput({ planId: 'plan-1', startDate: '2026-07-01' }));

      const data = subscriptionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(data.data).toMatchObject({
        planId: 'plan-1',
        memberId: 'gm-new',
        status: 'ACTIVE',
        priceAmount: 4500,
        currency: 'GEL',
        interval: 'MONTH',
      });
      // Month plan → period end one month after the start.
      expect((data.data.currentPeriodEnd as Date).toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('rejects an inactive plan with a 400 and does not create a subscription', async () => {
      const { service, subscriptionCreate } = setup({
        userFindUnique: null,
        gymMemberCreate: { id: 'gm-new' },
        findFirst: row({ id: 'gm-new' }),
        plan: {
          id: 'plan-x',
          priceAmount: 1,
          currency: 'GEL',
          interval: 'MONTH',
          status: 'ARCHIVED',
        },
      });

      await expect(
        service.createMember(createInput({ planId: 'plan-x', startDate: '2026-07-01' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(subscriptionCreate).not.toHaveBeenCalled();
    });
  });

  describe('addNote / addTask / setTaskStatus', () => {
    it('adds a note (author falls back to "Staff" with no session user) and returns the detail', async () => {
      const { service, memberNoteCreate } = setup({ findFirst: row() });

      const result = await service.addNote('gm-1', { body: 'Called back' });

      expect(memberNoteCreate.mock.calls[0]?.[0]).toMatchObject({
        data: { memberId: 'gm-1', authorName: 'Staff', body: 'Called back' },
      });
      expect(result.id).toBe('gm-1');
    });

    it('adds a task with a coerced due date', async () => {
      const { service, memberTaskCreate } = setup({ findFirst: row() });

      await service.addTask('gm-1', {
        title: 'Follow up',
        dueDate: '2026-07-10',
        assignee: 'Sales',
      });

      const data = memberTaskCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(data.data).toMatchObject({ memberId: 'gm-1', title: 'Follow up', assignee: 'Sales' });
      expect((data.data.dueDate as Date).toISOString()).toBe('2026-07-10T00:00:00.000Z');
    });

    it('toggles a task that belongs to the member', async () => {
      const { service, memberTaskUpdate } = setup({
        findFirst: row(),
        taskFindFirst: { id: 't-1' },
      });

      await service.setTaskStatus('gm-1', 't-1', { status: 'DONE' });

      expect(memberTaskUpdate.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 't-1' },
        data: { status: 'DONE' },
      });
    });

    it('throws 404 when the task does not belong to the member', async () => {
      const { service, memberTaskUpdate } = setup({ findFirst: row(), taskFindFirst: null });

      await expect(
        service.setTaskStatus('gm-1', 'missing', { status: 'DONE' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(memberTaskUpdate).not.toHaveBeenCalled();
    });
  });

  describe('bulkExport', () => {
    it('returns a jobId handle for the async export', async () => {
      const { service } = setup();

      const result = await service.bulkExport({ ids: ['gm-1', 'gm-2'] });

      expect(result.jobId).toEqual(expect.any(String));
      expect(result.jobId.length).toBeGreaterThan(0);
    });
  });
});

describe('MembersService.sendMemberEmail', () => {
  afterEach(() => vi.clearAllMocks());

  const emailMember = () =>
    row({
      user: { name: 'Davit Kvaratskhelia', email: 'davit@example.com', phone: '+995 555 10 20 30' },
      subscriptions: [
        {
          id: 'sub-1',
          planId: 'plan-1',
          status: 'ACTIVE',
          priceAmount: 7500,
          currency: 'GEL',
          interval: 'MONTH',
          currentPeriodStart: new Date('2026-07-05T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-08-05T00:00:00.000Z'),
          plan: { name: 'Standard' },
        },
      ],
      _count: { subscriptions: 1, checkIns: 42 },
    });

  it('sends a branded email to the member, interpolating merge fields for this member', async () => {
    const { service, mailerSend } = setup({ findFirst: emailMember() });

    const result = await service.sendMemberEmail('gm-1', {
      subject: 'Hi {{first_name}}',
      body: 'Your {{plan_name}} plan renews on {{expiry_date}}.',
    });

    expect(result).toEqual({ sent: true });
    expect(mailerSend).toHaveBeenCalledTimes(1);
    const message = mailerSend.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(message.to).toBe('davit@example.com');
    expect(message.subject).toBe('Hi Davit');
    expect(message.text).toBe('Your Standard plan renews on 2026-08-05.');
    expect(message.html).toContain('Standard');
  });

  // The drawer's template picker lists automation rule bodies beside marketing
  // templates, so these two automation-only tokens can reach this send path.
  // Both are *known* keys, so an unfilled one is not a visible `{{...}}` staff
  // would catch in the preview — it is a blank in the member's inbox.
  it('fills the check-in count and the loyalty balance an automation body may quote', async () => {
    const { service, mailerSend, loyaltyLedgerFindFirst } = setup({
      findFirst: emailMember(),
      pointsBalance: 275,
    });

    await service.sendMemberEmail('gm-1', {
      subject: 'Hi',
      body: '{{member_checkin_count}} visits, {{member_points_balance}} points.',
    });

    expect(loyaltyLedgerFindFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { gymId: 'gym-1', memberId: 'gm-1' },
      orderBy: { createdAt: 'desc' },
    });
    const message = mailerSend.mock.calls[0]?.[0] as { text: string };
    expect(message.text).toBe('42 visits, 275 points.');
  });

  it('reads a member with no ledger row as a zero balance, not a blank', async () => {
    const { service, mailerSend } = setup({ findFirst: emailMember() });

    await service.sendMemberEmail('gm-1', {
      subject: 'Hi',
      body: 'You have {{member_points_balance}} points.',
    });

    const message = mailerSend.mock.calls[0]?.[0] as { text: string };
    expect(message.text).toBe('You have 0 points.');
  });

  it('404s an unknown / cross-tenant / trashed member and never sends', async () => {
    const { service, mailerSend } = setup({ findFirst: null });

    await expect(
      service.sendMemberEmail('missing', { subject: 'Hi', body: 'There' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mailerSend).not.toHaveBeenCalled();
  });

  it('fails loud (no false success) when outbound mail is not configured', async () => {
    const { service, mailerSend } = setup({ findFirst: emailMember(), mailerConfigured: false });

    await expect(
      service.sendMemberEmail('gm-1', { subject: 'Hi', body: 'There' }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_CONFIGURED' } });
    expect(mailerSend).not.toHaveBeenCalled();
  });
});

/** One live subscription, as the roster's join selects it. */
const liveSub = () => ({
  id: 's-1',
  planId: 'plan-1',
  status: 'ACTIVE',
  priceAmount: 4500,
  currency: 'GEL',
  interval: 'MONTH' as const,
  currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
  plan: { name: 'Premium' },
});

describe('MembersService — member / guest / inactive', () => {
  it('reads a member with a live subscription as MEMBER', async () => {
    const { service } = setup({
      findMany: [row({ subscriptions: [liveSub()], _count: { subscriptions: 1, checkIns: 0 } })],
      count: 1,
    });

    const result = await service.listMembers(query());

    expect(result.data[0]).toMatchObject({ kind: 'MEMBER', kindOverride: null });
  });

  it('reads someone who never subscribed as GUEST', async () => {
    // How a till walk-in lands on the roster: created with no subscription, so
    // nothing extra has to mark them a guest — the derivation already does.
    const { service } = setup({
      findMany: [row({ subscriptions: [], _count: { subscriptions: 0, checkIns: 0 } })],
      count: 1,
    });

    const result = await service.listMembers(query());

    expect(result.data[0]?.kind).toBe('GUEST');
  });

  it('reads a lapsed member as INACTIVE, not as a guest', async () => {
    const { service } = setup({
      findMany: [row({ subscriptions: [], _count: { subscriptions: 2, checkIns: 0 } })],
      count: 1,
    });

    const result = await service.listMembers(query());

    expect(result.data[0]?.kind).toBe('INACTIVE');
  });

  it('lets a staff override win over the subscription', async () => {
    const { service } = setup({
      findMany: [
        row({
          subscriptions: [],
          _count: { subscriptions: 0, checkIns: 0 },
          kindOverride: 'MEMBER',
        }),
      ],
      count: 1,
    });

    const result = await service.listMembers(query());

    expect(result.data[0]).toMatchObject({ kind: 'MEMBER', kindOverride: 'MEMBER' });
  });

  it('filters the roster by kind through the override + subscription clauses', async () => {
    const { service, findMany } = setup();

    await service.listMembers(query({ kind: 'GUEST' }));

    // The clause has to mirror `resolveMemberKind`, or a tab would show a count
    // its own list cannot reproduce: pinned to GUEST, or unpinned with no
    // subscriptions and not suspended.
    const where = findMany.mock.calls[0]![0].where;
    expect(where?.OR).toEqual([
      { kindOverride: 'GUEST' },
      expect.objectContaining({ kindOverride: null, subscriptions: { none: {} } }),
    ]);
  });
});

describe('MembersService — home branch', () => {
  it('stamps the gym default on a member created without a branch', async () => {
    const { service, gymMemberCreate, locationFindFirst } = setup({
      findFirst: row({ id: 'gm-new' }),
    });

    await service.createMember({
      name: 'Ana',
      email: 'ana@example.com',
      status: 'ACTIVE',
    } as never);

    expect(locationFindFirst.mock.calls[0]?.[0]).toMatchObject({ where: { isDefault: true } });
    expect(gymMemberCreate.mock.calls[0]?.[0]?.data).toMatchObject({ locationId: 'loc-default' });
  });

  it('stamps the branch the desk named, without consulting the default', async () => {
    const { service, gymMemberCreate, locationFindFirst } = setup({
      findFirst: row({ id: 'gm-new' }),
      location: { id: 'loc-2' },
    });

    await service.createMember({
      name: 'Ana',
      email: 'ana@example.com',
      status: 'ACTIVE',
      locationId: 'loc-2',
    } as never);

    expect(locationFindFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'loc-2' } });
    expect(gymMemberCreate.mock.calls[0]?.[0]?.data).toMatchObject({ locationId: 'loc-2' });
  });

  it('rejects a branch belonging to another gym', async () => {
    // The scoped client simply never matches it, so the lookup misses.
    const { service } = setup({ findFirst: row({ id: 'gm-new' }), location: null });

    await expect(
      service.createMember({
        name: 'Ana',
        email: 'ana@example.com',
        status: 'ACTIVE',
        locationId: 'loc-other-gym',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_NOT_FOUND' } });
  });

  // A half-configured branch list must not be the reason a front desk cannot add
  // a member; the member is created unattributed instead.
  it('creates an unattributed member when the gym has no default branch', async () => {
    const { service, gymMemberCreate } = setup({
      findFirst: row({ id: 'gm-new' }),
      location: null,
    });

    await service.createMember({
      name: 'Ana',
      email: 'ana@example.com',
      status: 'ACTIVE',
    } as never);

    expect(gymMemberCreate.mock.calls[0]?.[0]?.data).toMatchObject({ locationId: null });
  });

  it('narrows the roster, its pager and its tab badges by the same branch', async () => {
    const { service, findMany, count, gymMemberGroupBy } = setup({});

    await service.listMembers({
      page: 1,
      limit: 20,
      sort: 'name',
      dir: 'asc',
      frozen: false,
      view: 'active',
      locationId: 'loc-1',
    } as never);

    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ locationId: 'loc-1' });
    expect(count.mock.calls[0]?.[0]?.where).toMatchObject({ locationId: 'loc-1' });
    // The tab badges count the same population the rows come from — a badge that
    // counts the whole gym above one branch's rows is the screen contradicting itself.
    const groupByArgs = gymMemberGroupBy.mock.calls[0]?.[0] as { where?: unknown } | undefined;
    expect(groupByArgs?.where).toMatchObject({ locationId: 'loc-1' });
  });

  it('leaves the roster gym-wide when no branch is selected', async () => {
    const { service, findMany } = setup({});

    await service.listMembers({
      page: 1,
      limit: 20,
      sort: 'name',
      dir: 'asc',
      frozen: false,
      view: 'active',
    } as never);

    expect(findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('locationId');
  });
});
