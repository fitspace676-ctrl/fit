import { describe, expect, it, vi } from 'vitest';
import { DECLINED_OUTPUT, runAgentLoop, summarizeResult, type AgentToolClient } from './run-agent';
import type { AgentModel } from './models';
import type { AgentContext } from './system-prompt';
import type {
  AgentHistoryMessage,
  AgentStreamEvent,
  AgentToolCall,
  ModelDriver,
  ModelTurn,
  RunTurnArgs,
} from './driver';

/** A minimal operator context in the given locale. */
const contextIn = (locale: 'ka' | 'en'): AgentContext => ({
  gym: { name: 'Gym', slug: 'gym' },
  locations: [],
  operator: { role: 'OWNER', permissions: [] },
  locale,
  today: '2026-01-01',
});

const MODEL: AgentModel = {
  id: 'fake',
  label: 'Fake',
  provider: 'anthropic',
  modelId: 'fake-1',
};

/** A driver that plays back scripted turns and records the history it saw. */
function fakeDriver(turns: ModelTurn[]) {
  const seen: AgentHistoryMessage[][] = [];
  const runTurn = vi.fn((args: RunTurnArgs) => {
    seen.push(structuredClone(args.history));
    const next = turns.shift() ?? { text: 'done', toolCalls: [] };
    if (next.text) args.onDelta(next.text);
    return Promise.resolve(next);
  });
  const driver: ModelDriver = { runTurn };
  return { driver, runTurn, seen };
}

/** Two tools: a read (`list_members`) and a destructive write (`delete_member`). */
function fakeClient(output = '{"data":[{"id":"m1"},{"id":"m2"}],"total":5}') {
  const callTool = vi.fn((_params: { name: string; arguments?: Record<string, unknown> }) =>
    Promise.resolve({ content: [{ type: 'text', text: output }] } as unknown),
  );
  const client: AgentToolClient = {
    listTools: () =>
      Promise.resolve({
        tools: [
          {
            name: 'list_members',
            title: 'List members',
            annotations: { readOnlyHint: true },
            inputSchema: { type: 'object' },
          },
          {
            name: 'delete_member',
            title: 'Delete member',
            annotations: { readOnlyHint: false, destructiveHint: true },
            inputSchema: { type: 'object' },
          },
          // No annotations at all — must be gated as a write.
          { name: 'mystery_tool', inputSchema: { type: 'object' } },
        ],
      }),
    callTool,
  };
  return { client, callTool };
}

async function run(
  turns: ModelTurn[],
  opts: Parameters<typeof runAgentLoop>[0]['options'] = {},
  output?: string,
) {
  const { driver, runTurn, seen } = fakeDriver(turns);
  const { client, callTool } = fakeClient(output);
  const events: AgentStreamEvent[] = [];
  await runAgentLoop({
    messages: [{ role: 'user', content: 'hi' }],
    model: MODEL,
    emit: (e) => events.push(e),
    options: opts,
    client,
    createDriver: () => driver,
    spares: [],
  });
  return { events, callTool, seen, runTurn };
}

const toolEvents = (events: AgentStreamEvent[]) =>
  events.filter((e): e is Extract<AgentStreamEvent, { t: 'tool' }> => e.t === 'tool');

const readCall: AgentToolCall = { id: 'c1', name: 'list_members', input: { search: 'ana' } };
const writeCall: AgentToolCall = {
  id: 'c2',
  name: 'delete_member',
  input: { id: 'm1' },
  signature: 'sig-opaque==',
};

describe('localized tool titles', () => {
  const toolCatalog = {
    domains: [
      {
        id: 'members',
        title: 'Members',
        description: 'Members',
        tools: ['list_members', 'delete_member'],
      },
    ],
    core: ['list_members'],
    titles: {
      list_members: { en: 'Members list', ka: 'წევრების სია' },
      delete_member: { en: 'Member removal', ka: 'წევრის წაშლა' },
    },
  };
  const titlesOf = (events: AgentStreamEvent[]) =>
    toolEvents(events).map((e) => [e.name, e.status, e.title]);

  it('shows Georgian titles for ka on running, complete and awaiting_approval', async () => {
    const { events } = await run(
      [
        { text: '', toolCalls: [readCall] },
        { text: '', toolCalls: [writeCall] },
      ],
      {
        toolCatalog,
        context: contextIn('ka'),
      },
    );
    expect(titlesOf(events)).toEqual([
      ['list_members', 'running', 'წევრების სია'],
      ['list_members', 'complete', 'წევრების სია'],
      ['delete_member', 'awaiting_approval', 'წევრის წაშლა'],
    ]);
  });

  it('defaults to Georgian when no locale is given', async () => {
    const { events } = await run([{ text: '', toolCalls: [readCall] }], { toolCatalog });
    expect(toolEvents(events).at(-1)).toMatchObject({ title: 'წევრების სია' });
  });

  it('shows English titles for en', async () => {
    const { events } = await run(
      [
        { text: '', toolCalls: [readCall] },
        { text: '', toolCalls: [writeCall] },
      ],
      {
        toolCatalog,
        context: contextIn('en'),
      },
    );
    expect(titlesOf(events)).toEqual([
      ['list_members', 'running', 'Members list'],
      ['list_members', 'complete', 'Members list'],
      ['delete_member', 'awaiting_approval', 'Member removal'],
    ]);
  });

  it('falls back to the MCP title when the catalog has no titles', async () => {
    const { titles: _omit, ...withoutTitles } = toolCatalog;
    const { events } = await run(
      [
        { text: '', toolCalls: [readCall] },
        { text: '', toolCalls: [writeCall] },
      ],
      {
        toolCatalog: withoutTitles,
        context: contextIn('ka'),
      },
    );
    expect(titlesOf(events)).toEqual([
      ['list_members', 'running', 'List members'],
      ['list_members', 'complete', 'List members'],
      ['delete_member', 'awaiting_approval', 'Delete member'],
    ]);
  });
});

describe('runAgentLoop', () => {
  it('runs a read round and reports kind, title, duration and a summary', async () => {
    const { events, callTool } = await run([{ text: '', toolCalls: [readCall] }]);

    expect(callTool).toHaveBeenCalledWith({ name: 'list_members', arguments: { search: 'ana' } });
    const complete = toolEvents(events).find((e) => e.status === 'complete');
    expect(complete).toMatchObject({
      kind: 'read',
      title: 'წევრების სია',
      resultSummary: '2 / 5 ჩანაწერი',
    });
    expect(typeof complete?.durationMs).toBe('number');
    expect(events.at(-1)).toEqual({ t: 'done' });
  });

  it('stops a round containing a write at awaiting_approval and runs nothing', async () => {
    const { events, callTool, runTurn } = await run([
      { text: 'I will delete Ana.', toolCalls: [readCall, writeCall] },
    ]);

    expect(callTool).not.toHaveBeenCalled();
    expect(runTurn).toHaveBeenCalledTimes(1);
    const tools = toolEvents(events);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      id: 'c2',
      name: 'delete_member',
      title: 'Delete member',
      kind: 'write',
      destructive: true,
      status: 'awaiting_approval',
      input: { id: 'm1' },
      signature: 'sig-opaque==',
      target: 'm1',
    });
    expect(events.at(-1)).toEqual({ t: 'done' });
  });

  it('gates a tool with no annotations as a write', async () => {
    const { events, callTool } = await run([
      { text: '', toolCalls: [{ id: 'c3', name: 'mystery_tool', input: {} }] },
    ]);

    expect(callTool).not.toHaveBeenCalled();
    expect(toolEvents(events)[0]).toMatchObject({ kind: 'write', status: 'awaiting_approval' });
  });

  it('runs an approved call, replays it with its signature, and continues', async () => {
    const { events, callTool, seen } = await run([{ text: 'Deleted.', toolCalls: [] }], {
      approvals: [{ call: writeCall, decision: 'approve' }],
    });

    expect(callTool).toHaveBeenCalledWith({ name: 'delete_member', arguments: { id: 'm1' } });
    expect(toolEvents(events).map((e) => e.status)).toEqual(['running', 'complete']);
    const history = seen[0] ?? [];
    expect(history.at(-2)).toEqual({ role: 'assistant', text: '', toolCalls: [writeCall] });
    expect(history.at(-1)).toMatchObject({
      role: 'tool',
      results: [{ id: 'c2', name: 'delete_member', isError: false }],
    });
    expect(events).toContainEqual({ t: 'delta', v: 'Deleted.' });
  });

  it('puts the replayed calls on the assistant text that preceded them', async () => {
    const { driver, seen } = fakeDriver([]);
    const { client } = fakeClient();
    await runAgentLoop({
      messages: [
        { role: 'user', content: 'delete Ana' },
        { role: 'assistant', content: 'I will delete Ana.' },
      ],
      model: MODEL,
      emit: () => {},
      options: { approvals: [{ call: writeCall, decision: 'reject' }] },
      client,
      createDriver: () => driver,
      spares: [],
    });

    expect(seen[0]?.at(-2)).toEqual({
      role: 'assistant',
      text: 'I will delete Ana.',
      toolCalls: [writeCall],
    });
  });

  it('does not run a rejected call and tells the model it was declined', async () => {
    const { events, callTool, seen } = await run([], {
      approvals: [{ call: writeCall, decision: 'reject' }],
    });

    expect(callTool).not.toHaveBeenCalled();
    expect(toolEvents(events)[0]).toMatchObject({ id: 'c2', status: 'rejected', kind: 'write' });
    expect(seen[0]?.at(-1)).toEqual({
      role: 'tool',
      results: [{ id: 'c2', name: 'delete_member', output: DECLINED_OUTPUT, isError: true }],
    });
  });

  it('refuses an approval for a tool that does not exist', async () => {
    const { events, callTool, seen } = await run([], {
      approvals: [{ call: { id: 'x', name: 'drop_database', input: {} }, decision: 'approve' }],
    });

    expect(callTool).not.toHaveBeenCalled();
    expect(toolEvents(events)[0]).toMatchObject({ status: 'error', name: 'drop_database' });
    expect(events).toContainEqual(expect.objectContaining({ t: 'error', code: 'unknown_tool' }));
    expect(seen[0]?.at(-1)).toMatchObject({ role: 'tool', results: [{ isError: true }] });
  });

  it('stops repeating an identical call after two failures in a row', async () => {
    const { driver } = fakeDriver([
      { text: '', toolCalls: [readCall] },
      { text: '', toolCalls: [{ ...readCall, id: 'c1b' }] },
      { text: '', toolCalls: [{ ...readCall, id: 'c1c' }] },
    ]);
    const callTool = vi.fn(() =>
      Promise.resolve({ content: [{ type: 'text', text: 'boom' }], isError: true } as unknown),
    );
    const { client } = fakeClient();
    client.callTool = callTool;
    const events: AgentStreamEvent[] = [];
    await runAgentLoop({
      messages: [{ role: 'user', content: 'hi' }],
      model: MODEL,
      emit: (e) => events.push(e),
      options: {},
      client,
      createDriver: () => driver,
      spares: [],
    });

    expect(callTool).toHaveBeenCalledTimes(2);
    const last = toolEvents(events).at(-1);
    expect(last).toMatchObject({ id: 'c1c', status: 'error' });
    expect(last?.errorMessage).toMatch(/Do not retry/);
  });

  it('says so when the step limit runs out instead of stopping silently', async () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({
      text: '',
      toolCalls: [{ id: `r${i}`, name: 'list_members', input: { page: i } }],
    }));
    const { events } = await run(turns);

    const deltas = events.filter((e) => e.t === 'delta');
    expect(deltas.at(-1)?.v).toContain('ლიმიტი');
    expect(events.at(-1)).toEqual({ t: 'done' });
  });
});

describe('summarizeResult', () => {
  it('counts a bare array and a data list', () => {
    expect(summarizeResult('[1,2,3]')).toBe('3 ჩანაწერი');
    expect(summarizeResult('{"data":[1],"total":1}', 'en')).toBe('1 records');
    expect(summarizeResult('{"items":[1,2],"total":9}', 'en')).toBe('2 of 9 records');
  });

  it('says nothing about non-list output', () => {
    expect(summarizeResult('{"id":"m1"}')).toBeUndefined();
    expect(summarizeResult('not json')).toBeUndefined();
  });
});
