import { listActivityQuerySchema } from '@fit/types';
import { listOf, slimActivity } from './projections';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/activity/activity.controller.ts. */
export const activityTools = defineTools('insights', [
  {
    name: 'list_activity',
    project: listOf(slimActivity),
    title: 'List activity',
    titleKa: 'აქტივობის ლენტი',
    description:
      "List the gym's recent activity feed, newest first and filterable by type or date: type, title, member, amount and time. Staff actions are in list_audit_logs.",
    method: 'get',
    path: '/admin/activity',
    query: listActivityQuerySchema,
  },
]);
