import { z } from 'zod';
import {
  createSubscriptionPlanSchema,
  listAdminSubscriptionPlansQuerySchema,
  updateSubscriptionPlanSchema,
} from '@fit/types';
import { listOf, slimPlan } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/subscriptions/admin-subscription-plans.controller.ts. */
export const adminSubscriptionPlansTools = defineTools('plans', [
  {
    name: 'list_subscription_plans',
    core: true,
    project: listOf(slimPlan),
    title: 'List subscription plans',
    titleKa: 'გამოწერის გეგმები',
    description:
      'List recurring membership subscription plans page by page: id, name, status, price, interval and subscriber count. Use get_subscription_plan for full detail and enroll_subscription to sign a member up.',
    method: 'get',
    path: '/admin/subscriptions',
    query: listAdminSubscriptionPlansQuerySchema,
  },
  {
    name: 'get_subscription_plan',
    title: 'Get subscription plan',
    titleKa: 'გამოწერის გეგმის დეტალები',
    description:
      'Read one subscription plan in full: price, interval, features, freeze days, included credits, trial and subscribers. Use before update_subscription_plan.',
    method: 'get',
    path: '/admin/subscriptions/:id',
    params: id,
  },
  {
    name: 'create_subscription_plan',
    title: 'Create subscription plan',
    titleKa: 'გამოწერის გეგმის შექმნა',
    description:
      'Create a recurring membership plan from a name with optional price, interval, features, freeze days and trial. Returns the new plan.',
    method: 'post',
    path: '/admin/subscriptions',
    destructive: false,
    body: createSubscriptionPlanSchema,
  },
  {
    name: 'update_subscription_plan',
    title: 'Update subscription plan',
    titleKa: 'გამოწერის გეგმის რედაქტირება',
    description:
      "Edit a subscription plan's name, price, interval, features or allowances and return the updated plan. Read get_subscription_plan first; price changes affect members' billing.",
    method: 'patch',
    path: '/admin/subscriptions/:id',
    destructive: true,
    body: updateSubscriptionPlanSchema,
    params: id,
  },
  {
    name: 'set_subscription_plan_status',
    title: 'Activate / deactivate subscription plan',
    titleKa: 'გამოწერის გეგმის ჩართვა ან გამორთვა',
    description:
      'Stop offering a subscription plan (active=false) or offer it again (active=true) and return the updated plan. Confirm the plan with get_subscription_plan first.',
    method: 'post',
    path: '/admin/subscriptions/:id/deactivate',
    activePath: '/admin/subscriptions/:id/reactivate',
    destructive: true,
    params: id,
  },
]);
