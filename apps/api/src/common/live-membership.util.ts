import { GymMemberStatus, Role, SubscriptionStatus, type Prisma } from '@fit/db';
import type { TenantPrismaService } from './prisma/tenant-prisma.service';
import { atLocation } from './location-filter.util';

/** Same access states and inclusive period end as check-in eligibility. Credit
 * packs purchase sessions, not membership, and do not confer gym access here.
 * Also exclude future periods: a scheduled membership is not in force yet. */
export function liveSubscriptionWhere(now: Date): Prisma.SubscriptionWhereInput {
  return {
    status: {
      in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
    },
    currentPeriodStart: { lte: now },
    currentPeriodEnd: { gte: now },
  };
}

export function rosterMemberWhere(locationId?: string): Prisma.GymMemberWhereInput {
  return { role: Role.MEMBER, deletedAt: null, ...atLocation(locationId) };
}

/** Account suspension overrides an otherwise live membership, as at check-in. */
export function activeMemberWhere(now: Date, locationId?: string): Prisma.GymMemberWhereInput {
  return {
    ...rosterMemberWhere(locationId),
    status: GymMemberStatus.ACTIVE,
    subscriptions: { some: liveSubscriptionWhere(now) },
  };
}

const PLAN_COLORS = ['#7C3AED', '#EC4899', '#2563EB', '#0EA5E9', '#10B981', '#F59E0B'];

/** Shared dashboard/roster paid membership mix. Frozen memberships retain their
 * slot even past period end (resume extends it). Suspension blocks access, not
 * ownership of a paid membership. TRIAL remains included for compatibility.
 * Count people once, assigning overlapping entitlements to the latest-ending
 * plan (id breaks ties), so the slices sum to the number of paying members. */
export async function membershipPlanMix(
  db: TenantPrismaService['client'],
  locationId?: string,
  now = new Date(),
) {
  const subscriptions = await db.subscription.findMany({
    where: {
      OR: [liveSubscriptionWhere(now), { status: SubscriptionStatus.FROZEN }],
      member: rosterMemberWhere(locationId),
    },
    orderBy: [{ currentPeriodEnd: 'desc' }, { id: 'asc' }],
    select: { memberId: true, planId: true, plan: { select: { name: true } } },
  });
  const seen = new Set<string>();
  const counts = new Map<string | null, { planId: string | null; name: string; count: number }>();
  for (const sub of subscriptions) {
    if (seen.has(sub.memberId)) continue;
    seen.add(sub.memberId);
    const slice = counts.get(sub.planId) ?? {
      planId: sub.planId,
      name: sub.planId === null ? 'No plan' : (sub.plan?.name ?? 'Deleted plan'),
      count: 0,
    };
    slice.count += 1;
    counts.set(sub.planId, slice);
  }
  const plans = [...counts.values()]
    .sort((a, b) => b.count - a.count || (a.planId ?? '').localeCompare(b.planId ?? ''))
    .map((slice, i) => ({ ...slice, color: PLAN_COLORS[i % PLAN_COLORS.length] ?? null }));
  return { total: seen.size, plans };
}
