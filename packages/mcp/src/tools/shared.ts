import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FitApiError, qs, type FitApiClient } from '../fit-api';

export function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export async function guard(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (error) {
    let message: string;
    if (error instanceof z.ZodError) {
      message = `Invalid fields: ${error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`;
    } else if (error instanceof FitApiError) {
      const detail = `${error.message}${error.details === undefined ? '' : `; validation details: ${JSON.stringify(error.details)}`}`;
      if (error.status === 400 || error.status === 422)
        message = `Invalid fields or request: ${detail}. Correct the indicated fields before retrying.`;
      else if (error.status === 401)
        message = 'Session expired. Ask the operator to sign in again.';
      else if (error.status === 403) message = 'Operator lacks this permission; do not retry.';
      else if (error.status === 404)
        message = 'Not found in this gym. Verify the identifier with a list tool.';
      else if (error.status === 409)
        message = `Conflict: ${detail}. Read the current state before changing the request.`;
      else if (error.status >= 500 || error.status === 0)
        message =
          'Temporary failure (network, timeout, or API unavailable). Retry later; verify the state before repeating a write.';
      else message = `Request failed (${error.status}, ${error.code}): ${detail}`;
    } else {
      message = 'Temporary failure. Retry later; verify the state before repeating a write.';
    }
    return { content: [{ type: 'text' as const, text: message }], isError: true };
  }
}

const branchDescription = 'branch id from list_locations; omit for the whole gym';
const fieldDescriptions: Record<string, string> = {
  id: 'Existing resource id from the corresponding list tool; never invent an id',
  memberId: 'Member id from list_members',
  gymMemberId: 'Gym membership id from list_members (not a gym id)',
  staffId: 'Staff member id from list_staff',
  trainerId: 'Trainer id from list_trainers',
  bookingId: 'Booking id from get_schedule_instance or get_attendance',
  classTypeId: 'Class type id from list_class_types',
  packId: 'Credit package id from list_credit_pack_catalogue',
  planId: 'Plan id from the corresponding subscription or package list',
  locationId: branchDescription,
  page: 'Page number, starting at 1',
  limit: 'Maximum number of rows on this page, bounded by the API schema',
  search: 'Search text matched against this resource by the API',
  from: 'Start of the requested window; use the date or ISO datetime format shown by the schema',
  to: 'End of the requested window; use the date or ISO datetime format shown by the schema',
  priceAmount: 'Price in minor currency units',
  priceMinor: 'Price in minor currency units',
  costAmount: 'Cost in minor currency units',
  amount: 'Amount in minor currency units',
  startsAt: 'Session start as an ISO-8601 datetime with timezone',
  scheduledAt: 'Campaign delivery time as an ISO-8601 datetime with timezone',
};

/** Describe the actual DTO input, leaving transforms/refinements to one validation pass.
 * Cloning avoids mutating the shared API contracts. */
export function describeInput(schema: z.ZodTypeAny, name: string): z.ZodTypeAny {
  if (schema instanceof z.ZodEffects)
    return describeInput(schema.innerType() as z.ZodTypeAny, name);
  const def: z.ZodTypeDef & Record<string, unknown> = {
    ...(schema._def as z.ZodTypeDef & Record<string, unknown>),
  };
  if (schema instanceof z.ZodObject) {
    const shape = Object.fromEntries(
      Object.entries(schema.shape as z.ZodRawShape).map(([key, value]) => {
        if (key === 'gymId') throw new Error('Tenant ids must never be tool inputs');
        return [key, describeInput(value, key)];
      }),
    );
    def.shape = () => shape;
    def.unknownKeys = 'strict';
  }
  for (const key of ['innerType', 'type', 'valueType', 'keyType', 'left', 'right']) {
    if (def[key] instanceof z.ZodType) def[key] = describeInput(def[key], name);
  }
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    def.options = (schema.options as z.ZodTypeAny[]).map((option: z.ZodTypeAny) =>
      describeInput(option, name),
    );
    if (schema instanceof z.ZodDiscriminatedUnion) {
      def.optionsMap = new Map(
        [...(schema.optionsMap as Map<unknown, z.ZodTypeAny>)].map(([key, option]) => [
          key,
          describeInput(option, name),
        ]),
      );
    }
  }
  const Constructor = schema.constructor as new (def: z.ZodTypeDef) => z.ZodTypeAny;
  const description =
    fieldDescriptions[name] ??
    schema.description ??
    `${name.replace(/([A-Z])/g, ' $1').toLowerCase()}; follow the displayed API constraints`;
  return new Constructor(def).describe(description);
}

function objectShape(schema: z.ZodTypeAny): z.ZodRawShape | undefined {
  while (schema instanceof z.ZodEffects) schema = schema.innerType() as z.ZodTypeAny;
  return schema instanceof z.ZodObject ? (schema.shape as z.ZodRawShape) : undefined;
}

export interface Endpoint {
  name: string;
  title: string;
  /** Short Georgian title the admin chat shows to operators; the MCP title stays English. */
  titleKa: string;
  description: string;
  method: 'get' | 'post' | 'patch' | 'put' | 'del';
  path: string;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  params?: z.ZodRawShape;
  /** Keep the existing status tool's active boolean and pair of API routes. */
  activePath?: string;
  destructive?: boolean;
  /** Always offered to the agent, whichever domains it loaded; read-only tools only. */
  core?: boolean;
  project?: (value: unknown) => unknown;
}

export type DomainId =
  | 'members'
  | 'classes'
  | 'services'
  | 'products'
  | 'sales'
  | 'plans'
  | 'staff'
  | 'trainers'
  | 'locations'
  | 'marketing'
  | 'insights'
  | 'settings';

/** One tools module: the domain it belongs to and its endpoints, readable without a server. */
export interface ToolModule {
  domain: DomainId;
  endpoints: Endpoint[];
}

export function defineTools(domain: DomainId, endpoints: Endpoint[]): ToolModule {
  return { domain, endpoints };
}

export function registerEndpoint(server: McpServer, api: FitApiClient, endpoint: Endpoint) {
  const bodyShape = endpoint.body && objectShape(endpoint.body);
  const queryShape = endpoint.query && objectShape(endpoint.query);
  const rawShape: z.ZodRawShape = {
    ...endpoint.params,
    ...queryShape,
    ...(bodyShape ?? (endpoint.body ? { data: endpoint.body } : {})),
    ...(endpoint.activePath
      ? { active: z.boolean().describe('true activates or resumes; false deactivates or pauses') }
      : {}),
  };
  const inputSchema = Object.fromEntries(
    Object.entries(rawShape).map(([key, schema]) => [key, describeInput(schema, key)]),
  );
  const pick = (args: Record<string, unknown>, shape: z.ZodRawShape) =>
    Object.fromEntries(
      Object.keys(shape)
        .filter((key) => args[key] !== undefined)
        .map((key) => [key, args[key]]),
    );
  server.registerTool(
    endpoint.name,
    {
      title: endpoint.title,
      description: endpoint.description,
      inputSchema,
      annotations:
        endpoint.method === 'get'
          ? { readOnlyHint: true }
          : { readOnlyHint: false, destructiveHint: endpoint.destructive ?? false },
    },
    async (args) =>
      guard(async () => {
        const query = queryShape ? pick(args, queryShape) : {};
        const body: unknown = bodyShape ? pick(args, bodyShape) : args.data;
        // Validate the complete DTO as well: date-window and cross-field refinements
        // cannot be expressed by MCP's top-level raw shape. Send the input on the wire,
        // not transformed output, because the API parses this same DTO again.
        endpoint.query?.parse(query);
        endpoint.body?.parse(body);
        const template = endpoint.activePath && args.active ? endpoint.activePath : endpoint.path;
        const path =
          template.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, key: string) => {
            const value = String(args[key]);
            if (!value || value === '.' || value === '..' || args[key] === undefined)
              throw new z.ZodError([
                { code: 'custom', path: [key], message: 'A valid resource identifier is required' },
              ]);
            return encodeURIComponent(value);
          }) + qs(query);
        switch (endpoint.method) {
          case 'get':
            return endpoint.project ? endpoint.project(await api.get(path)) : api.get(path);
          case 'post':
            return api.post(path, body);
          case 'patch':
            return api.patch(path, body);
          case 'put':
            return api.put(path, body);
          case 'del':
            return api.del(path);
        }
      }),
  );
}
