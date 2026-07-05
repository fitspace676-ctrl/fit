import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { z } from 'zod';
import {
  CLASS_OCCUPANCY_EVENT,
  getClassInstanceQuerySchema,
  listClassInstancesQuerySchema,
  type ClassOccupancy,
  type GetClassInstanceResponse,
  type ListClassInstancesResponse,
} from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { OccupancyStreamService } from '../live/occupancy-stream.service';
import { ClassesService } from './classes.service';

/**
 * How often the live stream emits a keep-alive `ping` — the same cadence the
 * staff activity + occupancy streams use, keeping idle connections open through
 * proxies between real events.
 */
const SSE_HEARTBEAT_MS = 25_000;

/**
 * Public class-discovery endpoint.
 *
 * `GET /class-instances` powers the unauthenticated classes page (T3.4): a
 * visitor browsing a gym's `<slug>.fit.ge` site, before any session exists, so
 * the route is `@Public()` (exempt from the global deny-by-default
 * {@link PermissionsGuard}) and `class-instances` is excluded from the JWT
 * `TenantMiddleware` in `AppModule` (which would otherwise 401 a tokenless
 * request). The gym is identified explicitly by the `gymId` query param the
 * page resolves from the subdomain, not from a session.
 */
@Controller('class-instances')
export class ClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly occupancy: OccupancyStreamService,
  ) {}

  /**
   * `GET /class-instances/occupancy/stream?gymId=<id>` — the member-facing live
   * occupancy stream over Server-Sent Events (T8.10). Each book / cancel / promote
   * pushes a {@link ClassOccupancy} snapshot the moment an occurrence's seat counts
   * settle, so a member watching a class detail page sees the capacity bar move as
   * others book and cancel, without polling. A client opens one connection per gym
   * and filters the frames to the occurrence(s) it is showing by `classInstanceId`.
   *
   * `@Public()` and scoped by the `gymId` query param, exactly like the public
   * discovery listing and detail reads this stream complements — an occurrence's
   * seat counts are already public on those cards, so no session is required. Every
   * occupancy frame's event name is {@link CLASS_OCCUPANCY_EVENT} (`class.occupancy`);
   * a `ping` every {@link SSE_HEARTBEAT_MS} keeps idle connections alive. Declared
   * before the `:id` detail route so its two-segment path is never shadowed.
   */
  @Sse('occupancy/stream')
  @Public()
  streamOccupancy(@Query() query: unknown): Observable<MessageEvent> {
    const result = occupancyStreamQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    const { gymId } = result.data;
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
   * `GET /class-instances?gymId=<id>&from=<ISO>&to=<ISO>&view=week|list` —
   * list the gym's class occurrences overlapping `[from, to)`. The query is
   * validated up front (a bad/missing `gymId`, a non-ISO bound, or an inverted
   * range is a `400` with per-field details) so the service only ever sees a
   * well-formed window. An empty `instances` array is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(@Query() query: unknown): Promise<ListClassInstancesResponse> {
    const result = listClassInstancesQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.classes.listInstances(result.data);
  }

  /**
   * `GET /class-instances/:id?gymId=<id>` — one occurrence's full detail for the
   * member-facing detail page (T5.9). The `id` is the path param; the `gymId`
   * query is validated up front (a bad/missing one is a `400`) so the lookup is
   * always tenant-scoped. An unknown or cross-tenant id is a `404` from the
   * service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Public()
  async getOne(
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<GetClassInstanceResponse> {
    const result = getClassInstanceQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.classes.getInstance(id, result.data);
  }
}

/**
 * Query for `GET /class-instances/occupancy/stream` — `gymId` scopes the live
 * stream to one tenant (the member page resolves it from the active subdomain),
 * mirroring the public listing / detail reads. A missing / blank `gymId` is a
 * `400` rather than a stream that silently never delivers.
 */
const occupancyStreamQuerySchema = z.object({
  gymId: z.string().min(1),
});

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
