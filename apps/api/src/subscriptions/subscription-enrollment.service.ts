import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LIVE_SUBSCRIPTION_STATUSES,
  Prisma,
  SubscriptionPlanStatus,
  SubscriptionStatus,
  initialBillingPeriod,
} from '@fit/db';
import type { EnrolledSubscription, EnrollSubscriptionResponse } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The columns projected off a created {@link Subscription} for the enrolment response. */
const ENROLLED_SUBSCRIPTION_SELECT = {
  id: true,
  status: true,
  planId: true,
  priceAmount: true,
  currency: true,
  interval: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  createdAt: true,
  plan: { select: { name: true } },
} satisfies Prisma.SubscriptionSelect;

type EnrolledSubscriptionRecord = Prisma.SubscriptionGetPayload<{
  select: typeof ENROLLED_SUBSCRIPTION_SELECT;
}>;

/**
 * Subscription enrolment — the missing core that turns a {@link SubscriptionPlan}
 * into a member's live {@link Subscription} (T5.3). Before this, only the seed ever
 * created a subscription row; the freeze/renewal/billing flows all assumed one into
 * existence.
 *
 * One service backs both enrolment entry points so the invariants live in exactly
 * one place: the member self-checkout (`POST /subscriptions`, {@link enrollSelf})
 * and the staff-initiated enrolment (`POST /admin/subscriptions/enroll`,
 * {@link enrollMember}). Both run on the **tenant-scoped** {@link TenantPrismaService}
 * — every `subscription` / `subscriptionPlan` / `gymMember` query is auto-constrained
 * to the caller's gym — and additionally stamp `gymId` explicitly on the write, so a
 * cross-tenant plan or member can never be enrolled and the created row can never
 * escape its tenant.
 *
 * Enrolment is proration-free: the member pays for a whole period starting now, and
 * `currentPeriodStart` / `currentPeriodEnd` are computed from the plan's interval by
 * the shared {@link initialBillingPeriod} the recurring-billing job (T5.4) also
 * advances by, so the period cadence never drifts between enrolment and renewal.
 * The plan's `priceAmount` / `currency` / `interval` are snapshotted onto the
 * subscription (the buyer's agreed terms), so a later plan edit never re-prices an
 * active subscriber.
 *
 * The charge itself is a **stub** at this stage: the subscription is stamped
 * `provider = "stub"` (the model default) rather than settling a real payment. A
 * recurring-billing {@link Payment} is order-bound in the schema and belongs to the
 * payment-provider hardening + renewal-job work (T5.11 / T5.4) that depends on this
 * task; recording one here would mean minting a synthetic order, which is out of
 * scope and inconsistent with how `GET /me/subscription` already reports an empty
 * invoice history until real billing lands.
 */
@Injectable()
export class SubscriptionEnrollmentService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Enrol the **calling member** on `planId` (member self-checkout,
   * `POST /subscriptions`). The member is resolved from the session — never a
   * member id on the wire — mirroring {@link SubscriptionFreezeService}. Fails with
   * `403` when there is no member session / the caller is not a member of this gym,
   * and shares enrolment's `404` / `409` failure modes (see {@link enroll}).
   */
  async enrollSelf(planId: string): Promise<EnrollSubscriptionResponse> {
    const memberId = await this.requireCallerMembership();
    return this.enroll(memberId, planId);
  }

  /**
   * Enrol a **specific member** on `planId` (staff console,
   * `POST /admin/subscriptions/enroll`). `memberId` is validated to belong to the
   * caller's gym (the scoped `gymMember` lookup makes a cross-tenant id a `404
   * MEMBER_NOT_FOUND`) before enrolling. Shares enrolment's `404` / `409` failure
   * modes (see {@link enroll}).
   */
  async enrollMember(memberId: string, planId: string): Promise<EnrollSubscriptionResponse> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({
        message: 'Member not found',
        code: 'MEMBER_NOT_FOUND',
      });
    }
    return this.enroll(member.id, planId);
  }

  /**
   * Create a live {@link Subscription} for `memberId` from `planId`, in a single
   * interactive transaction so the "does this member already have a live
   * subscription?" read and the insert stay consistent under concurrency.
   *
   * Failure modes: `404 SUBSCRIPTION_PLAN_NOT_FOUND` (unknown / cross-tenant plan),
   * `409 SUBSCRIPTION_PLAN_INACTIVE` (a deactivated plan may not be enrolled on),
   * and `409 ALREADY_SUBSCRIBED` (the member already holds a live —
   * `ACTIVE`/`PAST_DUE`/`FROZEN` — subscription; one live membership per member per
   * gym). The last is enforced both by the pre-check here and, as the ultimate
   * guard against a race, by the partial unique index on
   * `(gymId, memberId) WHERE status IN (live)` — a concurrent second enrolment
   * hits it and is mapped to the same `409`.
   */
  private async enroll(memberId: string, planId: string): Promise<EnrollSubscriptionResponse> {
    const gymId = this.tenant.gymId;
    if (!gymId) {
      throw new ForbiddenException({
        message: 'Tenant scope is required to enrol a subscription',
        code: 'TENANT_CONTEXT_MISSING',
      });
    }

    const row = await this.prisma.client.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findFirst({
        where: { id: planId },
        select: {
          id: true,
          status: true,
          priceAmount: true,
          currency: true,
          interval: true,
        },
      });
      if (!plan) {
        throw new NotFoundException({
          message: 'Subscription plan not found',
          code: 'SUBSCRIPTION_PLAN_NOT_FOUND',
        });
      }
      if (plan.status === SubscriptionPlanStatus.INACTIVE) {
        throw new ConflictException({
          message: 'This subscription plan is not available for enrolment',
          code: 'SUBSCRIPTION_PLAN_INACTIVE',
        });
      }

      const existingLive = await tx.subscription.findFirst({
        where: { memberId, status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
        select: { id: true },
      });
      if (existingLive) {
        throw this.alreadySubscribed();
      }

      const { currentPeriodStart, currentPeriodEnd } = initialBillingPeriod(
        new Date(),
        plan.interval,
      );

      try {
        return await tx.subscription.create({
          data: {
            gymId,
            planId: plan.id,
            memberId,
            status: SubscriptionStatus.ACTIVE,
            priceAmount: plan.priceAmount,
            currency: plan.currency,
            interval: plan.interval,
            currentPeriodStart,
            currentPeriodEnd,
          },
          select: ENROLLED_SUBSCRIPTION_SELECT,
        });
      } catch (error) {
        // The partial unique index is the race-safe backstop for the pre-check
        // above: a concurrent enrolment that slipped between the read and this
        // insert trips it, and reads identically to the checked case.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw this.alreadySubscribed();
        }
        throw error;
      }
    });

    return { subscription: this.toEnrolled(row) };
  }

  /**
   * Resolve the calling user's membership in the current gym — the subscription's
   * owner. Mirrors {@link SubscriptionFreezeService.requireCallerMembership}: the
   * session must carry a user and that user must be a member of this gym.
   */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required to enrol in a subscription',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'You are not a member of this gym',
        code: 'NOT_A_MEMBER',
      });
    }
    return member.id;
  }

  /** `409` for a member who already holds a live subscription in this gym. */
  private alreadySubscribed(): ConflictException {
    return new ConflictException({
      message: 'This member already has an active subscription',
      code: 'ALREADY_SUBSCRIBED',
    });
  }

  /** Project a created row to the wire {@link EnrolledSubscription}. */
  private toEnrolled(row: EnrolledSubscriptionRecord): EnrolledSubscription {
    return {
      id: row.id,
      status: row.status,
      planId: row.planId,
      planName: row.plan?.name ?? null,
      priceAmount: row.priceAmount,
      currency: row.currency,
      interval: row.interval,
      currentPeriodStart: row.currentPeriodStart.toISOString(),
      currentPeriodEnd: row.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
