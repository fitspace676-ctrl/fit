import type { DomainId, Endpoint, ToolModule } from './tools/shared';
import { membersTools } from './tools/members';
import { checkInTools } from './tools/check-in';
import { adminClassTemplatesTools } from './tools/admin-class-templates';
import { classTypesTools } from './tools/class-types';
import { adminScheduleTools } from './tools/admin-schedule';
import { attendanceTools } from './tools/attendance';
import { ptSessionsTools } from './tools/pt-sessions';
import { adminServicesTools } from './tools/admin-services';
import { serviceSessionsTools } from './tools/service-sessions';
import { adminProductsTools } from './tools/admin-products';
import { adminProductCategoriesTools } from './tools/admin-product-categories';
import { ordersTools } from './tools/orders';
import { adminInvoicesTools } from './tools/admin-invoices';
import { adminCreditPacksTools } from './tools/admin-credit-packs';
import { adminPackagePlansTools } from './tools/admin-package-plans';
import { adminSubscriptionPlansTools } from './tools/admin-subscription-plans';
import { adminSubscriptionEnrollmentTools } from './tools/admin-subscription-enrollment';
import { adminSubscriptionFreezeTools } from './tools/admin-subscription-freeze';
import { staffTools } from './tools/staff';
import { staffDepthTools } from './tools/staff-depth';
import { adminTrainersTools } from './tools/admin-trainers';
import { adminLocationsTools } from './tools/admin-locations';
import { marketingTools } from './tools/marketing';
import { adminBannersTools } from './tools/admin-banners';
import { automationTools } from './tools/automation';
import { loyaltyTools } from './tools/loyalty';
import { dashboardTools } from './tools/dashboard';
import { reportsTools } from './tools/reports';
import { reportDrilldownTools } from './tools/report-drilldown';
import { analyticsTools } from './tools/analytics';
import { activityTools } from './tools/activity';
import { auditTools } from './tools/audit';
import { adminReviewsTools } from './tools/admin-reviews';
import { gymSettingsTools } from './tools/gym-settings';

export interface ToolDomain {
  id: string;
  title: string;
  titleKa: string;
  description: string;
  tools: string[];
}

/** Every tools module, in registration order. */
export const TOOL_MODULES: ToolModule[] = [
  membersTools,
  checkInTools,
  adminClassTemplatesTools,
  classTypesTools,
  adminScheduleTools,
  attendanceTools,
  ptSessionsTools,
  adminServicesTools,
  serviceSessionsTools,
  adminProductsTools,
  adminProductCategoriesTools,
  ordersTools,
  adminInvoicesTools,
  adminCreditPacksTools,
  adminPackagePlansTools,
  adminSubscriptionPlansTools,
  adminSubscriptionEnrollmentTools,
  adminSubscriptionFreezeTools,
  staffTools,
  staffDepthTools,
  adminTrainersTools,
  adminLocationsTools,
  marketingTools,
  adminBannersTools,
  automationTools,
  loyaltyTools,
  dashboardTools,
  reportsTools,
  reportDrilldownTools,
  analyticsTools,
  activityTools,
  auditTools,
  adminReviewsTools,
  gymSettingsTools,
];

export const ALL_ENDPOINTS: Endpoint[] = TOOL_MODULES.flatMap((module) => module.endpoints);

const DOMAIN_COPY: Record<DomainId, Omit<ToolDomain, 'id' | 'tools'>> = {
  members: {
    title: 'Members & check-in',
    titleKa: 'წევრები და ჩექინი',
    description:
      'Find, create and edit members, their status, notes, tasks and emails, and handle front-desk check-ins and access eligibility.',
  },
  classes: {
    title: 'Classes & schedule',
    titleKa: 'კლასები და განრიგი',
    description:
      'Manage class types, recurring classes, the dated schedule, bookings and waitlists, attendance and personal-training sessions.',
  },
  services: {
    title: 'Services & appointments',
    titleKa: 'სერვისები და ჯავშნები',
    description:
      'Manage the bookable service catalogue (massage, PT and custom services) and its appointment slots.',
  },
  products: {
    title: 'Shop products & stock',
    titleKa: 'მაღაზია და მარაგი',
    description:
      'Manage shop products, categories, prices and variants, and read or correct inventory and stock history per branch.',
  },
  sales: {
    title: 'Sales, invoices & credits',
    titleKa: 'გაყიდვები, ინვოისები და კრედიტები',
    description:
      'Look up and record POS sales, refunds and receipts, end-of-day cash, invoices, and member session credit packs.',
  },
  plans: {
    title: 'Plans & subscriptions',
    titleKa: 'პაკეტები და გამოწერები',
    description:
      'Define package and subscription plans and their prices, enroll members on subscriptions, and freeze or unfreeze them.',
  },
  staff: {
    title: 'Staff',
    titleKa: 'პერსონალი',
    description:
      'Manage staff accounts, invitations and roles, plus staff notes, tasks, weekly shifts, time off and who is working now.',
  },
  trainers: {
    title: 'Trainers',
    titleKa: 'ტრენერები',
    description:
      'Manage public trainer profiles, their weekly availability, status and personal-training client lists.',
  },
  locations: {
    title: 'Branches',
    titleKa: 'ფილიალები',
    description:
      "Manage the gym's branches: addresses, opening hours, amenities, status and the default branch.",
  },
  marketing: {
    title: 'Marketing & loyalty',
    titleKa: 'მარკეტინგი და ლოიალობა',
    description:
      'Run campaigns, audiences, message templates, promo codes and banners, automation rules, and the loyalty points program and rewards.',
  },
  insights: {
    title: 'Dashboard, reports & logs',
    titleKa: 'დაფა, რეპორტები და ჟურნალები',
    description:
      'Answer performance questions with dashboards, reports, drilldowns and analytics, and review the activity feed, audit log and trainer reviews.',
  },
  settings: {
    title: 'Gym settings',
    titleKa: 'დარბაზის პარამეტრები',
    description:
      "Read or change the gym's branding, portal theme, language, opening hours, policies and guest or trial prices.",
  },
};

/** The tools grouped by what an operator asks about; built at import time, no server needed. */
export const TOOL_DOMAINS: ToolDomain[] = (Object.keys(DOMAIN_COPY) as DomainId[]).map((id) => ({
  id,
  ...DOMAIN_COPY[id],
  tools: TOOL_MODULES.filter((module) => module.domain === id).flatMap((module) =>
    module.endpoints.map((endpoint) => endpoint.name),
  ),
}));

/** Read-only tools the agent always has, whichever domains it loads. */
export const CORE_TOOLS: string[] = ALL_ENDPOINTS.filter((endpoint) => endpoint.core).map(
  (endpoint) => endpoint.name,
);

/** Operator-facing tool titles: the English MCP title and its Georgian counterpart. */
export const TOOL_TITLES: Record<string, { en: string; ka: string }> = Object.fromEntries(
  ALL_ENDPOINTS.map((endpoint) => [endpoint.name, { en: endpoint.title, ka: endpoint.titleKa }]),
);
