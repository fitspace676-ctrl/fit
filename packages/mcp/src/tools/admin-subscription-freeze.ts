import { z } from 'zod';
import { freezeSubscriptionSchema } from '@fit/types';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/subscriptions/admin-subscription-freeze.controller.ts. */
export const adminSubscriptionFreezeTools = defineTools('plans', [
  {
    name: 'freeze_subscription',
    title: 'Freeze subscription',
    titleKa: 'გამოწერის გაყინვა',
    description:
      "Pause a member's subscription from startDate for durationDays and return when the freeze ends. Pass the member's subscription id from get_member, not the plan id.",
    method: 'post',
    path: '/admin/subscriptions/:id/freeze',
    destructive: true,
    body: freezeSubscriptionSchema,
    params: id,
  },
  {
    name: 'unfreeze_subscription',
    title: 'Unfreeze subscription',
    titleKa: 'გამოწერის განყინვა',
    description:
      "End a member's subscription freeze now and return the new billing period end. Pass the member's subscription id, not the plan id.",
    method: 'post',
    path: '/admin/subscriptions/:id/unfreeze',
    destructive: false,
    params: id,
  },
]);
