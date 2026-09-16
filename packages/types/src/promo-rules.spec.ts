import { describe, expect, it } from 'vitest';
import { computePromoDiscount, promoRejectionReason, type PromoRuleFacts } from './marketing';

/** An unrestricted, running 20%-off code. */
const promo = (over: Partial<PromoRuleFacts> = {}): PromoRuleFacts => ({
  status: 'active',
  appliesTo: 'all',
  startsAt: null,
  expiryDate: null,
  usageLimit: null,
  usedCount: 0,
  minPurchase: null,
  oncePerMember: false,
  discountType: 'percentage',
  discountValue: 20,
  // NULL is the gym-wide default: redeemable at every branch, constraining
  // nothing. The exclusivity tests below opt in explicitly.
  locationId: null,
  ...over,
});

const NOW = Date.parse('2026-08-03T12:00:00.000Z');

describe('promoRejectionReason', () => {
  it('accepts a running, unrestricted code', () => {
    expect(promoRejectionReason(promo(), { now: NOW })).toBeNull();
  });

  it('refuses a switched-off code', () => {
    expect(promoRejectionReason(promo({ status: 'inactive' }), { now: NOW })).toBe('inactive');
  });

  it('refuses a code whose window has not opened', () => {
    const starts = new Date('2026-09-01T00:00:00.000Z');
    expect(promoRejectionReason(promo({ startsAt: starts }), { now: NOW })).toBe('not_started');
  });

  it('accepts a code once its start date has passed', () => {
    const starts = new Date('2026-08-01T00:00:00.000Z');
    expect(promoRejectionReason(promo({ startsAt: starts }), { now: NOW })).toBeNull();
  });

  it('refuses an expired code', () => {
    const expiry = new Date('2026-07-01T00:00:00.000Z');
    expect(promoRejectionReason(promo({ expiryDate: expiry }), { now: NOW })).toBe('expired');
  });

  it('refuses a code whose total redemptions are spent', () => {
    expect(promoRejectionReason(promo({ usageLimit: 10, usedCount: 10 }), { now: NOW })).toBe(
      'usage_limit_reached',
    );
  });

  it('refuses a scoped code against a different catalogue', () => {
    // The whole point of the scope: a supplements code must not quietly discount
    // an annual membership.
    expect(
      promoRejectionReason(promo({ appliesTo: 'products' }), { scope: 'subscriptions', now: NOW }),
    ).toBe('out_of_scope');
  });

  it('refuses a scoped code when the purchase kind is unknown', () => {
    // Without knowing what is being bought there is no way to honour a scoped
    // code correctly, and guessing would defeat the restriction.
    expect(promoRejectionReason(promo({ appliesTo: 'products' }), { now: NOW })).toBe(
      'out_of_scope',
    );
  });

  it('honours an all-scope code whatever is being bought', () => {
    expect(promoRejectionReason(promo(), { scope: 'subscriptions', now: NOW })).toBeNull();
  });

  it('refuses a one-per-customer code the buyer has already spent', () => {
    expect(
      promoRejectionReason(promo({ oncePerMember: true }), { alreadyRedeemed: true, now: NOW }),
    ).toBe('already_redeemed');
  });

  it('ignores past redemptions for a code that is not one-per-customer', () => {
    expect(promoRejectionReason(promo(), { alreadyRedeemed: true, now: NOW })).toBeNull();
  });

  it('refuses a basket under the minimum spend', () => {
    expect(promoRejectionReason(promo({ minPurchase: 5000 }), { amount: 4999, now: NOW })).toBe(
      'below_min_purchase',
    );
    expect(
      promoRejectionReason(promo({ minPurchase: 5000 }), { amount: 5000, now: NOW }),
    ).toBeNull();
  });

  describe('branch exclusivity', () => {
    // Stage 7 of multi-branch: `locationId` on a promo code means "redeemable
    // ONLY here", and NULL — the state of almost every code — means "redeemable
    // everywhere". That inversion is the thing these tests pin down.

    it('accepts a gym-wide code at any branch, and at none', () => {
      expect(promoRejectionReason(promo(), { locationId: 'loc-1', now: NOW })).toBeNull();
      expect(promoRejectionReason(promo(), { locationId: 'loc-2', now: NOW })).toBeNull();
      expect(promoRejectionReason(promo(), { now: NOW })).toBeNull();
    });

    it('accepts an exclusive code at its own branch', () => {
      expect(
        promoRejectionReason(promo({ locationId: 'loc-1' }), { locationId: 'loc-1', now: NOW }),
      ).toBeNull();
    });

    it('refuses an exclusive code at another branch', () => {
      expect(
        promoRejectionReason(promo({ locationId: 'loc-1' }), { locationId: 'loc-2', now: NOW }),
      ).toBe('wrong_location');
    });

    it('refuses an exclusive code when the purchase has no branch', () => {
      // The online shop and the member app send no branch. An exclusive code
      // cannot be confirmed against a purchase that happened nowhere in
      // particular, so it is refused — the same direction `out_of_scope` takes
      // for a purchase whose catalogue is unknown.
      expect(promoRejectionReason(promo({ locationId: 'loc-1' }), { now: NOW })).toBe(
        'wrong_location',
      );
    });

    it('reports scope before branch — WHAT before WHERE', () => {
      const both = promo({ appliesTo: 'products', locationId: 'loc-1' });
      expect(
        promoRejectionReason(both, { scope: 'subscriptions', locationId: 'loc-2', now: NOW }),
      ).toBe('out_of_scope');
    });
  });

  it('reports the most fundamental reason when several apply', () => {
    // Switched off AND expired AND spent: "inactive" is the one worth showing.
    const dead = promo({
      status: 'inactive',
      expiryDate: new Date('2020-01-01T00:00:00.000Z'),
      usageLimit: 1,
      usedCount: 1,
    });
    expect(promoRejectionReason(dead, { now: NOW })).toBe('inactive');
  });
});

describe('computePromoDiscount', () => {
  it('takes a whole percent off, rounding down', () => {
    // 33% of 1000 is 330; a fractional tetri rounds in the gym's favour.
    expect(computePromoDiscount({ discountType: 'percentage', discountValue: 33 }, 1000)).toBe(330);
  });

  it('takes a fixed amount off', () => {
    expect(computePromoDiscount({ discountType: 'fixed', discountValue: 500 }, 2000)).toBe(500);
  });

  it('never discounts more than the purchase itself', () => {
    // A 50-lari voucher against a 30-lari basket takes off 30, not 50 — otherwise
    // the order totals below zero and the sale becomes a refund.
    expect(computePromoDiscount({ discountType: 'fixed', discountValue: 5000 }, 3000)).toBe(3000);
  });

  it('discounts nothing against an empty basket', () => {
    expect(computePromoDiscount({ discountType: 'percentage', discountValue: 50 }, 0)).toBe(0);
  });
});
