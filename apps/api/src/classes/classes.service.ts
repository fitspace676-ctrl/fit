import { Injectable } from '@nestjs/common';
import type { ListClassInstancesQuery, ListClassInstancesResponse } from '@fit/types';

/**
 * Read access to a gym's scheduled class occurrences for the public discovery
 * page (`GET /class-instances`).
 *
 * The backing `ClassInstance` Prisma model — together with the generator job
 * that materialises occurrences from each `ClassTemplate`'s RRULE — lands in
 * Phase 5 (T5.1 schema, T5.3 generator). Until then this service honours the
 * wire contract with an **empty** result: the public classes page (T3.4) is
 * built and verifiable now (week navigation fires the request, the calendar /
 * list render, the empty state shows), and only the data source is deferred.
 *
 * When T5.1 lands, replace the body of {@link listInstances} with a tenant-
 * scoped query: `ClassInstance` rows for `gymId` whose `startsAt` falls in
 * `[from, to)` and `status = SCHEDULED`, joined to their template/trainer/
 * location, projected to {@link ListClassInstancesResponse}. No caller or
 * client changes are needed — the contract here is already the final one.
 */
@Injectable()
export class ClassesService {
  /**
   * List the class occurrences overlapping the requested window for one gym,
   * ordered by `startsAt`. Returns an empty list until the `ClassInstance`
   * model exists (see the class docstring) — an empty array is a valid result
   * the page renders as its "no classes this week" state.
   */
  listInstances(_query: ListClassInstancesQuery): Promise<ListClassInstancesResponse> {
    // Async signature kept for the forthcoming Prisma-backed implementation (the
    // controller already awaits it); for now the result is synchronous.
    return Promise.resolve({ instances: [] });
  }
}
