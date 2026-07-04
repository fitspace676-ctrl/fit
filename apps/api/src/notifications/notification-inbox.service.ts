import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type {
  ListNotificationsQuery,
  ListNotificationsResponse,
  MarkNotificationsReadData,
  MarkNotificationsReadResponse,
  NotificationDto,
  UnreadCountResponse,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The notification columns the inbox projection returns. */
const NOTIFICATION_SELECT = {
  id: true,
  category: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

/**
 * Member-facing notification inbox (`/notifications`, T8.4) that feeds the portal
 * bell (T6.10).
 *
 * A `Notification` carries an explicit `gymId` and is outside the tenant
 * extension's auto-scope set, so — like {@link PushTokenService} — this runs on
 * the **unscoped** {@link PrismaService} and keys **every** query on both the
 * caller's gym and user id, resolved from the verified session (never off the
 * wire). Filtering on `(gymId, userId)` together is the tenant boundary: a member
 * only ever sees notifications addressed to them in the gym they are signed into.
 */
@Injectable()
export class NotificationInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * List the caller's notifications for the current gym, newest first, offset-
   * paginated. `unreadOnly` narrows to unread items; the returned `unread` count
   * is always the full unread total (so the bell badge stays correct even on a
   * filtered page). An empty result is a normal success.
   */
  async list(query: ListNotificationsQuery): Promise<ListNotificationsResponse> {
    const { gymId, userId } = this.requireScope();
    const where: Prisma.NotificationWhereInput = {
      gymId,
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [rows, total, unread] = await this.prisma.client.$transaction([
      this.prisma.client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.client.notification.count({ where }),
      this.prisma.client.notification.count({ where: { gymId, userId, readAt: null } }),
    ]);

    return {
      data: rows.map(toDto),
      total,
      page: query.page,
      limit: query.limit,
      unread,
    };
  }

  /** The caller's unread notification count for the current gym — the bell badge. */
  async unreadCount(): Promise<UnreadCountResponse> {
    const { gymId, userId } = this.requireScope();
    const unread = await this.prisma.client.notification.count({
      where: { gymId, userId, readAt: null },
    });
    return { unread };
  }

  /**
   * Mark notifications read. With a non-empty `ids` list only those are marked;
   * omitted/empty marks every unread item ("mark all read"). Scoped to the
   * caller's own `(gymId, userId)` and to currently-unread rows, so a stray id
   * (another member's, or already read) is silently a no-op — the update is
   * idempotent. Returns how many rows were newly marked plus the resulting unread
   * count for the badge.
   */
  async markRead(data: MarkNotificationsReadData): Promise<MarkNotificationsReadResponse> {
    const { gymId, userId } = this.requireScope();
    const where: Prisma.NotificationWhereInput = {
      gymId,
      userId,
      readAt: null,
      ...(data.ids && data.ids.length > 0 ? { id: { in: data.ids } } : {}),
    };

    const result = await this.prisma.client.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    const unread = await this.prisma.client.notification.count({
      where: { gymId, userId, readAt: null },
    });

    return { updated: result.count, unread };
  }

  /**
   * The authenticated caller's `(gymId, userId)` scope. `@RequirePermissions`
   * guarantees an authenticated member; a request that somehow reaches here with
   * no session user (a coding error) is a `403`, never an unscoped read. The gym
   * is always in scope for a member request (`TenantGuard`), so its getter is
   * safe to read once the user is confirmed.
   */
  private requireScope(): { gymId: string; userId: string } {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required to read notifications',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    return { gymId: this.tenant.gymId, userId };
  }
}

/** Project a notification row to its wire DTO — ISO-8601 timestamps, `readAt`
 * null while unread. */
function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
