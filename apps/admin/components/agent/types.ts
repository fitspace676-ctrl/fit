// @fit/admin — AI Agent chat shared types.
//
// The transcript the drawer renders and the NDJSON event protocol the
// `/api/agent/chat` endpoint streams. Kept in one place so the UI, the hook,
// and (in Phase 3) the agent runtime agree on a single shape.

/** A tool call surfaced in the transcript — one MCP invocation (Phase 3). */
export interface AgentToolCall {
  id: string;
  name: string;
  status:
    | 'pending'
    | 'running'
    | 'complete'
    | 'error'
    | 'awaiting_approval'
    | 'rejected'
    | 'cancelled';
  title?: string;
  kind?: 'read' | 'write';
  destructive?: boolean;
  input?: Record<string, unknown>;
  signature?: string;
  resultSummary?: string;
  durationMs?: number;
  decision?: 'approve' | 'reject';
  /** Human-readable target of the action (e.g. a member name, a class id). */
  target?: string;
  errorMessage?: string;
}

/** A file the operator attached, base64-encoded for the request. */
export interface ChatAttachment {
  name: string;
  mimeType: string;
  data: string;
}

/** One turn in the visible transcript. */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Tool calls the assistant made while producing this turn. */
  toolCalls?: AgentToolCall[];
  /** True while the assistant turn is still streaming in. */
  streaming?: boolean;
  /** Names of files attached to a user turn (for transcript display). */
  attachments?: string[];
}

/** One NDJSON event streamed back from the agent endpoint. */
export type AgentStreamEvent =
  | { t: 'delta'; v: string }
  | ({ t: 'tool' } & Omit<AgentToolCall, 'decision'>)
  | { t: 'error'; message: string; code?: string }
  | { t: 'done' };

export interface AgentApproval {
  call: { id: string; name: string; input: Record<string, unknown>; signature?: string };
  decision: 'approve' | 'reject';
}
