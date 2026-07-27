import { Injectable } from '@nestjs/common';
import {
  PackageBillingInterval,
  PackagePlanStatus,
  SubscriptionPlanStatus,
  type Prisma,
} from '@fit/db';
import type {
  PackageInterval,
  PackageSummary,
  SignupCatalogueQuery,
  SignupCatalogueResponse,
  SubscriptionPlanSummary,
} from '@fit/types';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';

/** Prisma's package billing cadence → the lower-cased public interval. */
const PACKAGE_INTERVALS: Record<PackageBillingInterval, PackageInterval> = {
  [PackageBillingInterval.MONTH]: 'month',
  [PackageBillingInterval.YEAR]: 'year',
  [PackageBillingInterval.ONE_TIME]: 'one_time',
};

const PACKAGE_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  currency: true,
  billingInterval: true,
  sessionCount: true,
  creditValidityDays: true,
  features: true,
  popular: true,
} satisfies Prisma.PackagePlanSelect;

type PackageRecord = Prisma.PackagePlanGetPayload<{ select: typeof PACKAGE_SELECT }>;

const SUBSCRIPTION_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  currency: true,
  interval: true,
  features: true,
  popular: true,
  trialDays: true,
} satisfies Prisma.SubscriptionPlanSelect;

type SubscriptionRecord = Prisma.SubscriptionPlanGetPayload<{ select: typeof SUBSCRIPTION_SELECT }>;

/**
 * The whole product catalogue the public join wizard's step 2 offers, in one
 * read (`GET /catalogue`).
 *
 * **Why one endpoint.** The step renders three tabs, and the wizard also needs
 * the branch list to decide whether step 1 is worth showing at all (a
 * single-branch gym skips it). Four separate round trips on a page a visitor
 * sees before they have any session is four chances to render a half-empty
 * store, so they are composed here instead.
 *
 * **Why the tabs are disjoint.** Packages and credit packs are the *same*
 * `PackagePlan` table: a row with a positive `sessionCount` is a finite bundle
 * of sessions (what {@link import('../billing/credit-packs.service').CreditPacksService}
 * sells as a credit pack), and a row without one is a plain package. Listing the
 * table unfiltered in both tabs would show the buyer the same product twice
 * under two names, so the split is made here — `sessionCount = null` is a
 * package, `sessionCount > 0` is a credit pack — and subscriptions come from
 * their own `SubscriptionPlan` table. Note this is a narrower view than the
 * public `GET /packages`, which deliberately still lists every active plan for
 * the mobile Personal Training screen.
 *
 * Runs on the **base** {@link PrismaService}: the route is `@Public()` and
 * excluded from the JWT `TenantMiddleware`, so the tenant is constrained
 * explicitly by the `gymId` argument. Only `ACTIVE` rows are listed, so
 * deactivating a plan pulls it off the storefront without touching history.
 */
@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  /**
   * Read the gym's branches and its three product catalogues. An unknown gym
   * matches nothing and yields empty arrays rather than a 404 — the wizard
   * renders that as its "nothing on sale yet" state.
   */
  async read(query: SignupCatalogueQuery): Promise<SignupCatalogueResponse> {
    const [{ locations }, plans, subscriptionPlans] = await Promise.all([
      this.locations.listLocations({ gymId: query.gymId }),
      this.prisma.client.packagePlan.findMany({
        where: { gymId: query.gymId, status: PackagePlanStatus.ACTIVE },
        select: PACKAGE_SELECT,
        orderBy: [{ popular: 'desc' }, { priceAmount: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.client.subscriptionPlan.findMany({
        where: { gymId: query.gymId, status: SubscriptionPlanStatus.ACTIVE },
        select: SUBSCRIPTION_SELECT,
        orderBy: [{ popular: 'desc' }, { priceAmount: 'asc' }, { name: 'asc' }],
      }),
    ]);

    // One pass over `PackagePlan`, split by whether the plan grants a finite
    // number of sessions — see the class docstring for why the tabs are disjoint.
    const packages: PackageSummary[] = [];
    const creditPacks: SignupCatalogueResponse['creditPacks'] = [];
    for (const plan of plans) {
      if (plan.sessionCount && plan.sessionCount > 0) {
        creditPacks.push({
          id: plan.id,
          name: plan.name,
          priceAmount: plan.priceAmount,
          currency: plan.currency,
          sessionCount: plan.sessionCount,
          validityDays: plan.creditValidityDays,
        });
      } else {
        packages.push(toPackageSummary(plan));
      }
    }

    return {
      locations,
      packages,
      subscriptionPlans: subscriptionPlans.map((plan) => toSubscriptionSummary(plan)),
      creditPacks,
    };
  }
}

/** Project a `PackagePlan` row to the public {@link PackageSummary}. */
function toPackageSummary(row: PackageRecord): PackageSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceAmount: row.priceAmount,
    currency: row.currency,
    interval: PACKAGE_INTERVALS[row.billingInterval],
    sessionCount: row.sessionCount,
    features: row.features,
    popular: row.popular,
  };
}

/** Project a `SubscriptionPlan` row to the public {@link SubscriptionPlanSummary}. */
function toSubscriptionSummary(row: SubscriptionRecord): SubscriptionPlanSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceAmount: row.priceAmount,
    currency: row.currency,
    interval: row.interval,
    features: row.features,
    popular: row.popular,
    trialDays: row.trialDays,
  };
}
