'use client';

// @fit/admin — AI Agent chat session persistence (server-side).
//
// Sessions live on the fit API (scoped to the gym + the current user), reached
// through the same-origin `/api/agent/sessions` proxy which forwards the
// operator's token. The list carries metadata only (id, title, updatedAt); a
// session's full transcript is fetched on demand when the operator resumes it.

import { useCallback, useEffect, useState } from 'react';
import type { AgentMessage } from './types';

/** Base path (`/admin` behind the tenant proxy); Next does not prefix `fetch`. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';
const ENDPOINT = `${BASE_PATH}/api/agent/sessions`;

/** A saved session as shown in the history list (no transcript). */
export interface AgentSessionMeta {
  id: string;
  title: string;
  /** ISO timestamp of the last update. */
  updatedAt: string;
}

/** A monotonic-ish id without a crypto dependency. */
export function newSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Derive a short title from the first user message. */
export function sessionTitle(messages: AgentMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content?.trim();
  if (!first) return '';
  return first.length > 60 ? `${first.slice(0, 60)}…` : first;
}

export interface UseSessions {
  /** Saved sessions (metadata), newest first. */
  sessions: AgentSessionMeta[];
  /** Upsert a session's title + transcript. */
  save: (input: { id: string; title: string; messages: AgentMessage[] }) => void;
  /** Delete a session. */
  remove: (id: string) => void;
  /** Fetch one session's full transcript (for resume), or null on failure. */
  load: (id: string) => Promise<AgentMessage[] | null>;
}

export function useSessions(): UseSessions {
  const [sessions, setSessions] = useState<AgentSessionMeta[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { sessions?: AgentSessionMeta[] };
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      // Offline / API down — leave the list as-is.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    (input: { id: string; title: string; messages: AgentMessage[] }) => {
      // Optimistic: reflect the change immediately, then reconcile with the server.
      const nowIso = new Date().toISOString();
      setSessions((prev) => [
        { id: input.id, title: input.title, updatedAt: nowIso },
        ...prev.filter((s) => s.id !== input.id),
      ]);
      void fetch(`${ENDPOINT}/${encodeURIComponent(input.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: input.title, messages: input.messages }),
      })
        .then(() => refresh())
        .catch(() => {});
    },
    [refresh],
  );

  const remove = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    void fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const load = useCallback(async (id: string): Promise<AgentMessage[] | null> => {
    try {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as { messages?: AgentMessage[] };
      return Array.isArray(data.messages) ? data.messages : [];
    } catch {
      return null;
    }
  }, []);

  return { sessions, save, remove, load };
}
