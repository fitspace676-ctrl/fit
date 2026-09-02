import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type {
  GetClassInstanceQuery,
  GetClassInstanceResponse,
  ListClassInstancesQuery,
  ListClassInstancesResponse,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/** The occurrence + template columns the member-facing detail projection reads.
 * The template carries the denormalised display fields (title/description/
 * category/colour) and the seat/duration figures a card can't show. */
const DETAIL_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  capacityOverride: true,
  bookedCount: true,
  status: true,
  room: true,
  trainer: { select: { name: true } },
  location: { select: { name: true } },
  template: {
    select: {
      title: true,
      description: true,
      category: true,
      color: true,
      imageUrl: true,
      room: true,
      capacity: true,
      durationMinutes: true,
      trainer: { select: { name: true } },
      location: { select: { name: true } },
    },
  },
  classType: {
    select: {
      name: true,
      description: true,
      color: true,
      capacity: true,
      durationMinutes: true,
    },
  },
} satisfies Prisma.ClassInstanceSelect;

/** The columns the calendar CARD projection reads — a strict subset of
 * {@link DETAIL_SELECT}. The listing is the hottest query on the public surface
 * (a week view is ~40 rows per request, unauthenticated and cacheable), so it
 * deliberately does not pull the room/duration columns only the detail page
 * renders. It does pull `description`: the booking modal opens straight from a
 * card, and the member reads what they are booking there. */
const CARD_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  capacityOverride: true,
  bookedCount: true,
  trainer: { select: { name: true } },
  location: { select: { name: true } },
  template: {
    select: {
      title: true,
      description: true,
      category: true,
      color: true,
      imageUrl: true,
      capacity: true,
      trainer: { select: { name: true } },
      location: { select: { name: true } },
    },
  },
  classType: { select: { name: true, description: true, color: true, capacity: true } },
} satisfies Prisma.ClassInstanceSelect;

type InstanceCardRow = Prisma.ClassInstanceGetPayload<{ select: typeof CARD_SELECT }>;

type InstanceDetailRow = Prisma.ClassInstanceGetPayload<{ select: typeof DETAIL_SELECT }>;

/**
 * Read access to a gym's scheduled class occurrences for the public discovery
 * surface (`GET /class-instances`, `GET /class-instances/:id`).
 *
 * Both endpoints are `@Public()` and excluded from the JWT `TenantMiddleware`
 * (see `AppModule`), so an unauthenticated visitor on a gym subdomain can browse
 * the schedule and open a single class. There is no session to scope by — the
 * gym is identified explicitly by the `gymId` query param the page resolves from
 * the subdomain — so the queries run on the **base** {@link PrismaService} (not
 * the tenant-scoped client) and pin every lookup to that `gymId` by hand.
 *
 * The windowed {@link listInstances} still honours its T3.4 contract with an
 * empty result until the calendar's data source is wired; the single-occurrence
 * {@link getInstance} backing the detail page (T5.9) is a real query — its
 * `ClassInstance` model lands in T5.1 and is materialised by the T5.3 generator,
 * so the detail page can serve a live, deep-linkable class.
 */
@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the class occurrences overlapping the requested window for one gym,
   * ordered by `startsAt`. Returns an empty list until the windowed calendar
   * query is wired — an empty array is a valid result the page renders as its
   * "no classes this week" state.
   */
  async listInstances(query: ListClassInstancesQuery): Promise<ListClassInstancesResponse> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const rows = await this.prisma.client.classInstance.findMany({
      where: {
        gymId: query.gymId,
        // Only SCHEDULED occurrences reach the discovery listing. A canceled or
        // completed class still resolves by direct link (see `getInstance`), but
        // it must not appear in a calendar someone is browsing to book from.
        status: 'SCHEDULED',
        // OVERLAP, not containment: a class that starts before the window and
        // runs into it belongs on the calendar. Containment would drop the
        // in-progress class from a "today" view, which is exactly the one a
        // member checking the schedule on arrival is looking for.
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: CARD_SELECT,
      orderBy: { startsAt: 'asc' },
    });

    return { instances: rows.map(toCard) };
  }

  /**
   * Read one occurrence's full detail for the member-facing detail page
   * (`GET /class-instances/:id`, T5.9). The lookup is pinned to `query.gymId`, so
   * an unknown *or* cross-tenant id is a `404 CLASS_INSTANCE_NOT_FOUND` — the
   * page renders that as its "class not found" state. Unlike the calendar
   * listing, a non-`SCHEDULED` occurrence is *not* hidden: a shared link to a
   * since-canceled / completed class still resolves, carrying its `status` so the
   * page can show the right banner.
   */
  async getInstance(id: string, query: GetClassInstanceQuery): Promise<GetClassInstanceResponse> {
    const row = await this.prisma.client.classInstance.findFirst({
      where: { id, gymId: query.gymId },
      select: DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Class occurrence not found',
        code: 'CLASS_INSTANCE_NOT_FOUND',
      });
    }
    return { instance: toDetail(row) };
  }
}

/** Project a joined occurrence row to the denormalised calendar card the wire
 * contract defines. Mirrors {@link toDetail}'s fallback chain so a class reads
 * the same in the listing and on its own page: the occurrence's own trainer /
 * location win over the template's, the per-occurrence capacity override wins
 * over the template's seat count, and absent relations flatten to empty strings
 * rather than nulls. */
function toCard(row: InstanceCardRow): ListClassInstancesResponse['instances'][number] {
  return {
    id: row.id,
    title: row.template?.title ?? row.classType?.name ?? 'Class',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    trainerName: row.trainer?.name ?? row.template?.trainer?.name ?? '',
    locationName: row.location?.name ?? row.template?.location?.name ?? '',
    capacity: row.capacityOverride ?? row.template?.capacity ?? row.classType?.capacity ?? 0,
    bookedCount: row.bookedCount,
    category: row.template?.category ?? row.classType?.name ?? '',
    color: row.template?.color ?? row.classType?.color ?? '#2563eb',
    // Only templates carry a cover; a one-off from a class type has none.
    imageUrl: row.template?.imageUrl ?? null,
    description: row.template?.description ?? row.classType?.description ?? '',
  };
}

/** Project a joined occurrence row to the denormalised detail card the wire
 * contract defines — resolving the per-occurrence capacity override and flatten-
 * ing the optional trainer / location / room to empty strings when absent. */
function toDetail(row: InstanceDetailRow): GetClassInstanceResponse['instance'] {
  return {
    id: row.id,
    title: row.template?.title ?? row.classType?.name ?? 'Class',
    description: row.template?.description ?? row.classType?.description ?? '',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    trainerName: row.trainer?.name ?? row.template?.trainer?.name ?? '',
    locationName: row.location?.name ?? row.template?.location?.name ?? '',
    room: row.room ?? row.template?.room ?? '',
    capacity: row.capacityOverride ?? row.template?.capacity ?? row.classType?.capacity ?? 0,
    bookedCount: row.bookedCount,
    durationMinutes:
      row.template?.durationMinutes ??
      row.classType?.durationMinutes ??
      Math.max(1, Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000)),
    category: row.template?.category ?? '',
    color: row.template?.color ?? row.classType?.color ?? '#2563eb',
    // Only templates carry a cover; a one-off from a class type has none.
    imageUrl: row.template?.imageUrl ?? null,
    status: row.status,
  };
}
