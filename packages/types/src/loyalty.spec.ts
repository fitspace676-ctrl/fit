import { describe, expect, it } from 'vitest';
import {
  LOYALTY_REASON_CATALOG,
  LOYALTY_REWARD_TYPE_CATALOG,
  adjustLoyaltyPointsSchema,
  createLoyaltyRewardSchema,
  listRedemptionsQuerySchema,
  loyaltyReasonSchema,
  loyaltyRewardTypeSchema,
  loyaltyTopEarnersQuerySchema,
  redeemRewardSchema,
  updateLoyaltyProgramSchema,
  updateLoyaltyRewardSchema,
} from './loyalty';

describe('loyalty catalogs', () => {
  it('every reward-type catalog value is a valid enum member', () => {
    for (const meta of LOYALTY_REWARD_TYPE_CATALOG) {
      expect(loyaltyRewardTypeSchema.safeParse(meta.value).success).toBe(true);
    }
  });

  it('every reason catalog value is a valid enum member', () => {
    for (const meta of LOYALTY_REASON_CATALOG) {
      expect(loyaltyReasonSchema.safeParse(meta.value).success).toBe(true);
    }
  });
});

describe('createLoyaltyRewardSchema', () => {
  it('defaults description/type/active and accepts a nullable stock', () => {
    const parsed = createLoyaltyRewardSchema.parse({ name: 'Day pass', pointsCost: 200 });
    expect(parsed).toMatchObject({ description: '', type: 'other', active: true });
    expect(
      createLoyaltyRewardSchema.safeParse({ name: 'x', pointsCost: 5, stock: null }).success,
    ).toBe(true);
  });

  it('rejects a non-positive points cost', () => {
    expect(createLoyaltyRewardSchema.safeParse({ name: 'x', pointsCost: 0 }).success).toBe(false);
  });
});

describe('updateLoyaltyRewardSchema / updateLoyaltyProgramSchema', () => {
  it('require at least one field', () => {
    expect(updateLoyaltyRewardSchema.safeParse({}).success).toBe(false);
    expect(updateLoyaltyProgramSchema.safeParse({}).success).toBe(false);
    expect(updateLoyaltyProgramSchema.safeParse({ enabled: true }).success).toBe(true);
  });
});

describe('adjustLoyaltyPointsSchema', () => {
  it('accepts signed deltas but rejects zero', () => {
    expect(adjustLoyaltyPointsSchema.safeParse({ delta: -50 }).success).toBe(true);
    expect(adjustLoyaltyPointsSchema.safeParse({ delta: 0 }).success).toBe(false);
  });
});

describe('redeemRewardSchema', () => {
  it('requires both member and reward ids', () => {
    expect(redeemRewardSchema.safeParse({ memberId: 'm', rewardId: 'r' }).success).toBe(true);
    expect(redeemRewardSchema.safeParse({ memberId: 'm' }).success).toBe(false);
  });
});

describe('query schemas coerce and default', () => {
  it('lists redemptions with defaulted pagination', () => {
    expect(listRedemptionsQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(listRedemptionsQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it('defaults and coerces the top-earners limit', () => {
    expect(loyaltyTopEarnersQuerySchema.parse({}).limit).toBe(10);
    expect(loyaltyTopEarnersQuerySchema.parse({ limit: '3' }).limit).toBe(3);
  });
});
