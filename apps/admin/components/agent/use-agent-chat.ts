'use client';

import { useCallback, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useActiveLocation } from '../active-location';
import { approvalPayload, errorKey, foldEvent, restoreTranscript } from './chat-state';
import type { AgentApproval, AgentMessage, AgentStreamEvent, ChatAttachment } from './types';

const ENDPOINT = `${process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? ''}/api/agent/chat`;
let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}-${Date.now()}`;
interface Turn {
  id: string;
  body: {
    messages: { role: 'user' | 'assistant'; content: string }[];
    model?: string;
    attachments?: ChatAttachment[];
    locale: 'ka' | 'en';
    locationId?: string;
    approvals?: AgentApproval[];
  };
}

export function useAgentChat() {
  const locale = useLocale();
  const t = useTranslations('admin.agent');
  const { locationId } = useActiveLocation();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const transcriptRef = useRef(messages);
  transcriptRef.current = messages;
  const retryBaseRef = useRef<AgentMessage | null>(null);
  const decisionsRef = useRef<Record<string, AgentApproval['decision']>>({});
  const pendingApprovals = messages
    .flatMap((m) => m.toolCalls ?? [])
    .filter((c) => c.status === 'awaiting_approval');
  const patch = useCallback((id: string, fn: (m: AgentMessage) => AgentMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const run = useCallback(
    (turn: Turn, retrying = false) => {
      if (abortRef.current) return;
      turnRef.current = turn;
      if (!retrying)
        retryBaseRef.current = transcriptRef.current.find((m) => m.id === turn.id) ?? {
          id: turn.id,
          role: 'assistant',
          content: '',
        };
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setIsStreaming(true);
      patch(turn.id, (m) => ({ ...m, streaming: true }));
      void (async () => {
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(turn.body),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            const data = (await res.json().catch(() => ({}))) as { code?: string };
            if (abortRef.current === controller) setError(t(errorKey(data.code)));
            return;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const handle = (raw: string) => {
            if (!raw.trim() || abortRef.current !== controller) return;
            let event: AgentStreamEvent;
            try {
              event = JSON.parse(raw) as AgentStreamEvent;
            } catch {
              return;
            }
            if (event.t === 'error') setError(t(errorKey(event.code)));
            else patch(turn.id, (m) => foldEvent(m, event));
          };
          for (;;) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            lines.forEach(handle);
            if (done) {
              handle(buffer);
              break;
            }
          }
        } catch (err) {
          if (
            abortRef.current === controller &&
            !(err instanceof Error && err.name === 'AbortError')
          )
            setError(t('error'));
        } finally {
          if (abortRef.current === controller) {
            patch(turn.id, (m) => ({ ...m, streaming: false }));
            abortRef.current = null;
            setIsStreaming(false);
          }
        }
      })();
    },
    [patch, t],
  );

  const send = useCallback(
    (text: string, model?: string, attachments?: ChatAttachment[]) => {
      if ((!text.trim() && !attachments?.length) || abortRef.current || pendingApprovals.length)
        return;
      const user: AgentMessage = {
        id: nextId('u'),
        role: 'user',
        content: text.trim(),
        attachments: attachments?.map((a) => a.name),
      };
      const id = nextId('a');
      decisionsRef.current = {};
      setMessages((prev) => [
        ...prev,
        user,
        { id, role: 'assistant', content: '', streaming: true },
      ]);
      run({
        id,
        body: {
          messages: [...messages, user].map(({ role, content }) => ({ role, content })),
          model,
          attachments,
          locationId,
          locale: locale === 'ka' ? 'ka' : 'en',
        },
      });
    },
    [messages, pendingApprovals.length, run, locationId, locale],
  );

  const decide = useCallback(
    (decisions: Record<string, AgentApproval['decision']>) => {
      if (abortRef.current || !turnRef.current) return;
      const valid = Object.fromEntries(
        Object.entries(decisions).filter(([id]) => pendingApprovals.some((c) => c.id === id)),
      );
      decisionsRef.current = { ...decisionsRef.current, ...valid };
      patch(turnRef.current.id, (m) => ({
        ...m,
        toolCalls: m.toolCalls?.map((c) => (valid[c.id] ? { ...c, decision: valid[c.id] } : c)),
      }));
      const approvals = approvalPayload(pendingApprovals, decisionsRef.current);
      if (!approvals) return;
      decisionsRef.current = {};
      run({ ...turnRef.current, body: { ...turnRef.current.body, approvals } });
    },
    [patch, pendingApprovals, run],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);
  const loadTranscript = useCallback((next: AgentMessage[]) => {
    abortRef.current?.abort();
    abortRef.current = null;
    turnRef.current = null;
    decisionsRef.current = {};
    setIsStreaming(false);
    setError(null);
    setMessages(restoreTranscript(next));
  }, []);
  const reset = useCallback(() => loadTranscript([]), [loadTranscript]);
  const retry = useCallback(() => {
    if (turnRef.current && !abortRef.current) {
      if (retryBaseRef.current) {
        const baseline = retryBaseRef.current;
        patch(turnRef.current.id, () => baseline);
      }
      run(turnRef.current, true);
    }
  }, [patch, run]);
  return {
    messages,
    isStreaming,
    error,
    send,
    stop,
    reset,
    loadTranscript,
    pendingApprovals,
    decide,
    retry,
  };
}
