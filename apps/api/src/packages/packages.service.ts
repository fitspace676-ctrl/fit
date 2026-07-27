import { Injectable } from '@nestjs/common';
import { PackageBillingInterval, PackagePlanStatus, type Prisma } from '@fit/db';
import type {
  ListPackagesQuery,
  ListPackagesResponse,
  PackageInterval,
  PackageSummary,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The columns the public catalogue selects off `PackagePlan` — the fields a
 * buyer needs in order to choose between plans, and nothing else. Credit
 * validity and the lifecycle/audit columns are enrolment mechanics a storefront
 * has no use for, so they stay out of the projection.
 */
const PACKAGE_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  currency: true,
  billingInterval: true,
  sessionCount: true,
  features: true,
  popular: true,
} satisfies Prisma.PackagePlanSelect;

type PackageRecord = Prisma.PackagePlanGetPayload<{ select: typeof PACKAGE_SELECT }>;

/** Prisma's billing cadence → the lower-cased public {@link PackageInterval}. */
const INTERVALS: Record<PackageBillingInterval, PackageInterval> = {
  [PackageBillingInterval.MONTH]: 'month',
  [PackageBillingInterval.YEAR]: 'year',
  [PackageBillingInterval.ONE_TIME]: 'one_time',
};

/**
 * Read access to a gym's purchasable packages for the public catalogue
 * (`GET /packages`).
 *
 * Powers three surfaces: the web join wizard's product step, the mobile Personal
 * Training screen (T6.6), and the aggregated signup catalogue
 * ({@link import('../catalogue/catalogue.service').CatalogueService}) — all
 * unauthenticated reads scoped by an explicit `gymId`, never a session.
 *
 * Mirrors {@link import('../locations/locations.service').LocationsService}: it
 * runs on the **base** {@link PrismaService} (the route is `@Public()` and
 * excluded from the JWT `TenantMiddleware`), so the tenant is constrained
 * explicitly by the `gymId` argument rather than by the tenant extension. Only
 * `ACTIVE` plans are listed — deactivating a plan pulls it off the storefront
 * while preserving the row and the orders that reference it. Distinct from the
 * staff-only {@link import('./admin-package-plans.service').AdminPackagePlansService}
 * (`/admin/packages`, T4.11), which manages the same rows behind the
 * `TenantGuard` + permissions.
 */
@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the gym's purchasable packages — promoted plans first, then cheapest
   * first — so the storefront's featured cards lead. Scoped by the explicit
   * `gymId` (an unknown gym simply matches nothing). An empty array is a normal
   * result the clients render as their "no packages yet" state.
   *
   * `query.locationId` is accepted and deliberately ignored: `PackagePlan`
   * carries no branch relation, so a gym's package catalogue is gym-wide. The
   * parameter stays in the contract because the wizard passes the branch it
   * collected in step 1, and a future per-location catalogue would narrow here
   * without any client change.
   */
  async listPackages(query: ListPackagesQuery): Promise<ListPackagesResponse> {
    const rows = await this.prisma.client.packagePlan.findMany({
      where: { gymId: query.gymId, status: PackagePlanStatus.ACTIVE },
      select: PACKAGE_SELECT,
      orderBy: [{ popular: 'desc' }, { priceAmount: 'asc' }, { name: 'asc' }],
    });

    return { packages: rows.map((row) => toSummary(row)) };
  }
}

/** Project a queried row to the public {@link PackageSummary}. */
function toSummary(row: PackageRecord): PackageSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceAmount: row.priceAmount,
    currency: row.currency,
    interval: INTERVALS[row.billingInterval],
    sessionCount: row.sessionCount,
    features: row.features,
    popular: row.popular,
  };
}
