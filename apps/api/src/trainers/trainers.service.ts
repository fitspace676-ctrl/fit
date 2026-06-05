import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GetTrainerQuery,
  GetTrainerResponse,
  ListTrainersQuery,
  ListTrainersResponse,
} from '@fit/types';

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

  /**
   * Read one trainer's profile + schedule for the public detail page
   * (`GET /trainers/:id`). Until the trainer model exists (see the class
   * docstring) the roster is empty, so **every** id resolves to a `404` — a
   * `NotFoundException` the controller surfaces verbatim and the page renders as
   * its "trainer not found" state.
   *
   * When the model lands, replace the body with a tenant-scoped lookup: the
   * trainer whose `id` matches *and* whose gym is `query.gymId` (a cross-tenant id
   * stays a `404`), projected to {@link GetTrainerResponse} with the upcoming
   * sessions joined as the schedule. The signature is already final — no caller
   * or client change needed.
   */
  getTrainer(id: string, query: GetTrainerQuery): Promise<GetTrainerResponse> {
    void query.gymId;
    return Promise.reject(new NotFoundException(`Trainer ${id} not found`));
  }
}
