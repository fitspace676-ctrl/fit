import { adminEnrollSubscriptionSchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/subscriptions/admin-subscription-enrollment.controller.ts. */
export const adminSubscriptionEnrollmentTools = defineTools('plans', [
  {
    name: 'enroll_subscription',
    title: 'Enroll subscription',
    titleKa: 'წევრის გამოწერაზე ჩაწერა',
    description:
      'Enroll a member on a subscription plan on their behalf and return the new subscription. memberId from list_members, planId from list_subscription_plans.',
    method: 'post',
    path: '/admin/subscriptions/enroll',
    destructive: false,
    body: adminEnrollSubscriptionSchema,
  },
]);
