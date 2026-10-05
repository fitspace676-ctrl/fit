import { reportDrilldownQuerySchema, reportMetricSchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/reports/report-drilldown.controller.ts. */
export const reportDrilldownTools = defineTools('insights', [
  {
    name: 'report_drilldown_catalog',
    title: 'Report drilldown catalog',
    titleKa: 'დეტალური რეპორტების კატალოგი',
    description:
      'List the metrics that can be drilled into, each with its title, description and sections. Use first to choose the metric for run_report_drilldown.',
    method: 'get',
    path: '/admin/reports/drilldown',
  },
  {
    name: 'run_report_drilldown',
    title: 'Run report drilldown',
    titleKa: 'დეტალური რეპორტის გაშვება',
    description:
      'Compute one metric from report_drilldown_catalog for a window and optional branch: KPIs, trend series, breakdowns and detail sections. Use run_report for plain tables.',
    method: 'get',
    path: '/admin/reports/drilldown/:metric',
    query: reportDrilldownQuerySchema,
    params: { metric: reportMetricSchema },
  },
]);
