import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GymMemberStatus, OrderStatus, PackagePlanStatus, PaymentStatus } from '@fit/db';
import {
  PRODUCT_UNAVAILABLE_CODE,
  type CreateCheckoutInput,
  type CreateCheckoutResponse,
  type GetOrderResponse,
  type OrderSummary,
  type PaymentAction,
  type PaymentReturnTarget,
} from '@fit/types';
import { CreditPacksService } from '../billing/credit-packs.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { PromoRedemptionService } from '../marketing/promo-redemption.service';
import { SubscriptionEnrollmentService } from '../subscriptions/subscription-enrollment.service';
import { AutomationExecutorService } from '../automation/automation-executor.service';
import { dispatchSaleAutomation } from '../orders/order-automation';
import { OnlinePaymentsService, resolvePurchaseMode } from '../payments/online-payments.service';
import { toOrderPaymentState } from '../payments/order-payment-state';

/**
 * The join wizard's final step: the authenticated purchase that closes signup
 * (`POST /checkout`), plus the confirmation read behind it
 * (`GET /checkout/:orderId`).
 *
 * **Everything that identifies the buyer comes from the session.** The body
 * carries only *what* is being bought — the gym, the member, and the price are
 * resolved server-side off the tenant context and the catalogue row — so a
 * tampered request cannot buy another member a membership, cross tenants, or set
 * its own price.
 *
 * **Each product settles onto its own financial record**, which is why the
 * response is discriminated rather than a single id:
 *
 * - `credit_pack` — delegated whole to
 *   {@link CreditPacksService.purchasePack}, which raises a `PAID` order + a
 *   `CAPTURED` stub payment and mints the pack in one transaction.
 * - `subscription` — delegated to
 *   {@link SubscriptionEnrollmentService.purchaseSelf}. On the stub path it
 *   snapshots the plan's terms onto the subscription and mints the first period's
 *   `Invoice`; no order is raised (it would record the same revenue twice). At a
 *   Flitt gym a paid plan instead raises a PENDING order the member pays on
 *   Flitt's page; the subscription and its invoice (tied to that order, so the
 *   revenue is still counted once) are created when the payment is captured.
 * - `package` — a plain plan with no finite session count has no existing
 *   purchase path, so the order + stub payment are written here, mirroring the
 *   credit-pack transaction exactly.
 *
 * Runs on the tenant-scoped {@link TenantPrismaService}, so every query is
 * auto-constrained to the caller's gym and a cross-tenant `productId` simply
 * matches nothing (a `422 PRODUCT_UNAVAILABLE`, never a leak of whether the id
 * exists elsewhere).
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly creditPacks: CreditPacksService,
    private readonly subscriptions: SubscriptionEnrollmentService,
    private readonly promos: PromoRedemptionService,
    private readonly automation: AutomationExecutorService,
    // Optional so the unit specs that construct this by hand keep the stub path;
    // always provided by `PaymentsModule` in the running app.
    @Optional() private readonly payments?: OnlinePaymentsService,
  ) {}

  /** Buy the named catalogue product for the calling member. */
  async checkout(input: CreateCheckoutInput): Promise<CreateCheckoutResponse> {
    switch (input.productType) {
      case 'credit_pack': {
        const { orderId, payment } = await this.creditPacks.purchasePack({
          packId: input.productId,
          ...(input.promoCode ? { promoCode: input.promoCode } : {}),
          ...(input.returnTo ? { returnTo: input.returnTo } : {}),
        });
        return {
          productType: input.productType,
          orderId,
          subscriptionId: null,
          ...(payment ? { payment } : {}),
        };
      }
      case 'subscription': {
        // Stub mode: the instant enrolment, exactly as before (no `payment` key).
        // Flitt mode, paid plan: a pending first-period order + checkout, and no
        // subscription until Flitt approves the payment.
        const result = await this.subscriptions.purchaseSelf(input.productId, input.returnTo);
        return {
          productType: input.productType,
          orderId: result.orderId,
          subscriptionId: result.subscriptionId,
          ...(result.payment ? { payment: result.payment } : {}),
        };
      }
      case 'package': {
        const { orderId, payment } = await this.buyPackage(
          input.productId,
          input.locationId,
          input.promoCode,
          input.returnTo,
        );
        return {
          productType: input.productType,
          orderId,
          subscriptionId: null,
          ...(payment ? { payment } : {}),
        };
      }
    }
  }

  /**
   * `POST /checkout/:orderId/payment/sync` — ask the provider about the caller's
   * own order right now (settling any open attempt), then return the same read as
   * {@link readOrder}. What makes the flow work when Flitt's callback cannot
   * reach the API, and when the buyer is back before the callback is.
   */
  async syncPayment(orderId: string): Promise<GetOrderResponse> {
    const memberId = await this.requireCallerMembership();
    await this.requireOwnOrder(orderId, memberId);
    await this.payments?.syncOrder(this.tenant.gymId, orderId);
    return this.readOrder(orderId);
  }

  /** `POST /checkout/:orderId/payment/retry` — a (new) checkout for an unpaid order. */
  async retryPayment(orderId: string, returnTo: PaymentReturnTarget): Promise<PaymentAction> {
    const memberId = await this.requireCallerMembership();
    if (!this.payments) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    return this.payments.retry({ gymId: this.tenant.gymId, orderId, memberId, returnTo });
  }

  /** `POST /checkout/:orderId/payment/cancel` — give up an unpaid online order. */
  async cancelPayment(orderId: string): Promise<GetOrderResponse> {
    const memberId = await this.requireCallerMembership();
    if (!this.payments) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    await this.payments.cancelOwnOrder(this.tenant.gymId, orderId, memberId);
    return this.readOrder(orderId);
  }

  private async requireOwnOrder(orderId: string, memberId: string): Promise<void> {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, memberId },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
  }

  /**
   * The confirmation summary for one of the caller's **own** orders. Scoped both
   * by the tenant client and by the caller's membership, so an order id belonging
   * to another member (or another gym) is a `404` rather than a disclosure.
   */
  async readOrder(orderId: string): Promise<GetOrderResponse> {
    const memberId = await this.requireCallerMembership();

    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, memberId },
      select: {
        id: true,
        status: true,
        total: true,
        currency: true,
        items: { select: { label: true, amount: true }, orderBy: { createdAt: 'asc' } },
        payment: { select: { provider: true, status: true } },
        paymentAttempts: {
          select: { status: true, checkoutUrl: true, expiresAt: true, providerStatus: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!order) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }

    const summary: OrderSummary = {
      id: order.id,
      status: TO_WIRE_STATUS[order.status],
      total: order.total,
      currency: order.currency,
      items: order.items.map((item) => ({ label: item.label, amount: item.amount })),
      payment: toOrderPaymentState({
        orderStatus: order.status,
        payment: order.payment ?? null,
        latestAttempt: order.paymentAttempts?.[0] ?? null,
      }),
    };
    return { order: summary };
  }

  /**
   * Record the purchase of a plain package — an `ACTIVE` plan that grants no
   * finite session count (one that does is a credit pack, and is bought through
   * {@link CreditPacksService} so the credits are actually minted).
   *
   * The order, its opening status event, its single line and the stub payment are
   * written in one transaction so a charged-but-unrecorded purchase can never
   * land — the same shape the credit-pack and POS writes use.
   */
  private async buyPackage(
    packageId: string,
    locationId: string | undefined,
    promoCode: string | undefined,
    returnTo: PaymentReturnTarget | undefined,
  ): Promise<{ orderId: string; payment?: PaymentAction }> {
    const memberId = await this.requireCallerMembership();
    const gymId = this.tenant.gymId;

    const plan = await this.prisma.client.packagePlan.findFirst({
      where: { id: packageId },
      select: {
        id: true,
        name: true,
        priceAmount: true,
        currency: true,
        sessionCount: true,
        status: true,
      },
    });
    if (!plan || plan.status !== PackagePlanStatus.ACTIVE || (plan.sessionCount ?? 0) > 0) {
      throw new UnprocessableEntityException({
        message: 'This product is not available for purchase',
        code: PRODUCT_UNAVAILABLE_CODE,
      });
    }

    // A branch is only recorded when it really is one of this gym's — the tenant
    // client makes a foreign id match nothing, and an unknown branch must not
    // fail a purchase that is otherwise valid.
    const branchId = locationId
      ? ((
          await this.prisma.client.location.findFirst({
            where: { id: locationId },
            select: { id: true },
          })
        )?.id ?? null)
      : null;

    // A package purchase is checked against the `packages` scope, and resolved
    // before the transaction opens so an unusable code fails the request without
    // having written anything.
    const promo = await this.promos.resolve({
      gymId,
      code: promoCode,
      amount: plan.priceAmount,
      scope: 'packages',
      memberId,
      // The branch the buyer picked, already validated as one of this gym's above.
      // `null` there means they picked none, so a branch-exclusive code cannot be
      // confirmed and is refused.
      locationId: branchId ?? undefined,
    });
    const discount = promo?.discount ?? 0;
    const total = plan.priceAmount - discount;

    // No active provider and no stub → `409 ONLINE_PAYMENTS_UNAVAILABLE`.
    const mode = await resolvePurchaseMode(this.payments, gymId);
    if (mode.mode === 'flitt') {
      return this.payments!.begin(
        {
          gymId,
          memberId,
          purpose: 'package',
          fulfilment: { kind: 'package', planId: plan.id },
          description: plan.name,
          returnTo,
          order: {
            packageId: plan.id,
            locationId: branchId,
            total,
            currency: plan.currency,
            items: [
              { label: plan.name, amount: plan.priceAmount },
              ...(discount > 0 ? [{ label: `Promo ${promoCode}`, amount: -discount }] : []),
            ],
          },
          paymentLocationId: branchId,
          promo,
        },
        mode.credentials,
      );
    }

    const orderId = await this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          gymId,
          packageId: plan.id,
          locationId: branchId,
          memberId,
          total,
          currency: plan.currency,
          status: OrderStatus.PAID,
          items: {
            create: [
              { label: plan.name, amount: plan.priceAmount },
              // The discount rides as its own line so the confirmation shows what
              // the code took off, rather than an unexplained lower total.
              ...(discount > 0 ? [{ label: `Promo ${promoCode}`, amount: -discount }] : []),
            ],
          },
          statusEvents: { create: { status: OrderStatus.PAID } },
        },
        select: { id: true },
      });

      await tx.payment.create({
        data: {
          gymId,
          orderId: order.id,
          amount: total,
          currency: plan.currency,
          status: PaymentStatus.CAPTURED,
          // The same branch the order above carries (Stage 5) — `branchId`, already
          // validated as one of this gym's locations, not the raw `locationId` off
          // the wire. Taking it from the same resolved value rather than re-reading
          // is what guarantees the payment and its order agree; a foreign id was
          // already collapsed to null before either write.
          locationId: branchId,
          // The MVP charge is stubbed (treated as captured); T8.8 swaps `stub` for
          // a concrete gateway + `providerRef`. Distinct from the POS `pos` channel.
          provider: 'stub',
        },
        select: { id: true },
      });

      if (promo) {
        await this.promos.consume(tx, { ...promo, gymId, memberId, orderId: order.id });
      }

      return order.id;
    });

    // After commit, never awaited. A package holds no stock, so no low-stock read.
    dispatchSaleAutomation(this.automation, null, { gymId, orderId, memberId, paid: true });
    return { orderId };
  }

  /**
   * The calling member's own `GymMember` id. Mirrors the guard the credit-pack
   * and subscription self-service paths use: a session without a live membership
   * in this gym has nothing to buy against, which is a `403` rather than a `404`
   * (the caller is authenticated, just not a member here).
   */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException('A member session is required to check out');
    }

    const membership = await this.prisma.client.gymMember.findFirst({
      where: { userId, status: GymMemberStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('The caller is not a member of this gym');
    }
    return membership.id;
  }
}

/**
 * Prisma's order status → the lower-cased public one the confirmation summary
 * carries. The public enum has no `refunded` member (the summary exists to
 * confirm a purchase, and the confirmation link is followed seconds after
 * checkout), so a refunded order reads as `cancelled` — the closest "this is no
 * longer a live purchase" state. Staff see the true status on the admin order
 * detail, which has its own richer enum.
 */
const TO_WIRE_STATUS: Record<OrderStatus, OrderSummary['status']> = {
  [OrderStatus.PENDING]: 'pending',
  [OrderStatus.PAID]: 'paid',
  [OrderStatus.CANCELLED]: 'cancelled',
  [OrderStatus.REFUNDED]: 'cancelled',
};
