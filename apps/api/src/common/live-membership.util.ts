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

/**
 * A FROZEN member: not suspended, holding a FROZEN subscription, and with no
 * membership in force (an in-force one makes them active instead, so the two
 * populations never overlap). `active + frozen` is the console's "paying members".
 * A frozen membership keeps its slot even past its period end: resuming extends it.
 */
export function frozenMemberWhere(now: Date, locationId?: string): Prisma.GymMemberWhereInput {
  return {
    ...rosterMemberWhere(locationId),
    status: { not: GymMemberStatus.SUSPENDED },
    subscriptions: { some: { status: SubscriptionStatus.FROZEN } },
    NOT: { status: GymMemberStatus.ACTIVE, subscriptions: { some: liveSubscriptionWhere(now) } },
  };
}

const PLAN_COLORS = ['#7C3AED', '#EC4899', '#2563EB', '#0EA5E9', '#10B981', '#F59E0B'];

/** Shared dashboard/roster paying-member mix: the ACTIVE members of
 * {@link activeMemberWhere} plus the FROZEN members of {@link frozenMemberWhere},
 * one person each. An active person is assigned to the plan of their in-force
 * membership (latest-ending first, id breaks ties); a frozen person to their
 * frozen one. So `total === active + frozen` and the slices sum to `total`.
 * A subscription whose period is over is not in force whatever its status says;
 * a suspended account is neither active nor frozen. */
export async function membershipPlanMix(
  db: TenantPrismaService['client'],
  locationId?: string,
  now = new Date(),
) {
  const subscriptions = await db.subscription.findMany({
    where: {
      member: rosterMemberWhere(locationId),
      OR: [
        { ...liveSubscriptionWhere(now), member: { status: GymMemberStatus.ACTIVE } },
        {
          status: SubscriptionStatus.FROZEN,
          member: { status: { not: GymMemberStatus.SUSPENDED } },
        },
      ],
    },
    orderBy: [{ currentPeriodEnd: 'desc' }, { id: 'asc' }],
    select: {
      memberId: true,
      planId: true,
      status: true,
      plan: { select: { name: true } },
    },
  });
  const seen = new Set<string>();
  const counts = new Map<string | null, { planId: string | null; name: string; count: number }>();
  let active = 0;
  let frozen = 0;
  // In-force rows first, so a person holding both an in-force and a frozen
  // membership counts once, as active.
  const inForce = subscriptions.filter((sub) => sub.status !== SubscriptionStatus.FROZEN);
  const frozenRows = subscriptions.filter((sub) => sub.status === SubscriptionStatus.FROZEN);
  for (const [rows, isFrozen] of [
    [inForce, false],
    [frozenRows, true],
  ] as const) {
    for (const sub of rows) {
      if (seen.has(sub.memberId)) continue;
      seen.add(sub.memberId);
      if (isFrozen) frozen += 1;
      else active += 1;
      const slice = counts.get(sub.planId) ?? {
        planId: sub.planId,
        name: sub.planId === null ? 'No plan' : (sub.plan?.name ?? 'Deleted plan'),
        count: 0,
      };
      slice.count += 1;
      counts.set(sub.planId, slice);
    }
  }
  const plans = [...counts.values()]
    .sort((a, b) => b.count - a.count || (a.planId ?? '').localeCompare(b.planId ?? ''))
    .map((slice, i) => ({ ...slice, color: PLAN_COLORS[i % PLAN_COLORS.length] ?? null }));
  return { total: seen.size, plans, active, frozen };
}
