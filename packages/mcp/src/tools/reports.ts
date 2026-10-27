import { reportKeySchema, reportQuerySchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/reports/reports.controller.ts. */
export const reportsTools = defineTools('insights', [
  {
    name: 'report_catalog',
    core: true,
    title: 'Report catalog',
    titleKa: 'რეპორტების კატალოგი',
    description:
      'List the available tabular reports with each key, title, description and columns. Use first to choose the report key for run_report.',
    method: 'get',
    path: '/admin/reports',
  },
  {
    name: 'run_report',
    core: true,
    title: 'Run report',
    titleKa: 'რეპორტის გაშვება',
    description:
      'Run a tabular report from report_catalog for a date window (period or from/to) and optional branch: columns and rows. Headline KPIs are get_dashboard_*, rows behind one metric run_report_drilldown, trends get_analytics.',
    method: 'get',
    path: '/admin/reports/:report',
    query: reportQuerySchema,
    params: { report: reportKeySchema },
  },
]);
