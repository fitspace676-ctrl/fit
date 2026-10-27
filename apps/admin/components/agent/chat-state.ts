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
      : [...calls, { ...call, textOffset: message.content.length }],
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

/** Interleave text and adjacent tool calls; old transcripts keep tools first. */
export function messageParts(message: AgentMessage) {
  const parts: ({ kind: 'text'; text: string } | { kind: 'tools'; calls: AgentToolCall[] })[] = [];
  let offset = 0;
  for (const call of message.toolCalls ?? []) {
    const next = Math.max(offset, Math.min(call.textOffset ?? 0, message.content.length));
    if (next > offset) parts.push({ kind: 'text', text: message.content.slice(offset, next) });
    const last = parts[parts.length - 1];
    if (last?.kind === 'tools') last.calls.push(call);
    else parts.push({ kind: 'tools', calls: [call] });
    offset = next;
  }
  if (offset < message.content.length || !parts.length)
    parts.push({ kind: 'text', text: message.content.slice(offset) });
  return parts;
}

/** Prefix console Markdown links while leaving fenced and inline code untouched. */
export function prefixConsoleLinks(markdown: string, basePath: string): string {
  const base = basePath.replace(/\/+$/, '');
  if (!base) return markdown;
  let fence: string | undefined;
  let inline = '';
  return markdown
    .split(/(?<=\n)/)
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
      if (fence) {
        if (
          marker &&
          marker[1]![0] === fence[0] &&
          marker[1]!.length >= fence.length &&
          !marker[2]!.trim()
        )
          fence = undefined;
        return line;
      }
      if (marker && !inline && (marker[1]![0] !== '`' || !marker[2]!.includes('`'))) {
        fence = marker[1];
        return line;
      }
      if (!inline && /^(?: {4}|\t)/.test(line)) return line;
      return line.replace(/`+|\]\((\/[^\s)]*)/g, (match: string, path?: string) => {
        if (!path) {
          if (!inline) inline = match;
          else if (inline === match) inline = '';
          return match;
        }
        if (
          inline ||
          path.startsWith('//') ||
          path === base ||
          path.startsWith(`${base}/`) ||
          path.startsWith(`${base}?`) ||
          path.startsWith(`${base}#`)
        )
          return match;
        return `](${base}${path}`;
      });
    })
    .join('');
}
