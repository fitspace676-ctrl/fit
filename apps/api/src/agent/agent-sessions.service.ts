import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type {
  AgentSessionDetail,
  AgentSessionSummary,
  ListAgentSessionsResponse,
  UpsertAgentSessionInput,
  UpsertAgentSessionResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** Columns the session-list query selects — metadata only, never the transcript. */
const SUMMARY_SELECT = {
  id: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.AgentChatSessionSelect;

type SummaryRecord = Prisma.AgentChatSessionGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Server-side persistence for the admin console's AI-agent chat sessions
 * (`/agent/sessions`, T12.22) — previously kept in the browser's `localStorage`.
 *
 * A session is per-gym **and** per-user: one staff member's chat history is
 * invisible to another, even within the same gym. `AgentChatSession` is
 * deliberately *not* in the tenant Prisma extension's scoped-model set (like
 * {@link DashboardPin}), since scoping here is per-user rather than merely
 * per-gym — every query below stamps/filters `gymId` **and** `userId`
 * explicitly from {@link TenantContext} rather than relying on the extension.
 *
 * The session `id` is minted by the admin client (a short string, e.g.
 * `s-abc-123`), not the server, so `PUT` is an upsert keyed on that id. Because
 * the id isn't scoped in the database (it is the bare primary key), the upsert
 * first checks any existing row's ownership and refuses to touch one that
 * belongs to a different gym/user with a `404` rather than overwriting it.
 */
@Injectable()
export class AgentSessionsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** The caller's sessions for the current gym, newest first — metadata only. */
  async list(): Promise<ListAgentSessionsResponse> {
    const gymId = this.tenant.gymId;
    const userId = this.requireUserId();

    const rows = await this.prisma.client.agentChatSession.findMany({
      where: { gymId, userId },
      orderBy: { updatedAt: 'desc' },
      select: SUMMARY_SELECT,
    });
    return { sessions: rows.map((row) => toSummary(row)) };
  }

  /**
   * One of the caller's sessions with its full transcript. `404` when it
   * doesn't exist, or exists but isn't owned by the caller (gym or user).
   */
  async get(id: string): Promise<AgentSessionDetail> {
    const gymId = this.tenant.gymId;
    const userId = this.requireUserId();

    const row = await this.prisma.client.agentChatSession.findFirst({
      where: { id, gymId, userId },
      select: { id: true, title: true, updatedAt: true, messages: true },
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Session not found',
        code: 'AGENT_SESSION_NOT_FOUND',
      });
    }
    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      messages: row.messages as unknown[],
    };
  }

  /**
   * Upsert a session by its client-generated `id`: creates it (owned by the
   * caller's gym + user) if unknown, else overwrites its title + transcript.
   * A `404` guards against overwriting a same-id row owned by someone else —
   * see the class doc for why that check is needed at all.
   */
  async upsert(id: string, input: UpsertAgentSessionInput): Promise<UpsertAgentSessionResponse> {
    const gymId = this.tenant.gymId;
    const userId = this.requireUserId();

    const existing = await this.prisma.client.agentChatSession.findUnique({
      where: { id },
      select: { gymId: true, userId: true },
    });
    if (existing && (existing.gymId !== gymId || existing.userId !== userId)) {
      throw new NotFoundException({
        message: 'Session not found',
        code: 'AGENT_SESSION_NOT_FOUND',
      });
    }

    const messages = input.messages as Prisma.InputJsonValue;
    const row = await this.prisma.client.agentChatSession.upsert({
      where: { id },
      create: { id, gymId, userId, title: input.title, messages },
      update: { title: input.title, messages },
      select: SUMMARY_SELECT,
    });
    return toSummary(row);
  }

  /** Remove one of the caller's sessions. Idempotent — an unknown id is a no-op. */
  async remove(id: string): Promise<void> {
    const gymId = this.tenant.gymId;
    const userId = this.requireUserId();

    await this.prisma.client.agentChatSession.deleteMany({
      where: { id, gymId, userId },
    });
  }

  /**
   * The authenticated user id for the current request, or `401` when the
   * tenant context has none — a subdomain-resolved, unauthenticated request
   * reaching a route that must be a signed-in staff member's own data.
   */
  private requireUserId(): string {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new UnauthorizedException({
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }
    return userId;
  }
}

/** Project a queried session row to the wire {@link AgentSessionSummary}. */
function toSummary(row: SummaryRecord): AgentSessionSummary {
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() };
}
