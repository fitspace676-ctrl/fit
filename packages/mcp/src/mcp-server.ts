// @fit/admin — the Fit MCP server: the fitness admin's read + edit surface,
// exposed as Model Context Protocol tools for the AI agent.
//
// Each tool wraps a tenant-scoped @fit/api endpoint, authenticated with the
// operator's access token (see fit-api.ts). The agent connects to this server
// over MCP (an in-memory transport, in-process — see run-agent.ts) and calls
// these tools to manage the gym from chat. Because every call carries the
// operator's token, the agent is bounded by the same role → permission matrix
// the console UI enforces.
//
// Tool outputs are deliberately projected down to the fields that matter (not
// the full API payload) to keep the model's token cost — and the operator's
// bill — low. Adding an entity is mechanical: register another tool here.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createFitApiClient, qs, type FitApiClient } from './fit-api';

/** A tool result carrying JSON the model reads back. */
function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/** An error result the model sees and can recover from. */
function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Run an API call, mapping failures to a readable tool error. */
async function guard<T>(fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'request_failed');
  }
}

/** Project a member row/detail to the fields worth spending tokens on. */
function slimMember(m: Record<string, unknown>): Record<string, unknown> {
  const plan = m.plan as Record<string, unknown> | undefined;
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone ?? null,
    status: m.status,
    plan: plan?.name ?? null,
  };
}

/** Project a list envelope's `data` through `slim`, keeping paging meta. */
function slimList(res: unknown, slim: (row: Record<string, unknown>) => unknown): unknown {
  const r = res as { data?: unknown[]; total?: number; page?: number; limit?: number };
  if (!Array.isArray(r?.data)) return res;
  return {
    total: r.total,
    page: r.page,
    limit: r.limit,
    data: r.data.map((row) => slim(row as Record<string, unknown>)),
  };
}

/** Project a trainer row to id/name/status plus its headline. */
function slimTrainer(r: Record<string, unknown>): Record<string, unknown> {
  return { id: r.id, name: r.name, status: r.status, headline: r.headline };
}

/** Project a location row to id/name/status/address. */
function slimLocation(r: Record<string, unknown>): Record<string, unknown> {
  return { id: r.id, name: r.name, status: r.status, address: r.address };
}

/** Project a product row to id/name/status/price. */
function slimProduct(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    priceAmount: r.priceAmount,
    currency: r.currency,
  };
}

/** Project a class template row to id/title/status/category. */
function slimClass(r: Record<string, unknown>): Record<string, unknown> {
  return { id: r.id, title: r.title, status: r.status, category: r.category };
}

/** Project a package/subscription plan row to id/name/status/price. */
function slimPlan(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    priceAmount: r.priceAmount,
    currency: r.currency,
  };
}

/** Project an order row to id/customer/status/total. */
function slimOrder(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    customerName: r.customerName,
    status: r.status,
    total: r.total,
    currency: r.currency,
  };
}

/** Project an automation rule row to id/name/trigger/action/active. */
function slimAutomationRule(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    triggerType: r.triggerType,
    actionType: r.actionType,
    active: r.active,
  };
}

/** Project a campaign row to id/name/channel/status. */
function slimCampaign(r: Record<string, unknown>): Record<string, unknown> {
  return { id: r.id, name: r.name, channel: r.channel, status: r.status };
}

/**
 * Build a Fit MCP server bound to one operator's access token. The returned
 * server is ready to connect to a transport.
 */
export function createFitMcpServer(token: string): McpServer {
  const api: FitApiClient = createFitApiClient(token);
  const server = new McpServer(
    { name: 'fit-admin', version: '0.1.0' },
    {
      instructions:
        'Tools to read and manage a fitness gym: members, trainers, locations, classes, products, ' +
        'package/subscription plans, staff, gym settings, automation, ' +
        'marketing (segments/templates/promo codes/campaigns), loyalty, orders, check-ins, ' +
        'dashboard, and reports. IDs come from the list_* tools — never invent one. Confirm the ' +
        'target with a get_* before an edit when the user was vague. create_*/update_* tools take a ' +
        'freeform `data` object re-validated server-side; a rejected field comes back as a readable error.',
    },
  );

  // ── Members ────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_members',
    {
      title: 'List members',
      description: 'Search/filter the gym roster. Returns id, name, email, status, plan.',
      inputSchema: {
        search: z.string().optional().describe('name/email substring'),
        status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).optional(),
        planId: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().describe('default 20'),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => guard(async () => slimList(await api.get(`/members${qs(args)}`), slimMember)),
  );

  server.registerTool(
    'get_member',
    {
      title: 'Get member',
      description: "One member's full detail by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/members/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'update_member_contact',
    {
      title: 'Update member contact',
      description: "Edit a member's name and/or phone. Email is immutable.",
      inputSchema: {
        id: z.string(),
        name: z.string().describe("the member's full name (required by the API)"),
        phone: z.string().optional().describe('empty string clears it'),
      },
    },
    async ({ id, name, phone }) =>
      guard(() =>
        api.patch(`/members/${encodeURIComponent(id)}`, {
          name,
          ...(phone !== undefined && { phone }),
        }),
      ),
  );

  server.registerTool(
    'set_member_status',
    {
      title: 'Activate / suspend member',
      description: 'Reactivate (active=true) or suspend (active=false) a member.',
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() =>
        api.post(`/members/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`),
      ),
  );

  server.registerTool(
    'create_member',
    {
      title: 'Create member',
      description:
        'Add a new member. Fields: name, email, phone?, status?, planId? (enrols on a plan).',
      inputSchema: {
        data: z
          .record(z.string(), z.unknown())
          .describe('e.g. {"name":"...","email":"...","phone":"...","planId":"..."}'),
      },
    },
    async ({ data }) => guard(() => api.post('/members', data)),
  );

  server.registerTool(
    'add_member_note',
    {
      title: 'Add member note',
      description: 'Attach a staff note to a member.',
      inputSchema: { id: z.string(), note: z.string() },
    },
    async ({ id, note }) =>
      guard(() => api.post(`/members/${encodeURIComponent(id)}/notes`, { body: note })),
  );

  // ── Classes ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_classes',
    {
      title: 'List class templates',
      description: 'Search/filter the gym class templates.',
      inputSchema: {
        search: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () => slimList(await api.get(`/admin/classes${qs(args)}`), slimClass)),
  );

  server.registerTool(
    'get_class',
    {
      title: 'Get class template',
      description: "One class template's detail by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/admin/classes/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'create_class',
    {
      title: 'Create class template',
      description:
        'Add a class template. Fields: title, category, trainerId?, locationId?, capacity, ' +
        'durationMinutes, rrule (recurrence), pricingRule (FREE|INCLUDED|PAID), priceMinor?, validFrom (YYYY-MM-DD).',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/admin/classes', data)),
  );

  server.registerTool(
    'update_class',
    {
      title: 'Update class template',
      description: 'Edit a class template. Same fields as create_class, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/admin/classes/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'set_class_status',
    {
      title: 'Resume / pause class',
      description: 'Resume (active=true) or pause (active=false) a class template.',
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() =>
        api.post(`/admin/classes/${encodeURIComponent(id)}/${active ? 'resume' : 'pause'}`),
      ),
  );

  // ── Products ─────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_products',
    {
      title: 'List products',
      description: 'Search/filter the gym shop products.',
      inputSchema: {
        search: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () => slimList(await api.get(`/admin/products${qs(args)}`), slimProduct)),
  );

  server.registerTool(
    'get_product',
    {
      title: 'Get product',
      description: "One product's detail by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/admin/products/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'create_product',
    {
      title: 'Create product',
      description:
        'Add a shop product. Fields: name, description?, priceAmount (minor units), costAmount?, ' +
        'currency? (default USD), images?, variants?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/admin/products', data)),
  );

  server.registerTool(
    'update_product',
    {
      title: 'Update product',
      description: 'Edit a product. Same fields as create_product, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/admin/products/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'set_product_status',
    {
      title: 'Activate / deactivate product',
      description: 'Reactivate (active=true) or deactivate (active=false) a product.',
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() =>
        api.post(
          `/admin/products/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`,
        ),
      ),
  );

  // ── Trainers ─────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_trainers',
    {
      title: 'List trainers',
      description: 'Search/filter the gym trainer roster.',
      inputSchema: {
        search: z.string().optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        sort: z.enum(['name', 'status', 'createdAt']).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () => slimList(await api.get(`/admin/trainers${qs(args)}`), slimTrainer)),
  );

  server.registerTool(
    'get_trainer',
    {
      title: 'Get trainer',
      description: "One trainer's full detail by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/admin/trainers/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'create_trainer',
    {
      title: 'Create trainer',
      description:
        'Add a trainer. Fields: name, headline?, bio?, photoUrl?, specialties? (tags), status?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/admin/trainers', data)),
  );

  server.registerTool(
    'update_trainer',
    {
      title: 'Update trainer',
      description: 'Edit a trainer. Same fields as create_trainer, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/admin/trainers/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'set_trainer_status',
    {
      title: 'Activate / deactivate trainer',
      description: 'Reactivate (active=true) or deactivate (active=false) a trainer.',
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() =>
        api.post(
          `/admin/trainers/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`,
        ),
      ),
  );

  // ── Locations ────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_locations',
    {
      title: 'List locations',
      description: 'Search/filter the gym branch roster.',
      inputSchema: {
        search: z.string().optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        sort: z.enum(['name', 'status', 'createdAt']).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () => slimList(await api.get(`/admin/locations${qs(args)}`), slimLocation)),
  );

  server.registerTool(
    'get_location',
    {
      title: 'Get location',
      description: "One location's full detail by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/admin/locations/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'create_location',
    {
      title: 'Create location',
      description:
        'Add a branch location. Fields: name, address?, phone?, photoUrl?, amenities?, hours?, status?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/admin/locations', data)),
  );

  server.registerTool(
    'update_location',
    {
      title: 'Update location',
      description: 'Edit a location. Same fields as create_location, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/admin/locations/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'set_location_status',
    {
      title: 'Activate / deactivate location',
      description: 'Reactivate (active=true) or deactivate (active=false) a location.',
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() =>
        api.post(
          `/admin/locations/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`,
        ),
      ),
  );

  // ── Package plans ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_package_plans',
    {
      title: 'List package plans',
      description: 'Search/filter the gym credit-pack / package plan catalogue.',
      inputSchema: {
        search: z.string().optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        sort: z.enum(['name', 'status', 'createdAt']).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () => slimList(await api.get(`/admin/packages${qs(args)}`), slimPlan)),
  );

  server.registerTool(
    'get_package_plan',
    {
      title: 'Get package plan',
      description: "One package plan's full detail by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/admin/packages/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'create_package_plan',
    {
      title: 'Create package plan',
      description:
        'Add a package plan. Fields: name, description?, priceAmount (minor units), currency?, ' +
        'billingInterval? (MONTH|YEAR|ONE_TIME), sessionCount?, features?, popular?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/admin/packages', data)),
  );

  server.registerTool(
    'update_package_plan',
    {
      title: 'Update package plan',
      description: 'Edit a package plan. Same fields as create_package_plan, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/admin/packages/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'set_package_plan_status',
    {
      title: 'Activate / deactivate package plan',
      description: 'Reactivate (active=true) or deactivate (active=false) a package plan.',
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() =>
        api.post(
          `/admin/packages/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`,
        ),
      ),
  );

  // ── Subscription plans ───────────────────────────────────────────────────────

  server.registerTool(
    'list_subscription_plans',
    {
      title: 'List subscription plans',
      description: 'Search/filter the gym subscription plan catalogue.',
      inputSchema: {
        search: z.string().optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        sort: z.enum(['name', 'status', 'createdAt']).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () => slimList(await api.get(`/admin/subscriptions${qs(args)}`), slimPlan)),
  );

  server.registerTool(
    'get_subscription_plan',
    {
      title: 'Get subscription plan',
      description: "One subscription plan's full detail by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/admin/subscriptions/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'create_subscription_plan',
    {
      title: 'Create subscription plan',
      description:
        'Add a subscription plan. Fields: name, description?, priceAmount (minor units), currency?, ' +
        'interval? (MONTH|YEAR), features?, freezeDaysPerPeriod?, includedCredits?, trialDays?, popular?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/admin/subscriptions', data)),
  );

  server.registerTool(
    'update_subscription_plan',
    {
      title: 'Update subscription plan',
      description:
        'Edit a subscription plan. Same fields as create_subscription_plan, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/admin/subscriptions/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'set_subscription_plan_status',
    {
      title: 'Activate / deactivate subscription plan',
      description: 'Reactivate (active=true) or deactivate (active=false) a subscription plan.',
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() =>
        api.post(
          `/admin/subscriptions/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`,
        ),
      ),
  );

  // ── Staff ────────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_staff',
    {
      title: 'List staff',
      description: "The gym's active staff plus pending invitations.",
      inputSchema: {},
    },
    async () => guard(() => api.get('/staff')),
  );

  server.registerTool(
    'invite_staff',
    {
      title: 'Invite staff',
      description:
        'Invite someone to join the gym staff by email + role (OWNER|MANAGER|RECEPTIONIST|TRAINER).',
      inputSchema: {
        email: z.string(),
        role: z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER']),
      },
    },
    async ({ email, role }) => guard(() => api.post('/staff/invite', { email, role })),
  );

  server.registerTool(
    'update_staff_role',
    {
      title: 'Update staff role',
      description: "Change a staff member's role.",
      inputSchema: {
        memberId: z.string(),
        role: z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER']),
      },
    },
    async ({ memberId, role }) =>
      guard(() => api.patch(`/staff/${encodeURIComponent(memberId)}/role`, { role })),
  );

  server.registerTool(
    'remove_staff',
    {
      title: 'Remove staff',
      description: 'Remove a staff member and revoke their sessions.',
      inputSchema: { memberId: z.string() },
    },
    async ({ memberId }) => guard(() => api.del(`/staff/${encodeURIComponent(memberId)}`)),
  );

  // ── Gym settings ─────────────────────────────────────────────────────────────

  server.registerTool(
    'get_gym_settings',
    {
      title: 'Get gym settings',
      description: "The gym's brand / locale / hours / notification / billing settings.",
      inputSchema: {},
    },
    async () => guard(() => api.get('/gyms/settings')),
  );

  server.registerTool(
    'update_gym_settings',
    {
      title: 'Update gym settings',
      description:
        'Partially update gym settings. Sections: brand (name, logoUrl), business, locale, hours, ' +
        'booking, noShow, freeze, guestPass, trial, memberIntake, staffDirectory, reports, ' +
        'payments, invoice, receipt.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.patch('/gyms/settings', data)),
  );

  // ── Automation rules ─────────────────────────────────────────────────────────

  server.registerTool(
    'automation_catalog',
    {
      title: 'Automation catalog',
      description: 'The trigger / action / timing catalogs valid for automation rules.',
      inputSchema: {},
    },
    async () => guard(() => api.get('/automation/catalog')),
  );

  server.registerTool(
    'list_automation_rules',
    {
      title: 'List automation rules',
      description: 'Search/filter the active (non-template) automation rules.',
      inputSchema: {
        search: z.string().optional(),
        triggerType: z.string().optional(),
        active: z.boolean().optional(),
        sort: z.enum(['createdAt', 'name']).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () =>
        slimList(await api.get(`/automation/rules${qs(args)}`), slimAutomationRule),
      ),
  );

  server.registerTool(
    'create_automation_rule',
    {
      title: 'Create automation rule',
      description:
        'Add an automation rule. Fields: name, triggerType, triggerConfig? (e.g. {"days":3}), ' +
        'timingOffset?, actionType, actionConfig, active?. Check automation_catalog for valid trigger/action types.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/automation/rules', data)),
  );

  server.registerTool(
    'update_automation_rule',
    {
      title: 'Update automation rule',
      description: 'Edit an automation rule. Same fields as create_automation_rule, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/automation/rules/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'toggle_automation_rule',
    {
      title: 'Activate / pause automation rule',
      description: "Flip a rule's active state.",
      inputSchema: { id: z.string(), active: z.boolean() },
    },
    async ({ id, active }) =>
      guard(() => api.post(`/automation/rules/${encodeURIComponent(id)}/toggle`, { active })),
  );

  // ── Marketing — segments, templates, promo codes, campaigns ─────────────────

  server.registerTool(
    'marketing_catalog',
    {
      title: 'Marketing catalog',
      description: 'The channel + merge-field catalogs for composing campaigns/templates.',
      inputSchema: {},
    },
    async () => guard(() => api.get('/marketing/catalog')),
  );

  server.registerTool(
    'list_audience_segments',
    {
      title: 'List audience segments',
      description: 'Every saved marketing audience segment, newest first.',
      inputSchema: {},
    },
    async () => guard(() => api.get('/marketing/segments')),
  );

  server.registerTool(
    'create_audience_segment',
    {
      title: 'Create audience segment',
      description:
        'Save a named audience segment. Fields: name, criteria (audience filter object).',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/marketing/segments', data)),
  );

  server.registerTool(
    'update_audience_segment',
    {
      title: 'Update audience segment',
      description: 'Edit a saved audience segment. Fields: name?, criteria?.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/marketing/segments/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'list_message_templates',
    {
      title: 'List message templates',
      description: 'Every saved marketing message template, newest first.',
      inputSchema: {},
    },
    async () => guard(() => api.get('/marketing/templates')),
  );

  server.registerTool(
    'create_message_template',
    {
      title: 'Create message template',
      description: 'Fields: name, channel (email|sms|push), subject?, body, category?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/marketing/templates', data)),
  );

  server.registerTool(
    'update_message_template',
    {
      title: 'Update message template',
      description: 'Edit a message template. Same fields as create_message_template, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/marketing/templates/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'list_promo_codes',
    {
      title: 'List promo codes',
      description: 'Every promo code, newest first.',
      inputSchema: {},
    },
    async () => guard(() => api.get('/marketing/promo-codes')),
  );

  server.registerTool(
    'create_promo_code',
    {
      title: 'Create promo code',
      description:
        'Fields: code, description?, discountType (percentage|fixed), discountValue, minPurchase?, ' +
        'usageLimit?, expiryDate?, status?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/marketing/promo-codes', data)),
  );

  server.registerTool(
    'update_promo_code',
    {
      title: 'Update promo code',
      description: 'Edit a promo code. Same fields as create_promo_code, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/marketing/promo-codes/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'toggle_promo_code',
    {
      title: 'Activate / deactivate promo code',
      description: 'Flip a promo code active/inactive.',
      inputSchema: { id: z.string(), status: z.enum(['active', 'inactive']) },
    },
    async ({ id, status }) =>
      guard(() => api.post(`/marketing/promo-codes/${encodeURIComponent(id)}/toggle`, { status })),
  );

  server.registerTool(
    'list_campaigns',
    {
      title: 'List campaigns',
      description: 'Search/filter marketing campaigns.',
      inputSchema: {
        search: z.string().optional(),
        channel: z.enum(['email', 'sms', 'push']).optional(),
        status: z.enum(['draft', 'scheduled', 'sent', 'paused', 'active']).optional(),
        sort: z.enum(['createdAt', 'updatedAt', 'name']).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) =>
      guard(async () => slimList(await api.get(`/marketing/campaigns${qs(args)}`), slimCampaign)),
  );

  server.registerTool(
    'create_campaign',
    {
      title: 'Create campaign',
      description:
        'Fields: name, channel (email|sms|push), audienceSegmentId? or inlineCriteria? (not both), ' +
        'subject?, body, scheduleType? (now|scheduled), scheduledAt?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/marketing/campaigns', data)),
  );

  server.registerTool(
    'update_campaign',
    {
      title: 'Update campaign',
      description:
        'Edit a draft campaign (not once sent). Same fields as create_campaign, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/marketing/campaigns/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'send_campaign',
    {
      title: 'Send campaign now',
      description: 'Send a campaign immediately.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.post(`/marketing/campaigns/${encodeURIComponent(id)}/send`)),
  );

  server.registerTool(
    'schedule_campaign',
    {
      title: 'Schedule campaign',
      description: 'Schedule a campaign to send at a future ISO datetime.',
      inputSchema: { id: z.string(), scheduledAt: z.string() },
    },
    async ({ id, scheduledAt }) =>
      guard(() =>
        api.post(`/marketing/campaigns/${encodeURIComponent(id)}/schedule`, { scheduledAt }),
      ),
  );

  // ── Loyalty ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'get_loyalty_program',
    {
      title: 'Get loyalty program',
      description: "The gym's loyalty program configuration.",
      inputSchema: {},
    },
    async () => guard(() => api.get('/loyalty/program')),
  );

  server.registerTool(
    'update_loyalty_program',
    {
      title: 'Update loyalty program',
      description: 'Fields: enabled?, pointsPerCheckIn?, pointsPerCurrencyUnit?, signupBonus?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.put('/loyalty/program', data)),
  );

  server.registerTool(
    'list_loyalty_rewards',
    {
      title: 'List loyalty rewards',
      description: "The gym's redeemable rewards catalogue.",
      inputSchema: {},
    },
    async () => guard(() => api.get('/loyalty/rewards')),
  );

  server.registerTool(
    'create_loyalty_reward',
    {
      title: 'Create loyalty reward',
      description:
        'Fields: name, description?, pointsCost, type? (pt_session|day_pass|guest_pass|merchandise|drink|discount|other), active?, stock?.',
      inputSchema: { data: z.record(z.string(), z.unknown()) },
    },
    async ({ data }) => guard(() => api.post('/loyalty/rewards', data)),
  );

  server.registerTool(
    'update_loyalty_reward',
    {
      title: 'Update loyalty reward',
      description: 'Edit a reward. Same fields as create_loyalty_reward, all optional.',
      inputSchema: { id: z.string(), data: z.record(z.string(), z.unknown()) },
    },
    async ({ id, data }) =>
      guard(() => api.patch(`/loyalty/rewards/${encodeURIComponent(id)}`, data)),
  );

  server.registerTool(
    'list_redemptions',
    {
      title: 'List loyalty redemptions',
      description: 'Search/filter the loyalty redemption log.',
      inputSchema: {
        status: z.enum(['pending', 'fulfilled', 'cancelled']).optional(),
        type: z.string().optional(),
        memberId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => guard(() => api.get(`/loyalty/redemptions${qs(args)}`)),
  );

  server.registerTool(
    'get_member_loyalty',
    {
      title: 'Get member loyalty balance',
      description: "A member's points balance plus their recent ledger.",
      inputSchema: { memberId: z.string() },
    },
    async ({ memberId }) =>
      guard(() => api.get(`/loyalty/members/${encodeURIComponent(memberId)}`)),
  );

  server.registerTool(
    'adjust_member_points',
    {
      title: 'Adjust member loyalty points',
      description:
        'Apply a signed points delta (positive or negative) to a member, with an optional note.',
      inputSchema: { memberId: z.string(), delta: z.number().int(), note: z.string().optional() },
    },
    async ({ memberId, delta, note }) =>
      guard(() =>
        api.post(`/loyalty/members/${encodeURIComponent(memberId)}/adjust`, { delta, note }),
      ),
  );

  // ── Orders ───────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_orders',
    {
      title: 'List orders',
      description: 'Search/filter the gym order history.',
      inputSchema: {
        channel: z.enum(['POS', 'ONLINE']).optional(),
        status: z.enum(['PENDING', 'PAID', 'CANCELLED', 'REFUNDED']).optional(),
        memberId: z.string().optional(),
        from: z.string().optional().describe('YYYY-MM-DD or ISO instant'),
        to: z.string().optional().describe('YYYY-MM-DD or ISO instant'),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => guard(async () => slimList(await api.get(`/orders${qs(args)}`), slimOrder)),
  );

  server.registerTool(
    'get_order',
    {
      title: 'Get order',
      description: "One order's full detail (items, payments, refunds, timeline) by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => guard(() => api.get(`/orders/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    'refund_order',
    {
      title: 'Refund order',
      description:
        'Refund part or all of an order. Fields: amount (minor units), reason, restockItems? (default true).',
      inputSchema: {
        id: z.string(),
        amount: z.number().int().positive(),
        reason: z.string(),
        restockItems: z.boolean().optional(),
      },
    },
    async ({ id, amount, reason, restockItems }) =>
      guard(() =>
        api.post(`/orders/${encodeURIComponent(id)}/refund`, { amount, reason, restockItems }),
      ),
  );

  // ── Check-ins ────────────────────────────────────────────────────────────────

  server.registerTool(
    'checkin_stats',
    {
      title: 'Check-in stats',
      description: "Today's reception KPI snapshot.",
      inputSchema: {},
    },
    async () => guard(() => api.get('/admin/check-ins/stats')),
  );

  server.registerTool(
    'record_checkin',
    {
      title: 'Record check-in',
      description: "Record a member's arrival. Fields: gymMemberId, method? (default MANUAL).",
      inputSchema: { gymMemberId: z.string(), method: z.string().optional() },
    },
    async ({ gymMemberId, method }) =>
      guard(() => api.post('/admin/check-ins', { gymMemberId, method })),
  );

  // ── Dashboard ────────────────────────────────────────────────────────────────

  server.registerTool(
    'dashboard_stats',
    {
      title: 'Dashboard stats',
      description: "One live snapshot of the gym's KPI counts.",
      inputSchema: {},
    },
    async () => guard(() => api.get('/dashboard/stats')),
  );

  // ── Reports ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'report_catalog',
    {
      title: 'Report catalog',
      description: 'The available reports (key, display copy, columns).',
      inputSchema: {},
    },
    async () => guard(() => api.get('/admin/reports')),
  );

  server.registerTool(
    'run_report',
    {
      title: 'Run report',
      description:
        'Run one report by key (revenue-by-channel|attendance-by-class|membership-movement|no-show-rate) ' +
        'over an optional range (7d|30d|12w|12m, default 30d).',
      inputSchema: {
        key: z.enum([
          'revenue-by-channel',
          'attendance-by-class',
          'membership-movement',
          'no-show-rate',
        ]),
        range: z.enum(['7d', '30d', '12w', '12m']).optional(),
      },
    },
    async ({ key, range }) =>
      guard(() => api.get(`/admin/reports/${encodeURIComponent(key)}${qs({ range })}`)),
  );

  return server;
}
