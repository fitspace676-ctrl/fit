import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CreditPackStatus,
  ENTITLED_SUBSCRIPTION_STATUSES,
  MS_PER_DAY,
  OrderStatus,
  PackagePlanStatus,
  PaymentStatus,
} from '@fit/db';
import {
  INSUFFICIENT_CREDITS_CODE,
  PACK_UNAVAILABLE_CODE,
  type CreditPackSummary,
  type ListCreditPackCatalogueResponse,
  type ListCreditPacksResponse,
  type PurchaseCreditPackData,
  type PurchaseCreditPackResponse,
} from '@fit/types';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { PromoRedemptionService } from '../marketing/promo-redemption.service';

/**
 * Credit packs / class passes (T8.5).
 *
 * A member buys a finite-`sessionCount` {@link PackagePlan} as a *credit pack*:
 * the purchase mints a {@link CreditPack} of `sessionCount` class credits the
 * member then spends booking classes (one credit per confirmed seat). This
 * service owns both ends of that lifecycle:
 *
 * - **Purchase** ({@link purchasePack}) — validate the catalogue plan, then in one
 *   transaction raise a `PAID` {@link Order} + a `CAPTURED` stub {@link Payment}
 *   (the same shape the online wizard's stub charge uses; the real provider is
 *   T8.8) and mint the pack. Listing ({@link listMyCreditPacks}) feeds the member
 *   dashboard.
 * - **Spend / refund** ({@link chargeSeatCredit} / {@link refundCredit}) — called
 *   *inside the booking transaction* by `BookingsService`, so a credit is drawn /
 *   returned atomically with the seat. A member covered by an entitling
 *   subscription books for free (no credit drawn); everyone else draws a credit
 *   FIFO from the pack expiring soonest, or is refused with `422
 *   INSUFFICIENT_CREDITS`.
 *
 * Runs on the tenant-scoped {@link TenantPrismaService}: every query is
 * auto-constrained to the caller's gym, and the member is the caller's own gym
 * membership (resolved from the session), never a value off the wire.
 */
@Injectable()
export class CreditPacksService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly promos: PromoRedemptionService,
  ) {}

  /**
   * Buy the credit pack identified by `packId` (a finite-`sessionCount`,
   * `ACTIVE` {@link PackagePlan}). Validates the plan is a purchasable pack —
   * present, `ACTIVE`, and granting a finite, positive credit count — else `422
   * PACK_UNAVAILABLE`. On success, in one transaction: a `PAID` order + a
   * `CAPTURED` stub payment record the purchase (for the member's order history /
   * receipts), and a {@link CreditPack} is minted with `sessionCount` credits and
   * an `expiresAt` of `now + creditValidityDays` (or null when the plan never
   * expires). Returns the new pack's id.
   */
  async purchasePack(data: PurchaseCreditPackData): Promise<PurchaseCreditPackResponse> {
    const memberId = await this.requireCallerMembership();
    return this.mintPackForMember(memberId, data);
  }

  /**
   * Sell / grant a credit pack to a *specific* member from the staff console
   * (T5.8) — the desk-side mirror of {@link purchasePack}. The member is named by
   * `memberId` (from the admin member-detail screen), validated to belong to the
   * caller's gym (`404 MEMBER_NOT_FOUND` otherwise) before the same catalogue
   * validation + minting runs. Behind `BillingManage`, not the member's own
   * `CreditPackManage`, so staff can top up a member who paid at the desk.
   */
  async grantPackForMember(
    memberId: string,
    data: PurchaseCreditPackData,
  ): Promise<PurchaseCreditPackResponse> {
    await this.requireMemberInGym(memberId);
    return this.mintPackForMember(memberId, data);
  }

  /**
   * The gym's purchasable credit packs (T5.8) — every `ACTIVE`
   * {@link PackagePlan} that grants a finite, positive credit count, cheapest
   * first. Feeds the member portal's "Buy credits" picker and the admin
   * "Add credit" modal. An empty list is a normal result (a gym that sells no
   * finite-session packs — only unlimited memberships). Tenant-scoped, so it needs
   * no `gymId` argument.
   */
  async listCatalogue(): Promise<ListCreditPackCatalogueResponse> {
    const plans = await this.prisma.client.packagePlan.findMany({
      where: { status: PackagePlanStatus.ACTIVE, sessionCount: { gt: 0 } },
      orderBy: [{ priceAmount: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        priceAmount: true,
        currency: true,
        sessionCount: true,
        creditValidityDays: true,
      },
    });

    return {
      packs: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        // The `sessionCount > 0` filter guarantees a non-null, positive count.
        sessionCount: plan.sessionCount ?? 0,
        validityDays: plan.creditValidityDays,
      })),
    };
  }

  /**
   * A named member's usable credit packs for the staff console (T5.8) — the same
   * `ACTIVE`, credits-remaining projection {@link listMyCreditPacks} returns, but
   * for the member identified by `memberId` (validated to belong to the caller's
   * gym) rather than the caller. Powers the admin member-detail credit balance.
   */
  async listMemberCreditPacks(memberId: string): Promise<ListCreditPacksResponse> {
    await this.requireMemberInGym(memberId);
    return { packs: await this.readUsablePacks(memberId) };
  }

  /**
   * Validate the catalogue plan then mint the pack for `memberId` in one
   * transaction — the shared core of {@link purchasePack} (the member buying for
   * themselves) and {@link grantPackForMember} (staff selling to a member). See the
   * class docstring for the purchase lifecycle.
   */
  private async mintPackForMember(
    memberId: string,
    data: PurchaseCreditPackData,
  ): Promise<PurchaseCreditPackResponse> {
    const gymId = this.tenant.gymId;

    const plan = await this.prisma.client.packagePlan.findFirst({
      where: { id: data.packId },
      select: {
        id: true,
        name: true,
        priceAmount: true,
        currency: true,
        sessionCount: true,
        creditValidityDays: true,
        status: true,
      },
    });
    // A pack must be an ACTIVE plan that grants a finite, positive credit count —
    // an unlimited (`sessionCount: null`) plan is a membership, not a countable
    // pass, so it can't be bought as credits.
    if (
      !plan ||
      plan.status !== PackagePlanStatus.ACTIVE ||
      plan.sessionCount === null ||
      plan.sessionCount <= 0
    ) {
      throw new UnprocessableEntityException({
        message: 'This pack is not available for purchase',
        code: PACK_UNAVAILABLE_CODE,
      });
    }

    // Resolved before the transaction opens, so an unusable code fails the
    // request without having written an order. A pack is a package plan, so it
    // is checked against the `packages` scope.
    const promo = await this.promos.resolve({
      gymId,
      code: data.promoCode,
      amount: plan.priceAmount,
      scope: 'packages',
      memberId,
      // No `locationId`: a pack is bought from the member app, at no branch. Every
      // gym-wide code still applies; a branch-exclusive one is refused rather than
      // honoured on a purchase nothing can place.
    });
    const discount = promo?.discount ?? 0;
    const total = plan.priceAmount - discount;

    const credits = plan.sessionCount;
    const expiresAt =
      plan.creditValidityDays !== null
        ? new Date(Date.now() + plan.creditValidityDays * MS_PER_DAY)
        : null;

    // The order, its opening status event, the stub payment, and the pack are
    // written in one transaction, so a half-finished purchase (a charged payment
    // with no pack, or vice versa) can never land. `gymId` is stamped by the
    // tenant extension and passed explicitly to satisfy the create input's type,
    // mirroring the POS sale write.
    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          gymId,
          packageId: plan.id,
          memberId,
          total,
          currency: plan.currency,
          status: OrderStatus.PAID,
          // Itemise the pack so the order reads as a breakdown that sums to
          // `total` wherever orders are rendered — the buyer's confirmation
          // screen and the admin order detail alike — rather than a bare figure.
          // The discount rides as its own line for the same reason: a lower total
          // with nothing explaining it reads as a pricing bug.
          items: {
            create: [
              { label: plan.name, amount: plan.priceAmount },
              ...(discount > 0 ? [{ label: `Promo ${data.promoCode}`, amount: -discount }] : []),
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
          // Explicitly unattributed, mirroring the order above (Stage 5).
          //
          // This is the one payment write path that stamps no branch, and it is
          // written out rather than left to the column default so it reads as a
          // decision instead of an omission. A credit pack is bought from the
          // member's own account — `purchaseCreditPackSchema` carries no
          // `locationId`, so the ORDER has no branch either, and a payment must
          // never claim a branch its order does not. Defaulting it to the gym's
          // main branch would credit that branch with takings no order backs, and
          // the till reconciliation would then show money no drawer holds.
          //
          // Giving the purchase a real branch is a wire-contract change (the buyer
          // would have to name one), not something this write can infer. Until
          // then these rows sit in the gym-wide roll-up and out of every per-branch
          // figure — the residual class `NO_LOCATION_LABEL` exists to catch.
          locationId: null,
          // The MVP charge is stubbed (treated as captured); T8.8 swaps `stub` for
          // a concrete gateway + `providerRef`. Distinct from the POS `pos` channel.
          provider: 'stub',
        },
        select: { id: true },
      });

      const pack = await tx.creditPack.create({
        data: {
          gymId,
          memberId,
          planId: plan.id,
          orderId: order.id,
          name: plan.name,
          totalCredits: credits,
          remainingCredits: credits,
          expiresAt,
          status: CreditPackStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (promo) {
        // Consumed with the purchase, so a code is never counted as spent against
        // a pack that failed to mint.
        await this.promos.consume(tx, { ...promo, gymId, memberId, orderId: order.id });
      }

      return { creditPackId: pack.id, orderId: order.id };
    });
  }

  /**
   * The calling member's usable credit packs for the dashboard — `ACTIVE` packs
   * that still have credits, ordered by the one expiring soonest first (the same
   * FIFO order {@link chargeSeatCredit} draws them down in), never-expiring packs
   * last. An empty list is a normal result (a member who has bought no packs, or
   * whose packs are all spent / expired).
   */
  async listMyCreditPacks(): Promise<ListCreditPacksResponse> {
    const memberId = await this.requireCallerMembership();
    return { packs: await this.readUsablePacks(memberId) };
  }

  /**
   * The shared read behind {@link listMyCreditPacks} (the caller's own) and
   * {@link listMemberCreditPacks} (a named member, for staff): a member's `ACTIVE`
   * packs that still have credits, ordered by the one expiring soonest first (the
   * FIFO draw order), never-expiring packs last. Maps each to the wire
   * {@link CreditPackSummary}.
   */
  private async readUsablePacks(memberId: string): Promise<CreditPackSummary[]> {
    const packs = await this.prisma.client.creditPack.findMany({
      where: { memberId, status: CreditPackStatus.ACTIVE, remainingCredits: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        totalCredits: true,
        remainingCredits: true,
        expiresAt: true,
        name: true,
      },
    });

    return packs.map((pack) => ({
      id: pack.id,
      totalCredits: pack.totalCredits,
      remainingCredits: pack.remainingCredits,
      expiresAt: pack.expiresAt ? pack.expiresAt.toISOString() : null,
      planTitle: pack.name,
    }));
  }

  /**
   * Draw one class credit for a seat the member is taking (T8.5), inside the
   * caller's booking transaction.
   *
   * Returns the id of the {@link CreditPack} the credit was drawn from, or `null`
   * when no credit was spent — the member holds an *entitling* subscription
   * (`TRIAL` / `ACTIVE` / `PAST_DUE`), so the seat is membership-covered. Otherwise it draws
   * a credit FIFO from the pack expiring soonest (that is still `ACTIVE`, unexpired,
   * and has credits left): a single guarded `updateMany` decrements the balance only
   * `WHERE remainingCredits > 0`, so two concurrent bookings can never drive a pack
   * negative — the loser re-resolves against the next candidate pack.
   *
   * When the member has no entitling subscription and no credit to draw, the seat
   * is unpaid: with `required` (the default) that is a `422 INSUFFICIENT_CREDITS`
   * that rolls back the whole booking; with `required: false` (a waitlist
   * promotion, where refusing would unfairly block another member's cancellation)
   * it resolves to `null` and the seat is granted uncharged.
   */
  async chargeSeatCredit(
    tx: CreditPackTransactionClient,
    memberId: string,
    options?: { required?: boolean },
  ): Promise<string | null> {
    const entitled = await tx.subscription.findFirst({
      where: { memberId, status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] } },
      select: { id: true },
    });
    if (entitled) {
      return null;
    }

    const now = new Date();
    for (;;) {
      const pack = await tx.creditPack.findFirst({
        where: {
          memberId,
          status: CreditPackStatus.ACTIVE,
          remainingCredits: { gt: 0 },
          // Exclude a pack that has lapsed but not yet been flipped by the daily
          // expiry job — a NULL `expiresAt` (never expires) always qualifies.
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        select: { id: true },
      });

      if (!pack) {
        if (options?.required === false) {
          return null;
        }
        throw new UnprocessableEntityException({
          message: 'You have no class credits left',
          code: INSUFFICIENT_CREDITS_CODE,
        });
      }

      const charged = await tx.creditPack.updateMany({
        where: { id: pack.id, status: CreditPackStatus.ACTIVE, remainingCredits: { gt: 0 } },
        data: { remainingCredits: { decrement: 1 } },
      });
      if (charged.count === 1) {
        return pack.id;
      }
      // A concurrent booking took this pack's last credit between the read and the
      // decrement — re-resolve against the next candidate.
    }
  }

  /**
   * Refund one class credit to the pack it was drawn from (T8.5) — the mirror of
   * {@link chargeSeatCredit}, called inside the booking-cancellation transaction
   * when an in-policy cancel releases a credit-charged seat. The increment is
   * guarded on the pack still being `ACTIVE`: refunding a credit to an `EXPIRED`
   * pack would hand back an unusable balance, so the credit is simply forfeited
   * then (a no-op). Safe for a `null` id (a subscription-covered or uncharged
   * seat) — nothing to refund.
   */
  async refundCredit(tx: CreditPackTransactionClient, creditPackId: string | null): Promise<void> {
    if (!creditPackId) {
      return;
    }
    await tx.creditPack.updateMany({
      where: { id: creditPackId, status: CreditPackStatus.ACTIVE },
      data: { remainingCredits: { increment: 1 } },
    });
  }

  /**
   * Resolve the calling user's membership in the current gym — the pack's / the
   * booking's `memberId`. Mirrors `BookingsService`: an authenticated caller is
   * guaranteed by the route's permission, and that user must be a member of this
   * gym (a stray cross-tenant identity is a `403`).
   */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required',
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
   * Assert `memberId` names a member of the caller's gym — the guard for the staff
   * grant / balance endpoints, which take the member id off the wire (unlike the
   * self-service flows, where it comes from the session). The tenant-scoped client
   * already constrains the lookup to this gym, so an unknown or cross-tenant id
   * simply isn't found and is a `404 MEMBER_NOT_FOUND` (mirroring `MembersService`).
   */
  private async requireMemberInGym(memberId: string): Promise<void> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
  }
}

/**
 * The transaction-client view of the tenant-scoped (extended) Prisma client — the
 * delegate set minus the client-level lifecycle methods, mirroring how Prisma
 * derives its own `TransactionClient`. The booking flow passes its `$transaction`
 * callback's client here so a credit is drawn / refunded in the same transaction
 * as the seat. Mirrors the type `OrdersService` uses for its restock helper.
 */
export type CreditPackTransactionClient = Omit<
  TenantPrismaService['client'],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
