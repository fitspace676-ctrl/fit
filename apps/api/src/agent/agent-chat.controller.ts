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
import { z } from 'zod';
import { Permission } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AgentContextService, type AgentChatContext } from './agent-context.service';

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
/** A write call the operator decided on, echoed back unchanged. */
interface Approval {
  call: { id: string; name: string; input: Record<string, unknown>; signature?: string };
  decision: 'approve' | 'reject';
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
export interface AgentRuntime {
  runAgent: (
    messages: ChatTurn[],
    token: string,
    model: AgentModelRef,
    emit: (event: StreamEvent) => void,
    options?: {
      context?: AgentChatContext;
      approvals?: Approval[];
      attachments?: Attachment[];
      onFallback?: (from: AgentModelRef, to: AgentModelRef, reason: string) => void;
    },
  ) => Promise<void>;
  resolveModel: (id?: string) => AgentModelRef | undefined;
}

let runtime: AgentRuntime | undefined;
/** The runtime, required on first use so this module loads without it (specs). */
function agentRuntime(): AgentRuntime {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  runtime ??= require('@fit/agent') as AgentRuntime;
  return runtime;
}

/** The turn's extras; `messages`/`attachments`/`model` stay leniently read as before. */
const chatExtrasSchema = z.object({
  locationId: z.string().min(1).max(64).optional().catch(undefined),
  locale: z.enum(['ka', 'en']).optional().catch(undefined),
  approvals: z
    .array(
      z.object({
        call: z.object({
          id: z.string().min(1).max(128),
          name: z.string().min(1).max(128),
          input: z.record(z.unknown()),
          signature: z.string().optional(),
        }),
        decision: z.enum(['approve', 'reject']),
      }),
    )
    .max(10)
    .optional(),
});

interface ChatBody {
  messages?: ChatTurn[];
  attachments?: Attachment[];
  model?: string;
  locationId?: unknown;
  locale?: unknown;
  approvals?: unknown;
}

/** A short, stable error code for the operator; the raw message stays in the log. */
export function classifyAgentError(err: unknown): { code: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 429 || /rate.?limit|429|quota|resource_exhausted|too many requests/i.test(raw)) {
    return {
      code: 'rate_limited',
      message: 'The AI provider is rate-limiting requests. Try again shortly.',
    };
  }
  // The provider SDKs throw errors carrying an HTTP `status`; anything else
  // (a network fault, a bug in the loop) is ours.
  if (
    typeof status === 'number' ||
    /overloaded|unavailable|api.?key|model|anthropic|gemini|google|timed? ?out|ECONNRESET|ETIMEDOUT/i.test(
      raw,
    )
  ) {
    return { code: 'provider_error', message: 'The AI provider returned an error.' };
  }
  return { code: 'agent_failed', message: 'The agent could not finish this turn.' };
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
 * Each turn carries a context built from the session alone (gym, its branches,
 * the caller's grants — see {@link AgentContextService}). Write tools pause the
 * turn for approval; the console re-posts with `approvals` to resume.
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

  constructor(private readonly contexts: AgentContextService) {}

  /** The `@fit/agent` runtime — a method so a spec can stand in for it. */
  protected runtime(): AgentRuntime {
    return agentRuntime();
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async chat(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ChatBody,
    @Res() res: Response,
  ): Promise<void> {
    const extras = chatExtrasSchema.safeParse({
      locationId: body.locationId,
      locale: body.locale,
      approvals: body.approvals,
    });
    const token = extractBearer(authorization);
    const agent = this.runtime();
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
      // Reported in-stream like every other failure, so the console reads one
      // format; nothing has run yet.
      if (!extras.success) {
        this.logger.warn(`agent invalid_request: ${extras.error.message}`);
        emit({ t: 'error', code: 'invalid_request', message: 'Invalid agent request.' });
        return;
      }
      if (!model || !token) {
        // No provider key configured (no model) — the guards guarantee a token.
        this.logger.error(
          `agent_not_configured — no provider key is set, so no model resolved (requested: ${body.model ?? 'default'})`,
        );
        emit({
          t: 'error',
          code: 'agent_not_configured',
          message: 'The AI agent is not configured.',
        });
        return;
      }

      let context: AgentChatContext;
      try {
        context = await this.contexts.build({
          locationId: extras.data.locationId,
          locale: extras.data.locale,
        });
      } catch (err) {
        this.logger.error(
          `agent context failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        emit({
          t: 'error',
          code: 'agent_failed',
          message: 'Could not load the gym context.',
        });
        return;
      }

      // A fallback means the preferred (cheaper) provider is refusing work —
      // the turn still succeeds, so this warning is the only place it surfaces.
      const onFallback = (from: AgentModelRef, to: AgentModelRef, reason: string): void => {
        this.logger.warn(
          `agent falling back from ${from.provider}/${from.modelId} to ${to.provider}/${to.modelId}: ${reason}`,
        );
      };
      await agent.runAgent(messages, token, model, emit, {
        context,
        approvals: extras.data.approvals,
        attachments,
        onFallback,
      });
    } catch (err) {
      // Log before streaming: the provider's own message (bad key, retired model
      // id, rate limit) is the only thing that identifies the fault, and the 200
      // status means nothing else in the stack will record it. The operator gets
      // only the short code.
      const message = err instanceof Error ? err.message : 'agent_failed';
      this.logger.error(
        `agent turn failed [${model?.provider ?? 'no-provider'}/${model?.modelId ?? 'no-model'}]: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      emit({ t: 'error', ...classifyAgentError(err) });
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
