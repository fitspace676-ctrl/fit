// @fit/admin — Gemini (Google) model driver.
//
// The cheap path: Gemini Flash models cost a fraction of Claude Haiku. Translates
// the neutral history + tools into the @google/genai shape (function declarations
// + Content parts), streams one turn, and returns text + tool calls in neutral
// form. `parametersJsonSchema` takes our MCP JSON Schema almost as-is (sanitized).

import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type Part,
  type FunctionDeclaration,
} from '@google/genai';
import {
  decodeText,
  isTextAttachment,
  sanitizeSchema,
  toStructured,
  type AgentAttachment,
  type AgentHistoryMessage,
  type AgentToolCall,
  type ModelDriver,
  type RunTurnArgs,
} from '../driver';

const MAX_TOKENS = 2048;

/** Signature Gemini accepts on a function call it did not generate itself. */
const UNSIGNED_CALL_SIGNATURE = 'skip_thought_signature_validator';

/** Convert an attachment to a Gemini part (inline binary, or decoded text). */
function attachmentPart(a: AgentAttachment): Part {
  if (isTextAttachment(a.mimeType)) {
    return { text: `Attached file "${a.name}":\n${decodeText(a.data)}` };
  }
  return { inlineData: { mimeType: a.mimeType, data: a.data } };
}

/** Read the Gemini key from either common env var. */
function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
}

/**
 * Translate the neutral history to Gemini contents. An assistant turn with no
 * text (a replayed approval) becomes `functionCall` parts alone, each carrying
 * its `thoughtSignature` back.
 */
export function toGeminiContents(history: AgentHistoryMessage[]): Content[] {
  return history.map((m): Content => {
    if (m.role === 'user') {
      const parts: Part[] = [{ text: m.text }];
      for (const a of m.attachments ?? []) parts.push(attachmentPart(a));
      return { role: 'user', parts };
    }
    if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const tc of m.toolCalls) {
        // Replay the thoughtSignature Gemini 2.5+ requires on function-call parts.
        // A call Gemini did not author (an approval whose first turn fell back to
        // Claude) has none, and an unsigned call is a 400 — so it carries the
        // placeholder Google documents for injected function calls.
        parts.push({
          functionCall: { name: tc.name, args: tc.input },
          thoughtSignature: tc.signature ?? UNSIGNED_CALL_SIGNATURE,
        });
      }
      return { role: 'model', parts };
    }
    return {
      role: 'user',
      parts: m.results.map(
        (r): Part => ({
          functionResponse: {
            name: r.name,
            response: r.isError ? { error: r.output } : toStructured(r.output),
          },
        }),
      ),
    };
  });
}

export function createGeminiDriver(modelId: string): ModelDriver {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey() });

  return {
    async runTurn({ system, tools, history, onDelta }: RunTurnArgs) {
      const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: sanitizeSchema(t.parameters),
      }));

      const contents = toGeminiContents(history);

      const stream = await ai.models.generateContentStream({
        model: modelId,
        contents,
        config: {
          systemInstruction: system,
          maxOutputTokens: MAX_TOKENS,
          tools: [{ functionDeclarations }],
          // Keep thinking at the floor: this is a CRUD tool-caller, so thinking
          // only adds cost and latency. The `-latest` aliases now point at
          // models that reject `thinkingBudget: 0` with a 400; `minimal` is the
          // lowest level they accept.
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      let text = '';
      const toolCalls: AgentToolCall[] = [];
      let counter = 0;
      for await (const chunk of stream) {
        const delta = chunk.text;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        // Read parts directly (not the `functionCalls` getter) so we can capture
        // each call's `thoughtSignature` for replay.
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (!part.functionCall) continue;
          counter += 1;
          toolCalls.push({
            id: part.functionCall.id ?? `gcall-${counter}-${Date.now()}`,
            name: part.functionCall.name ?? 'unknown',
            input: part.functionCall.args ?? {},
            signature: part.thoughtSignature,
          });
        }
      }

      return { text, toolCalls };
    },
  };
}
