import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GymMemberStatus,
  LocationStatus,
  ProductStatus,
  Role,
  TrainerStatus,
  PaymentStatus,
  SubscriptionStatus,
} from '@fit/db';
import type { DashboardSecondaryKpis } from '@fit/types';
import { DashboardService } from './dashboard.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** The subset of the Prisma count arg the assertions inspect. */
interface CountArgs {
  where?: Record<string, unknown>;
}

/**
 * Stub the four scoped models' `count`, each returning a fixed number per call in
 * the order the service issues them: active first, then total. The tenant
 * extension (gym scoping) is exercised by the real client in integration; here we
 * assert the service's own filters (`role` / `status`) and projection.
 */
function setup(counts?: Partial<Record<string, number>>) {
  const make = (active: number, total: number) => {
    const fn = vi.fn<(args?: CountArgs) => Promise<number>>();
    fn.mockResolvedValueOnce(active).mockResolvedValueOnce(total);
    return fn;
  };

  const gymMember = make(counts?.membersActive ?? 0, counts?.membersTotal ?? 0);
  const trainer = make(counts?.trainersActive ?? 0, counts?.trainersTotal ?? 0);
  const location = make(counts?.locationsActive ?? 0, counts?.locationsTotal ?? 0);
  const product = make(counts?.productsActive ?? 0, counts?.productsTotal ?? 0);

  const client = {
    gymMember: { count: gymMember },
    trainer: { count: trainer },
    location: { count: location },
    product: { count: product },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  // `getStats` never touches the tenant context; a minimal stub satisfies the
  // constructor for these unit tests (the overview's tenant-scoped reads are
  // exercised against the real client in integration).
  const tenant = { gymId: 'gym_test', userId: 'user_test', role: Role.MANAGER } as TenantContext;

  return {
    service: new DashboardService(prisma, tenant),
    gymMember,
    trainer,
    location,
    product,
  };
}

describe('DashboardService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('getStats', () => {
    it('projects each entity as an active/total pair', async () => {
      const { service } = setup({
        membersActive: 42,
        membersTotal: 50,
        trainersActive: 6,
        trainersTotal: 7,
        locationsActive: 2,
        locationsTotal: 3,
        productsActive: 9,
        productsTotal: 12,
      });

      const result = await service.getStats();

      expect(result).toEqual({
        members: { active: 42, total: 50 },
        trainers: { active: 6, total: 7 },
        locations: { active: 2, total: 3 },
        products: { active: 9, total: 12 },
      });
    });

    it('counts only MEMBER-role memberships, active filtered by status', async () => {
      const { service, gymMember } = setup();

      await service.getStats();

      // First call: the active figure — MEMBER role + ACTIVE status.
      expect(gymMember.mock.calls[0]?.[0]?.where).toEqual({
        role: Role.MEMBER,
        status: GymMemberStatus.ACTIVE,
      });
      // Second call: the total — MEMBER role, all statuses.
      expect(gymMember.mock.calls[1]?.[0]?.where).toEqual({ role: Role.MEMBER });
    });

    it('filters the active count of each catalogue entity by its ACTIVE status', async () => {
      const { service, trainer, location, product } = setup();

      await service.getStats();

      expect(trainer.mock.calls[0]?.[0]?.where).toEqual({ status: TrainerStatus.ACTIVE });
      expect(location.mock.calls[0]?.[0]?.where).toEqual({ status: LocationStatus.ACTIVE });
      expect(product.mock.calls[0]?.[0]?.where).toEqual({ status: ProductStatus.ACTIVE });
    });

    it('counts every record for the total of each catalogue entity (no filter)', async () => {
      const { service, trainer, location, product } = setup();

      await service.getStats();

      expect(trainer.mock.calls[1]?.[0]).toBeUndefined();
      expect(location.mock.calls[1]?.[0]).toBeUndefined();
      expect(product.mock.calls[1]?.[0]).toBeUndefined();
    });
  });

  describe('secondaryKpis', () => {
    function setupSecondary() {
      const gymMemberCount = vi.fn().mockResolvedValueOnce(120); // activeMembers
      const paymentAggregate = vi
        .fn()
        .mockResolvedValueOnce({ _sum: { amount: 500000 } }) // this month
        .mockResolvedValueOnce({ _sum: { amount: 400000 } }); // last month
      const subscriptionCount = vi
        .fn()
        .mockResolvedValueOnce(7) // overdue (PAST_DUE)
        .mockResolvedValueOnce(15) // expiring soon
        .mockResolvedValueOnce(30); // renewals due
      const classInstanceCount = vi.fn().mockResolvedValueOnce(9); // classes today

      const client = {
        gymMember: { count: gymMemberCount },
        payment: { aggregate: paymentAggregate },
        subscription: { count: subscriptionCount },
        classInstance: { count: classInstanceCount },
      };
      const prisma = { client } as unknown as TenantPrismaService;
      const tenant = { gymId: 'gym_test' } as TenantContext;
      const service = new DashboardService(prisma, tenant);
      return { service, subscriptionCount, paymentAggregate };
    }

    it('projects the six figures with a real month-over-month revenue delta', async () => {
      const { service } = setupSecondary();
      const result: DashboardSecondaryKpis = await (
        service as unknown as { secondaryKpis(): Promise<DashboardSecondaryKpis> }
      ).secondaryKpis();

      expect(result).toEqual({
        activeMembers: 120,
        revenueThisMonth: { value: 500000, deltaPct: 25 },
        overduePayments: 7,
        classesToday: 9,
        expiringSoon: 15,
        renewalsDue: 30,
      });
    });

    it('counts overdue as PAST_DUE subscriptions', async () => {
      const { service, subscriptionCount } = setupSecondary();
      await (
        service as unknown as { secondaryKpis(): Promise<DashboardSecondaryKpis> }
      ).secondaryKpis();
      expect(subscriptionCount.mock.calls[0]?.[0]).toEqual({
        where: { status: SubscriptionStatus.PAST_DUE },
      });
    });

    it('sums this-month revenue from CAPTURED payments only', async () => {
      const { service, paymentAggregate } = setupSecondary();
      await (
        service as unknown as { secondaryKpis(): Promise<DashboardSecondaryKpis> }
      ).secondaryKpis();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentAggregate.mock.calls[0]?.[0].where.status).toBe(PaymentStatus.CAPTURED);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentAggregate.mock.calls[0]?.[0]._sum).toEqual({ amount: true });
    });
  });
});
