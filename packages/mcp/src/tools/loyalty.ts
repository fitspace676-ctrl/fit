import { z } from 'zod';
import {
  adjustLoyaltyPointsSchema,
  createLoyaltyRewardSchema,
  listLoyaltyRewardsQuerySchema,
  listRedemptionsQuerySchema,
  loyaltyTimeseriesQuerySchema,
  loyaltyTopEarnersQuerySchema,
  redeemRewardSchema,
  updateLoyaltyProgramSchema,
  updateLoyaltyRewardSchema,
} from '@fit/types';
import { listOf, slimRedemption, slimReward } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };
const memberId = { memberId: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/loyalty/loyalty.controller.ts. */
export const loyaltyTools = defineTools('marketing', [
  {
    name: 'loyalty_catalog',
    title: 'Loyalty catalog',
    titleKa: 'ლოიალობის კატალოგი',
    description:
      'List the loyalty reward types and point-adjustment reasons. Use to pick valid values for create_loyalty_reward or adjust_member_points.',
    method: 'get',
    path: '/loyalty/catalog',
  },
  {
    name: 'get_loyalty_program',
    title: 'Get loyalty program',
    titleKa: 'ლოიალობის პროგრამა',
    description:
      'Read the loyalty program settings: whether it is enabled, points per check-in, points per currency unit spent and signup bonus. Use before update_loyalty_program.',
    method: 'get',
    path: '/loyalty/program',
  },
  {
    name: 'update_loyalty_program',
    title: 'Update loyalty program',
    titleKa: 'ლოიალობის პროგრამის შეცვლა',
    description:
      'Turn the loyalty program on or off or change its earning rates and signup bonus; returns the new settings. Read get_loyalty_program first; rate changes affect every member.',
    method: 'put',
    path: '/loyalty/program',
    destructive: true,
    body: updateLoyaltyProgramSchema,
  },
  {
    name: 'list_loyalty_rewards',
    project: listOf(slimReward),
    title: 'List loyalty rewards',
    titleKa: 'ლოიალობის ჯილდოები',
    description:
      'List loyalty rewards, or those one branch can honour: id, name, active flag, points cost, type and stock. Use to pick rewardId for redeem_loyalty_reward.',
    method: 'get',
    path: '/loyalty/rewards',
    query: listLoyaltyRewardsQuerySchema,
  },
  {
    name: 'create_loyalty_reward',
    title: 'Create loyalty reward',
    titleKa: 'ჯილდოს შექმნა',
    description:
      'Create a loyalty reward with a name, points cost, type, optional stock and branch, and return it. Reward types come from loyalty_catalog.',
    method: 'post',
    path: '/loyalty/rewards',
    destructive: false,
    body: createLoyaltyRewardSchema,
  },
  {
    name: 'update_loyalty_reward',
    title: 'Update loyalty reward',
    titleKa: 'ჯილდოს რედაქტირება',
    description:
      "Edit a loyalty reward's name, points cost, type, stock, branch or active flag and return the updated reward. Points cost changes what members pay for it.",
    method: 'patch',
    path: '/loyalty/rewards/:id',
    destructive: true,
    body: updateLoyaltyRewardSchema,
    params: id,
  },
  {
    name: 'delete_loyalty_reward',
    title: 'Delete loyalty reward',
    titleKa: 'ჯილდოს წაშლა',
    description:
      'Permanently delete a loyalty reward. Use update_loyalty_reward with active false to retire it while keeping history.',
    method: 'del',
    path: '/loyalty/rewards/:id',
    destructive: true,
    params: id,
  },
  {
    name: 'list_redemptions',
    project: listOf(slimRedemption),
    title: 'List loyalty redemptions',
    titleKa: 'ჯილდოების გაცვლები',
    description:
      'List loyalty reward redemptions page by page: member, status, reward, points spent and date. Use cancel_loyalty_redemption to reverse one.',
    method: 'get',
    path: '/loyalty/redemptions',
    query: listRedemptionsQuerySchema,
  },
  {
    name: 'redeem_loyalty_reward',
    title: 'Redeem loyalty reward',
    titleKa: 'ჯილდოს გაცვლა',
    description:
      "Spend a member's points on a loyalty reward and return the redemption and new balance. Check get_loyalty_member_balance first.",
    method: 'post',
    path: '/loyalty/redemptions',
    destructive: false,
    body: redeemRewardSchema,
  },
  {
    name: 'cancel_loyalty_redemption',
    title: 'Cancel loyalty redemption',
    titleKa: 'გაცვლის გაუქმება',
    description:
      'Cancel a loyalty redemption and refund its points to the member; returns the updated redemption and balance. Redemption ids come from list_redemptions.',
    method: 'post',
    path: '/loyalty/redemptions/:id/cancel',
    destructive: true,
    params: id,
  },
  {
    name: 'get_member_loyalty',
    title: 'Get member loyalty balance',
    titleKa: 'წევრის ლოიალობის ბალანსი',
    description:
      "Read a member's loyalty balance with their points history (earned, spent and adjusted). Use get_loyalty_member_balance when only the number is needed.",
    method: 'get',
    path: '/loyalty/members/:memberId',
    params: memberId,
  },
  {
    name: 'get_loyalty_member_balance',
    title: 'Get loyalty member balance',
    titleKa: 'წევრის ქულების ბალანსი',
    description:
      "Read just a member's current loyalty points balance. Use get_member_loyalty for the points history.",
    method: 'get',
    path: '/loyalty/members/:memberId/balance',
    params: memberId,
  },
  {
    name: 'adjust_member_points',
    title: 'Adjust member loyalty points',
    titleKa: 'წევრის ქულების კორექცია',
    description:
      "Add or remove loyalty points on a member's balance with a reason and return the new balance. Reasons come from loyalty_catalog.",
    method: 'post',
    path: '/loyalty/members/:memberId/adjust',
    destructive: true,
    body: adjustLoyaltyPointsSchema,
    params: memberId,
  },
  {
    name: 'get_loyalty_summary',
    title: 'Get loyalty summary',
    titleKa: 'ლოიალობის შეჯამება',
    description:
      'Read loyalty program totals: points issued and redeemed, outstanding points, redemption count and active rewards. Use for program health questions.',
    method: 'get',
    path: '/loyalty/reports/summary',
  },
  {
    name: 'get_loyalty_points_timeseries',
    title: 'Get loyalty points timeseries',
    titleKa: 'ქულების დინამიკა',
    description:
      'Read loyalty points issued and redeemed per month over a window. Use for trend questions; get_loyalty_summary gives totals.',
    method: 'get',
    path: '/loyalty/reports/points-timeseries',
    query: loyaltyTimeseriesQuerySchema,
  },
  {
    name: 'get_loyalty_redemptions_by_type',
    title: 'Get loyalty redemptions by type',
    titleKa: 'გაცვლები ტიპების მიხედვით',
    description:
      'Read how many loyalty redemptions each reward type has had. Use to see which kinds of rewards members prefer.',
    method: 'get',
    path: '/loyalty/reports/redemptions-by-type',
  },
  {
    name: 'list_loyalty_top_earners',
    title: 'List loyalty top earners',
    titleKa: 'ქულების ლიდერები',
    description:
      'List the members who earned the most loyalty points, highest first. Use for leaderboard or most-engaged-member questions.',
    method: 'get',
    path: '/loyalty/reports/top-earners',
    query: loyaltyTopEarnersQuerySchema,
  },
]);
