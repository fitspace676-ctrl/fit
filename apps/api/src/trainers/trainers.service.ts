import { Injectable } from '@nestjs/common';
import type { ListTrainersQuery, ListTrainersResponse } from '@fit/types';

/**
 * Read access to a gym's trainers for the public discovery index
 * (`GET /trainers`).
 *
 * Like {@link import('../classes/classes.service').ClassesService}, the backing
 * Prisma model + real query land later (Phase 5). Until then this service
 * honours the wire contract with an **empty** result: the public trainers index
 * (T3.6) is built and verifiable now (the request fires, the card grid / filter
 * cards / empty state render), and only the data source is deferred.
 *
 * When the trainer model exists, replace the body of {@link listTrainers} with a
 * tenant-scoped query: the gym's trainers ordered by name, joined to their
 * specialties / locations, projected to {@link ListTrainersResponse}. No caller
 * or client changes are needed — the contract here is already the final one.
 */
@Injectable()
export class TrainersService {
  /**
   * List the gym's trainers, ordered by name. Returns an empty list until the
   * trainer model exists (see the class docstring) — an empty array is a valid
   * result the page renders as its "no trainers yet" state.
   */
  listTrainers(_query: ListTrainersQuery): Promise<ListTrainersResponse> {
    // Async signature kept for the forthcoming Prisma-backed implementation (the
    // controller already awaits it); for now the result is synchronous.
    return Promise.resolve({ trainers: [] });
  }
}
