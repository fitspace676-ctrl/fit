import { adminEnrollSubscriptionSchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/subscriptions/admin-subscription-enrollment.controller.ts. */
export const adminSubscriptionEnrollmentTools = defineTools('plans', [
  {
    name: 'enroll_subscription',
    title: 'Enroll subscription',
    titleKa: 'წევრის გამოწერაზე ჩაწერა',
    description:
      'Put a member on a subscription plan without a POS payment record and return the subscription; planId from list_subscription_plans. To sell and take payment use record_pos_sale; credits use grant_member_credit_pack.',
    method: 'post',
    path: '/admin/subscriptions/enroll',
    destructive: false,
    body: adminEnrollSubscriptionSchema,
  },
]);
