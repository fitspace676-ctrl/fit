import {
  dashboardClassesQuerySchema,
  dashboardMembersQuerySchema,
  dashboardOverviewQuerySchema,
  dashboardRevenueQuerySchema,
  dashboardSalesQuerySchema,
  dashboardStaffQuerySchema,
} from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/dashboard/dashboard.controller.ts. */
export const dashboardTools = defineTools('insights', [
  {
    name: 'dashboard_stats',
    core: true,
    title: 'Dashboard stats',
    titleKa: 'დაფის სტატისტიკა',
    description:
      'Read headline counts: members, trainers, branches and products, active and total. For quick size questions; period KPIs are get_dashboard_overview, tables for a date window run_report.',
    method: 'get',
    path: '/dashboard/stats',
  },
  {
    name: 'get_dashboard_overview',
    core: true,
    title: 'Get dashboard overview',
    titleKa: 'დაფის მიმოხილვა',
    description:
      "Headline KPIs of the overview tab for the current period: occupancy, revenue, check-ins, new members, today's classes, alerts. Start here for how the gym is doing; tables are run_report, trends get_analytics.",
    method: 'get',
    path: '/dashboard/overview',
    query: dashboardOverviewQuerySchema,
  },
  {
    name: 'get_dashboard_sales',
    title: 'Get dashboard sales',
    titleKa: 'გაყიდვების მიმოხილვა',
    description:
      'Headline KPIs of the sales tab for the current period: revenue and refund trend, payment split, top items. Single sales are list_orders, tables run_report, rows behind a metric run_report_drilldown.',
    method: 'get',
    path: '/dashboard/sales',
    query: dashboardSalesQuerySchema,
  },
  {
    name: 'get_dashboard_members',
    title: 'Get dashboard members',
    titleKa: 'წევრების მიმოხილვა',
    description:
      'Headline KPIs of the members tab for the current period: active trend, signups against churn, retention, billing split. Tables for a date window are run_report, rows behind a metric run_report_drilldown.',
    method: 'get',
    path: '/dashboard/members',
    query: dashboardMembersQuerySchema,
  },
  {
    name: 'get_dashboard_revenue',
    title: 'Get dashboard revenue',
    titleKa: 'შემოსავლის მიმოხილვა',
    description:
      'Headline KPIs of the revenue tab for the current period: streams, MRR trend, projection, outstanding invoices, per branch. Tables for a date window are run_report, rows behind a metric run_report_drilldown.',
    method: 'get',
    path: '/dashboard/revenue',
    query: dashboardRevenueQuerySchema,
  },
  {
    name: 'get_dashboard_classes',
    title: 'Get dashboard classes',
    titleKa: 'კლასების მიმოხილვა',
    description:
      'Headline KPIs of the classes tab for the current period: bookings, attendance, utilization, PT trend, ranking, heatmap. Tables for a date window are run_report, rows behind a metric run_report_drilldown.',
    method: 'get',
    path: '/dashboard/classes',
    query: dashboardClassesQuerySchema,
  },
  {
    name: 'get_dashboard_staff',
    title: 'Get dashboard staff',
    titleKa: 'პერსონალის მიმოხილვა',
    description:
      'Headline KPIs of the staff tab for the current period: sessions delivered, per-trainer utilization, weekly rota. Tables for a date window are run_report, rows behind a metric run_report_drilldown.',
    method: 'get',
    path: '/dashboard/staff',
    query: dashboardStaffQuerySchema,
  },
]);
