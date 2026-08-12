import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@fit/db';
import { gymSettingsStoredSchema } from '@fit/types';
import type { GymBusinessSettings, GymLanguage, MergeValues } from '@fit/types';
import { money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import type { AutomationDispatchContext } from './automation-executor.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The gym-level facts a personalised message draws on. */
export interface AutomationBrand {
  name: string;
  business: GymBusinessSettings;
  language: GymLanguage;
  currency: string;
}

/** An ISO `YYYY-MM-DD` date, or an empty string when the value is absent. */
function isoDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/**
 * A subscription is "live" — the one whose plan and expiry a message should quote.
 * Mirrors `LIVE_SUBSCRIPTION_STATUSES` in the members service.
 */
const LIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
] as const;

/** The membership slice a personalised message needs. */
const MEMBER_SELECT = {
  id: true,
  status: true,
  joinedAt: true,
  dateOfBirth: true,
  user: { select: { name: true, email: true, phone: true } },
  subscriptions: {
    where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
    orderBy: { currentPeriodEnd: 'desc' },
    take: 1,
    select: {
      currentPeriodEnd: true,
      priceAmount: true,
      currency: true,
      plan: { select: { name: true } },
    },
  },
  _count: { select: { checkIns: true } },
} satisfies Prisma.GymMemberSelect;

type MemberRecord = Prisma.GymMemberGetPayload<{ select: typeof MEMBER_SELECT }>;

/** Who a fired rule's message is about, and the tokens to personalise it with. */
export interface AutomationMergeTarget {
  /** The recipient's email, or `null` when the member has no address on file. */
  recipient: string | null;
  /** Token values for {@link interpolateMergeFields}, keyed without braces. */
  values: MergeValues;
}

/**
 * Resolves the person a fired automation rule is about, and the merge values that
 * personalise their message.
 *
 * Reads through the **unscoped** Prisma client with an explicit `gymId`, because
 * the executor fires from the tenant-less nightly scan as well as inline in a
 * request — there is no `TenantContext` to lean on. Every lookup is constrained by
 * `gymId`, so an id belonging to another tenant simply resolves to `null` rather
 * than personalising one gym's email with another's member.
 *
 * Deliberately total and non-throwing: a rule that cannot be personalised should
 * skip its send and say so in the run log, never raise into the fire-and-forget
 * dispatch that member creation depends on.
 */
@Injectable()
export class AutomationMergeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The target of one dispatch, or `null` when the context names nothing this
   * service can personalise against — no entity, an entity type it does not
   * handle, or an id outside `gymId`.
   *
   * The two live dispatch paths are both covered: the `member_joined` trigger
   * passes a membership id, and the expiry scan passes a subscription id.
   */
  async resolve(
    gymId: string,
    context: AutomationDispatchContext,
    brand: AutomationBrand,
  ): Promise<AutomationMergeTarget | null> {
    const member = await this.loadMember(gymId, context);
    if (!member) return null;

    const points = await this.pointsBalance(gymId, member.id);
    return {
      recipient: member.user.email || null,
      values: this.mergeValues(member, brand, points),
    };
  }

  /**
   * The gym's name, contact details and locale — everything the `business_*`
   * tokens need plus the locale the money and dates are formatted in.
   *
   * Never throws for a missing or malformed settings blob: a gym that has never
   * opened the settings screen still gets a personalised email, just without the
   * contact lines it never filled in.
   */
  async brand(gymId: string): Promise<AutomationBrand> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: gymId },
      select: { name: true, settings: true },
    });
    const settings = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    return {
      name: gym?.name ?? '',
      business: settings.business,
      language: settings.locale.language,
      currency: settings.locale.currency,
    };
  }

  /**
   * The member's live points balance — the `balanceAfter` the loyalty ledger last
   * recorded, or `0` for a member who has never earned any. Read separately from
   * the membership because it is one indexed row, not a join worth widening
   * `MEMBER_SELECT` for.
   */
  private async pointsBalance(gymId: string, memberId: string): Promise<number> {
    const latest = await this.prisma.client.loyaltyLedgerEntry.findFirst({
      where: { gymId, memberId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    return latest?.balanceAfter ?? 0;
  }

  /** The membership a dispatch context points at, within `gymId`. */
  private async loadMember(
    gymId: string,
    context: AutomationDispatchContext,
  ): Promise<MemberRecord | null> {
    const { entityId, entityType } = context;
    if (!entityId) return null;

    if (entityType === 'member') {
      return this.prisma.client.gymMember.findFirst({
        where: { id: entityId, gymId, deletedAt: null },
        select: MEMBER_SELECT,
      });
    }

    if (entityType === 'subscription') {
      const subscription = await this.prisma.client.subscription.findFirst({
        where: { id: entityId, gymId },
        select: { memberId: true },
      });
      if (!subscription) return null;
      return this.prisma.client.gymMember.findFirst({
        where: { id: subscription.memberId, gymId, deletedAt: null },
        select: MEMBER_SELECT,
      });
    }

    return null;
  }

  /**
   * The token values for one member.
   *
   * Carries both the `{{member_*}}` automation tokens and the bare marketing
   * aliases that name the same facts (`{{first_name}}`, `{{full_name}}`, …), so a
   * body pasted from either editor personalises the same way. Its twin on the
   * marketing side is `buildMemberMergeValues` (`members/member-merge-values.ts`),
   * which the member email drawer sends through. The two now agree token for
   * token on the automation vocabulary — including `member_checkin_count` and
   * `member_points_balance`, which the drawer's caller feeds its resolver the
   * same way this service queries them here — so a rule body personalises
   * identically whichever pipeline sends it.
   *
   * Retired tokens (`RETIRED_MERGE_TOKENS`, `RETIRED_MARKETING_TOKENS` — the
   * `class_*` group and friends) are absent from both on purpose: no trigger can
   * back them, and `interpolateMergeFields` blanks a known token with no value, so
   * they vanish instead of reaching a member as literal braces.
   */
  private mergeValues(member: MemberRecord, brand: AutomationBrand, points: number): MergeValues {
    const fullName = (member.user.name ?? '').trim();
    const [firstName, ...rest] = fullName.length > 0 ? fullName.split(/\s+/) : [''];
    const first = firstName ?? '';
    const last = rest.join(' ');
    const subscription = member.subscriptions[0];
    const phone = member.user.phone ?? '';
    const planName = subscription?.plan?.name ?? '';
    const expiry = isoDate(subscription?.currentPeriodEnd);
    // Floor, so "1 day left" holds for the whole of the day before expiry rather
    // than rounding up to 2 in the morning and down to 0 after lunch.
    const daysLeft = subscription?.currentPeriodEnd
      ? String(
          Math.max(0, Math.floor((subscription.currentPeriodEnd.getTime() - Date.now()) / DAY_MS)),
        )
      : '';
    const price = subscription
      ? money(subscription.priceAmount, brand.language, subscription.currency)
      : '';

    return {
      // Bare marketing aliases, so a body written in either editor personalises.
      // One per marketing token that names a fact this resolver already holds —
      // an alias left out is not a visible `{{full_name}}` the staff can spot, it
      // is a blank in the member's inbox, because the marketing catalogue makes
      // every one of these a *known* key.
      first_name: first,
      last_name: last,
      full_name: fullName,
      email: member.user.email,
      phone,
      join_date: isoDate(member.joinedAt),
      birthday: isoDate(member.dateOfBirth),
      plan_name: planName,
      expiry_date: expiry,
      days_until_expiry: daysLeft,
      renewal_date: expiry,

      // The person.
      member_first_name: first,
      member_last_name: last,
      member_full_name: fullName,
      member_email: member.user.email,
      member_phone: phone,
      member_status: member.status,
      member_join_date: isoDate(member.joinedAt),
      member_birthday: isoDate(member.dateOfBirth),
      member_checkin_count: String(member._count.checkIns),
      member_points_balance: String(points),

      // Their membership.
      member_plan_name: planName,
      member_expiry_date: expiry,
      member_days_until_expiry: daysLeft,
      payment_amount: price,
      payment_due_date: expiry,

      // The gym.
      business_name: brand.name,
      business_phone: brand.business.phone ?? '',
      business_address: brand.business.address ?? '',
      business_email: brand.business.email ?? '',
      business_website: brand.business.website ?? '',
    };
  }
}
