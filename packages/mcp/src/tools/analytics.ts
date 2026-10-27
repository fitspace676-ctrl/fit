import { analyticsQuerySchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/analytics/analytics.controller.ts. */
export const analyticsTools = defineTools('insights', [
  {
    name: 'get_analytics',
    title: 'Get analytics',
    titleKa: 'ანალიტიკა',
    description:
      "Read trends and time series for a range: KPIs, revenue trends, channel and plan mix, top classes. Use for trend analysis; headline KPIs are get_dashboard_*, tables run_report, a metric's rows run_report_drilldown.",
    method: 'get',
    path: '/admin/analytics',
    query: analyticsQuerySchema,
  },
]);
