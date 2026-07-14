// @fit/admin — Claude (Anthropic) model driver.
//
// Translates the neutral history + tools into the Anthropic Messages shape, runs
// one streamed turn, and returns the text + tool calls in neutral form. The
// stable tool block is prompt-cached (cache_control on the last tool) to keep
// input cost low across the loop's rounds.

import Anthropic from '@anthropic-ai/sdk';
import {
  decodeText,
  isTextAttachment,
  type AgentAttachment,
  type AgentToolCall,
  type ModelDriver,
  type RunTurnArgs,
} from '../driver';

const MAX_TOKENS = 2048;

/** Convert an attachment to Anthropic content blocks (image / PDF / inline text). */
function attachmentBlocks(a: AgentAttachment): Anthropic.ContentBlockParam[] {
  if (a.mimeType.startsWith('image/')) {
    return [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: a.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: a.data,
        },
      },
    ];
  }
  if (a.mimeType === 'application/pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } },
    ];
  }
  if (isTextAttachment(a.mimeType)) {
    return [{ type: 'text', text: `Attached file "${a.name}":\n${decodeText(a.data)}` }];
  }
  return [{ type: 'text', text: `(unsupported attachment "${a.name}", ${a.mimeType})` }];
}

export function createClaudeDriver(modelId: string): ModelDriver {
  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  return {
    async runTurn({ system, tools, history, onDelta }: RunTurnArgs) {
      const anthropicTools: Anthropic.Tool[] = tools.map((t, i) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
        ...(i === tools.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));

      const messages: Anthropic.MessageParam[] = history.map((m) => {
        if (m.role === 'user') {
          if (!m.attachments || m.attachments.length === 0) {
            return { role: 'user', content: m.text };
          }
          const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: m.text }];
          for (const a of m.attachments) content.push(...attachmentBlocks(a));
          return { role: 'user', content };
        }
        if (m.role === 'assistant') {
          const content: Anthropic.ContentBlockParam[] = [];
          if (m.text) content.push({ type: 'text', text: m.text });
          for (const tc of m.toolCalls) {
            content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
          }
          return { role: 'assistant', content };
        }
        return {
          role: 'user',
          content: m.results.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.id,
            content: r.output,
            is_error: r.isError,
          })),
        };
      });

      const stream = anthropic.messages.stream({
        model: modelId,
        max_tokens: MAX_TOKENS,
        system,
        tools: anthropicTools,
        messages,
      });
      stream.on('text', (delta) => onDelta(delta));
      const message = await stream.finalMessage();

      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const toolCalls: AgentToolCall[] = message.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          name: b.name,
          input: (b.input ?? {}) as Record<string, unknown>,
        }));

      return { text, toolCalls };
    },
  };
}
