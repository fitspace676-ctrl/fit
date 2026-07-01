// @fit/admin — the trainer / location option lists the class-template form offers.
//
// The create + edit pages both need the gym's active trainers and locations as
// `{ id, name }` selects for the template's default assignment. This loads both in
// parallel server-side (the form is a client component and must not hold the
// session token), degrading to empty lists if a roster call fails so the form
// still renders without its optional defaults.

import { fetchLocations, fetchTrainers } from '@/lib/api';
import type { RelationOption } from './class-template-form';

/** Pull enough of each roster to cover a realistic gym without paging. */
const OPTION_LIMIT = 100;

/** Load the gym's active trainers + locations as form options, parallel + fail-soft. */
export async function loadRelationOptions(): Promise<{
  trainers: RelationOption[];
  locations: RelationOption[];
}> {
  const [trainers, locations] = await Promise.all([
    fetchTrainers({ status: 'ACTIVE', limit: OPTION_LIMIT })
      .then((res) => res.data.map((t) => ({ id: t.id, name: t.name })))
      .catch(() => [] as RelationOption[]),
    fetchLocations({ status: 'ACTIVE', limit: OPTION_LIMIT })
      .then((res) => res.data.map((l) => ({ id: l.id, name: l.name })))
      .catch(() => [] as RelationOption[]),
  ]);
  return { trainers, locations };
}
