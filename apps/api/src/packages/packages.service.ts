import { Injectable } from '@nestjs/common';
import type { ListPackagesQuery, ListPackagesResponse } from '@fit/types';

/**
 * Read access to a gym's purchasable packages for the public catalogue
 * (`GET /packages`).
 *
 * Powers two surfaces: the web purchase wizard's package step (T3.9) and the
 * mobile Personal Training screen (T6.6) — both unauthenticated/member reads
 * scoped by an explicit `gymId` (and the optional `locationId` chosen earlier),
 * never a session.
 *
 * Like {@link import('../trainers/trainers.service').TrainersService}, the
 * backing Prisma query lands later: a `PackagePlan` row already exists (the
 * staff console manages it via `/admin/packages`, T4.11), so the eventual
 * implementation reads the gym's `ACTIVE` plans, maps the Prisma
 * `PackageBillingInterval` (`MONTH`/`YEAR`/`ONE_TIME`) to the public
 * `PackageInterval` (`month`/`year`/`one_time`), and projects each to
 * {@link import('@fit/types').PackageSummary}. Until then this service honours
 * the wire contract with an **empty** result, so both clients are built and
 * verifiable now (the request fires, the cards / empty state render) with only
 * the data source deferred. The contract here is already the final one, so no
 * caller or client change is needed when the query lands.
 */
@Injectable()
export class PackagesService {
  /**
   * List the gym's purchasable packages, in display order. Returns an empty list
   * until the query is wired (see the class docstring) — an empty array is a
   * valid result the clients render as their "no packages yet" state. The
   * optional `locationId` narrows the catalogue to a branch when the gym scopes
   * packages by location.
   */
  listPackages(query: ListPackagesQuery): Promise<ListPackagesResponse> {
    void query.gymId;
    void query.locationId;
    // Async signature kept for the forthcoming Prisma-backed implementation (the
    // controller already awaits it); for now the result is synchronous.
    return Promise.resolve({ packages: [] });
  }
}
