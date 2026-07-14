import { Module } from '@nestjs/common';
import { AgentSessionsController } from './agent-sessions.controller';
import { AgentSessionsService } from './agent-sessions.service';

/**
 * Agent — server-side persistence for the admin console's AI-agent chat
 * sessions (`/agent/sessions` — list, get, upsert, delete; T12.22), replacing
 * the prior `localStorage`-only storage. Per-gym and per-user scoped; the
 * tenant-scoped Prisma client, guards, and tenant context all come from the
 * app-wide `TenantModule` / `RbacModule`, so this module needs no imports.
 */
@Module({
  controllers: [AgentSessionsController],
  providers: [AgentSessionsService],
})
export class AgentModule {}
