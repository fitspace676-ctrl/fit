// @fit/admin — the trainer filter options the week calendar offers.
//
// The schedule toolbar (T3.2) narrows the grid by a default trainer, so it needs
// the gym's active trainers as an `{ id, name }` select. This loads them
// server-side (the board is a client component and must not hold the session
// token), degrading to an empty list if the roster call fails so the calendar
// still renders — the filter just offers nothing to pick.
//
// It used to load the gym's locations too, for a page-local branch select. That
// select is gone: the branch is now the top bar's, console-wide, and the page
// resolves it through `getActiveLocationId()`. The "Add Class" drawer still needs
// a location list, but it loads its own (`../options.ts`) because there it is a
// write target — the branch the class will be *held at* — not a filter.

import { fetchTrainers } from '@/lib/api';
import type { ScheduleOption } from './schedule-board';

/** Pull enough of the roster to cover a realistic gym without paging. */
const OPTION_LIMIT = 100;

/** Load the gym's active trainers as filter options, fail-soft. */
export async function loadScheduleFilters(): Promise<{ trainers: ScheduleOption[] }> {
  const trainers = await fetchTrainers({ status: 'ACTIVE', limit: OPTION_LIMIT })
    .then((res) => res.data.map((trainer) => ({ id: trainer.id, name: trainer.name })))
    .catch(() => [] as ScheduleOption[]);
  return { trainers };
}
