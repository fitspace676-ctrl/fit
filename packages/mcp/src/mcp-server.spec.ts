import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFitMcpServer } from './mcp-server';
import { CORE_TOOLS, TOOL_DOMAINS, TOOL_TITLES } from '../index';
import manifest from './tool-manifest.json';

async function connect() {
  const server = createFitMcpServer('operator-token');
  const client = new Client({ name: 'contract-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

type Schema = {
  type?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  anyOf?: Schema[];
  oneOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  minimum?: number;
  minLength?: number;
  format?: string;
  description?: string;
  [key: string]: unknown;
};
function sample(schema: Schema, key = ''): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  const option = schema.anyOf?.[0] ?? schema.oneOf?.[0];
  if (option) return sample(option, key);
  if (schema.type === 'object')
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([name]) => schema.required?.includes(name) || name === 'locationId')
        .map(([name, field]) => [name, sample(field, name)]),
    );
  if (schema.type === 'array') return [];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 1;
  if (schema.type === 'null') return null;
  if (schema.format === 'date-time')
    return key === 'to' ? '2026-01-08T00:00:00Z' : '2026-01-01T00:00:00Z';
  if (schema.format === 'date' || key === 'date') return key === 'to' ? '2026-01-08' : '2026-01-01';
  return key === 'locationId' ? 'branch-test' : 'resource-test';
}

function inspectSchema(value: unknown, visit: (name: string, field: Schema) => void) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => inspectSchema(item, visit));
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.properties)
    for (const [name, field] of Object.entries(record.properties as Record<string, Schema>))
      visit(name, field);
  Object.values(record).forEach((item) => inspectSchema(item, visit));
}

afterEach(() => vi.unstubAllGlobals());

describe('MCP admin contracts', () => {
  it('publishes described, tenant-safe tools with explicit approval annotations', async () => {
    const session = await connect();
    try {
      const { tools } = await session.client.listTools();
      expect(tools).toHaveLength(manifest.length);
      expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
      for (const tool of tools) {
        expect(tool.title, tool.name).toBeTruthy();
        expect(tool.description!.length, tool.name).toBeGreaterThanOrEqual(30);
        expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe('boolean');
        const route = manifest.find((item) => item.name === tool.name)!;
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(route.method === 'get');
        if (!tool.annotations?.readOnlyHint)
          expect(typeof tool.annotations?.destructiveHint, tool.name).toBe('boolean');
        inspectSchema(tool.inputSchema, (name, field) => {
          expect(name, tool.name).not.toBe('gymId');
          expect(field.description, `${tool.name}.${name}`).toBeTruthy();
          if (name === 'locationId')
            expect(field.description).toBe('branch id from list_locations; omit for the whole gym');
        });
        expect(route.path).not.toMatch(
          /^\/(platform|admin\/gyms|auth\/impersonation|admin\/audit-logs|me|auth)(\/|$)/,
        );
      }
    } finally {
      await session.close();
    }
  });

  it('every read tool sends only GET with the operator token and preserves branch filters', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const session = await connect();
    try {
      const { tools } = await session.client.listTools();
      for (const tool of tools.filter((item) => item.annotations?.readOnlyHint)) {
        fetchMock.mockClear();
        const args = sample(tool.inputSchema as Schema) as Record<string, unknown>;
        const result = await session.client.callTool({ name: tool.name, arguments: args });
        expect(result.isError, `${tool.name}: ${JSON.stringify(result)}`).not.toBe(true);
        expect(fetchMock, tool.name).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(init.method ?? 'GET', tool.name).toBe('GET');
        const route = manifest.find((item) => item.name === tool.name)!;
        const expectedPath = route.path.replace(/:(\w+)/g, (_, key: string) =>
          encodeURIComponent(String(args[key])),
        );
        expect(new URL(url).pathname, tool.name).toBe(expectedPath);
        expect(init.headers).toEqual({ authorization: 'Bearer operator-token' });
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(new URL(url).pathname).not.toMatch(
          /^\/(platform|admin\/gyms|auth\/impersonation)(\/|$)/,
        );
        if (args.locationId)
          expect(new URL(url).searchParams.get('locationId'), tool.name).toBe('branch-test');
      }
    } finally {
      await session.close();
    }
  });

  it('all exposed routes exist on tenant-scoped controllers and exclude self-service, uploads and cross-tenant routes', () => {
    for (const route of manifest) {
      const source = readFileSync(
        resolve(__dirname, '../../../apps/api/src', route.controller),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      const paths: string[] = [];
      for (const section of source.split('@Controller(').slice(1)) {
        const base = /^'([^']+)'/.exec(section)![1];
        expect(section).not.toContain('@AllowCrossTenant');
        for (const match of section.matchAll(/@(Get|Post|Patch|Put|Delete)\((?:'([^']*)')?\)/g)) {
          const method = match[1]!.toLowerCase().replace('delete', 'del');
          if (method === route.method) paths.push(`/${base}${match[2] ? `/${match[2]}` : ''}`);
        }
      }
      expect(paths, route.name).toContain(route.path);
      if (route.activePath) expect(paths, route.name).toContain(route.activePath);
      expect(route.path).not.toMatch(
        /^\/(me|notifications|cart|catalogue|checkout|service-sessions|class-instances)(\/|$)/,
      );
      expect(route.path).not.toMatch(
        /\/(logo|portal-image|portal-logo|portal-favicon|image|stream|export)$/,
      );
    }
  });

  it('validates schedule windows and stock branches before fetching, and sends typed attendance bodies', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const session = await connect();
    try {
      const badWindow = await session.client.callTool({
        name: 'list_schedule',
        arguments: { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
      });
      expect(badWindow.isError).toBe(true);
      expect(JSON.stringify(badWindow)).toContain('from');
      const badStock = await session.client.callTool({
        name: 'adjust_product_stock',
        arguments: { id: 'product-1', delta: 1, reason: 'RECEIVE' },
      });
      expect(badStock.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      const attendance = {
        id: 'class-1',
        entries: [{ bookingId: 'booking-1', status: 'ATTENDED' }],
      };
      const result = await session.client.callTool({
        name: 'mark_attendance',
        arguments: attendance,
      });
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(new URL(url).pathname).toBe('/admin/class-instances/class-1/attendance');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ entries: attendance.entries });
    } finally {
      await session.close();
    }
  });
  it('requires destructive confirmation for removal, deactivation, money and stock changes', async () => {
    const session = await connect();
    try {
      const { tools } = await session.client.listTools();
      for (const name of [
        'remove_staff',
        'refund_order',
        'set_member_status',
        'send_campaign',
        'schedule_campaign',
        'adjust_member_points',
        'adjust_product_stock',
        'update_product',
        'update_package_plan',
        'update_subscription_plan',
        'update_service',
        'update_staff_profile',
        'toggle_promo_code',
        'update_gym_settings',
      ]) {
        expect(tools.find((tool) => tool.name === name)?.annotations, name).toMatchObject({
          readOnlyHint: false,
          destructiveHint: true,
        });
      }
      for (const name of [
        'create_member',
        'add_member_note',
        'record_checkin',
        'book_member_onto_class',
        'mark_attendance',
      ]) {
        expect(tools.find((tool) => tool.name === name)?.annotations, name).toMatchObject({
          readOnlyHint: false,
          destructiveHint: false,
        });
      }
    } finally {
      await session.close();
    }
  });

  it('preserves DTO wire values, validates unions and keeps path identifiers inside their routes', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const session = await connect();
    try {
      const frozen = await session.client.callTool({
        name: 'list_members',
        arguments: { frozen: 'true', locationId: 'branch-1' },
      });
      expect(frozen.isError).not.toBe(true);
      const [membersUrl] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(new URL(membersUrl).searchParams.get('frozen')).toBe('true');
      const orders = await session.client.callTool({
        name: 'list_orders',
        arguments: { from: '2026-01-01', to: '2026-01-31' },
      });
      expect(orders.isError).not.toBe(true);
      const [ordersUrl] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      expect(new URL(ordersUrl).searchParams.get('from')).toBe('2026-01-01');
      const service = await session.client.callTool({
        name: 'create_service',
        arguments: {
          data: { type: 'CUSTOM', name: 'Massage', staffId: 'staff-1', priceMinor: 5000 },
        },
      });
      expect(service.isError, JSON.stringify(service)).not.toBe(true);
      const [, serviceInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
      expect(JSON.parse(serviceInit.body as string)).toMatchObject({
        type: 'CUSTOM',
        name: 'Massage',
        staffId: 'staff-1',
        priceMinor: 5000,
      });
      const invalidService = await session.client.callTool({
        name: 'create_service',
        arguments: { data: { type: 'CUSTOM', staffId: 'staff-1', priceMinor: 5000 } },
      });
      expect(invalidService.isError).toBe(true);
      const traversal = await session.client.callTool({
        name: 'get_member',
        arguments: { id: '..' },
      });
      expect(traversal.isError).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      await session.close();
    }
  });

  it('forwards stock adjustments and POS sales to the named branch and resolves legacy status actions', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const session = await connect();
    try {
      const stock = await session.client.callTool({
        name: 'adjust_product_stock',
        arguments: { id: 'product-1', locationId: 'branch-1', delta: 3, reason: 'RECEIVE' },
      });
      expect(stock.isError, JSON.stringify(stock)).not.toBe(true);
      const [, stockInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(stockInit.body as string)).toMatchObject({
        locationId: 'branch-1',
        delta: 3,
        reason: 'RECEIVE',
      });
      const receipt = {
        currency: 'GEL',
        items: [{ name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 }],
        subtotal: 500,
        discountTotal: 0,
        total: 500,
        paymentMethod: 'cash',
        cashTendered: 1000,
        changeDue: 500,
      };
      const sale = await session.client.callTool({
        name: 'record_pos_sale',
        arguments: { locationId: 'branch-1', receipt },
      });
      expect(sale.isError, JSON.stringify(sale)).not.toBe(true);
      const [saleUrl, saleInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      expect(new URL(saleUrl).pathname).toBe('/orders/pos-sale');
      expect(JSON.parse(saleInit.body as string)).toMatchObject({
        locationId: 'branch-1',
        receipt,
      });
      for (const active of [true, false])
        await session.client.callTool({
          name: 'set_class_status',
          arguments: { id: 'class-1', active },
        });
      const [resumeUrl] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
      const [pauseUrl] = fetchMock.mock.calls[3] as unknown as [string, RequestInit];
      expect(new URL(resumeUrl).pathname).toBe('/admin/classes/class-1/resume');
      expect(new URL(pauseUrl).pathname).toBe('/admin/classes/class-1/pause');
    } finally {
      await session.close();
    }
  });
});

describe('MCP tool domains', () => {
  async function listTools() {
    const session = await connect();
    try {
      return (await session.client.listTools()).tools;
    } finally {
      await session.close();
    }
  }

  it('publishes exactly the twelve domains', () => {
    expect(TOOL_DOMAINS.map((domain) => domain.id)).toEqual([
      'members',
      'classes',
      'services',
      'products',
      'sales',
      'plans',
      'staff',
      'trainers',
      'locations',
      'marketing',
      'insights',
      'settings',
    ]);
    for (const domain of TOOL_DOMAINS) {
      expect(domain.title, domain.id).toBeTruthy();
      expect(domain.titleKa, domain.id).toMatch(/[\u10D0-\u10FF]/);
      expect(domain.description.length, domain.id).toBeGreaterThanOrEqual(30);
      expect(domain.tools.length, domain.id).toBeGreaterThan(0);
    }
  });

  it('places every registered tool in exactly one domain and lists no unknown tool', async () => {
    const registered = (await listTools()).map((tool) => tool.name).sort();
    const listed = TOOL_DOMAINS.flatMap((domain) => domain.tools);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(registered);
  });

  it('marks at most twenty existing read-only tools as core', async () => {
    const tools = await listTools();
    expect(CORE_TOOLS.length).toBeGreaterThan(0);
    expect(CORE_TOOLS.length).toBeLessThanOrEqual(20);
    expect(new Set(CORE_TOOLS).size).toBe(CORE_TOOLS.length);
    for (const name of CORE_TOOLS)
      expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, name).toBe(true);
  });

  it('gives every tool an English and a short plain Georgian title', async () => {
    const tools = await listTools();
    expect(Object.keys(TOOL_TITLES).sort()).toEqual(tools.map((tool) => tool.name).sort());
    for (const tool of tools) {
      const titles = TOOL_TITLES[tool.name]!;
      expect(titles.en, tool.name).toBe(tool.title);
      expect(titles.en.trim(), tool.name).not.toBe('');
      expect(titles.ka, tool.name).toMatch(/[\u10D0-\u10FF]/);
      expect(titles.ka, tool.name).not.toMatch(/[\u1C90-\u1CBF]/);
      expect(titles.ka.length, tool.name).toBeLessThanOrEqual(60);
    }
    const georgian = Object.values(TOOL_TITLES).map((titles) => titles.ka);
    expect(new Set(georgian).size).toBe(georgian.length);
  });

  it('describes every tool for the model in one or two plain sentences', async () => {
    for (const tool of await listTools()) {
      const description = tool.description ?? '';
      expect(description.length, tool.name).toBeGreaterThanOrEqual(30);
      expect(description.length, tool.name).toBeLessThanOrEqual(240);
      expect(description, tool.name).not.toMatch(/\b[1-5]\d\d\b|controller|the service\b/);
    }
  });

  it('keeps list rows compact and the paging envelope intact', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ id: 'm1', name: 'Nino', status: 'ACTIVE', email: 'n@x.ge', notes: ['x'] }],
            total: 1,
            page: 1,
            limit: 20,
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const session = await connect();
    try {
      const result = await session.client.callTool({ name: 'list_members', arguments: {} });
      const [content] = result.content as { text: string }[];
      const body = JSON.parse(content!.text) as { data: Record<string, unknown>[] };
      expect(body).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(body.data[0]).toMatchObject({ id: 'm1', name: 'Nino', status: 'ACTIVE' });
      expect(body.data[0]).not.toHaveProperty('notes');
    } finally {
      await session.close();
    }
  });
});
