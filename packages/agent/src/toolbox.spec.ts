import { describe, expect, it, vi } from 'vitest';
import { runAgentLoop, type AgentToolClient, type RunAgentOptions } from './run-agent';
import { OPEN_TOOLBOX, type ToolCatalog } from './toolbox';
import type { AgentModel } from './models';
import type { AgentContext } from './system-prompt';
import type { AgentHistoryMessage, AgentStreamEvent, ModelTurn, RunTurnArgs } from './driver';

/** A minimal operator context in the given locale. */
const contextIn = (locale: 'ka' | 'en'): AgentContext => ({
  gym: { name: 'Gym', slug: 'gym' },
  locations: [],
  operator: { role: 'OWNER', permissions: [] },
  locale,
  today: '2026-01-01',
});

const MODEL: AgentModel = { id: 'fake', label: 'Fake', provider: 'anthropic', modelId: 'fake-1' };

const CATALOG: ToolCatalog = {
  core: ['get_dashboard'],
  domains: [
    {
      id: 'members',
      title: 'Members',
      description: 'Members and their memberships',
      tools: ['list_members', 'delete_member'],
    },
    { id: 'products', title: 'Products', description: 'Retail', tools: ['list_products'] },
  ],
};

const read = { readOnlyHint: true };
const client = (callTool: AgentToolClient['callTool']): AgentToolClient => ({
  listTools: () =>
    Promise.resolve({
      tools: [
        { name: 'get_dashboard', title: 'Dashboard', annotations: read },
        { name: 'list_members', title: 'List members', annotations: read },
        {
          name: 'delete_member',
          title: 'Delete member',
          annotations: { readOnlyHint: false, destructiveHint: true },
        },
        { name: 'list_products', title: 'List products', annotations: read },
      ],
    }),
  callTool,
});

/** Runs the loop with scripted turns; records the tool names each turn was offered. */
async function run(turns: ModelTurn[], options: RunAgentOptions = { toolCatalog: CATALOG }) {
  const offered: string[][] = [];
  const systems: string[] = [];
  const histories: AgentHistoryMessage[][] = [];
  const runTurn = vi.fn((args: RunTurnArgs) => {
    histories.push(structuredClone(args.history));
    offered.push(args.tools.map((t) => t.name));
    systems.push(args.system);
    return Promise.resolve(turns.shift() ?? { text: 'ok', toolCalls: [] });
  });
  const callTool = vi.fn(() =>
    Promise.resolve({ content: [{ type: 'text', text: '[]' }] } as unknown),
  );
  const events: AgentStreamEvent[] = [];
  await runAgentLoop({
    messages: [{ role: 'user', content: 'hi' }],
    model: MODEL,
    emit: (e) => events.push(e),
    options,
    client: client(callTool),
    createDriver: () => ({ runTurn }),
    spares: [],
  });
  return { offered, systems, histories, events, callTool };
}

describe('progressive tool loading', () => {
  it('starts with the core tools and open_toolbox only', async () => {
    const { offered, systems } = await run([]);

    expect(offered[0]).toEqual(['get_dashboard', OPEN_TOOLBOX]);
    expect(systems[0]).toContain('members — Members and their memberships');
    expect(systems[0]).toContain('call\n  open_toolbox');
  });

  it('loads a domain after open_toolbox, without touching MCP', async () => {
    const { offered, events, callTool } = await run([
      { text: '', toolCalls: [{ id: 'o1', name: OPEN_TOOLBOX, input: { domains: ['members'] } }] },
    ]);

    expect(callTool).not.toHaveBeenCalled();
    expect(offered[1]).toEqual(['get_dashboard', 'list_members', 'delete_member', OPEN_TOOLBOX]);
    expect(events).toContainEqual(
      expect.objectContaining({
        t: 'tool',
        name: OPEN_TOOLBOX,
        kind: 'read',
        title: 'ხელსაწყოების გახსნა',
        status: 'complete',
      }),
    );
  });

  it('titles open_toolbox in English for en, and keeps the model-facing titles English', async () => {
    const turns: ModelTurn[] = [
      { text: '', toolCalls: [{ id: 'o1', name: OPEN_TOOLBOX, input: { domains: ['members'] } }] },
    ];
    const ka = await run(structuredClone(turns), {
      toolCatalog: {
        ...CATALOG,
        titles: { list_members: { en: 'Members list', ka: 'წევრების სია' } },
      },
    });
    const result = ka.histories[1]!.flatMap((m) => (m.role === 'tool' ? m.results : []));
    expect(JSON.stringify(result)).toContain('List members');
    expect(JSON.stringify(result)).not.toContain('წევრების სია');

    const en = await run(turns, { toolCatalog: CATALOG, context: contextIn('en') });
    expect(en.events).toContainEqual(
      expect.objectContaining({ name: OPEN_TOOLBOX, title: 'Open toolbox', status: 'complete' }),
    );
  });

  it('loads every tool when there is no catalog', async () => {
    const { offered } = await run([], { toolCatalog: null });

    expect(offered[0]).toEqual(['get_dashboard', 'list_members', 'delete_member', 'list_products']);
  });

  it('runs an approval for a tool whose domain is not loaded, and opens that domain', async () => {
    const { offered, callTool } = await run([], {
      toolCatalog: CATALOG,
      approvals: [
        { call: { id: 'c1', name: 'delete_member', input: { id: 'm1' } }, decision: 'approve' },
      ],
    });

    expect(callTool).toHaveBeenCalledWith({ name: 'delete_member', arguments: { id: 'm1' } });
    expect(offered[0]).toContain('list_members');
  });

  it('handles a call to an existing but unloaded tool by opening its domain', async () => {
    const { offered, callTool, events } = await run([
      { text: '', toolCalls: [{ id: 'p1', name: 'list_products', input: {} }] },
      { text: '', toolCalls: [{ id: 'd1', name: 'delete_member', input: { id: 'm1' } }] },
    ]);

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(offered[1]).toContain('list_products');
    expect(events).toContainEqual(
      expect.objectContaining({ id: 'd1', status: 'awaiting_approval' }),
    );
  });
});
