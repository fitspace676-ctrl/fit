import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import {
  AgentChatController,
  classifyAgentError,
  type AgentRuntime,
} from './agent-chat.controller';
import type { AgentChatContext, AgentContextService } from './agent-context.service';

const CONTEXT: AgentChatContext = {
  gym: { name: 'Downtown', slug: 'downtown' },
  locations: [{ id: 'loc-a', name: 'Vake', status: 'ACTIVE' }],
  operator: { role: 'MANAGER', permissions: [] },
  today: '2026-10-05',
};

function setup(opts: { model?: boolean; runAgent?: AgentRuntime['runAgent'] } = {}) {
  const build = vi.fn((_input: { locationId?: string; locale?: string }) =>
    Promise.resolve(CONTEXT),
  );
  const runAgent = vi.fn<AgentRuntime['runAgent']>(
    opts.runAgent ?? ((_m, _t, _model, emit) => Promise.resolve(emit({ t: 'done' }))),
  );
  const runtime: AgentRuntime = {
    runAgent,
    resolveModel: () =>
      opts.model === false
        ? undefined
        : { id: 'm', label: 'M', provider: 'anthropic', modelId: 'claude-x' },
  };
  class TestController extends AgentChatController {
    protected override runtime(): AgentRuntime {
      return runtime;
    }
  }
  const controller = new TestController({ build } as unknown as AgentContextService);
  const lines: string[] = [];
  const end = vi.fn();
  const res = {
    setHeader: vi.fn(),
    write: vi.fn((chunk: string) => lines.push(chunk)),
    end,
  } as unknown as Response;
  const events = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { controller, build, runAgent, res, end, events };
}

describe('AgentChatController', () => {
  it('passes locationId and locale to the context and approvals to the runtime', async () => {
    const ctx = setup();
    const approvals = [
      {
        call: { id: 'c1', name: 'delete_member', input: { id: 'm1' }, signature: 's' },
        decision: 'approve',
      },
    ];

    await ctx.controller.chat(
      'Bearer tok',
      { messages: [{ role: 'user', content: 'hi' }], locationId: 'loc-a', locale: 'ka', approvals },
      ctx.res,
    );

    expect(ctx.build).toHaveBeenCalledWith({ locationId: 'loc-a', locale: 'ka' });
    expect(ctx.runAgent).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hi' }],
      'tok',
      expect.objectContaining({ modelId: 'claude-x' }),
      expect.any(Function),
      expect.objectContaining({ context: CONTEXT, approvals }),
    );
  });

  it('drops an unknown locale instead of failing the turn', async () => {
    const ctx = setup();

    await ctx.controller.chat('Bearer tok', { messages: [], locale: 'fr' }, ctx.res);

    expect(ctx.build).toHaveBeenCalledWith({ locationId: undefined, locale: undefined });
  });

  it('streams invalid_request for more than ten approvals without running anything', async () => {
    const ctx = setup();
    const approval = { call: { id: 'c', name: 'x', input: {} }, decision: 'reject' };

    await ctx.controller.chat(
      'Bearer tok',
      { approvals: Array.from({ length: 11 }, () => approval) },
      ctx.res,
    );

    expect(ctx.events()).toEqual([
      { t: 'error', code: 'invalid_request', message: 'Invalid agent request.' },
    ]);
    expect(ctx.runAgent).not.toHaveBeenCalled();
    expect(ctx.build).not.toHaveBeenCalled();
  });

  it('streams invalid_request for an approval whose input is not an object', async () => {
    const ctx = setup();

    await ctx.controller.chat(
      'Bearer tok',
      { approvals: [{ call: { id: 'c', name: 'x', input: 'drop' }, decision: 'approve' }] },
      ctx.res,
    );

    expect(ctx.events()[0]).toMatchObject({ code: 'invalid_request' });
    expect(ctx.runAgent).not.toHaveBeenCalled();
  });

  it('streams agent_not_configured when no model resolves', async () => {
    const ctx = setup({ model: false });

    await ctx.controller.chat('Bearer tok', { messages: [] }, ctx.res);

    expect(ctx.events()).toEqual([
      { t: 'error', code: 'agent_not_configured', message: 'The AI agent is not configured.' },
    ]);
    expect(ctx.end).toHaveBeenCalled();
  });

  it('streams a short code, not the provider message, when the turn fails', async () => {
    const ctx = setup({
      runAgent: () =>
        Promise.reject(new Error('429 rate_limit_error: key sk-ant-secret over quota')),
    });

    await ctx.controller.chat('Bearer tok', { messages: [] }, ctx.res);

    const [event] = ctx.events();
    expect(event).toMatchObject({ t: 'error', code: 'rate_limited' });
    expect(JSON.stringify(event)).not.toContain('sk-ant-secret');
  });
});

describe('classifyAgentError', () => {
  it('maps provider failures to stable codes', () => {
    expect(classifyAgentError(new Error('Overloaded')).code).toBe('provider_error');
    expect(classifyAgentError(new Error('invalid x-api-key')).code).toBe('provider_error');
    expect(classifyAgentError(Object.assign(new Error('bad'), { status: 400 })).code).toBe(
      'provider_error',
    );
    expect(classifyAgentError(new TypeError('x is undefined')).code).toBe('agent_failed');
  });
});
