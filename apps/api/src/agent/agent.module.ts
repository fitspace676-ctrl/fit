import { Module } from '@nestjs/common';
import { AgentChatController } from './agent-chat.controller';
import { AgentSessionsController } from './agent-sessions.controller';
import { AgentSessionsService } from './agent-sessions.service';

/**
 * Agent — the admin console's AI-agent backend:
 * - `POST /agent/chat` runs the Claude/Gemini + Fit MCP loop (provider keys live
 *   in the API env, not the frontend) and streams the reply as NDJSON. Its
 *   runtime lives in `src/agent/runtime/` (SWC at runtime; type-checked via
 *   `tsconfig.agent.json`, kept out of the API's main `tsc` — see the controller).
 * - `/agent/sessions` persists a staff member's chat sessions (list/get/upsert/
 *   delete; T12.22), per-gym and per-user scoped.
 *
 * The tenant-scoped Prisma client, guards, and tenant context all come from the
 * app-wide `TenantModule` / `RbacModule`, so this module needs no imports.
 */
@Module({
  controllers: [AgentChatController, AgentSessionsController],
  providers: [AgentSessionsService],
})
export class AgentModule {}
