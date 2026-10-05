// @fit/agent — progressive tool loading.
//
// The Fit MCP server registers a couple of hundred tools; sending every one on
// every turn is expensive and makes a cheap model choose badly. So a turn starts
// with the always-on CORE_TOOLS plus one local meta-tool, `open_toolbox`, and the
// model opens the domains it needs. Opened domains live for this request only —
// a follow-up request starts from core again (stateless by design).
//
// The catalog (TOOL_DOMAINS / CORE_TOOLS) is published by @fit/mcp. When it is
// missing or empty, every tool is loaded and `open_toolbox` does not exist —
// the behaviour before domains.

import * as fitMcp from '@fit/mcp';
import type { AgentTool } from './driver';

/** One group of related tools the model can open as a unit. */
export interface ToolDomain {
  id: string;
  title: string;
  description: string;
  tools: string[];
}

export interface ToolCatalog {
  domains: ToolDomain[];
  /** Read tools that are always loaded. */
  core: string[];
  /** Operator-facing titles per tool; a tool missing here shows its MCP title. */
  titles?: Record<string, { en: string; ka: string }>;
}

export const OPEN_TOOLBOX = 'open_toolbox';
export const OPEN_TOOLBOX_TITLE = { en: 'Open toolbox', ka: 'ხელსაწყოების გახსნა' };

/**
 * The catalog @fit/mcp exports, read loosely so this package compiles and runs
 * against an @fit/mcp that does not publish it yet.
 */
export function defaultToolCatalog(): ToolCatalog | undefined {
  const mod = fitMcp as unknown as {
    TOOL_DOMAINS?: unknown;
    CORE_TOOLS?: unknown;
    TOOL_TITLES?: unknown;
  };
  if (!Array.isArray(mod.TOOL_DOMAINS)) return undefined;
  return {
    domains: mod.TOOL_DOMAINS as ToolDomain[],
    core: Array.isArray(mod.CORE_TOOLS) ? (mod.CORE_TOOLS as string[]) : [],
    ...(mod.TOOL_TITLES && typeof mod.TOOL_TITLES === 'object'
      ? { titles: mod.TOOL_TITLES as NonNullable<ToolCatalog['titles']> }
      : {}),
  };
}

/** Which tools a turn sees, and the domains opened so far in this request. */
export interface Toolbox {
  /** False when there is no catalog — every tool is loaded, no meta-tool. */
  readonly enabled: boolean;
  /** The domains, for the system prompt (empty when disabled). */
  readonly domains: ToolDomain[];
  /** The tools to send this turn, in the server's order, meta-tool last. */
  visible(): AgentTool[];
  /** Open the domain owning `toolName`, if it has one and it is closed. */
  activateFor(toolName: string): void;
  /** Run `open_toolbox`: open the named domains and describe what they hold. */
  open(input: Record<string, unknown>): { output: string; isError: boolean; opened: string[] };
}

export function createToolbox(
  all: AgentTool[],
  catalog: ToolCatalog | undefined,
  titleOf: (name: string) => string | undefined,
): Toolbox {
  const known = new Set(all.map((t) => t.name));
  // Only domains that still name a real tool count; a catalog left with none
  // is treated as no catalog at all.
  const domains = (catalog?.domains ?? [])
    .map((d) => ({ ...d, tools: d.tools.filter((n) => known.has(n)) }))
    .filter((d) => d.tools.length > 0);
  const enabled = domains.length > 0;

  const domainOf = new Map<string, string>();
  for (const d of domains) for (const n of d.tools) if (!domainOf.has(n)) domainOf.set(n, d.id);
  const core = new Set((catalog?.core ?? []).filter((n) => known.has(n)));
  const active = new Set<string>();

  const metaTool: AgentTool = {
    name: OPEN_TOOLBOX,
    description:
      'Load more tools by domain. Call this when the tool you need is not in your tool list; ' +
      'the domain tools are available from your next step. Returns the names of the loaded tools.',
    parameters: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string', enum: domains.map((d) => d.id) },
          description: 'Domain ids to open.',
        },
      },
      required: ['domains'],
    },
  };

  return {
    enabled,
    domains,
    visible() {
      if (!enabled) return all;
      const loaded = all.filter((t) => {
        if (core.has(t.name)) return true;
        const domain = domainOf.get(t.name);
        return domain !== undefined && active.has(domain);
      });
      return [...loaded, metaTool];
    },
    activateFor(toolName) {
      const domain = domainOf.get(toolName);
      if (domain) active.add(domain);
    },
    open(input) {
      const requested = Array.isArray(input.domains)
        ? input.domains.filter((d): d is string => typeof d === 'string')
        : [];
      const opened = domains.filter((d) => requested.includes(d.id));
      const unknown = requested.filter((id) => !domains.some((d) => d.id === id));
      if (opened.length === 0) {
        return {
          output: `No such domain. Choose from: ${domains.map((d) => d.id).join(', ')}.`,
          isError: true,
          opened: [],
        };
      }
      for (const d of opened) active.add(d.id);
      const body = {
        opened: opened.map((d) => ({
          domain: d.id,
          tools: d.tools.map((name) => ({ name, title: titleOf(name) ?? name })),
        })),
        ...(unknown.length > 0 ? { unknownDomains: unknown } : {}),
      };
      return { output: JSON.stringify(body), isError: false, opened: opened.map((d) => d.id) };
    },
  };
}
