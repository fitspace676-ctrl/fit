import { describe, expect, it } from 'vitest';
import type { AgentHistoryMessage } from '../driver';
import { toAnthropicMessages } from './claude';
import { toGeminiContents } from './gemini';

/** A replayed approval: an assistant turn with no text, only the call. */
const replayed: AgentHistoryMessage[] = [
  { role: 'user', text: 'delete Ana' },
  {
    role: 'assistant',
    text: '',
    toolCalls: [{ id: 'c2', name: 'delete_member', input: { id: 'm1' }, signature: 'sig==' }],
  },
  { role: 'tool', results: [{ id: 'c2', name: 'delete_member', output: '{}', isError: false }] },
];

describe('replayed tool calls without text', () => {
  it('become tool_use blocks alone for Claude', () => {
    const messages = toAnthropicMessages(replayed);

    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'c2', name: 'delete_member', input: { id: 'm1' } }],
    });
    expect(messages[2]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'c2' }],
    });
  });

  it('become functionCall parts carrying the signature for Gemini', () => {
    const contents = toGeminiContents(replayed);

    expect(contents[1]).toEqual({
      role: 'model',
      parts: [
        { functionCall: { name: 'delete_member', args: { id: 'm1' } }, thoughtSignature: 'sig==' },
      ],
    });
  });
});
