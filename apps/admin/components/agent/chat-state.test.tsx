import { describe, expect, it } from 'vitest';
import {
  approvalPayload,
  errorKey,
  foldEvent,
  messageParts,
  prefixConsoleLinks,
  restoreTranscript,
} from './chat-state';
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
    ).toEqual([{ id: 'legacy', name: 'read_members', status: 'running', textOffset: 5 }]);
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

describe('console Markdown links', () => {
  it.each([
    ['[Settings](/app-settings)', '/admin', '[Settings](/admin/app-settings)'],
    ['[Already](/admin/x)', '/admin', '[Already](/admin/x)'],
    ['[Root](/admin?tab=x)', '/admin', '[Root](/admin?tab=x)'],
    ['[Similar](/administrator)', '/admin', '[Similar](/admin/administrator)'],
    ['[External](https://example.com/x)', '/admin', '[External](https://example.com/x)'],
    ['[External](//example.com/x)', '/admin', '[External](//example.com/x)'],
    ['[Settings](/app-settings)', '', '[Settings](/app-settings)'],
    [
      '`[Code](/app-settings)` [Settings](/app-settings)',
      '/admin',
      '`[Code](/app-settings)` [Settings](/admin/app-settings)',
    ],
    ['``[Code](/x) ` nested``', '/admin', '``[Code](/x) ` nested``'],
    ['```[Code](/x)``` [Page](/x)', '/admin', '```[Code](/x)``` [Page](/admin/x)'],
    ['    [Code](/x)\n\n[Page](/x)', '/admin', '    [Code](/x)\n\n[Page](/admin/x)'],
    ['```md\n[Code](/x)\n```\n[Page](/x)', '/admin', '```md\n[Code](/x)\n```\n[Page](/admin/x)'],
    ['~~~md\n[Code](/x)\n~~~\n[Page](/x)', '/admin', '~~~md\n[Code](/x)\n~~~\n[Page](/admin/x)'],
    ['```md\n[Streaming code](/x)', '/admin', '```md\n[Streaming code](/x)'],
  ])('prefixes only console links: %s', (markdown, base, expected) => {
    expect(prefixConsoleLinks(markdown, base)).toBe(expected);
  });
});

describe('transcript ordering', () => {
  it('keeps earlier text before tools and later text after them, including status updates', () => {
    let next: AgentMessage = { id: 'a', role: 'assistant', content: '' };
    next = foldEvent(next, { t: 'delta', v: 'Adding ' });
    next = foldEvent(next, { t: 'delta', v: 'a member.' });
    next = foldEvent(next, { t: 'tool', ...call });
    next = foldEvent(next, { t: 'delta', v: ' Done.' });
    next = foldEvent(next, { t: 'tool', id: call.id, name: call.name, status: 'complete' });
    expect(messageParts(next)).toEqual([
      { kind: 'text', text: 'Adding a member.' },
      { kind: 'tools', calls: [{ ...call, textOffset: 16, status: 'complete' }] },
      { kind: 'text', text: ' Done.' },
    ]);
    expect(messageParts(restoreTranscript([next])[0]!)).toEqual(messageParts(next));
    expect(next.content).toBe('Adding a member. Done.');
  });

  it('groups adjacent calls for bulk approval and preserves legacy transcripts', () => {
    const next = foldEvent(message, { t: 'tool', ...call, id: 'second' });
    expect(messageParts(next).map((part) => part.kind)).toEqual(['tools', 'text', 'tools']);
    const adjacent = foldEvent(next, { t: 'tool', ...call, id: 'third' });
    expect(messageParts(adjacent).at(-1)).toMatchObject({
      kind: 'tools',
      calls: [{ id: 'second' }, { id: 'third' }],
    });
    expect(messageParts(message)).toEqual([
      { kind: 'tools', calls: [call] },
      { kind: 'text', text: 'Hello' },
    ]);
  });
});
