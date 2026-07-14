import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Permission } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';

// The agent runtime lives in the `@fit/agent` package, whose provider-SDK type
// graphs (notably @google/genai) make the API's classic `moduleResolution: Node`
// `tsc` blow up (OOM — even at 8GB). We load it through a hand-typed `require`
// boundary so the API's `tsc` never resolves those types; SWC transpiles the
// package at runtime, and @fit/agent type-checks/lints itself under bundler
// resolution. (Railway never runs tsc for the API anyway — build = prisma
// generate, start = SWC — so the deployment is unaffected either way.)

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
/** NDJSON event the runtime streams (kept loose at this boundary). */
interface StreamEvent {
  t: 'delta' | 'tool' | 'error' | 'done';
  [key: string]: unknown;
}
/** The concrete model the runtime resolves (structurally its `AgentModel`). */
interface AgentModelRef {
  id: string;
  label: string;
  provider: string;
  modelId: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const agent = require('@fit/agent') as {
  runAgent: (
    messages: ChatTurn[],
    token: string,
    model: AgentModelRef,
    emit: (event: StreamEvent) => void,
    attachments?: Attachment[],
  ) => Promise<void>;
  resolveModel: (id?: string) => AgentModelRef | undefined;
};

interface ChatBody {
  messages?: ChatTurn[];
  attachments?: Attachment[];
  model?: string;
}

/**
 * Admin console AI-agent chat runtime (`POST /agent/chat`).
 *
 * The agent loop runs here, on the backend, so the provider API keys live in the
 * API's environment rather than the admin frontend. Guarded like
 * {@link Permission.ProfileManage} self-service (every staff role holds it);
 * {@link TenantGuard} pins the gym. The caller's bearer token (the same one the
 * guards verified) is handed to the MCP tools, so every read/write the agent
 * performs is scoped to that operator — the agent has no authority of its own.
 *
 * Streams the reply as NDJSON (`{t:'delta'|'tool'|'error'|'done'}`) via the raw
 * Express response; the admin proxy forwards the stream to the browser verbatim.
 */
@Controller('agent')
@UseGuards(TenantGuard, PermissionsGuard)
export class AgentChatController {
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async chat(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ChatBody,
    @Res() res: Response,
  ): Promise<void> {
    const token = extractBearer(authorization);
    const model = agent.resolveModel(body.model);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const attachments = Array.isArray(body.attachments) ? body.attachments : undefined;

    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');

    const emit = (event: StreamEvent): void => {
      res.write(`${JSON.stringify(event)}\n`);
    };

    try {
      if (model && token) {
        await agent.runAgent(messages, token, model, emit, attachments);
      } else {
        // No provider key configured (no model) — the guards guarantee a token.
        emit({ t: 'error', message: 'agent_not_configured' });
      }
    } catch (err) {
      emit({ t: 'error', message: err instanceof Error ? err.message : 'agent_failed' });
    } finally {
      res.end();
    }
  }
}

/** Pull the token out of an `Authorization: Bearer <token>` header. */
function extractBearer(header: string | undefined): string | null {
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}
