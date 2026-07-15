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
// Cost is the first constraint (see the cost memory): the model defaults to the
// cheapest available (Gemini Flash-Lite, else Claude Haiku), the driver caps
// output short, and the loop is bounded so it can never run away.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFitMcpServer } from '@fit/mcp';
import { createDriver, type AgentModel } from './models';
import { normalizeAttachments } from './attachments';
import type {
  AgentAttachment,
  AgentHistoryMessage,
  AgentStreamEvent,
  AgentTool,
  AgentToolResult,
} from './driver';

/** Hard ceiling on tool-call rounds so a loop can never burn tokens unbounded. */
const MAX_ROUNDS = 8;

const SYSTEM = [
  'You are the AI assistant inside a fitness gym admin console.',
  'You help staff read and fully manage the gym — members, classes, products, trainers,',
  'locations, plans, staff, orders, marketing, loyalty, settings — by calling the tools.',
  'The user may attach files (images, PDFs, or text/CSV) — their contents are included directly',
  'in the conversation, so read and use them without claiming you cannot access files.',
  '',
  'Formatting (important — the reply renders as Markdown, so make it look good):',
  '- Present a LIST of records as a Markdown table with a short, relevant set of columns',
  '  (e.g. Name | Status | Plan). Never paste raw JSON.',
  '- Present a SINGLE record as a compact list of **bold label**: value lines.',
  '- Confirm an edit in one short sentence, then show the changed fields.',
  "- Keep it concise; use headings/bold sparingly. Reply in the user's language",
  '  (Georgian or English, matching their message).',
  '',
  'Rules: never invent an id — always find it with a list_* tool first. Before a create or edit,',
  'if the target or the values are ambiguous, ask a brief clarifying question. For create/update',
  'tools pass the fields under `data`; if the API returns a validation error, read it and retry',
  'with corrected fields.',
].join('\n');

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A one-line, human-readable target for a tool call, for the transcript chrome. */
function toolTarget(input: Record<string, unknown>): string | undefined {
  const pick = input.id ?? input.search ?? input.name ?? input.status ?? Object.values(input)[0];
  if (typeof pick === 'string') return pick.slice(0, 60);
  if (typeof pick === 'number' || typeof pick === 'boolean') return String(pick);
  return undefined;
}

/**
 * Run one assistant turn: stream the model's reply, execute any tool calls through
 * MCP, and loop until the model stops calling tools. `emit` receives NDJSON
 * events. `token` is the operator's access token — the MCP tools act as that
 * operator. `model` selects the provider + concrete model.
 */
export async function runAgent(
  messages: ChatTurn[],
  token: string,
  model: AgentModel,
  emit: (event: AgentStreamEvent) => void,
  attachments?: AgentAttachment[],
): Promise<void> {
  const driver = createDriver(model);

  // Link an MCP client to the in-process Fit server over an in-memory transport.
  const server = createFitMcpServer(token);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'fit-admin-agent', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const { tools: mcpTools } = await client.listTools();
    const tools: AgentTool[] = mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    }));

    const history: AgentHistoryMessage[] = messages.map((m) =>
      m.role === 'assistant'
        ? { role: 'assistant', text: m.content, toolCalls: [] }
        : { role: 'user', text: m.content },
    );
    // Attach the uploaded files to the latest user turn, if any. Normalize first
    // so the model only ever sees types it accepts (xlsx → CSV, etc.).
    if (attachments && attachments.length > 0) {
      const normalized = normalizeAttachments(attachments);
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const msg = history[i];
        if (msg && msg.role === 'user') {
          msg.attachments = normalized;
          break;
        }
      }
    }

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const turn = await driver.runTurn({
        system: SYSTEM,
        tools,
        history,
        onDelta: (text) => emit({ t: 'delta', v: text }),
      });

      if (turn.toolCalls.length === 0) break;
      history.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls });

      const results: AgentToolResult[] = [];
      for (const call of turn.toolCalls) {
        const target = toolTarget(call.input);
        emit({ t: 'tool', id: call.id, name: call.name, status: 'running', target });
        try {
          const res = (await client.callTool({
            name: call.name,
            arguments: call.input,
          })) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
          const text = (res.content ?? [])
            .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
            .join('\n');
          const isError = Boolean(res.isError);
          emit({
            t: 'tool',
            id: call.id,
            name: call.name,
            status: isError ? 'error' : 'complete',
            target,
            ...(isError ? { errorMessage: text } : {}),
          });
          results.push({ id: call.id, name: call.name, output: text || '(no output)', isError });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'tool_failed';
          emit({
            t: 'tool',
            id: call.id,
            name: call.name,
            status: 'error',
            target,
            errorMessage: msg,
          });
          results.push({ id: call.id, name: call.name, output: msg, isError: true });
        }
      }

      history.push({ role: 'tool', results });
    }

    emit({ t: 'done' });
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
