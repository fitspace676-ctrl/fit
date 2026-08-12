import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PackageBillingInterval, PackagePlanStatus } from '@fit/db';
import type {
  CreatePackagePlanData,
  ListAdminPackagePlansQuery,
  UpdatePackagePlanData,
} from '@fit/types';
import { AdminPackagePlansService } from './admin-package-plans.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { GymLocaleService } from '../gyms/gym-locale.service';

/** A package-plan row as the service's projection selects it. */
interface PackagePlanRecord {
  id: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  billingInterval: PackageBillingInterval;
  sessionCount: number | null;
  features: string[];
  popular: boolean;
  status: PackagePlanStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface FindManyArgs {
  where?: { status?: unknown; OR?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown };
  data?: Record<string, unknown>;
}

const row = (over?: Partial<PackagePlanRecord>): PackagePlanRecord => ({
  id: 'pp-1',
  name: '10 Session Pack',
  description: 'Ten one-on-one personal training sessions.',
  priceAmount: 50000,
  currency: 'USD',
  billingInterval: PackageBillingInterval.ONE_TIME,
  sessionCount: 10,
  features: ['Personalised plan', 'Progress tracking'],
  popular: true,
  status: PackagePlanStatus.ACTIVE,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
  ...over,
});

function setup(overrides?: {
  findMany?: PackagePlanRecord[];
  count?: number;
  findFirst?: PackagePlanRecord | null;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<PackagePlanRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<PackagePlanRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const create = vi.fn<(args: WhereArgs) => Promise<PackagePlanRecord>>(() =>
    Promise.resolve(row()),
  );
  const update = vi.fn<(args: WhereArgs) => Promise<PackagePlanRecord>>(() =>
    Promise.resolve(row()),
  );

  const client: Record<string, unknown> = {
    packagePlan: { findMany, count, findFirst, create, update },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  // The gym prices in GEL; a created plan must be stamped with that, not USD.
  const locale = {
    get: () => Promise.resolve({ language: 'en', currency: 'GEL', timezone: 'Asia/Tbilisi' }),
  } as unknown as GymLocaleService;

  return {
    service: new AdminPackagePlansService(prisma, tenant, locale),
    findMany,
    count,
    findFirst,
    create,
    update,
  };
}

function query(overrides?: Partial<ListAdminPackagePlansQuery>): ListAdminPackagePlansQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreatePackagePlanData>): CreatePackagePlanData => ({
  name: '10 Session Pack',
  description: 'Ten one-on-one personal training sessions.',
  priceAmount: 50000,
  billingInterval: 'ONE_TIME',
  sessionCount: 10,
  features: ['Personalised plan', 'Progress tracking'],
  popular: true,
  status: 'ACTIVE',
  ...over,
});

const updateInput = (over?: Partial<UpdatePackagePlanData>): UpdatePackagePlanData => ({
  name: '20 Session Pack',
  description: 'Updated copy.',
  priceAmount: 90000,
  billingInterval: 'MONTH',
  sessionCount: null,
  features: ['Unlimited sessions'],
  popular: false,
  ...over,
});

describe('AdminPackagePlansService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listPackagePlans', () => {
    it('projects rows to denormalised AdminPackagePlanRows and echoes pagination totals', async () => {
      const { service } = setup({ findMany: [row()], count: 1 });

      const result = await service.listPackagePlans(query());

      expect(result).toEqual({
        data: [
          {
            id: 'pp-1',
            name: '10 Session Pack',
            priceAmount: 50000,
            currency: 'USD',
            billingInterval: 'ONE_TIME',
            sessionCount: 10,
            featureCount: 2,
            popular: true,
            status: 'ACTIVE',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('reports zero featureCount and a null sessionCount for a bare plan', async () => {
      const { service } = setup({
        findMany: [row({ features: [], sessionCount: null })],
        count: 1,
      });

      const result = await service.listPackagePlans(query());

      expect(result.data[0]).toMatchObject({ featureCount: 0, sessionCount: null });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listPackagePlans(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listPackagePlans(query({ status: 'INACTIVE' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'INACTIVE' });
    });

    it('builds a case-insensitive name/description search', async () => {
      const { service, findMany } = setup();

      await service.listPackagePlans(query({ search: 'pack' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toEqual([
        { name: { contains: 'pack', mode: 'insensitive' } },
        { description: { contains: 'pack', mode: 'insensitive' } },
      ]);
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listPackagePlans(query({ sort: 'name', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ name: 'desc' });

      await service.listPackagePlans(query({ sort: 'price', dir: 'asc' }));
      expect(findMany.mock.calls[1]?.[0]?.orderBy).toEqual({ priceAmount: 'asc' });

      await service.listPackagePlans(query({ sort: 'status', dir: 'asc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ status: 'asc' });

      await service.listPackagePlans(query({ sort: 'createdAt', dir: 'desc' }));
      expect(findMany.mock.calls[3]?.[0]?.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('getPackagePlan', () => {
    it('returns the full detail projection with the features list', async () => {
      const { service } = setup({ findFirst: row() });

      const result = await service.getPackagePlan('pp-1');

      expect(result).toEqual({
        id: 'pp-1',
        name: '10 Session Pack',
        priceAmount: 50000,
        currency: 'USD',
        billingInterval: 'ONE_TIME',
        sessionCount: 10,
        featureCount: 2,
        popular: true,
        status: 'ACTIVE',
        createdAt: '2026-03-01T00:00:00.000Z',
        description: 'Ten one-on-one personal training sessions.',
        features: ['Personalised plan', 'Progress tracking'],
        updatedAt: '2026-03-02T00:00:00.000Z',
      });
    });

    it('throws 404 PACKAGE_PLAN_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getPackagePlan('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createPackagePlan', () => {
    it('stamps the tenant gymId and persists the profile fields', async () => {
      const { service, create } = setup();

      await service.createPackagePlan(
        createInput({ name: 'Starter Pack', status: 'INACTIVE', sessionCount: null }),
      );

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: 'gym-1',
        name: 'Starter Pack',
        priceAmount: 50000,
        // Stamped from the gym's own locale, not from the request body.
        currency: 'GEL',
        billingInterval: 'ONE_TIME',
        sessionCount: null,
        features: ['Personalised plan', 'Progress tracking'],
        popular: true,
        status: 'INACTIVE',
      });
    });
  });

  describe('updatePackagePlan', () => {
    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updatePackagePlan('pp-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'pp-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        name: '20 Session Pack',
        description: 'Updated copy.',
        priceAmount: 90000,
        billingInterval: 'MONTH',
        sessionCount: null,
        features: ['Unlimited sessions'],
        popular: false,
      });
      expect(data).not.toHaveProperty('status');
      // An existing plan keeps the currency its buyers signed up in.
      expect(data).not.toHaveProperty('currency');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updatePackagePlan('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('deactivatePackagePlan / reactivatePackagePlan', () => {
    it('sets the status to INACTIVE on deactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.deactivatePackagePlan('pp-1');

      expect(update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'pp-1' },
        data: { status: PackagePlanStatus.INACTIVE },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.reactivatePackagePlan('pp-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ status: PackagePlanStatus.ACTIVE });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.deactivatePackagePlan('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
