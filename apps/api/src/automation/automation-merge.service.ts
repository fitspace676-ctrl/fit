import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@fit/db';
import {
  AUTOMATION_MERGE_FIELDS,
  GYM_RECIPIENT_TRIGGERS,
  gymSettingsStoredSchema,
  mergeFieldNames,
} from '@fit/types';
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

/** Primary token name (no braces) -> every name it answers to: itself plus aliases. */
const MERGE_NAMES = new Map<string, readonly string[]>(
  AUTOMATION_MERGE_FIELDS.map((field) => [mergeFieldNames(field)[0] ?? '', mergeFieldNames(field)]),
);

/** Every catalogue token and alias, blank: a token no source fills reads as ''. */
const BLANK_CATALOG: MergeValues = Object.fromEntries(
  AUTOMATION_MERGE_FIELDS.flatMap(mergeFieldNames).map((name) => [name, '']),
);

/** Set `value` under `token` and every alias of it, so old and new names agree. */
function setAll(values: MergeValues, token: string, value: string): void {
  for (const name of MERGE_NAMES.get(token) ?? [token]) values[name] = value;
}

/** Expand a record keyed by primary token names to every alias as well. */
function withAliases(primary: MergeValues): MergeValues {
  const values: MergeValues = {};
  for (const [token, value] of Object.entries(primary)) setAll(values, token, value);
  return values;
}

/** Who cancelled a PT session, in the gym's language; an unknown code blanks. */
const CANCELLED_BY_LABELS: Record<string, Record<string, string>> = {
  en: { member: 'member', trainer: 'trainer' },
  ka: { member: 'წევრი', trainer: 'მწვრთნელი' },
};

function cancelledByLabel(code: string, language: GymLanguage): string {
  const labels = CANCELLED_BY_LABELS[language] ?? CANCELLED_BY_LABELS.en;
  return labels?.[code] ?? '';
}

/** Whole days from `from` to `to`, floored and never negative. */
function wholeDays(from: Date, to: Date): string {
  return String(Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS)));
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
  user: { select: { id: true, name: true, email: true, phone: true } },
  subscriptions: {
    where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
    orderBy: { currentPeriodEnd: 'desc' },
    take: 1,
    select: {
      currentPeriodEnd: true,
      currentPeriodStart: true,
      frozenUntil: true,
      frozenAt: true,
      canceledAt: true,
      status: true,
      priceAmount: true,
      currency: true,
      plan: { select: { name: true } },
    },
  },
  _count: { select: { checkIns: true } },
} satisfies Prisma.GymMemberSelect;

type MemberRecord = Prisma.GymMemberGetPayload<{ select: typeof MEMBER_SELECT }>;
type SubscriptionRecord = MemberRecord['subscriptions'][number];

/** The staff member a trainer-recipient rule addresses. */
interface StaffRecipient {
  name: string;
  email: string | null;
  userId: string | null;
}

/** Who a fired rule's message is about, and the tokens to personalise it with. */
export interface AutomationMergeTarget {
  /**
   * The recipient's email, or `null` when there is no address on file — the
   * member's for a member trigger, the gym's business email for a gym-recipient
   * trigger (`product_stock_low`).
   */
  recipient: string | null;
  /** The member the message is about; `null` for a gym-recipient trigger. */
  memberId: string | null;
  /** The recipient's User id (for push); `null` when there is no account. */
  userId: string | null;
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
    if (context.triggerType && GYM_RECIPIENT_TRIGGERS.has(context.triggerType)) {
      return this.resolveGym(gymId, context, brand);
    }
    const member = await this.loadMember(gymId, context);
    if (!member) return null;

    const now = context.now ?? new Date();
    const points = await this.pointsBalance(gymId, member.id);
    const values: MergeValues = {
      ...BLANK_CATALOG,
      ...this.mergeValues(member, brand, points, now),
      ...withAliases(await this.contextValues(gymId, context, brand, now)),
      ...this.extraValues(context, brand),
    };

    if (context.recipient !== 'trainer') {
      return {
        recipient: member.user.email || null,
        memberId: member.id,
        userId: member.user.id,
        values,
      };
    }
    // A trainer-recipient rule: the message goes to the class / session's
    // trainer, but it is still about the member, so the member tokens stay.
    const staff = await this.resolveStaff(gymId, context);
    values.recipient_name = staff?.name ?? '';
    return {
      recipient: staff?.email ?? null,
      memberId: member.id,
      userId: staff?.userId ?? null,
      values,
    };
  }

  /**
   * The dispatcher's and the rule's own values (`cancelled_by`, the offer
   * tokens). `cancelled_by` arrives as a code and is shown in the gym's language.
   */
  private extraValues(context: AutomationDispatchContext, brand: AutomationBrand): MergeValues {
    const extra: MergeValues = { ...context.extraValues };
    if (extra.cancelled_by !== undefined) {
      extra.cancelled_by = cancelledByLabel(extra.cancelled_by, brand.language);
    }
    return extra;
  }

  /**
   * The trainer a booking or PT session belongs to, within `gymId`: the class
   * instance's trainer (or its template's) for a booking, the session's staff
   * member for a PT session. `email` / `userId` are null when the trainer has no
   * staff account to reach; the whole result is null when there is no trainer.
   */
  private async resolveStaff(
    gymId: string,
    context: AutomationDispatchContext,
  ): Promise<StaffRecipient | null> {
    const id = context.entityId;
    if (!id) return null;
    if (context.entityType === 'booking') {
      const booking = await this.prisma.client.booking.findFirst({
        where: { id, gymId },
        select: { classInstanceId: true },
      });
      if (!booking) return null;
      const instance = await this.prisma.client.classInstance.findFirst({
        where: { id: booking.classInstanceId, gymId },
        select: { trainerId: true, template: { where: { gymId }, select: { trainerId: true } } },
      });
      const trainerId = instance?.trainerId ?? instance?.template?.trainerId;
      if (!trainerId) return null;
      const trainer = await this.prisma.client.trainer.findFirst({
        where: { id: trainerId, gymId },
        select: { name: true, staffId: true },
      });
      if (!trainer) return null;
      const staff = trainer.staffId ? await this.loadStaff(gymId, trainer.staffId) : null;
      return {
        name: trainer.name,
        email: staff?.user.email || null,
        userId: staff?.user.id ?? null,
      };
    }
    if (context.entityType === 'service_session') {
      const session = await this.prisma.client.serviceSession.findFirst({
        where: { id, gymId },
        select: { staffId: true },
      });
      const staff = session ? await this.loadStaff(gymId, session.staffId) : null;
      if (!staff) return null;
      return {
        name: staffName(staff),
        email: staff.user.email || null,
        userId: staff.user.id,
      };
    }
    return null;
  }

  /** A staff membership and its account, within `gymId`. */
  private loadStaff(gymId: string, staffId: string) {
    return this.prisma.client.gymMember.findFirst({
      where: { id: staffId, gymId, deletedAt: null },
      select: {
        firstName: true,
        lastName: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * The target of a gym-recipient trigger (`product_stock_low`): the message goes
   * to the gym's own business email, not the buyer. Only the `business_*` and
   * `order_*` tokens are filled — `order_items` names the product that ran low —
   * so every `member_*` token blanks rather than leaking the buyer into a staff
   * email. An order id outside `gymId` resolves to `null`, like any other entity.
   */
  private async resolveGym(
    gymId: string,
    context: AutomationDispatchContext,
    brand: AutomationBrand,
  ): Promise<AutomationMergeTarget | null> {
    let orderValues: MergeValues = {};
    if (context.entityId) {
      if (context.entityType !== 'order') return null;
      orderValues = withAliases(
        await this.contextValues(gymId, context, brand, context.now ?? new Date()),
      );
      if (Object.keys(orderValues).length === 0) return null;
    }
    return {
      recipient: brand.business.email?.trim() || null,
      memberId: null,
      userId: null,
      values: { ...this.businessValues(brand), ...orderValues },
    };
  }

  /** The `business_*` tokens — the gym's own name and contact details. */
  private businessValues(brand: AutomationBrand): MergeValues {
    return {
      business_name: brand.name,
      business_phone: brand.business.phone ?? '',
      business_address: brand.business.address ?? '',
      business_email: brand.business.email ?? '',
      business_website: brand.business.website ?? '',
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

  /**
   * The values the triggering entity carries, keyed by primary token name
   * ({@link withAliases} spreads them to the aliases). Every lookup is held to
   * `gymId`; an entity outside it yields `{}`.
   */
  private async contextValues(
    gymId: string,
    context: AutomationDispatchContext,
    brand: AutomationBrand,
    now: Date,
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
      return {
        ...this.subscriptionValues(sub, brand, now),
        cancellation_date: isoDate(sub.canceledAt),
        // Not stored anywhere yet; the token stays known so it blanks cleanly.
        cancellation_reason: '',
      };
    }
    if (context.entityType === 'booking') return this.bookingValues(gymId, context.entityId);
    if (context.entityType === 'invoice') {
      const invoice = await this.prisma.client.invoice.findFirst({
        where,
        select: {
          number: true,
          amount: true,
          currency: true,
          issuedAt: true,
          dueDate: true,
          orderId: true,
        },
      });
      if (!invoice) return {};
      const [payment, refund] = invoice.orderId
        ? await Promise.all([
            this.prisma.client.payment.findFirst({
              where: { orderId: invoice.orderId, gymId },
              select: { method: true },
            }),
            this.latestRefund(gymId, invoice.orderId),
          ])
        : [null, null];
      return {
        invoice_number: invoice.number,
        amount: money(invoice.amount, brand.language, invoice.currency),
        payment_date: isoDate(invoice.issuedAt),
        due_date: isoDate(invoice.dueDate),
        payment_method: payment?.method.toLowerCase() ?? '',
        // Failed charges keep no reason on the invoice yet.
        failure_reason: '',
        refund_amount: refund ? money(refund.amount, brand.language, invoice.currency) : '',
        refund_date: isoDate(refund?.createdAt),
      };
    }
    if (context.entityType === 'order') {
      const order = await this.prisma.client.order.findFirst({
        where,
        select: {
          id: true,
          total: true,
          currency: true,
          createdAt: true,
          items: { select: { label: true, qty: true } },
          invoices: {
            where: { gymId },
            orderBy: { issuedAt: 'asc' },
            take: 1,
            select: { number: true },
          },
        },
      });
      if (!order) return {};
      const refund = await this.latestRefund(gymId, order.id);
      return {
        order_total: money(order.total, brand.language, order.currency),
        order_items: order.items.map((item) => `${item.label} × ${item.qty}`).join(', '),
        product_name: order.items.map((item) => item.label).join(', '),
        // Orders carry no number of their own; the invoice raised for one does.
        order_number: order.invoices[0]?.number ?? '',
        purchase_date: isoDate(order.createdAt),
        refund_amount: refund ? money(refund.amount, brand.language, order.currency) : '',
        refund_date: isoDate(refund?.createdAt),
      };
    }
    if (context.entityType === 'service_session') {
      const session = await this.prisma.client.serviceSession.findFirst({
        where,
        select: {
          startsAt: true,
          serviceId: true,
          staffId: true,
          location: { select: { gymId: true, name: true } },
        },
      });
      if (!session) return {};
      const [service, staff] = await Promise.all([
        this.prisma.client.service.findFirst({
          where: { id: session.serviceId, gymId },
          select: { name: true },
        }),
        this.loadStaff(gymId, session.staffId),
      ]);
      return {
        session_type: service?.name ?? '',
        session_date: isoDate(session.startsAt),
        session_time: session.startsAt.toISOString().slice(11, 16),
        trainer_name: staff ? staffName(staff) : '',
        location: session.location?.gymId === gymId ? session.location.name : '',
      };
    }
    return {};
  }

  /** The class a booking is for: its name, time, trainer, place and fill. */
  private async bookingValues(gymId: string, bookingId: string): Promise<MergeValues> {
    const booking = await this.prisma.client.booking.findFirst({
      where: { id: bookingId, gymId },
      select: { classInstanceId: true, waitlistPosition: true },
    });
    if (!booking) return {};
    const instance = await this.prisma.client.classInstance.findFirst({
      where: { id: booking.classInstanceId, gymId },
      select: {
        startsAt: true,
        bookedCount: true,
        capacityOverride: true,
        template: {
          where: { gymId },
          select: {
            title: true,
            capacity: true,
            trainer: { where: { gymId }, select: { name: true } },
            location: { select: { gymId: true, name: true } },
          },
        },
        classType: { where: { gymId }, select: { name: true, capacity: true } },
        trainer: { where: { gymId }, select: { name: true } },
        location: { where: { gymId }, select: { name: true } },
      },
    });
    if (!instance) return {};
    const className = instance.classType?.name ?? instance.template?.title ?? '';
    const classDate = isoDate(instance.startsAt);
    const capacity =
      instance.capacityOverride ?? instance.template?.capacity ?? instance.classType?.capacity;
    return {
      class_name: className,
      class_date: classDate,
      class_time: instance.startsAt.toISOString().slice(11, 16),
      trainer_name: instance.trainer?.name ?? instance.template?.trainer?.name ?? '',
      location:
        instance.location?.name ??
        (instance.template?.location.gymId === gymId ? instance.template.location.name : ''),
      waitlist_position: booking.waitlistPosition === null ? '' : String(booking.waitlistPosition),
      spots_filled: String(instance.bookedCount),
      spots_total: capacity === undefined ? '' : String(capacity),
      missed_class_name: className,
      missed_class_date: classDate,
    };
  }

  /** The most recent refund against an order, within `gymId`. */
  private latestRefund(gymId: string, orderId: string) {
    return this.prisma.client.refund.findFirst({
      where: { orderId, gymId },
      orderBy: { createdAt: 'desc' },
      select: { amount: true, createdAt: true },
    });
  }

  /**
   * The membership tokens for one subscription (or blanks without one), keyed
   * by primary token name. Shared by the member's live subscription and the
   * subscription a trigger names, so both quote it the same way.
   */
  private subscriptionValues(
    subscription: SubscriptionRecord | undefined,
    brand: AutomationBrand,
    now: Date,
  ): MergeValues {
    const expiry = isoDate(subscription?.currentPeriodEnd);
    const price = subscription
      ? money(subscription.priceAmount, brand.language, subscription.currency)
      : '';
    return {
      membership_plan: subscription?.plan?.name ?? '',
      expiry_date: expiry,
      // Floor, so "1 day left" holds for the whole of the day before expiry rather
      // than rounding up to 2 in the morning and down to 0 after lunch.
      days_remaining: subscription?.currentPeriodEnd
        ? wholeDays(now, subscription.currentPeriodEnd)
        : '',
      payment_amount: price,
      plan_price: price,
      renewal_date: expiry,
      member_subscription_status: subscription?.status ?? '',
      member_period_start: isoDate(subscription?.currentPeriodStart),
      freeze_end_date: isoDate(subscription?.frozenUntil),
      freeze_start_date: isoDate(subscription?.frozenAt),
      access_end_date: expiry,
    };
  }

  /**
   * The token values for one member, under every name the catalogue gives them
   * (`{{first_name}}` and `{{member_first_name}}` alike), so a body written with
   * either the current or an older token personalises the same way. Its twin on
   * the marketing side is `buildMemberMergeValues` (`members/member-merge-values.ts`).
   *
   * Retired tokens (`RETIRED_MERGE_TOKENS`) are absent on purpose:
   * `interpolateMergeFields` blanks a known token with no value, so they vanish
   * instead of reaching a member as literal braces.
   */
  private mergeValues(
    member: MemberRecord,
    brand: AutomationBrand,
    points: number,
    now: Date,
  ): MergeValues {
    const fullName = (member.user.name ?? '').trim();
    const [firstName, ...rest] = fullName.length > 0 ? fullName.split(/\s+/) : [''];
    const lastCheckIn = member.checkIns[0]?.checkedInAt;

    return withAliases({
      // The person.
      first_name: firstName ?? '',
      last_name: rest.join(' '),
      full_name: fullName,
      email: member.user.email,
      phone: member.user.phone ?? '',
      member_status: member.status,
      member_since: isoDate(member.joinedAt),
      member_birthday: isoDate(member.dateOfBirth),
      member_checkin_count: String(member._count.checkIns),
      member_points_balance: String(points),
      member_gender: member.gender ?? '',
      member_age: String(ageAt(member.dateOfBirth, now) ?? ''),
      member_tags: member.tags.join(', '),
      branch_name: member.location?.name ?? '',
      member_branch_address: member.location?.address ?? '',
      member_branch_phone: member.location?.phone ?? '',
      last_checkin_date: isoDate(lastCheckIn),
      // Days since the last visit, or since joining for someone never seen.
      days_inactive: wholeDays(lastCheckIn ?? member.joinedAt, now),

      // Their membership.
      ...this.subscriptionValues(member.subscriptions[0], brand, now),

      // Who gets it (the member, unless the rule addresses the trainer) and who
      // it is about.
      recipient_name: fullName,
      related_member_name: fullName,

      // The gym.
      ...this.businessValues(brand),
    });
  }
}

/** A staff member's display name: profile name first, account name second. */
function staffName(staff: {
  firstName: string | null;
  lastName: string | null;
  user: { name: string | null };
}): string {
  return [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.user.name || '';
}
