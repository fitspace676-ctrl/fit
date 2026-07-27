import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GymMemberStatus, OrderStatus, PackagePlanStatus, PaymentStatus } from '@fit/db';
import {
  PRODUCT_UNAVAILABLE_CODE,
  type CreateCheckoutInput,
  type CreateCheckoutResponse,
  type GetOrderResponse,
  type OrderSummary,
} from '@fit/types';
import { CreditPacksService } from '../billing/credit-packs.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { SubscriptionEnrollmentService } from '../subscriptions/subscription-enrollment.service';

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
 *   {@link SubscriptionEnrollmentService.enrollSelf}, which snapshots the plan's
 *   terms onto the subscription and mints the first period's `Invoice`. No order
 *   is raised: doing so would record the same revenue twice.
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
  ) {}

  /** Buy the named catalogue product for the calling member. */
  async checkout(input: CreateCheckoutInput): Promise<CreateCheckoutResponse> {
    switch (input.productType) {
      case 'credit_pack': {
        const { orderId } = await this.creditPacks.purchasePack({ packId: input.productId });
        return { productType: input.productType, orderId, subscriptionId: null };
      }
      case 'subscription': {
        const { subscription } = await this.subscriptions.enrollSelf(input.productId);
        return { productType: input.productType, orderId: null, subscriptionId: subscription.id };
      }
      case 'package':
        return {
          productType: input.productType,
          orderId: await this.buyPackage(input.productId, input.locationId),
          subscriptionId: null,
        };
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
  private async buyPackage(packageId: string, locationId?: string): Promise<string> {
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

    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          gymId,
          packageId: plan.id,
          locationId: branchId,
          memberId,
          total: plan.priceAmount,
          currency: plan.currency,
          status: OrderStatus.PAID,
          items: { create: { label: plan.name, amount: plan.priceAmount } },
          statusEvents: { create: { status: OrderStatus.PAID } },
        },
        select: { id: true },
      });

      await tx.payment.create({
        data: {
          gymId,
          orderId: order.id,
          amount: plan.priceAmount,
          currency: plan.currency,
          status: PaymentStatus.CAPTURED,
          // The MVP charge is stubbed (treated as captured); T8.8 swaps `stub` for
          // a concrete gateway + `providerRef`. Distinct from the POS `pos` channel.
          provider: 'stub',
        },
        select: { id: true },
      });

      return order.id;
    });
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
