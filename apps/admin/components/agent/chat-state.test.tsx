import { describe, expect, it } from 'vitest';
import { approvalPayload, errorKey, foldEvent, restoreTranscript } from './chat-state';
import type { AgentMessage, AgentToolCall } from './types';

const call: AgentToolCall = {
  id: 'write-1',
  name: 'member_update',
  title: 'Update member',
  kind: 'write',
  status: 'awaiting_approval',
  input: { memberId: '1', nested: { active: false } },
  signature: 'signed-token',
  destructive: true,
};
const message: AgentMessage = { id: 'a', role: 'assistant', content: 'Hello', toolCalls: [call] };

describe('agent stream and approval state', () => {
  it('updates by id and preserves approval metadata when subsequent events omit it', () => {
    const next = foldEvent(message, {
      t: 'tool',
      id: call.id,
      name: call.name,
      status: 'complete',
      resultSummary: 'Saved',
      durationMs: 12,
    });
    expect(next.toolCalls).toEqual([
      { ...call, status: 'complete', resultSummary: 'Saved', durationMs: 12 },
    ]);
    expect(foldEvent(next, { t: 'delta', v: ' again' }).content).toBe('Hello again');
  });
  it('accepts old tool events without title or kind', () => {
    expect(
      foldEvent(
        { ...message, toolCalls: [] },
        { t: 'tool', id: 'legacy', name: 'read_members', status: 'running' },
      ).toolCalls,
    ).toEqual([{ id: 'legacy', name: 'read_members', status: 'running' }]);
  });
  it('waits for every decision and returns unchanged call inputs and signatures', () => {
    const calls = [call, { ...call, id: 'write-2', signature: undefined }];
    expect(approvalPayload(calls, { 'write-1': 'approve' })).toBeNull();
    const payload = approvalPayload(calls, { 'write-1': 'approve', 'write-2': 'reject' });
    expect(payload?.[0]).toEqual({
      call: { id: call.id, name: call.name, input: call.input, signature: call.signature },
      decision: 'approve',
    });
    expect(payload?.[0]?.call.input).toBe(call.input);
    expect(payload?.[1]?.decision).toBe('reject');
    expect(payload?.[1]?.call).not.toHaveProperty('signature');
  });
  it('cancels restored pending approvals and retains settled decisions', () => {
    const restored = restoreTranscript([
      {
        ...message,
        streaming: true,
        toolCalls: [call, { ...call, id: 'complete', status: 'complete', decision: 'approve' }],
      },
    ]);
    expect(restored[0]?.streaming).toBe(false);
    expect(restored[0]?.toolCalls?.[0]?.status).toBe('cancelled');
    expect(restored[0]?.toolCalls?.[1]?.decision).toBe('approve');
    expect(call.status).toBe('awaiting_approval');
  });
  it('uses a generic localized error for missing or unknown codes', () => {
    expect(errorKey('provider_error')).toBe('errors.provider_error');
    expect(errorKey('internal_secret')).toBe('error');
    expect(errorKey()).toBe('error');
  });
});
