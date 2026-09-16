import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@fit/db';
import {
  MY_ORDER_LABEL_PREVIEW,
  type ListMyOrdersQuery,
  type ListMyOrdersResponse,
  type MemberOrderSummary,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * The columns an {@link Order} is projected onto for the member's history card.
 * `items` is deliberately a *bounded* nested read — the first
 * {@link MY_ORDER_LABEL_PREVIEW} labels for the card's subtitle — with the true
 * line count coming from `_count`, so one page of rows never drags whole baskets
 * across the wire to render "+N more".
 */
const MY_ORDER_SELECT = {
  id: true,
  status: true,
  total: true,
  currency: true,
  createdAt: true,
  items: {
    select: { label: true },
    orderBy: { createdAt: 'asc' },
    take: MY_ORDER_LABEL_PREVIEW,
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type MyOrderRecord = Prisma.OrderGetPayload<{ select: typeof MY_ORDER_SELECT }>;

/**
 * Member-facing read of the caller's own purchase history (`GET /me/orders`).
 *
 * **Why a `/me` route at all.** The order roster is `GET /orders`
 * ({@link import('../orders/orders.controller').OrdersController}), gated on
 * `BillingRead` — a permission `ROLE_PERMISSIONS.MEMBER` does not hold — and
 * `GET /checkout/:orderId` can only confirm an order whose id the caller already
 * has. So "what have I bought" had no member-callable answer until this. Same
 * shape as the other `/me` reads: the caller comes off the session, never off the
 * wire, and the tenant-scoped Prisma client constrains every query to their gym.
 *
 * **Membership is resolved without a status filter, unlike checkout.**
 * {@link CheckoutService.requireCallerMembership} demands `ACTIVE` because it is
 * gating a *purchase*; this is a record of purchases already made, and a
 * `SUSPENDED` member (or one mid-`INVITED`) being told they have never bought
 * anything would be a lie about their own money. Soft-deleted memberships are
 * still excluded — that row is gone as far as the gym is concerned.
 *
 * A caller with no membership in this gym is the empty page, not a `403`: the
 * mobile Orders tab renders it as its empty state, and there is nothing to leak
 * (mirroring {@link MeSubscriptionService}, which returns the empty shape for the
 * same case). A caller with no session at all is still a `403` — that is a broken
 * request, not an empty history.
 */
@Injectable()
export class MeOrdersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** One page of the caller's own orders, newest first. */
  async list(query: ListMyOrdersQuery): Promise<ListMyOrdersResponse> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }

    const { page, limit } = query;

    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (!member) {
      return { orders: [], total: 0, page, limit };
    }

    const where: Prisma.OrderWhereInput = { memberId: member.id };

    // Count and page in one round trip. `total` is the whole history, not the
    // page — the app pages as it scrolls and needs to know where the end is.
    const [total, rows] = await Promise.all([
      this.prisma.client.order.count({ where }),
      this.prisma.client.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: MY_ORDER_SELECT,
      }),
    ]);

    return { orders: rows.map(toMemberOrderSummary), total, page, limit };
  }
}

/**
 * Prisma's order status → the public one the member sees. Identical to
 * `CheckoutService`'s map on purpose: a `REFUNDED` order reads as `cancelled`
 * here for the same reason it does on the confirmation screen — the public enum
 * has no `refunded` member, and the list must not name a state differently from
 * the detail it links into. Staff see the true status on the admin order detail.
 */
const TO_WIRE_STATUS: Record<OrderStatus, MemberOrderSummary['status']> = {
  [OrderStatus.PENDING]: 'pending',
  [OrderStatus.PAID]: 'paid',
  [OrderStatus.CANCELLED]: 'cancelled',
  [OrderStatus.REFUNDED]: 'cancelled',
};

/** Project an {@link Order} row onto the member-facing history card shape. */
function toMemberOrderSummary(row: MyOrderRecord): MemberOrderSummary {
  return {
    id: row.id,
    status: TO_WIRE_STATUS[row.status],
    total: row.total,
    currency: row.currency,
    itemCount: row._count.items,
    itemLabels: row.items.map((item) => item.label),
    createdAt: row.createdAt.toISOString(),
  };
}
