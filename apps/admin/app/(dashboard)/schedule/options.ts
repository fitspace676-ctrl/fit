// @fit/admin — the trainer / location filter options the week calendar offers.
//
// The schedule toolbar (T3.2) narrows the grid by a default trainer or branch, so
// it needs the gym's active trainers and locations as `{ id, name }` selects. This
// loads both in parallel server-side (the board is a client component and must not
// hold the session token), degrading to empty lists if a roster call fails so the
// calendar still renders — the filters just offer nothing to pick.

import { fetchLocations, fetchTrainers } from '@/lib/api';
import type { ScheduleOption } from './schedule-board';

/** Pull enough of each roster to cover a realistic gym without paging. */
const OPTION_LIMIT = 100;

/** Load the gym's active trainers + locations as filter options, parallel + fail-soft. */
export async function loadScheduleFilters(): Promise<{
  trainers: ScheduleOption[];
  locations: ScheduleOption[];
}> {
  const [trainers, locations] = await Promise.all([
    fetchTrainers({ status: 'ACTIVE', limit: OPTION_LIMIT })
      .then((res) => res.data.map((trainer) => ({ id: trainer.id, name: trainer.name })))
      .catch(() => [] as ScheduleOption[]),
    fetchLocations({ status: 'ACTIVE', limit: OPTION_LIMIT })
      .then((res) => res.data.map((location) => ({ id: location.id, name: location.name })))
      .catch(() => [] as ScheduleOption[]),
  ]);
  return { trainers, locations };
}
