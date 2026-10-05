import type { AgentApproval, AgentMessage, AgentStreamEvent, AgentToolCall } from './types';

export function foldEvent(message: AgentMessage, event: AgentStreamEvent): AgentMessage {
  if (event.t === 'delta') return { ...message, content: message.content + event.v };
  if (event.t !== 'tool') return message;
  const { t: _t, ...call } = event;
  const calls = message.toolCalls ?? [];
  return {
    ...message,
    toolCalls: calls.some((c) => c.id === call.id)
      ? calls.map((c) => (c.id === call.id ? { ...c, ...call } : c))
      : [...calls, call],
  };
}

export function restoreTranscript(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((m) => ({
    ...m,
    streaming: false,
    toolCalls: m.toolCalls?.map((c) =>
      c.status === 'awaiting_approval' ? { ...c, status: 'cancelled' } : c,
    ),
  }));
}

export function approvalPayload(
  calls: AgentToolCall[],
  decisions: Record<string, AgentApproval['decision']>,
): AgentApproval[] | null {
  if (!calls.length || calls.some((c) => !decisions[c.id] || !c.input)) return null;
  return calls.map((c) => ({
    call: {
      id: c.id,
      name: c.name,
      input: c.input!,
      ...(c.signature === undefined ? {} : { signature: c.signature }),
    },
    decision: decisions[c.id]!,
  }));
}

export function errorKey(code?: string) {
  switch (code) {
    case 'agent_not_configured':
    case 'provider_error':
    case 'rate_limited':
    case 'invalid_request':
    case 'unknown_tool':
    case 'agent_failed':
      return `errors.${code}` as const;
    default:
      return 'error' as const;
  }
}
