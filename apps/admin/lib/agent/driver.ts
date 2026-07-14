// @fit/admin — provider-agnostic model driver contract for the AI agent.
//
// The agent loop (run-agent.ts) and the MCP tools are provider-neutral; only the
// per-turn model call differs between Claude and Gemini. A `ModelDriver` hides
// that: it takes a neutral history + tool list, streams text out via `onDelta`,
// and returns the turn's final text plus any tool calls in neutral form. Adding a
// provider means writing one driver — nothing else in the loop changes.

/** A tool the model may call, in neutral (JSON-Schema) form — sourced from MCP. */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema object describing the tool's arguments. */
  parameters: Record<string, unknown>;
}

/** One tool call the model requested. */
export interface AgentToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /**
   * Opaque provider signature to replay with the call (Gemini 2.5+ requires its
   * `thoughtSignature` echoed back on function-call parts). Undefined for Claude.
   */
  signature?: string;
}

/** The result of executing one tool call, fed back to the model. */
export interface AgentToolResult {
  id: string;
  name: string;
  output: string;
  isError: boolean;
}

/** A file the operator attached for the agent (image, PDF, or text). */
export interface AgentAttachment {
  name: string;
  /** MIME type, e.g. `image/png`, `application/pdf`, `text/csv`. */
  mimeType: string;
  /** Base64-encoded file bytes (no `data:` prefix). */
  data: string;
}

/** One entry in the neutral conversation history the drivers translate. */
export type AgentHistoryMessage =
  | { role: 'user'; text: string; attachments?: AgentAttachment[] }
  | { role: 'assistant'; text: string; toolCalls: AgentToolCall[] }
  | { role: 'tool'; results: AgentToolResult[] };

/** True for a MIME type we inline as decoded text rather than binary. */
export function isTextAttachment(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'text/csv';
}

/** Decode a base64 attachment to a UTF-8 string (for text/CSV/JSON files). */
export function decodeText(data: string): string {
  return Buffer.from(data, 'base64').toString('utf8');
}

/** What one streamed model turn produced. */
export interface ModelTurn {
  text: string;
  toolCalls: AgentToolCall[];
}

export interface RunTurnArgs {
  system: string;
  tools: AgentTool[];
  history: AgentHistoryMessage[];
  onDelta: (text: string) => void;
}

/** A model provider bound to one concrete model id. */
export interface ModelDriver {
  runTurn(args: RunTurnArgs): Promise<ModelTurn>;
}

/**
 * Recursively drop JSON-Schema keys that some providers (notably Gemini) reject —
 * `$schema`, `additionalProperties`, `$ref`/`definitions`. Returns a clean copy.
 */
export function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (
      key === '$schema' ||
      key === 'additionalProperties' ||
      key === '$ref' ||
      key === 'definitions'
    ) {
      continue;
    }
    out[key] = sanitizeSchema(value);
  }
  return out;
}

/** Best-effort parse of a tool's text output into a structured value for Gemini. */
export function toStructured(output: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: output };
  }
}
