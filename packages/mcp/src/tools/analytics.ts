import { analyticsQuerySchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/analytics/analytics.controller.ts. */
export const analyticsTools = defineTools('insights', [
  {
    name: 'get_analytics',
    title: 'Get analytics',
    titleKa: 'ანალიტიკა',
    description:
      'Read business analytics for a range: KPIs, revenue trends, channel and plan mix, and top classes. Use for broad business analysis; run_report gives individual report tables.',
    method: 'get',
    path: '/admin/analytics',
    query: analyticsQuerySchema,
  },
]);
