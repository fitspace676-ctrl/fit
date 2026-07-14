// @fit/mcp-server — standalone HTTP host for the Fit MCP server.
//
// Serves the same 91-tool Fit MCP (from @fit/mcp) over the MCP Streamable HTTP
// transport so external clients (Claude Desktop, the Messages-API MCP connector,
// other LLMs) can reach it. Auth is a bearer token: the client sends the
// operator's fit access token as `Authorization: Bearer <token>`, and every tool
// call runs against the tenant-scoped fit API as that operator — the server has
// no ambient authority of its own, so an unauthenticated or wrong-gym token
// simply can't read or change anything.
//
// Stateful: an MCP session is established on `initialize` (the bearer token from
// that request is bound to the session's server), and follow-up requests carry
// the `Mcp-Session-Id` header. Put this behind HTTPS (a tunnel in dev, a real
// deployment in prod) — the bearer token must never travel over plain HTTP.

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createFitMcpServer } from '@fit/mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAgent } from './runtime/run-agent';
import { resolveModel } from './runtime/models';
import type { AgentStreamEvent } from './runtime/driver';

const PORT = Number(process.env.PORT ?? 3005);

/** Live sessions, keyed by the MCP session id assigned on initialize. */
const sessions = new Map<string, { mcp: McpServer; transport: StreamableHTTPServerTransport }>();

/** Permissive CORS so browser-based MCP clients can connect; tighten for prod. */
function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

/** Extract the bearer token from the Authorization header, or null. */
function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Read and JSON-parse a request body (undefined when empty). */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
interface ChatBody {
  messages?: ChatTurn[];
  attachments?: { name: string; mimeType: string; data: string }[];
  model?: string;
}

/**
 * `POST /agent/chat` — run the Claude/Gemini + Fit MCP loop for the admin console
 * and stream the reply as NDJSON. Bearer auth: the operator's fit access token is
 * handed to the MCP tools, so every read/write is scoped to that operator.
 */
async function handleAgentChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }
  const token = bearer(req);
  if (!token) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    json(res, 401, { error: 'missing_bearer_token' });
    return;
  }
  let body: ChatBody;
  try {
    const parsed = (await readJson(req)) as ChatBody | null;
    body = parsed ?? {};
  } catch {
    json(res, 400, { error: 'invalid_json' });
    return;
  }

  const model = resolveModel(body.model);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const attachments = Array.isArray(body.attachments) ? body.attachments : undefined;

  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
  });
  const emit = (event: AgentStreamEvent): void => {
    res.write(`${JSON.stringify(event)}\n`);
  };
  try {
    if (model) await runAgent(messages, token, model, emit, attachments);
    else emit({ t: 'error', message: 'agent_not_configured' });
  } catch (err) {
    emit({ t: 'error', message: err instanceof Error ? err.message : 'agent_failed' });
  } finally {
    res.end();
  }
}

const server = createServer((req, res) => {
  void (async () => {
    cors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const path = (req.url ?? '/').split('?')[0];
    if (path === '/' || path === '/health') {
      json(res, 200, { ok: true, service: 'fit-mcp', transport: 'streamable-http' });
      return;
    }
    // The admin console's AI-agent loop runs here (backend, keys in this service's
    // env) and the admin proxies to it.
    if (path === '/agent/chat') {
      await handleAgentChat(req, res);
      return;
    }
    if (path !== '/mcp') {
      json(res, 404, { error: 'not_found' });
      return;
    }

    const body = req.method === 'POST' ? await readJson(req).catch(() => Symbol('bad')) : undefined;
    if (typeof body === 'symbol') {
      json(res, 400, { error: 'invalid_json' });
      return;
    }

    const sessionId = req.headers['mcp-session-id'];
    const existing = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;

    // Follow-up request on an established session.
    if (existing) {
      await existing.transport.handleRequest(req, res, body);
      return;
    }

    // A new session must start with `initialize`, carrying the bearer token.
    if (!isInitializeRequest(body)) {
      json(res, 400, { error: 'no_session_or_not_initialize' });
      return;
    }
    const token = bearer(req);
    if (!token) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      json(res, 401, { error: 'missing_bearer_token' });
      return;
    }

    const mcp = createFitMcpServer(token);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid) => {
        sessions.set(sid, { mcp, transport });
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
      void mcp.close();
    };

    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  })().catch((err) => {
    if (!res.headersSent) {
      json(res, 500, { error: err instanceof Error ? err.message : 'mcp_error' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[fit-mcp] Streamable HTTP MCP server on :${PORT} (POST /mcp, bearer auth)`);
});
