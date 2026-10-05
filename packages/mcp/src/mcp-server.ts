import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createFitApiClient } from './fit-api';
import { ALL_ENDPOINTS } from './catalog';
import { registerEndpoint } from './tools/shared';

/** Build the admin MCP surface bound exclusively to the operator's token. */
export function createFitMcpServer(token: string): McpServer {
  const api = createFitApiClient(token);
  const server = new McpServer(
    { name: 'fit-admin', version: '0.2.0' },
    {
      instructions:
        'Manage the current gym: members, branches, staff schedules and time off, trainers, class types, recurring classes, dated schedules, bookings, waitlists, attendance, PT and service appointments, products, categories, inventory, POS sales, refunds, subscription plans and enrollment/freezes, credit packs, invoices, marketing campaigns and banners, loyalty, automation, reviews, branding/themes, dashboard, activity, gym audit logs, analytics and reports/drilldowns. IDs come from list tools; never invent them. The operator token determines the gym; never supply a gymId. Use locationId from list_locations where supported; omit a read filter for the whole gym. Stock corrections require a branch; omitted check-in branches use the gym default. Read the exact target before editing if the request is vague. Read-only tools run immediately; every write requires operator confirmation enforced by runtime annotations. Follow schema constraints and return validation errors without guessing replacements. No member self-service notifications, member checkout, uploads or cross-tenant operations are exposed.',
    },
  );
  for (const endpoint of ALL_ENDPOINTS) registerEndpoint(server, api, endpoint);
  return server;
}
