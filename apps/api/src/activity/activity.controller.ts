import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { z } from 'zod';
import {
  Permission,
  listActivityQuerySchema,
  type ActivityEvent,
  type ListActivityResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ActivityStreamService } from '../live/activity-stream.service';
import { ActivityService } from './activity.service';

/**
 * How often the live stream emits a keep-alive comment. Idle proxies and load
 * balancers drop a connection that has been silent too long; a lightweight `ping`
 * well under the usual 60s idle timeout keeps the pipe open between real events so
 * the client never has to reconnect during a quiet stretch.
 */
const SSE_HEARTBEAT_MS = 25_000;

/**
 * Staff-console Activity feed API (`/admin/activity`, T3.8).
 *
 * A read-only, tenant-scoped, unified stream of the gym's operational events —
 * signups, bookings, check-ins, sales, and subscription enrolments — merged
 * newest-first from the tables that already record them (no new write path).
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * gates on {@link Permission.ReportView} (held by `OWNER` / `MANAGER`), the same
 * capability the dashboard and analytics screens require. The service constrains
 * every query to the caller's gym, so no handler passes or trusts a `gymId`.
 */
@Controller('admin/activity')
@UseGuards(TenantGuard, PermissionsGuard)
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly stream: ActivityStreamService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * `GET /admin/activity?page&limit&type&from&to` — one filtered, server-paginated
   * page of the gym's merged activity stream, newest first. The query is validated
   * up front (a bad page/limit/type/date is a `400` with per-field detail) so the
   * service only sees a well-formed, defaulted request. An empty page is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async list(@Query() query: unknown): Promise<ListActivityResponse> {
    return this.activity.listActivity(parse(listActivityQuerySchema, query));
  }

  /**
   * `GET /admin/activity/stream` — the live activity stream over Server-Sent Events
   * (T8.9). Reception check-ins (and later bookings/sales) push a message the moment
   * they happen, so the reception board and activity screen update without polling.
   * Each `data` frame is one {@link ActivityEvent} — the *same* denormalised shape a
   * page of `GET /admin/activity` returns — and the frame's event name is the
   * event's `type` (`checkin`, `booking`, …) so a client can route on it.
   *
   * Guarded exactly like the paginated feed — {@link TenantGuard} +
   * {@link Permission.ReportView} — and filtered to the caller's own gym from the
   * tenant context, never from a client-supplied id, so the stream honours the same
   * tenant isolation. A `ping` comment every {@link SSE_HEARTBEAT_MS} keeps idle
   * connections alive through proxies.
   */
  @Sse('stream')
  @RequirePermissions(Permission.ReportView)
  streamActivity(): Observable<MessageEvent> {
    const gymId = this.tenant.gymId;
    const events$ = this.stream
      .stream(gymId)
      .pipe(map((event: ActivityEvent): MessageEvent => ({ type: event.type, data: event })));
    const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(events$, heartbeat$);
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
