import { Injectable } from '@nestjs/common';
import type { AutomationConditionFacts } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86400000;
export function ageAt(birthday: Date | null, now: Date): number | null {
  if (!birthday) return null;
  let age = now.getUTCFullYear() - birthday.getUTCFullYear();
  if (
    now.getUTCMonth() < birthday.getUTCMonth() ||
    (now.getUTCMonth() === birthday.getUTCMonth() && now.getUTCDate() < birthday.getUTCDate())
  )
    age--;
  return age;
}

@Injectable()
export class AutomationFactsService {
  constructor(private readonly prisma: PrismaService) {}

  async loadConditionFacts(
    gymId: string,
    memberId: string,
    now = new Date(),
  ): Promise<AutomationConditionFacts | null> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { gymId, id: memberId, deletedAt: null },
      select: {
        gender: true,
        dateOfBirth: true,
        status: true,
        kindOverride: true,
        locationId: true,
        tags: true,
        joinedAt: true,
      },
    });
    if (!member) return null;
    const [subscription, everSubscribed, lastCheckin, checkinCount] = await Promise.all([
      this.prisma.client.subscription.findFirst({
        where: { gymId, memberId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'FROZEN'] } },
        orderBy: { currentPeriodEnd: 'desc' },
        select: { planId: true, status: true, currentPeriodEnd: true },
      }),
      this.prisma.client.subscription.findFirst({
        where: { gymId, memberId },
        select: { id: true },
      }),
      this.prisma.client.checkIn.findFirst({
        where: { gymId, gymMemberId: memberId },
        orderBy: { checkedInAt: 'desc' },
        select: { checkedInAt: true },
      }),
      this.prisma.client.checkIn.count({ where: { gymId, gymMemberId: memberId } }),
    ]);
    return {
      member_gender: member.gender,
      member_age: ageAt(member.dateOfBirth, now),
      member_status: member.status,
      member_kind:
        member.kindOverride ?? (subscription ? 'MEMBER' : everSubscribed ? 'INACTIVE' : 'GUEST'),
      member_branch: member.locationId,
      member_tags: member.tags,
      member_joined_days_ago: Math.floor((now.getTime() - member.joinedAt.getTime()) / DAY_MS),
      member_last_checkin_days_ago: lastCheckin
        ? Math.floor((now.getTime() - lastCheckin.checkedInAt.getTime()) / DAY_MS)
        : null,
      member_checkin_count: checkinCount,
      subscription_plan: subscription?.planId ?? null,
      subscription_status: subscription?.status ?? null,
      subscription_days_until_expiry: subscription
        ? Math.floor((subscription.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS)
        : null,
    };
  }
}
