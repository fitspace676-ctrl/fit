// @fit/admin — the AI agent runtime: a provider-agnostic tool-use loop over the
// Fit MCP server.
//
// Wiring: an in-process Fit MCP server (mcp-server.ts) is linked to an MCP client
// over an in-memory transport — a real MCP connection, no child process. The
// client lists the server's tools; a `ModelDriver` (Claude or Gemini — chosen by
// the caller) runs each streamed turn, and we execute every tool call back
// through MCP. Text and tool events stream out via `emit` as the NDJSON the chat
// UI already renders.
//
// Writes are a hard gate, not a prompt rule: a round in which the model calls
// any write tool executes nothing — each write is streamed as
// `awaiting_approval` and the turn ends. The UI re-posts with the operator's
// `approvals`, which are replayed onto the history before the loop resumes.
//
// Cost is the first constraint (see the cost memory): the model defaults to the
// cheapest available (Gemini Flash-Lite, else Claude Haiku), the driver caps
// output short, and the loop is bounded so it can never run away.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFitMcpServer } from '@fit/mcp';
import { createDriver, fallbackModels, type AgentModel } from './models';
import { normalizeAttachments } from './attachments';
import { buildSystemPrompt, type AgentContext } from './system-prompt';
import {
  createToolbox,
  defaultToolCatalog,
  OPEN_TOOLBOX,
  OPEN_TOOLBOX_TITLE,
  type ToolCatalog,
} from './toolbox';
import type {
  AgentApproval,
  AgentAttachment,
  AgentHistoryMessage,
  AgentStreamEvent,
  AgentTool,
  AgentToolCall,
  AgentToolKind,
  AgentToolResult,
  ModelDriver,
  ModelTurn,
} from './driver';

/**
 * Hard ceiling on tool-call rounds so a loop can never burn tokens unbounded.
 * An `open_toolbox` round counts too.
 */
const MAX_ROUNDS = 10;

/** Identical failing calls tolerated in a row before the loop refuses a third. */
const MAX_REPEAT_FAILURES = 2;

/** What a rejected write feeds back to the model. */
export const DECLINED_OUTPUT =
  'Operator declined this action. Do not retry it; ask what to do instead.';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Everything beyond the conversation itself; all optional. */
export interface RunAgentOptions {
  /** Gym, branches, operator and date — shapes the system prompt. */
  context?: AgentContext;
  /** The operator's decisions on the writes the previous turn paused on. */
  approvals?: AgentApproval[];
  attachments?: AgentAttachment[];
  onFallback?: (from: AgentModel, to: AgentModel, reason: string) => void;
  /**
   * Tool domains + always-on core. Defaults to the catalog @fit/mcp exports;
   * `null` (or a catalog with no domains) loads every tool up front.
   */
  toolCatalog?: ToolCatalog | null;
}

/** The slice of an MCP `Client` the loop uses — a seam for tests. */
export interface AgentToolClient {
  listTools(): Promise<{
    tools: Array<{
      name: string;
      title?: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean };
    }>;
  }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
}

/** Per-tool facts the gate and the UI need, read off the MCP tool list. */
interface ToolMeta {
  /** The title the operator sees, in their language when the catalog has one. */
  title?: string;
  /** The MCP title, which stays English for the model. */
  mcpTitle?: string;
  kind: AgentToolKind;
  destructive: boolean;
}

/** A one-line, human-readable target for a tool call, for the transcript chrome. */
function toolTarget(input: Record<string, unknown>): string | undefined {
  const pick = input.id ?? input.search ?? input.name ?? input.status ?? Object.values(input)[0];
  if (typeof pick === 'string') return pick.slice(0, 60);
  if (typeof pick === 'number' || typeof pick === 'boolean') return String(pick);
  return undefined;
}

/** `N records` (or `N of T`) when a tool result is a list; otherwise nothing. */
export function summarizeResult(output: string, locale?: 'ka' | 'en'): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  let count: number | undefined;
  let total: number | undefined;
  if (Array.isArray(parsed)) {
    count = parsed.length;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const list = Object.values(obj).find(Array.isArray);
    if (Array.isArray(obj.data)) count = obj.data.length;
    else if (list) count = list.length;
    const t = obj.total ?? (obj.meta as Record<string, unknown> | undefined)?.total;
    if (typeof t === 'number') total = t;
  }
  if (count === undefined) return undefined;
  const noun = locale === 'en' ? 'records' : 'ჩანაწერი';
  if (total !== undefined && total > count) {
    return locale === 'en' ? `${count} of ${total} ${noun}` : `${count} / ${total} ${noun}`;
  }
  return `${count} ${noun}`;
}

/** Order-independent key for "the same call with the same input". */
function callKey(call: AgentToolCall): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
          )
        : v;
  return `${call.name}\u0000${JSON.stringify(stable(call.input))}`;
}

/** The step-limit notice, so a turn that ran out never just stops mid-thought. */
function stepLimitNotice(done: string[], locale?: 'ka' | 'en'): string {
  const list = [...new Set(done)].join(', ');
  if (locale === 'en') {
    return `\n\n_Step limit reached (${MAX_ROUNDS} rounds).${list ? ` Done so far: ${list}.` : ''} Send a message to continue._`;
  }
  return `\n\n_ნაბიჯების ლიმიტი ამოიწურა (${MAX_ROUNDS} ნაბიჯი).${list ? ` შესრულდა: ${list}.` : ''} გასაგრძელებლად მომწერე._`;
}

/**
 * Run one assistant turn: stream the model's reply, execute any read calls
 * through MCP, pause on writes for approval, and loop until the model stops
 * calling tools. `emit` receives NDJSON events. `token` is the operator's access
 * token — the MCP tools act as that operator. `model` selects the provider +
 * concrete model.
 */
export async function runAgent(
  messages: ChatTurn[],
  token: string,
  model: AgentModel,
  emit: (event: AgentStreamEvent) => void,
  options: RunAgentOptions = {},
): Promise<void> {
  // Link an MCP client to the in-process Fit server over an in-memory transport.
  const server = createFitMcpServer(token);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'fit-admin-agent', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    await runAgentLoop({ messages, model, emit, options, client, createDriver });
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/**
 * The loop itself, over any {@link AgentToolClient} and driver factory — what
 * {@link runAgent} wires to the real MCP server and providers, and what the
 * tests drive with fakes.
 */
export async function runAgentLoop(args: {
  messages: ChatTurn[];
  model: AgentModel;
  emit: (event: AgentStreamEvent) => void;
  options: RunAgentOptions;
  client: AgentToolClient;
  createDriver: (model: AgentModel) => ModelDriver;
  spares?: AgentModel[];
}): Promise<void> {
  const { messages, model, emit, options, client } = args;
  const locale = options.context?.locale;

  // The requested model, plus a spare from every other configured provider. A
  // rejected key or a provider outage then costs a pricier turn instead of the
  // whole agent — see `fallbackModels`.
  const spares = args.spares ?? fallbackModels(model);
  let driver = args.createDriver(model);
  let active = model;

  const { tools: mcpTools } = await client.listTools();
  const catalog = options.toolCatalog === undefined ? defaultToolCatalog() : options.toolCatalog;
  // Georgian unless the operator asked for English, as the prompt falls back.
  const lang = locale === 'en' ? 'en' : 'ka';
  const meta = new Map<string, ToolMeta>();
  const tools: AgentTool[] = mcpTools.map((t) => {
    const mcpTitle = t.title ?? t.annotations?.title;
    meta.set(t.name, {
      title: catalog?.titles?.[t.name]?.[lang] || mcpTitle,
      mcpTitle,
      // No annotations means no promise it only reads — gate it as a write.
      kind: t.annotations?.readOnlyHint === true ? 'read' : 'write',
      destructive: t.annotations?.destructiveHint === true,
    });
    return {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    };
  });

  const toolbox = createToolbox(tools, catalog ?? undefined, (name) => meta.get(name)?.mcpTitle);
  if (toolbox.enabled) {
    meta.set(OPEN_TOOLBOX, { title: OPEN_TOOLBOX_TITLE[lang], kind: 'read', destructive: false });
  }

  // Blank assistant turns (a reply that was only a tool card) carry nothing,
  // and both providers reject an empty assistant message.
  const history: AgentHistoryMessage[] = messages
    .filter((m) => m.role === 'user' || m.content.trim() !== '')
    .map((m) =>
      m.role === 'assistant'
        ? { role: 'assistant', text: m.content, toolCalls: [] }
        : { role: 'user', text: m.content },
    );
  // Attach the uploaded files to the latest user turn, if any. Normalize first
  // so the model only ever sees types it accepts (xlsx → CSV, etc.).
  if (options.attachments && options.attachments.length > 0) {
    const normalized = normalizeAttachments(options.attachments);
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const msg = history[i];
      if (msg && msg.role === 'user') {
        msg.attachments = normalized;
        break;
      }
    }
  }

  /** Consecutive failures per identical call — see {@link MAX_REPEAT_FAILURES}. */
  const failures = new Map<string, number>();
  /** Titles of the calls that ran, for the step-limit notice. */
  const done: string[] = [];

  /** Run one call through MCP, streaming its lifecycle; never throws. */
  const execute = async (call: AgentToolCall): Promise<AgentToolResult> => {
    const info = meta.get(call.name);
    const base = {
      t: 'tool' as const,
      id: call.id,
      name: call.name,
      title: info?.title,
      kind: info?.kind ?? ('write' as const),
      ...(info?.destructive ? { destructive: true } : {}),
      target: toolTarget(call.input),
    };
    if (!info) {
      const msg = `Unknown tool "${call.name}". Use only the tools you were given.`;
      emit({ ...base, status: 'error', errorMessage: msg });
      return { id: call.id, name: call.name, output: msg, isError: true };
    }
    if (call.name === OPEN_TOOLBOX && toolbox.enabled) {
      // Local to the runtime: never reaches MCP, needs no approval.
      emit({ ...base, status: 'running', input: call.input });
      const res = toolbox.open(call.input);
      emit(
        res.isError
          ? { ...base, status: 'error', errorMessage: res.output }
          : { ...base, status: 'complete', durationMs: 0, resultSummary: res.opened.join(', ') },
      );
      return { id: call.id, name: call.name, output: res.output, isError: res.isError };
    }
    const key = callKey(call);
    if ((failures.get(key) ?? 0) >= MAX_REPEAT_FAILURES) {
      const msg = `This exact call already failed ${MAX_REPEAT_FAILURES} times in a row. Do not retry it; explain the error to the operator.`;
      emit({ ...base, status: 'error', errorMessage: msg });
      return { id: call.id, name: call.name, output: msg, isError: true };
    }

    emit({ ...base, status: 'running', input: call.input });
    const started = Date.now();
    let output: string;
    let isError: boolean;
    try {
      const res = (await client.callTool({ name: call.name, arguments: call.input })) as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
      output = (res.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('\n');
      isError = Boolean(res.isError);
    } catch (err) {
      output = err instanceof Error ? err.message : 'tool_failed';
      isError = true;
    }
    const durationMs = Date.now() - started;

    if (isError) {
      const count = (failures.get(key) ?? 0) + 1;
      failures.set(key, count);
      emit({ ...base, status: 'error', errorMessage: output.slice(0, 500), durationMs });
      const note =
        count >= MAX_REPEAT_FAILURES
          ? `\n(This identical call has now failed ${count} times. Do not retry it.)`
          : '';
      return { id: call.id, name: call.name, output: (output || 'tool_failed') + note, isError };
    }
    failures.delete(key);
    done.push(info.title ?? call.name);
    const resultSummary = summarizeResult(output, locale);
    emit({ ...base, status: 'complete', durationMs, ...(resultSummary ? { resultSummary } : {}) });
    return { id: call.id, name: call.name, output: output || '(no output)', isError: false };
  };

  // Replay the operator's decisions as the assistant turn that asked for them,
  // followed by their results. Approved calls run now; declined ones never do.
  if (options.approvals && options.approvals.length > 0) {
    const calls = options.approvals.map((a) => a.call);
    const last = history[history.length - 1];
    // The text the model streamed before pausing comes back as a plain
    // assistant message; the calls belong on that same turn.
    if (last && last.role === 'assistant' && last.toolCalls.length === 0) {
      last.toolCalls = calls;
    } else {
      history.push({ role: 'assistant', text: '', toolCalls: calls });
    }
    const results: AgentToolResult[] = [];
    for (const { call, decision } of options.approvals) {
      if (decision === 'approve') {
        // Checked against every tool, not only the loaded ones; the approved
        // tool's domain opens so the model can follow up with its siblings.
        toolbox.activateFor(call.name);
        // An approval naming a tool that does not exist is a broken client, not
        // a model slip — flag it on the turn as well as on the card.
        if (!meta.has(call.name)) {
          emit({ t: 'error', code: 'unknown_tool', message: `Unknown tool "${call.name}".` });
        }
        results.push(await execute(call));
        continue;
      }
      const info = meta.get(call.name);
      emit({
        t: 'tool',
        id: call.id,
        name: call.name,
        title: info?.title,
        kind: info?.kind ?? 'write',
        ...(info?.destructive ? { destructive: true } : {}),
        status: 'rejected',
        target: toolTarget(call.input),
      });
      results.push({ id: call.id, name: call.name, output: DECLINED_OUTPUT, isError: true });
    }
    history.push({ role: 'tool', results });
  }

  const system = buildSystemPrompt(options.context, toolbox.domains);

  // Tracks whether the current turn has put text on screen. Once it has, a
  // provider swap would replay the reply from the start, so the failure is
  // surfaced instead.
  let streamed = false;
  const onDelta = (text: string): void => {
    streamed = true;
    emit({ t: 'delta', v: text });
  };

  /** Stream one turn, moving to the next provider while the turn is silent. */
  const streamTurn = async (): Promise<ModelTurn> => {
    for (;;) {
      try {
        return await driver.runTurn({ system, tools: toolbox.visible(), history, onDelta });
      } catch (err) {
        const spare = streamed ? undefined : spares.shift();
        if (!spare) throw err;
        options.onFallback?.(active, spare, err instanceof Error ? err.message : 'unknown');
        driver = args.createDriver(spare);
        active = spare;
      }
    }
  };

  let finished = false;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const turn = await streamTurn();
    streamed = false;

    if (turn.toolCalls.length === 0) {
      finished = true;
      break;
    }

    // A call to a real tool the model was not shown opens its domain and is
    // handled like any other call.
    for (const call of turn.toolCalls) toolbox.activateFor(call.name);

    // The gate: one write anywhere in the round and nothing in it runs. The
    // reads are dropped with it — the model asks again after the decision.
    const writes = turn.toolCalls.filter((c) => meta.get(c.name)?.kind === 'write');
    if (writes.length > 0) {
      for (const call of writes) {
        const info = meta.get(call.name);
        emit({
          t: 'tool',
          id: call.id,
          name: call.name,
          title: info?.title,
          kind: 'write',
          ...(info?.destructive ? { destructive: true } : {}),
          status: 'awaiting_approval',
          target: toolTarget(call.input),
          input: call.input,
          ...(call.signature ? { signature: call.signature } : {}),
        });
      }
      emit({ t: 'done' });
      return;
    }

    history.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls });
    const results = await Promise.all(turn.toolCalls.map((call) => execute(call)));
    history.push({ role: 'tool', results });
  }

  if (!finished) emit({ t: 'delta', v: stepLimitNotice(done, locale) });
  emit({ t: 'done' });
}
