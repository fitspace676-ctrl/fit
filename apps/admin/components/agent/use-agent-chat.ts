// @fit/admin — AI Agent chat state + streaming hook.
//
// Owns the visible transcript and drives one request/response turn against
// `/api/agent/chat`. It POSTs the running conversation, reads the NDJSON stream,
// and folds each event into the assistant turn as it arrives — text deltas
// append, tool events attach/update tool calls (Phase 3), `done`/`error` end the
// turn. `stop()` aborts an in-flight turn.

'use client';

import { useCallback, useRef, useState } from 'react';
import type { AgentMessage, AgentStreamEvent, AgentToolCall, ChatAttachment } from './types';

/** Base path (`/admin` behind the tenant proxy); Next does not prefix `fetch`. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';
const ENDPOINT = `${BASE_PATH}/api/agent/chat`;

/** Monotonic id source for transcript entries (no crypto dependency needed). */
let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${(seq += 1)}-${Date.now()}`;

export interface UseAgentChat {
  messages: AgentMessage[];
  isStreaming: boolean;
  error: string | null;
  send: (text: string, model?: string, attachments?: ChatAttachment[]) => void;
  stop: () => void;
  reset: () => void;
  /** Replace the transcript with a saved session's messages (resume). */
  loadTranscript: (messages: AgentMessage[]) => void;
}

export function useAgentChat(): UseAgentChat {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Patch a single message by id. */
  const patch = useCallback((id: string, fn: (m: AgentMessage) => AgentMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    (text: string, model?: string, attachments?: ChatAttachment[]) => {
      const trimmed = text.trim();
      if ((!trimmed && !attachments?.length) || isStreaming) return;

      setError(null);
      const userMsg: AgentMessage = {
        id: nextId('u'),
        role: 'user',
        content: trimmed,
        ...(attachments?.length ? { attachments: attachments.map((a) => a.name) } : {}),
      };
      const assistantId = nextId('a');
      const assistantMsg: AgentMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
      };

      // Snapshot the wire history *before* this turn for the request body.
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              messages: history,
              ...(model ? { model } : {}),
              ...(attachments?.length ? { attachments } : {}),
            }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            throw new Error(`agent_http_${res.status}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const handle = (event: AgentStreamEvent): void => {
            switch (event.t) {
              case 'delta':
                patch(assistantId, (m) => ({ ...m, content: m.content + event.v }));
                break;
              case 'tool':
                patch(assistantId, (m) => {
                  const call: AgentToolCall = {
                    id: event.id,
                    name: event.name,
                    status: event.status,
                    target: event.target,
                    errorMessage: event.errorMessage,
                  };
                  const existing = m.toolCalls ?? [];
                  const idx = existing.findIndex((c) => c.id === event.id);
                  const toolCalls =
                    idx === -1
                      ? [...existing, call]
                      : existing.map((c, i) => (i === idx ? { ...c, ...call } : c));
                  return { ...m, toolCalls };
                });
                break;
              case 'error':
                setError(event.message);
                break;
              case 'done':
                break;
            }
          };

          // NDJSON: split on newlines, keep the trailing partial in the buffer.
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf('\n')) !== -1) {
              const raw = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!raw) continue;
              try {
                handle(JSON.parse(raw) as AgentStreamEvent);
              } catch {
                // Ignore malformed lines rather than dropping the whole turn.
              }
            }
          }
        } catch (err) {
          if (!(err instanceof DOMException && err.name === 'AbortError')) {
            setError(err instanceof Error ? err.message : 'agent_failed');
          }
        } finally {
          patch(assistantId, (m) => ({ ...m, streaming: false }));
          setIsStreaming(false);
          abortRef.current = null;
        }
      })();
    },
    [isStreaming, messages, patch],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  }, []);

  const loadTranscript = useCallback((next: AgentMessage[]) => {
    abortRef.current?.abort();
    setError(null);
    // Clear any lingering streaming flag from a saved turn.
    setMessages(next.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
  }, []);

  return { messages, isStreaming, error, send, stop, reset, loadTranscript };
}
