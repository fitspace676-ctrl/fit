import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
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
    onFallback?: (from: AgentModelRef, to: AgentModelRef, reason: string) => void,
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
  /**
   * A failed turn is reported to the browser inside the NDJSON stream, so the
   * HTTP status stays 200 and nothing reaches Nest's exception filter — without
   * this logger a provider outage, a rejected key or a bad model id is invisible
   * everywhere except the operator's screen. Every failure below is logged here.
   */
  private readonly logger = new Logger(AgentChatController.name);

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
        // A fallback means the preferred (cheaper) provider is refusing work —
        // the turn still succeeds, so this warning is the only place it surfaces.
        const onFallback = (from: AgentModelRef, to: AgentModelRef, reason: string): void => {
          this.logger.warn(
            `agent falling back from ${from.provider}/${from.modelId} to ${to.provider}/${to.modelId}: ${reason}`,
          );
        };
        await agent.runAgent(messages, token, model, emit, attachments, onFallback);
      } else {
        // No provider key configured (no model) — the guards guarantee a token.
        this.logger.error(
          `agent_not_configured — no provider key is set, so no model resolved (requested: ${body.model ?? 'default'})`,
        );
        emit({ t: 'error', message: 'agent_not_configured' });
      }
    } catch (err) {
      // Log before streaming: the provider's own message (bad key, retired model
      // id, rate limit) is the only thing that identifies the fault, and the 200
      // status means nothing else in the stack will record it.
      const message = err instanceof Error ? err.message : 'agent_failed';
      this.logger.error(
        `agent turn failed [${model?.provider ?? 'no-provider'}/${model?.modelId ?? 'no-model'}]: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      emit({ t: 'error', message });
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
