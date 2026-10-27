import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@fit/db';
import { gymSettingsStoredSchema } from '@fit/types';
import type { GymBusinessSettings, GymLanguage, MergeValues } from '@fit/types';
import { money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import type { AutomationDispatchContext } from './automation-executor.service';

import { ageAt } from './automation-facts.service';

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
  gender: true,
  tags: true,
  location: { select: { name: true, address: true, phone: true } },
  checkIns: { orderBy: { checkedInAt: 'desc' }, take: 1, select: { checkedInAt: true } },
  user: { select: { name: true, email: true, phone: true } },
  subscriptions: {
    where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
    orderBy: { currentPeriodEnd: 'desc' },
    take: 1,
    select: {
      currentPeriodEnd: true,
      currentPeriodStart: true,
      frozenUntil: true,
      status: true,
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
  memberId: string;
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
      memberId: member.id,
      values: {
        ...this.mergeValues(member, brand, points),
        ...(await this.contextValues(gymId, context, brand)),
      },
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
    const memberId = await this.resolveMemberId(gymId, context);
    if (!memberId) return null;
    return this.prisma.client.gymMember.findFirst({
      where: { id: memberId, gymId, deletedAt: null },
      select: {
        ...MEMBER_SELECT,
        location: { where: { gymId }, select: MEMBER_SELECT.location.select },
        subscriptions: {
          ...MEMBER_SELECT.subscriptions,
          where: { ...MEMBER_SELECT.subscriptions.where, gymId },
          select: {
            ...MEMBER_SELECT.subscriptions.select,
            plan: { where: { gymId }, select: { name: true } },
          },
        },
        checkIns: { ...MEMBER_SELECT.checkIns, where: { gymId } },
        _count: { select: { checkIns: { where: { gymId } } } },
      },
    });
  }

  /** Resolve the member independently of email/brand for condition evaluation. */
  async resolveMemberId(gymId: string, context: AutomationDispatchContext): Promise<string | null> {
    const { entityId: id, entityType } = context;
    if (!id) return null;
    if (entityType === 'member') return id;
    const where = { id, gymId };
    const select = { memberId: true };
    switch (entityType) {
      case 'subscription':
        return (
          (await this.prisma.client.subscription.findFirst({ where, select }))?.memberId ?? null
        );
      case 'booking':
        return (await this.prisma.client.booking.findFirst({ where, select }))?.memberId ?? null;
      case 'order':
        return (await this.prisma.client.order.findFirst({ where, select }))?.memberId ?? null;
      case 'service_session':
        return (
          (await this.prisma.client.serviceSession.findFirst({ where, select }))?.memberId ?? null
        );
      case 'invoice': {
        const invoice = await this.prisma.client.invoice.findFirst({
          where,
          select: { memberId: true, subscriptionId: true },
        });
        if (invoice?.memberId) return invoice.memberId;
        return invoice?.subscriptionId
          ? ((
              await this.prisma.client.subscription.findFirst({
                where: { id: invoice.subscriptionId, gymId },
                select,
              })
            )?.memberId ?? null)
          : null;
      }
      default:
        return null;
    }
  }

  private async contextValues(
    gymId: string,
    context: AutomationDispatchContext,
    brand: AutomationBrand,
  ): Promise<MergeValues> {
    if (!context.entityId) return {};
    const where = { id: context.entityId, gymId };
    if (context.entityType === 'subscription') {
      const sub = await this.prisma.client.subscription.findFirst({
        where,
        select: {
          ...MEMBER_SELECT.subscriptions.select,
          plan: { where: { gymId }, select: { name: true } },
        },
      });
      if (!sub?.currentPeriodEnd) return {};
      const price = money(sub.priceAmount, brand.language, sub.currency);
      return {
        member_plan_name: sub.plan?.name ?? '',
        member_expiry_date: isoDate(sub.currentPeriodEnd),
        member_days_until_expiry: String(
          Math.max(0, Math.floor((sub.currentPeriodEnd.getTime() - Date.now()) / DAY_MS)),
        ),
        payment_amount: price,
        member_plan_price: price,
        payment_due_date: isoDate(sub.currentPeriodEnd),
        member_subscription_status: sub.status,
        member_period_start: isoDate(sub.currentPeriodStart),
        member_frozen_until: isoDate(sub.frozenUntil),
        plan_name: sub.plan?.name ?? '',
        expiry_date: isoDate(sub.currentPeriodEnd),
        renewal_date: isoDate(sub.currentPeriodEnd),
      };
    }
    if (context.entityType === 'booking') {
      const booking = await this.prisma.client.booking.findFirst({
        where,
        select: { classInstanceId: true },
      });
      if (!booking) return {};
      const instance = await this.prisma.client.classInstance.findFirst({
        where: { id: booking.classInstanceId, gymId },
        select: {
          startsAt: true,
          template: {
            where: { gymId },
            select: {
              title: true,
              trainer: { where: { gymId }, select: { name: true } },
              location: { select: { gymId: true, name: true } },
            },
          },
          classType: { where: { gymId }, select: { name: true } },
          trainer: { where: { gymId }, select: { name: true } },
          location: { where: { gymId }, select: { name: true } },
        },
      });
      if (!instance) return {};
      return {
        class_name: instance.classType?.name ?? instance.template?.title ?? '',
        class_date: isoDate(instance.startsAt),
        class_time: instance.startsAt.toISOString().slice(11, 16),
        class_trainer_name: instance.trainer?.name ?? instance.template?.trainer?.name ?? '',
        class_location:
          instance.location?.name ??
          (instance.template?.location.gymId === gymId ? instance.template.location.name : ''),
      };
    }
    if (context.entityType === 'invoice') {
      const invoice = await this.prisma.client.invoice.findFirst({
        where,
        select: { number: true, amount: true, currency: true, issuedAt: true },
      });
      return invoice
        ? {
            invoice_number: invoice.number,
            invoice_amount: money(invoice.amount, brand.language, invoice.currency),
            invoice_date: isoDate(invoice.issuedAt),
          }
        : {};
    }
    if (context.entityType === 'order') {
      const order = await this.prisma.client.order.findFirst({
        where,
        select: { total: true, currency: true, items: { select: { label: true, qty: true } } },
      });
      return order
        ? {
            order_total: money(order.total, brand.language, order.currency),
            order_items: order.items.map((item) => `${item.label} × ${item.qty}`).join(', '),
          }
        : {};
    }
    if (context.entityType === 'service_session') {
      const session = await this.prisma.client.serviceSession.findFirst({
        where,
        select: { startsAt: true, serviceId: true, staffId: true },
      });
      if (!session) return {};
      const [service, staff] = await Promise.all([
        this.prisma.client.service.findFirst({
          where: { id: session.serviceId, gymId },
          select: { name: true },
        }),
        this.prisma.client.gymMember.findFirst({
          where: { id: session.staffId, gymId, deletedAt: null },
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        }),
      ]);
      return {
        session_name: service?.name ?? '',
        session_date: isoDate(session.startsAt),
        session_time: session.startsAt.toISOString().slice(11, 16),
        session_trainer_name:
          [staff?.firstName, staff?.lastName].filter(Boolean).join(' ') || staff?.user.name || '',
      };
    }
    return {};
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
      member_gender: member.gender ?? '',
      member_age: String(ageAt(member.dateOfBirth, new Date()) ?? ''),
      member_tags: member.tags.join(', '),
      member_branch_name: member.location?.name ?? '',
      member_branch_address: member.location?.address ?? '',
      member_branch_phone: member.location?.phone ?? '',
      member_last_checkin_date: isoDate(member.checkIns[0]?.checkedInAt),

      // Their membership.
      member_plan_name: planName,
      member_expiry_date: expiry,
      member_days_until_expiry: daysLeft,
      payment_amount: price,
      member_plan_price: price,
      member_subscription_status: subscription?.status ?? '',
      member_period_start: isoDate(subscription?.currentPeriodStart),
      member_frozen_until: isoDate(subscription?.frozenUntil),
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
