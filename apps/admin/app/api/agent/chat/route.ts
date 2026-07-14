// @fit/admin — AI Agent chat endpoint (Phase 1 scaffold).
//
// The console's AI copilot posts a conversation here and receives a streamed
// NDJSON reply. Each line is one event the client folds into the transcript:
//
//   {"t":"delta","v":"…"}                 — append text to the current turn
//   {"t":"tool","id,name,status,target"}  — an MCP tool invocation (Phase 3)
//   {"t":"error","message":"…"}           — a turn-level failure
//   {"t":"done"}                          — the turn is complete
//
// This protocol is deliberately the shape the real agent loop will emit, so the
// UI never changes when Phase 3 swaps this placeholder for the Claude + MCP
// runtime: the browser drives the transcript, an MCP server exposes every
// read/edit the console can perform, and Claude calls those tools here.
//
// When `ANTHROPIC_API_KEY` is set the endpoint runs the real Claude + MCP agent
// (see run-agent.ts) — Claude calls the Fit MCP tools to read and manage the gym.
// Without the key it falls back to a canned streamed reply so the pipe — button →
// drawer → stream → transcript — still works end to end for UI development.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';
import { runAgent } from '@/lib/agent/run-agent';
import { resolveModel } from '@/lib/agent/models';

export const runtime = 'nodejs';
// The stream must flush incrementally; never statically cache or buffer it.
export const dynamic = 'force-dynamic';

/** One inbound chat turn from the client. */
interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface Attachment {
  name: string;
  mimeType: string;
  data: string;
}

interface ChatRequestBody {
  messages?: ChatTurn[];
  /** UI id of the model to run (see lib/agent/models.ts); falls back to cheapest. */
  model?: string;
  /** Files attached to the latest user turn (base64). */
  attachments?: Attachment[];
}

/** Serialize one agent event as an NDJSON line. */
function line(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser =
    [...messages]
      .reverse()
      .find((m) => m.role === 'user')
      ?.content?.trim() ?? '';

  // Resolve the requested model to one whose provider key is configured.
  const model = resolveModel(body.model);
  // The MCP tools act as this operator — forward their real access token.
  const token = model ? (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value : undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => controller.enqueue(line(event));

      try {
        if (model && token) {
          // Real agent: the chosen model drives the Fit MCP tools; events stream through.
          const attachments = Array.isArray(body.attachments) ? body.attachments : undefined;
          await runAgent(messages, token, model, emit, attachments);
        } else {
          // Fallback (no provider key): a canned streamed reply so the UI still works.
          const reply = lastUser
            ? `მივიღე: “${lastUser}”. AI მოდელი ჯერ არ არის მიერთებული — დააყენე ANTHROPIC_API_KEY ან GEMINI_API_KEY, რომ რეალურად შევძლო ფიტნესის ადმინის მართვა MCP-ით.`
            : 'გამარჯობა! მე ვარ ფიტნესის ადმინის AI აგენტი. API key-ის (Claude ან Gemini) დაყენების შემდეგ შევძლებ წევრების, გაკვეთილების და პროდუქტების მართვას პირდაპირ ამ ჩატიდან.';
          for (const word of reply.split(/(\s+)/)) {
            emit({ t: 'delta', v: word });
            await new Promise((r) => setTimeout(r, 18));
          }
          emit({ t: 'done' });
        }
      } catch (err) {
        emit({ t: 'error', message: err instanceof Error ? err.message : 'stream_failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
