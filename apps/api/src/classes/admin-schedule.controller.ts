import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { z } from 'zod';
import {
  CLASS_OCCUPANCY_EVENT,
  Permission,
  adminBookMemberSchema,
  adminScheduleQuerySchema,
  type AdminScheduleResponse,
  type BookMemberOntoClassResponse,
  type CancelClassInstanceResponse,
  type ClassOccupancy,
  type GetAdminClassInstanceResponse,
  type PromoteWaitlistResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { OccupancyStreamService } from '../live/occupancy-stream.service';
import { AdminScheduleService } from './admin-schedule.service';

/**
 * How often the live stream emits a keep-alive `ping`. Idle proxies drop a
 * connection that has been silent too long; a lightweight ping well under the
 * usual 60s idle timeout keeps the pipe open between real events — the same
 * cadence the activity stream uses.
 */
const SSE_HEARTBEAT_MS = 25_000;

/**
 * Staff-console schedule week-view API (`/admin/schedule`, T3.1).
 *
 * The scheduling console's calendar: `GET /admin/schedule` returns the gym's
 * materialised class occurrences in a date window, each with its occupancy,
 * trainer, branch, and status, shaped for the week grid (T3.2); `GET
 * /admin/schedule/instances/:id` returns one occurrence in full — its roster and
 * waitlist — for the drawer, and `POST .../cancel` cancels it (T3.3). Every route
 * is tenant-scoped staff access — {@link TenantGuard} pins the request to one gym
 * and {@link PermissionsGuard} enforces the capability: the reads require
 * {@link Permission.ClassRead}, the cancel {@link Permission.ClassWrite} (the same
 * read/write split as class-template management). The service runs on the
 * tenant-scoped Prisma client, so no handler passes or trusts a `gymId`.
 */
@Controller('admin/schedule')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminScheduleController {
  constructor(
    private readonly schedule: AdminScheduleService,
    private readonly occupancy: OccupancyStreamService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * `GET /admin/schedule/stream` — the gym's live class-occupancy stream over
   * Server-Sent Events (T8.10). Each book / cancel / promote pushes a
   * {@link ClassOccupancy} snapshot the moment the seat counts settle, so the
   * schedule board's capacity bars update without polling. Every occupancy frame's
   * event name is {@link CLASS_OCCUPANCY_EVENT} (`class.occupancy`) so a client
   * routes on it; a `ping` every {@link SSE_HEARTBEAT_MS} keeps idle connections
   * alive through proxies.
   *
   * Guarded exactly like the read endpoints — {@link TenantGuard} +
   * {@link Permission.ClassRead} — and filtered to the caller's own gym from the
   * tenant context, never a client-supplied id, so the stream honours the same
   * tenant isolation the schedule reads do.
   */
  @Sse('stream')
  @RequirePermissions(Permission.ClassRead)
  streamOccupancy(): Observable<MessageEvent> {
    const gymId = this.tenant.gymId;
    const occupancy$ = this.occupancy.stream(gymId).pipe(
      map(
        (snapshot: ClassOccupancy): MessageEvent => ({
          type: CLASS_OCCUPANCY_EVENT,
          data: snapshot,
        }),
      ),
    );
    const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(occupancy$, heartbeat$);
  }

  /**
   * `GET /admin/schedule?from=<ISO>&to=<ISO>&trainerId=&locationId=` — the gym's
   * class occurrences whose `startsAt` falls in `[from, to)`, ordered by start. The
   * query is validated up front (a missing/non-ISO bound, an inverted range, or an
   * over-wide window is a `400` with per-field detail) so the service only ever
   * sees a well-formed, bounded window. An empty `instances` array is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async list(@Query() query: unknown): Promise<AdminScheduleResponse> {
    return this.schedule.listSchedule(parse(adminScheduleQuerySchema, query));
  }

  /**
   * `GET /admin/schedule/instances/:id` — one occurrence in full for the schedule
   * drawer (T3.3): the denormalised calendar block plus its `waitlistCount` and
   * the roster of live bookings (held seats first, then the waitlist by position).
   * An unknown / cross-tenant id is a `404 CLASS_INSTANCE_NOT_FOUND`.
   */
  @Get('instances/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async getInstance(@Param('id') id: string): Promise<GetAdminClassInstanceResponse> {
    return this.schedule.getInstanceDetail(id);
  }

  /**
   * `POST /admin/schedule/instances/:id/cancel` — cancel a scheduled occurrence
   * from the drawer's quick actions (T3.3): every live booking is released (each
   * held seat's class credit refunded), the occurrence is marked `CANCELED` and
   * emptied, and the refreshed detail is returned so the drawer and week grid
   * re-render. Requires {@link Permission.ClassWrite} (the same write capability
   * as class-template management and attendance). Failure modes: `404
   * CLASS_INSTANCE_NOT_FOUND` (unknown / cross-tenant) and `409
   * CLASS_NOT_CANCELABLE` (already canceled / completed).
   */
  @Post('instances/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async cancelInstance(@Param('id') id: string): Promise<CancelClassInstanceResponse> {
    return this.schedule.cancelInstance(id);
  }

  /**
   * `POST /admin/schedule/instances/:id/bookings/:bookingId/promote` — manually
   * promote a waitlisted booking into a held seat from the drawer's waitlist
   * controls (T3.6): the chosen entry flips `WAITLIST → BOOKED`, `bookedCount`
   * grows by one (a desk override that may take the occurrence over its listed
   * capacity), the promoted member is charged a class credit best-effort, and the
   * queue behind them is closed up. Requires {@link Permission.ClassWrite} (the
   * same write capability as the cancel and attendance actions). Failure modes:
   * `404 CLASS_INSTANCE_NOT_FOUND` (unknown / cross-tenant occurrence), `404
   * BOOKING_NOT_FOUND` (booking not on this occurrence), `409 CLASS_NOT_MODIFIABLE`
   * (occurrence no longer scheduled) and `409 BOOKING_NOT_PROMOTABLE` (booking
   * isn't a live waitlist entry — already promoted, canceled, or a held seat).
   */
  @Post('instances/:id/bookings/:bookingId/promote')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async promoteWaitlist(
    @Param('id') id: string,
    @Param('bookingId') bookingId: string,
  ): Promise<PromoteWaitlistResponse> {
    return this.schedule.promoteWaitlistEntry(id, bookingId);
  }

  /**
   * `POST /admin/schedule/instances/:id/bookings` — the front-desk "book a member
   * onto this class" action from the drawer (T3.7): the desk searches for a member
   * (via `GET /members`) and books them on their behalf, `{ memberId }` in the
   * body. Honours the same capacity/credit rules as a member self-book — a seat is
   * claimed with the atomic capacity gate (or the member is queued onto the
   * waitlist when full), and a confirmed seat draws a required class credit unless
   * an entitling subscription covers it. Requires {@link Permission.ClassWrite}
   * (the same write capability as the cancel and promote actions). Returns `201`
   * with the refreshed occurrence detail so the drawer and week grid re-render.
   * Failure modes: `400` (blank `memberId`), `404 CLASS_INSTANCE_NOT_FOUND`
   * (unknown / cross-tenant occurrence), `404 MEMBER_NOT_FOUND` (member not in this
   * gym), `409 CLASS_NOT_BOOKABLE` (occurrence no longer scheduled), `409
   * ALREADY_BOOKED` (member already holds a live booking), `409 SUBSCRIPTION_FROZEN`
   * (frozen membership), and `422 INSUFFICIENT_CREDITS` (a held seat the member
   * can't pay for).
   */
  @Post('instances/:id/bookings')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ClassWrite)
  async bookMember(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<BookMemberOntoClassResponse> {
    const { memberId } = parse(adminBookMemberSchema, body);
    return this.schedule.bookMemberOntoClass(id, memberId);
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
