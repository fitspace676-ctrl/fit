// @fit/types — admin AI-agent chat session contracts (Zod schemas + types).
//
// The wire shape for the admin console's AI-agent chat sessions (T12.22),
// persisted server-side (`/agent/sessions`) instead of the browser's
// `localStorage`, scoped per gym and per calling user. `messages` is the
// opaque chat transcript the admin client owns the shape of — the API stores
// it as a JSON blob and never validates its inner structure.

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*  Request                                                                     */
/* -------------------------------------------------------------------------- */

/** `PUT /agent/sessions/:id` body — upsert a session's title + transcript. */
export const upsertAgentSessionSchema = z.object({
  title: z
    .string()
    .max(200)
    .transform((title) => (title.trim().length > 0 ? title : 'Untitled')),
  messages: z.array(z.unknown()),
});
export type UpsertAgentSessionInput = z.infer<typeof upsertAgentSessionSchema>;

/* -------------------------------------------------------------------------- */
/*  Result                                                                      */
/* -------------------------------------------------------------------------- */

/** A session's metadata only (no transcript) — the sessions-list item shape. */
export const agentSessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** ISO-8601 timestamp of the session's last save. */
  updatedAt: z.string(),
});
export type AgentSessionSummary = z.infer<typeof agentSessionSummarySchema>;

/** `GET /agent/sessions` response — the caller's own sessions, newest first. */
export const listAgentSessionsResponseSchema = z.object({
  sessions: z.array(agentSessionSummarySchema),
});
export type ListAgentSessionsResponse = z.infer<typeof listAgentSessionsResponseSchema>;

/** `GET /agent/sessions/:id` response — one session with its full transcript. */
export const agentSessionDetailSchema = agentSessionSummarySchema.extend({
  messages: z.array(z.unknown()),
});
export type AgentSessionDetail = z.infer<typeof agentSessionDetailSchema>;

/** `PUT /agent/sessions/:id` response — the upserted session's metadata. */
export type UpsertAgentSessionResponse = AgentSessionSummary;
