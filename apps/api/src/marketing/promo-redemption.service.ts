import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { computePromoDiscount, promoRejectionReason, type PromoScope } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The slice of a transaction client {@link PromoRedemptionService.consume} needs.
 *
 * Narrow on purpose: the callers do not share a client type — the shop runs on
 * the plain Prisma client while the till and the wizard run on the tenant-
 * extended one — and both satisfy this.
 */
export interface PromoTransactionClient {
  promoCode: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  promoRedemption: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** A resolved code, ready to be consumed once the purchase it discounts commits. */
export interface ResolvedPromo {
  promoId: string;
  /** Money off, in the currency's MINOR units. */
  discount: number;
  /** The cap as it stood when the code was resolved; re-checked on consume. */
  usageLimit: number | null;
}

/** What a caller needs to write the redemption alongside its purchase. */
export interface ConsumePromoInput extends ResolvedPromo {
  gymId: string;
  /** The buyer, or `null` for an anonymous walk-in. */
  memberId: string | null;
  /** The order this discounted, when there is one. */
  orderId?: string | null;
}

/**
 * Applying a promo code to a purchase — the database half of the promo rules.
 *
 * Every place that sells something needs the same two steps: decide whether a
 * code applies to *this* purchase, then consume it in the same transaction as
 * the sale. Written per flow, the shop, the purchase wizard and the till would
 * each drift in a different direction, and the drift would show up as a code that
 * works in one place and not another. So the steps live here once, over the pure
 * rules in `@fit/types`.
 *
 * Deliberately on the **base** Prisma client with an explicit `gymId`, because
 * the callers do not agree on tenancy: the shop cart is reached anonymously and
 * scopes itself, while the till and the wizard run tenant-scoped. Passing the gym
 * makes this usable from either without pretending they are the same.
 */
@Injectable()
export class PromoRedemptionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a code against a purchase, or throw a `422` naming the reason.
   *
   * Rejection is deliberately loud. Charging full price to someone who believes
   * they have a discount is worse than telling them the code did not work — they
   * would find out from their bank statement instead of from the screen.
   *
   * Returns `null` only when no code was supplied at all.
   */
  async resolve(input: {
    gymId: string;
    code: string | undefined;
    /** Purchase total before discount, MINOR units. */
    amount: number;
    /** Which catalogue is being bought from. */
    scope: PromoScope;
    /** The buyer, or `null` when anonymous. */
    memberId: string | null;
    /**
     * WHERE the purchase is happening — the branch of the till, or `undefined`
     * for a sale with no branch (the online shop, the member app).
     *
     * Checked against `PromoCode.locationId`, which since Stage 7 of multi-branch
     * means the code is EXCLUSIVE to that branch. **`null` there — the state of
     * almost every code — means "redeemable anywhere" and constrains nothing**,
     * so this argument changes the outcome for exclusive codes only.
     *
     * An exclusive code rung up at another branch, or on a purchase with no
     * branch at all, is refused as `wrong_location`, for the same reason a scoped
     * code is refused against an unknown catalogue: it cannot be confirmed, and
     * quietly honouring it is how a grand-opening voucher ends up discounting
     * sales at every site. Refusing is the loud direction, which is the whole
     * posture of this service — see the note on rejection above.
     */
    locationId?: string;
  }): Promise<ResolvedPromo | null> {
    if (!input.code) {
      return null;
    }

    const promo = await this.prisma.client.promoCode.findFirst({
      where: { gymId: input.gymId, code: { equals: input.code, mode: 'insensitive' } },
    });
    if (!promo) {
      throw this.reject('not_found', 'That promo code was not recognised');
    }

    const reason = promoRejectionReason(promo, {
      scope: input.scope,
      locationId: input.locationId,
      amount: input.amount,
      alreadyRedeemed: promo.oncePerMember
        ? await this.alreadyRedeemed(promo.id, input.memberId)
        : false,
    });
    if (reason) {
      throw this.reject(reason, 'That promo code cannot be used on this purchase');
    }

    return {
      promoId: promo.id,
      discount: computePromoDiscount(promo, input.amount),
      usageLimit: promo.usageLimit,
    };
  }

  /**
   * Consume the code inside the caller's transaction, recording who spent it.
   *
   * Runs on the passed transaction client so the redemption and the sale commit
   * together: a code can never be counted as spent against a purchase that did
   * not land, nor a discounted order exist with no record of the code behind it.
   *
   * The usage cap is re-checked here rather than trusted from `resolve`, because
   * the last redemption may have gone to someone else in between. Losing that
   * race fails the purchase — the alternative is quietly charging a price the
   * customer did not agree to.
   */
  async consume(tx: PromoTransactionClient, input: ConsumePromoInput): Promise<void> {
    const claimed = await tx.promoCode.updateMany({
      where: {
        id: input.promoId,
        ...(input.usageLimit !== null ? { usedCount: { lt: input.usageLimit } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw this.reject('usage_limit_reached', 'That promo code has just been fully redeemed');
    }

    await tx.promoRedemption.create({
      data: {
        gymId: input.gymId,
        promoCodeId: input.promoId,
        memberId: input.memberId,
        orderId: input.orderId ?? null,
        discountAmount: input.discount,
      },
    });
  }

  /**
   * Whether this buyer has already spent this code. Read from the redemption
   * ledger, since `usedCount` counts everyone together and cannot tell one
   * customer's second attempt from another's first.
   *
   * A buyer with no member record counts as having redeemed it: refusing a
   * one-per-customer code to someone the gym cannot identify is the safe
   * direction to be wrong in, because a code anonymous buyers may spend
   * repeatedly is not one-per-customer at all.
   */
  private async alreadyRedeemed(promoId: string, memberId: string | null): Promise<boolean> {
    if (!memberId) {
      return true;
    }
    const existing = await this.prisma.client.promoRedemption.findFirst({
      where: { promoCodeId: promoId, memberId },
      select: { id: true },
    });
    return existing !== null;
  }

  /** A `422` carrying the machine-readable reason in `details`. */
  private reject(reason: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'PROMO_CODE_INVALID',
      details: [reason],
      message,
    });
  }
}
