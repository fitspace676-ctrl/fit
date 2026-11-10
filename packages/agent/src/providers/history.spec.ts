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

describe('blank user turns', () => {
  const png = { name: 'a.png', mimeType: 'image/png', data: 'AAAA' };
  const blank: AgentHistoryMessage[] = [
    { role: 'user', text: '' },
    { role: 'assistant', text: 'ok', toolCalls: [] },
    { role: 'user', text: '', attachments: [png] },
  ];

  it('never send Claude an empty text block', () => {
    const messages = toAnthropicMessages(blank);
    expect(messages[0]).toEqual({ role: 'user', content: '(no text)' });
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ],
    });
  });

  it('never send Gemini an empty text part', () => {
    const contents = toGeminiContents(blank);
    expect(contents[0]).toEqual({ role: 'user', parts: [{ text: '(no text)' }] });
    expect(contents[2]).toEqual({
      role: 'user',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }],
    });
  });
});
