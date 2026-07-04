import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
  type ListNotificationsResponse,
  type MarkNotificationsReadResponse,
  type UnreadCountResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { NotificationInboxService } from './notification-inbox.service';

/**
 * Member notification inbox endpoints (`/notifications`, T8.4) — the API behind
 * the member portal's bell + inbox (T6.10) and (later) the mobile notifications
 * screen (T8.5).
 *
 * All three sit behind {@link TenantGuard} + the global {@link PermissionsGuard}
 * and require {@link Permission.NotificationManage} (granted to `MEMBER` +
 * `OWNER`) — a self-service capability, the same member-held permission the
 * push-token endpoints use: the caller reads and marks *their own* inbox,
 * resolved from the session, so neither the owning user nor the gym is ever read
 * off the wire (that scoping lives in {@link NotificationInboxService}). Sits at
 * a different sub-path (`/notifications`, `/notifications/unread-count`,
 * `/notifications/mark-read`) than the push-token controller
 * (`/notifications/push-token`), so the two coexist under the module.
 */
@Controller('notifications')
@UseGuards(TenantGuard, PermissionsGuard)
export class NotificationInboxController {
  constructor(private readonly inbox: NotificationInboxService) {}

  /**
   * `GET /notifications` — the caller's inbox, newest first, offset-paginated
   * (`page`/`limit`, `unreadOnly`). The query is validated up front (`400` on a
   * malformed page/limit). Returns the page plus the full unread count.
   */
  @Get()
  @RequirePermissions(Permission.NotificationManage)
  async list(@Query() query: unknown): Promise<ListNotificationsResponse> {
    return this.inbox.list(parse(listNotificationsQuerySchema, query));
  }

  /** `GET /notifications/unread-count` — the unread badge count for the bell. */
  @Get('unread-count')
  @RequirePermissions(Permission.NotificationManage)
  async unreadCount(): Promise<UnreadCountResponse> {
    return this.inbox.unreadCount();
  }

  /**
   * `POST /notifications/mark-read` — mark the given ids read, or every unread
   * item when `ids` is omitted/empty. Idempotent (unknown/already-read ids are
   * no-ops); returns how many rows were newly marked and the resulting unread
   * count. `200` (not `204`) because it returns that body.
   */
  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.NotificationManage)
  async markRead(@Body() body: unknown): Promise<MarkNotificationsReadResponse> {
    return this.inbox.markRead(parse(markNotificationsReadSchema, body));
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
