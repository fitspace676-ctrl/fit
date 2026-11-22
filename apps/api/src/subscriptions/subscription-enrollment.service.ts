import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  LIVE_SUBSCRIPTION_STATUSES,
  Prisma,
  SubscriptionPlanStatus,
  type SubscriptionInterval,
} from '@fit/db';
import {
  type EnrolledSubscription,
  type EnrollSubscriptionResponse,
  type SelfEnrollSubscriptionResponse,
  type PaymentAction,
  type PaymentReturnTarget,
} from '@fit/types';
import { InvoiceService } from '../billing/invoice.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import {
  FulfilmentConflictError,
  OnlinePaymentsService,
  resolvePurchaseMode,
} from '../payments/online-payments.service';
import {
  AlreadySubscribedError,
  MANUAL_PAY_PROVIDER,
  startSubscription,
} from './subscription-periods';

/** The plan columns enrolment (and the paid-online start) reads. */
const ENROLLABLE_PLAN_SELECT = {
  id: true,
  name: true,
  status: true,
  priceAmount: true,
  currency: true,
  interval: true,
  trialDays: true,
} satisfies Prisma.SubscriptionPlanSelect;

interface EnrollablePlan {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  trialDays: number;
}

/** The plan read enrolment makes — structural so both the client and a transaction fit. */
interface EnrollablePlanClient {
  subscriptionPlan: {
    findFirst(args: {
      where: { id: string };
      select: typeof ENROLLABLE_PLAN_SELECT;
    }): Promise<(EnrollablePlan & { status: SubscriptionPlanStatus }) | null>;
  };
}

/** Where the subscription provider key comes from for the instant (stub) path. */
const STUB_PROVIDER = 'stub';

/** What a member's self-purchase (`POST /checkout`, productType `subscription`) produced. */
export type SelfPurchaseResult =
  | { subscriptionId: string; orderId: null; payment?: undefined }
  | { subscriptionId: null; orderId: string; payment: PaymentAction };

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
 * A plan with a free trial (`trialDays > 0`, T5.6) instead starts the member in a
 * `TRIAL` whose period runs a fixed {@link trialBillingPeriod} of days; the member is
 * entitled but uncharged until the recurring-billing job's first charge at trial end
 * auto-converts it to `ACTIVE` (and starts the first paid period there). A trial thus
 * occupies the same single live slot as any other live subscription.
 *
 * Payment depends on the gym's purchase mode ({@link resolvePurchaseMode}):
 * - `stub` — the instant path: the subscription is stamped `provider = "stub"`
 *   without settling a real payment (T5.11 / T8.8).
 * - `flitt` — the member pays each period by hand on the gym's Flitt page. A paid
 *   plan bought by the member ({@link purchaseSelf}) opens a PENDING order and
 *   creates NOTHING until Flitt approves it; the capture then runs the same
 *   `startSubscription` this service runs (provider `flitt`). A trial still starts
 *   at once, stamped `flitt`, so it is paid by hand when it converts.
 * - no provider and no stub → `409 ONLINE_PAYMENTS_UNAVAILABLE` for the member's
 *   own enrolment. Staff enrolment ({@link enrollMember}) is a desk sale and keeps
 *   the stub stamp.
 * A paid (non-trial) enrolment does, however, mint a numbered
 * {@link Invoice} for the first period via {@link InvoiceService} inside the same
 * transaction (T5.9), so the member's billing history — surfaced by
 * `GET /me/subscription` — reflects the charge from day one. A `TRIAL` enrolment charges
 * nothing yet, so it raises no invoice; the recurring-billing job mints the first one
 * when the trial converts.
 */
@Injectable()
export class SubscriptionEnrollmentService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly invoices: InvoiceService,
    // Optional so the unit specs that construct this by hand keep the stub path;
    // always provided by `PaymentsModule` in the running app.
    @Optional() private readonly payments?: OnlinePaymentsService,
  ) {}

  /**
   * Enrol the **calling member** on `planId` (member self-checkout, the legacy
   * `POST /subscriptions` older app builds still call). The member is resolved from
   * the session — never a member id on the wire — mirroring
   * {@link SubscriptionFreezeService}. Fails with `403` when there is no member
   * session / the caller is not a member of this gym, and shares enrolment's
   * `404` / `409` failure modes (see {@link enroll}).
   *
   * The same purchase-mode policy as `POST /checkout` ({@link purchaseSelf}): stub →
   * unchanged `{ subscription }`; Flitt + paid plan → `{ subscription: null,
   * orderId, payment }` (nothing created until Flitt approves); Flitt + trial →
   * `{ subscription }` (provider `flitt`); no provider and no stub → `409
   * ONLINE_PAYMENTS_UNAVAILABLE`.
   */
  async enrollSelf(
    planId: string,
    returnTo?: PaymentReturnTarget,
  ): Promise<SelfEnrollSubscriptionResponse> {
    const result = await this.purchase(planId, returnTo);
    if (result.kind === 'enrolled') return result.response;
    return { subscription: null, orderId: result.orderId, payment: result.payment };
  }

  /**
   * The member's own purchase of a plan (`POST /checkout`, productType
   * `subscription`) — see {@link purchase}.
   */
  async purchaseSelf(
    planId: string,
    returnTo: PaymentReturnTarget | undefined,
  ): Promise<SelfPurchaseResult> {
    const result = await this.purchase(planId, returnTo);
    if (result.kind === 'enrolled') {
      return { subscriptionId: result.response.subscription.id, orderId: null };
    }
    return { subscriptionId: null, orderId: result.orderId, payment: result.payment };
  }

  /**
   * The purchase-mode policy both member routes share:
   *
   * - `stub` mode: the instant enrolment, exactly as before.
   * - `flitt` mode, trial plan: the trial starts at once (provider `flitt`).
   * - `flitt` mode, paid plan: `409 ALREADY_SUBSCRIBED` if the member holds a live
   *   subscription; otherwise a PENDING order for the first period (the plan's
   *   price, GEL only) and a Flitt checkout. Nothing is created until Flitt approves
   *   the payment — the capture runs `startSubscription` and re-checks the live slot
   *   (a member who subscribed meanwhile gets a NEEDS_REVIEW attempt, not a second
   *   subscription). A member who already has an unpaid start order for the SAME
   *   plan gets that order's checkout back instead of a second order.
   * - neither → `409 ONLINE_PAYMENTS_UNAVAILABLE` (from {@link resolvePurchaseMode}).
   */
  private async purchase(
    planId: string,
    returnTo: PaymentReturnTarget | undefined,
  ): Promise<
    | { kind: 'enrolled'; response: EnrollSubscriptionResponse }
    | { kind: 'payment'; orderId: string; payment: PaymentAction }
  > {
    const memberId = await this.requireCallerMembership();
    const gymId = this.requireGymId();
    const mode = await resolvePurchaseMode(this.payments, gymId);
    if (mode.mode === 'stub') {
      return { kind: 'enrolled', response: await this.enroll(memberId, planId, STUB_PROVIDER) };
    }

    const plan = await this.loadEnrollablePlan(this.prisma.client, planId);
    if (plan.trialDays > 0) {
      return {
        kind: 'enrolled',
        response: await this.enroll(memberId, planId, MANUAL_PAY_PROVIDER),
      };
    }

    const existingLive = await this.prisma.client.subscription.findFirst({
      where: { memberId, status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
      select: { id: true },
    });
    if (existingLive) throw this.alreadySubscribed();

    const payments = this.payments!;
    const open = await payments.findOpenOrder(
      gymId,
      memberId,
      (fulfilment) => fulfilment.kind === 'subscription_start' && fulfilment.planId === plan.id,
    );
    if (open) {
      const payment = await payments.retry({ gymId, orderId: open, memberId, returnTo });
      return { kind: 'payment', orderId: open, payment };
    }

    // The payment is attributed to the member's home branch — the same branch the
    // first-period invoice is stamped with (`InvoiceService.issue`).
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: { locationId: true },
    });
    const locationId = member?.locationId ?? null;

    try {
      const { orderId, payment } = await payments.begin(
        {
          gymId,
          memberId,
          purpose: 'subscription_start',
          fulfilment: {
            kind: 'subscription_start',
            planId: plan.id,
            planName: plan.name,
            priceAmount: plan.priceAmount,
            currency: plan.currency,
            interval: plan.interval,
          },
          description: plan.name,
          returnTo,
          order: {
            locationId,
            total: plan.priceAmount,
            currency: plan.currency,
            items: [{ label: plan.name, amount: plan.priceAmount }],
          },
          paymentLocationId: locationId,
          promo: null,
        },
        mode.credentials,
      );
      return { kind: 'payment', orderId, payment };
    } catch (error) {
      // A free (0-priced) plan is fulfilled inside `begin`'s own transaction.
      if (error instanceof FulfilmentConflictError) throw this.alreadySubscribed();
      throw error;
    }
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
  private async enroll(
    memberId: string,
    planId: string,
    provider: string = STUB_PROVIDER,
  ): Promise<EnrollSubscriptionResponse> {
    const gymId = this.requireGymId();

    const { row, invoice } = await this.prisma.client.$transaction(async (tx) => {
      const plan = await this.loadEnrollablePlan(tx, planId);

      // A plan with `trialDays > 0` starts the member in a free TRIAL that runs a
      // fixed number of days; the recurring-billing job's first charge at trial end
      // (or, for a manually paid subscription, the member's own payment) converts it
      // to ACTIVE. Otherwise enrolment is a normal ACTIVE membership whose first paid
      // period starts now and mints its invoice in this same transaction. Either way
      // the plan's price/currency/interval are snapshotted. The live-slot check, the
      // period arithmetic and the invoice live in the shared `startSubscription`, which
      // the Flitt capture of a `subscription_start` order runs too.
      try {
        const started = await startSubscription(tx, this.invoices, {
          gymId,
          memberId,
          planId: plan.id,
          planName: plan.name,
          priceAmount: plan.priceAmount,
          currency: plan.currency,
          interval: plan.interval,
          trialDays: plan.trialDays,
          provider,
          now: new Date(),
        });
        const created = await tx.subscription.findFirst({
          where: { id: started.subscriptionId },
          select: ENROLLED_SUBSCRIPTION_SELECT,
        });
        if (!created) throw new Error('The enrolled subscription could not be read back');
        return { row: created, invoice: started.invoice };
      } catch (error) {
        // The partial unique index is the race-safe backstop for the pre-check: a
        // concurrent enrolment that slipped between the read and the insert reads
        // identically to the checked case.
        if (error instanceof AlreadySubscribedError) throw this.alreadySubscribed();
        throw error;
      }
    });

    // Announce the first period's payment only now that the transaction committed:
    // a rolled-back enrolment (a lost race, a failed insert) never fires it.
    if (invoice) this.invoices.announcePaid({ gymId }, invoice);

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

  /**
   * The plan a member may be enrolled on: `404 SUBSCRIPTION_PLAN_NOT_FOUND` for an
   * unknown / cross-tenant plan, `409 SUBSCRIPTION_PLAN_INACTIVE` for a retired one.
   * Takes the client so it runs inside the enrolment transaction too.
   */
  private async loadEnrollablePlan(
    client: EnrollablePlanClient,
    planId: string,
  ): Promise<EnrollablePlan> {
    const plan = await client.subscriptionPlan.findFirst({
      where: { id: planId },
      select: ENROLLABLE_PLAN_SELECT,
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
    return plan;
  }

  private requireGymId(): string {
    const gymId = this.tenant.gymId;
    if (!gymId) {
      throw new ForbiddenException({
        message: 'Tenant scope is required to enrol a subscription',
        code: 'TENANT_CONTEXT_MISSING',
      });
    }
    return gymId;
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
