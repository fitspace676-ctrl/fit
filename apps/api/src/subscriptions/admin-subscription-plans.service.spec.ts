import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SubscriptionInterval, SubscriptionPlanStatus } from '@fit/db';
import type {
  CreateSubscriptionPlanData,
  ListAdminSubscriptionPlansQuery,
  UpdateSubscriptionPlanData,
} from '@fit/types';
import { AdminSubscriptionPlansService } from './admin-subscription-plans.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { GymLocaleService } from '../gyms/gym-locale.service';

/** A subscription-plan row as the service's projection selects it. */
interface SubscriptionPlanRecord {
  id: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  features: string[];
  freezeDaysPerPeriod: number;
  includedCredits: number;
  trialDays: number;
  popular: boolean;
  status: SubscriptionPlanStatus;
  /** Stage 7 exclusivity: `null` means "offered at every branch". */
  locationId: string | null;
  location: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A `subscription.groupBy` row as the live-subscriber-count aggregation returns it. */
interface SubscriberCountGroup {
  planId: string | null;
  _count: { _all: number };
}

interface FindManyArgs {
  where?: { status?: unknown; OR?: unknown; AND?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown };
  data?: Record<string, unknown>;
}
interface GroupByArgs {
  by?: unknown;
  where?: { planId?: { in?: unknown }; status?: unknown };
}

const row = (over?: Partial<SubscriptionPlanRecord>): SubscriptionPlanRecord => ({
  id: 'sp-1',
  name: 'Monthly Unlimited',
  description: 'Unlimited gym access, billed monthly.',
  priceAmount: 5000,
  currency: 'USD',
  interval: SubscriptionInterval.MONTH,
  features: ['Unlimited access', 'Free guest passes'],
  freezeDaysPerPeriod: 30,
  includedCredits: 10,
  trialDays: 0,
  popular: true,
  status: SubscriptionPlanStatus.ACTIVE,
  // Stage 7 exclusivity: NULL means "sold at every branch", which is what almost
  // every catalogue row holds — so it is the fixture's default.
  locationId: null,
  location: null,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
  ...over,
});

function setup(overrides?: {
  findMany?: SubscriptionPlanRecord[];
  count?: number;
  findFirst?: SubscriptionPlanRecord | null;
  /** `subscription.groupBy` result feeding the roster's live-subscriber counts. */
  subscriberGroups?: SubscriberCountGroup[];
  /** `subscription.count` result feeding a single plan's detail subscriber count. */
  subscriberCount?: number;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<SubscriptionPlanRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<SubscriptionPlanRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const create = vi.fn<(args: WhereArgs) => Promise<SubscriptionPlanRecord>>(() =>
    Promise.resolve(row()),
  );
  const update = vi.fn<(args: WhereArgs) => Promise<SubscriptionPlanRecord>>(() =>
    Promise.resolve(row()),
  );
  const subscriptionGroupBy = vi.fn<(args: GroupByArgs) => Promise<SubscriberCountGroup[]>>(() =>
    Promise.resolve(overrides?.subscriberGroups ?? []),
  );
  const subscriptionCount = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.subscriberCount ?? 0),
  );

  const client: Record<string, unknown> = {
    subscriptionPlan: { findMany, count, findFirst, create, update },
    subscription: { groupBy: subscriptionGroupBy, count: subscriptionCount },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  // The gym prices in GEL; a created plan must be stamped with that, not USD.
  const locale = {
    get: () => Promise.resolve({ language: 'en', currency: 'GEL', timezone: 'Asia/Tbilisi' }),
  } as unknown as GymLocaleService;

  return {
    service: new AdminSubscriptionPlansService(prisma, tenant, locale),
    findMany,
    count,
    findFirst,
    create,
    update,
    subscriptionGroupBy,
    subscriptionCount,
  };
}

function query(
  overrides?: Partial<ListAdminSubscriptionPlansQuery>,
): ListAdminSubscriptionPlansQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreateSubscriptionPlanData>): CreateSubscriptionPlanData => ({
  name: 'Monthly Unlimited',
  description: 'Unlimited gym access, billed monthly.',
  priceAmount: 5000,
  interval: 'MONTH',
  features: ['Unlimited access', 'Free guest passes'],
  popular: true,
  freezeDaysPerPeriod: 30,
  includedCredits: 10,
  trialDays: 0,
  status: 'ACTIVE',
  // NULL is the Stage 7 default: sold at every branch, not "unattributed".
  locationId: null,
  ...over,
});

const updateInput = (over?: Partial<UpdateSubscriptionPlanData>): UpdateSubscriptionPlanData => ({
  name: 'Annual Unlimited',
  description: 'Updated copy.',
  priceAmount: 50000,
  interval: 'YEAR',
  features: ['Unlimited access'],
  popular: false,
  freezeDaysPerPeriod: 15,
  includedCredits: 5,
  trialDays: 0,
  locationId: null,
  ...over,
});

describe('AdminSubscriptionPlansService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listSubscriptionPlans', () => {
    it('projects rows to denormalised AdminSubscriptionPlanRows and echoes pagination totals', async () => {
      const { service } = setup({
        findMany: [row()],
        count: 1,
        subscriberGroups: [{ planId: 'sp-1', _count: { _all: 12 } }],
      });

      const result = await service.listSubscriptionPlans(query());

      expect(result).toEqual({
        data: [
          {
            id: 'sp-1',
            name: 'Monthly Unlimited',
            priceAmount: 5000,
            currency: 'USD',
            interval: 'MONTH',
            featureCount: 2,
            features: ['Unlimited access', 'Free guest passes'],
            freezeDaysPerPeriod: 30,
            includedCredits: 10,
            trialDays: 0,
            subscriberCount: 12,
            popular: true,
            status: 'ACTIVE',
            locationName: null,
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('reports zero featureCount for a bare plan', async () => {
      const { service } = setup({ findMany: [row({ features: [] })], count: 1 });

      const result = await service.listSubscriptionPlans(query());

      expect(result.data[0]).toMatchObject({ featureCount: 0 });
    });

    it('counts only live subscriptions per plan and defaults a plan with none to zero', async () => {
      const { service, subscriptionGroupBy } = setup({
        findMany: [row({ id: 'sp-1' }), row({ id: 'sp-2' })],
        count: 2,
        // Only sp-1 has live subscribers; sp-2 is absent from the aggregation.
        subscriberGroups: [{ planId: 'sp-1', _count: { _all: 5 } }],
      });

      const result = await service.listSubscriptionPlans(query());

      expect(result.data.map((plan) => plan.subscriberCount)).toEqual([5, 0]);
      // The aggregation is scoped to the page's plan ids and the live statuses.
      expect(subscriptionGroupBy.mock.calls[0]?.[0]?.where?.planId?.in).toEqual(['sp-1', 'sp-2']);
      const statusWhere = subscriptionGroupBy.mock.calls[0]?.[0]?.where?.status as
        | { in?: unknown }
        | undefined;
      expect(statusWhere?.in).toEqual(expect.arrayContaining(['ACTIVE', 'PAST_DUE', 'FROZEN']));
    });

    it('skips the subscriber aggregation entirely for an empty page', async () => {
      const { service, subscriptionGroupBy } = setup({ findMany: [], count: 0 });

      await service.listSubscriptionPlans(query());

      expect(subscriptionGroupBy).not.toHaveBeenCalled();
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listSubscriptionPlans(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listSubscriptionPlans(query({ status: 'INACTIVE' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'INACTIVE' });
    });

    it('narrows to a branch WITHOUT hiding the gym-wide plans', async () => {
      const { service, findMany, count } = setup();

      await service.listSubscriptionPlans(query({ locationId: 'loc-1' }));

      // The Stage 7 inversion, pinned: a plan with no branch is sold at EVERY
      // branch, so it has to survive the filter. Plain equality
      // (`{ locationId: 'loc-1' }`) would leave only this branch's exclusives —
      // an empty plan list for any gym that has not written one.
      expect(findMany.mock.calls[0]?.[0]?.where?.AND).toEqual({
        OR: [{ locationId: null }, { locationId: 'loc-1' }],
      });
      // The pager counts the same population, or the totals disagree with the page.
      expect(count.mock.calls[0]?.[0]?.where).toEqual(findMany.mock.calls[0]?.[0]?.where);
    });

    it('applies no branch predicate at all in all-locations mode', async () => {
      const { service, findMany } = setup();

      await service.listSubscriptionPlans(query());

      expect(findMany.mock.calls[0]?.[0]?.where?.AND).toBeUndefined();
    });

    it('keeps the search alongside the branch filter, not instead of it', async () => {
      // The branch predicate is a disjunction and the search is another. They live
      // on separate keys precisely so the second cannot overwrite the first.
      const { service, findMany } = setup();

      await service.listSubscriptionPlans(query({ locationId: 'loc-1', search: 'month' }));

      const where = findMany.mock.calls[0]?.[0]?.where;
      expect(where?.AND).toEqual({ OR: [{ locationId: null }, { locationId: 'loc-1' }] });
      expect(where?.OR).toHaveLength(2);
    });

    it('builds a case-insensitive name/description search', async () => {
      const { service, findMany } = setup();

      await service.listSubscriptionPlans(query({ search: 'month' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toEqual([
        { name: { contains: 'month', mode: 'insensitive' } },
        { description: { contains: 'month', mode: 'insensitive' } },
      ]);
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listSubscriptionPlans(query({ sort: 'name', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ name: 'desc' });

      await service.listSubscriptionPlans(query({ sort: 'price', dir: 'asc' }));
      expect(findMany.mock.calls[1]?.[0]?.orderBy).toEqual({ priceAmount: 'asc' });

      await service.listSubscriptionPlans(query({ sort: 'status', dir: 'asc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ status: 'asc' });

      await service.listSubscriptionPlans(query({ sort: 'createdAt', dir: 'desc' }));
      expect(findMany.mock.calls[3]?.[0]?.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('getSubscriptionPlan', () => {
    it('returns the full detail projection with the features list and live subscriber count', async () => {
      const { service, subscriptionCount } = setup({ findFirst: row(), subscriberCount: 7 });

      const result = await service.getSubscriptionPlan('sp-1');

      expect(result).toEqual({
        id: 'sp-1',
        name: 'Monthly Unlimited',
        priceAmount: 5000,
        currency: 'USD',
        interval: 'MONTH',
        featureCount: 2,
        freezeDaysPerPeriod: 30,
        includedCredits: 10,
        trialDays: 0,
        subscriberCount: 7,
        popular: true,
        status: 'ACTIVE',
        locationName: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        description: 'Unlimited gym access, billed monthly.',
        features: ['Unlimited access', 'Free guest passes'],
        locationId: null,
        updatedAt: '2026-03-02T00:00:00.000Z',
      });
      // The count is scoped to this plan and the live statuses.
      expect(subscriptionCount.mock.calls[0]?.[0]?.where).toMatchObject({ planId: 'sp-1' });
    });

    it('throws 404 SUBSCRIPTION_PLAN_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getSubscriptionPlan('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createSubscriptionPlan', () => {
    it('stamps the tenant gymId and persists the profile fields', async () => {
      const { service, create } = setup();

      await service.createSubscriptionPlan(
        createInput({ name: 'Starter', status: 'INACTIVE', interval: 'YEAR' }),
      );

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: 'gym-1',
        name: 'Starter',
        priceAmount: 5000,
        // Stamped from the gym's own locale, not from the request body.
        currency: 'GEL',
        interval: 'YEAR',
        features: ['Unlimited access', 'Free guest passes'],
        popular: true,
        freezeDaysPerPeriod: 30,
        includedCredits: 10,
        trialDays: 0,
        status: 'INACTIVE',
      });
    });
  });

  describe('updateSubscriptionPlan', () => {
    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updateSubscriptionPlan('sp-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'sp-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        name: 'Annual Unlimited',
        description: 'Updated copy.',
        priceAmount: 50000,
        interval: 'YEAR',
        features: ['Unlimited access'],
        popular: false,
        freezeDaysPerPeriod: 15,
        includedCredits: 5,
        trialDays: 0,
      });
      expect(data).not.toHaveProperty('status');
      // An existing plan keeps the currency its members were signed up in.
      expect(data).not.toHaveProperty('currency');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updateSubscriptionPlan('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateSubscriptionPlan / reactivateSubscriptionPlan', () => {
    it('sets the status to INACTIVE on deactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.deactivateSubscriptionPlan('sp-1');

      expect(update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'sp-1' },
        data: { status: SubscriptionPlanStatus.INACTIVE },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.reactivateSubscriptionPlan('sp-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({
        status: SubscriptionPlanStatus.ACTIVE,
      });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.deactivateSubscriptionPlan('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
