// @fit/admin — the trainer / location option lists the class-template form offers.
//
// The create + edit pages both need the gym's active trainers and locations as
// `{ id, name }` selects for the template's default assignment. This loads both in
// parallel server-side (the form is a client component and must not hold the
// session token), degrading to empty lists if a roster call fails so the form
// still renders without its optional defaults.

import { fetchLocations, fetchSubscriptionPlans, fetchTrainers } from '@/lib/api';
import type { RelationOption } from './class-template-form';

/** Pull enough of each roster to cover a realistic gym without paging. */
const OPTION_LIMIT = 100;

/**
 * Load the gym's active trainers + locations + membership plans as form options,
 * parallel + fail-soft. Plans back the "included in these plans" multi-select the
 * class-type pricing rule offers; a failed roster call degrades to an empty list
 * so the form still renders.
 */
export async function loadRelationOptions(): Promise<{
  trainers: RelationOption[];
  locations: RelationOption[];
  plans: RelationOption[];
}> {
  const [trainers, locations, plans] = await Promise.all([
    fetchTrainers({ status: 'ACTIVE', limit: OPTION_LIMIT })
      .then((res) => res.data.map((t) => ({ id: t.id, name: t.name })))
      .catch(() => [] as RelationOption[]),
    fetchLocations({ status: 'ACTIVE', limit: OPTION_LIMIT })
      .then((res) => res.data.map((l) => ({ id: l.id, name: l.name })))
      .catch(() => [] as RelationOption[]),
    fetchSubscriptionPlans({ limit: OPTION_LIMIT, sort: 'name', dir: 'asc' })
      .then((res) => res.data.map((p) => ({ id: p.id, name: p.name })))
      .catch(() => [] as RelationOption[]),
  ]);
  return { trainers, locations, plans };
}
