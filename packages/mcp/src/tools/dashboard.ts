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
      'Read headline counts for the gym: members, trainers, branches and products, each as active and total. Use for quick size questions; get_dashboard_overview has revenue and activity.',
    method: 'get',
    path: '/dashboard/stats',
  },
  {
    name: 'get_dashboard_overview',
    core: true,
    title: 'Get dashboard overview',
    titleKa: 'დაფის მიმოხილვა',
    description:
      "Read today's or a period's key numbers: occupancy, revenue, check-ins, new members, classes, a revenue trend, plan mix, today's classes and alerts. Start here for 'how is the gym doing'.",
    method: 'get',
    path: '/dashboard/overview',
    query: dashboardOverviewQuerySchema,
  },
  {
    name: 'get_dashboard_sales',
    title: 'Get dashboard sales',
    titleKa: 'გაყიდვების მიმოხილვა',
    description:
      'Read sales KPIs for a period with revenue and refund trends, payment-method split and top-selling items. Use for sales performance; list_orders has individual sales.',
    method: 'get',
    path: '/dashboard/sales',
    query: dashboardSalesQuerySchema,
  },
  {
    name: 'get_dashboard_members',
    title: 'Get dashboard members',
    titleKa: 'წევრების მიმოხილვა',
    description:
      'Read member KPIs for a period with the active-member trend, signups against churn, retention rate and billing-state split. Use for growth and retention questions.',
    method: 'get',
    path: '/dashboard/members',
    query: dashboardMembersQuerySchema,
  },
  {
    name: 'get_dashboard_revenue',
    title: 'Get dashboard revenue',
    titleKa: 'შემოსავლის მიმოხილვა',
    description:
      'Read revenue KPIs for a period with revenue streams, MRR trend, projection, outstanding invoices and per-branch breakdown. Use for income questions.',
    method: 'get',
    path: '/dashboard/revenue',
    query: dashboardRevenueQuerySchema,
  },
  {
    name: 'get_dashboard_classes',
    title: 'Get dashboard classes',
    titleKa: 'კლასების მიმოხილვა',
    description:
      'Read class KPIs for a period with booking, attendance, utilization and PT trends, class-type ranking and demand heatmap. Use for class performance questions.',
    method: 'get',
    path: '/dashboard/classes',
    query: dashboardClassesQuerySchema,
  },
  {
    name: 'get_dashboard_staff',
    title: 'Get dashboard staff',
    titleKa: 'პერსონალის მიმოხილვა',
    description:
      'Read staff KPIs for a period with sessions delivered, per-trainer delivery and utilization, and the weekly rota. Use for trainer workload questions.',
    method: 'get',
    path: '/dashboard/staff',
    query: dashboardStaffQuerySchema,
  },
]);
