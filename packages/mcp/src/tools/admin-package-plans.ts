import { z } from 'zod';
import {
  createPackagePlanSchema,
  listAdminPackagePlansQuerySchema,
  updatePackagePlanSchema,
} from '@fit/types';
import { listOf, slimPlan } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/packages/admin-package-plans.controller.ts. */
export const adminPackagePlansTools = defineTools('plans', [
  {
    name: 'list_package_plans',
    core: true,
    project: listOf(slimPlan),
    title: 'List package plans',
    titleKa: 'პაკეტების სია',
    description:
      'List package plans (session packs and memberships sold as packages) page by page: id, name, status, price, billing interval and session count. Use get_package_plan for features and full detail.',
    method: 'get',
    path: '/admin/packages',
    query: listAdminPackagePlansQuerySchema,
  },
  {
    name: 'get_package_plan',
    title: 'Get package plan',
    titleKa: 'პაკეტის დეტალები',
    description:
      'Read one package plan in full: price, billing interval, sessions, features, branch and status. Use before update_package_plan.',
    method: 'get',
    path: '/admin/packages/:id',
    params: id,
  },
  {
    name: 'create_package_plan',
    title: 'Create package plan',
    titleKa: 'პაკეტის შექმნა',
    description:
      'Create a package plan from a name with optional price, interval, session count and features. Returns the new plan; grant it to a member with grant_member_credit_pack.',
    method: 'post',
    path: '/admin/packages',
    destructive: false,
    body: createPackagePlanSchema,
  },
  {
    name: 'update_package_plan',
    title: 'Update package plan',
    titleKa: 'პაკეტის რედაქტირება',
    description:
      "Edit a package plan's name, price, interval, sessions or features and return the updated plan. Read get_package_plan first; price changes affect new purchases.",
    method: 'patch',
    path: '/admin/packages/:id',
    destructive: true,
    body: updatePackagePlanSchema,
    params: id,
  },
  {
    name: 'set_package_plan_status',
    title: 'Activate / deactivate package plan',
    titleKa: 'პაკეტის ჩართვა ან გამორთვა',
    description:
      'Stop selling a package plan (active=false) or offer it again (active=true) and return the updated plan. Confirm the plan with get_package_plan first.',
    method: 'post',
    path: '/admin/packages/:id/deactivate',
    activePath: '/admin/packages/:id/reactivate',
    destructive: true,
    params: id,
  },
]);
