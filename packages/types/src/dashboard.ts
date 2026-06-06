// @fit/types — staff-console dashboard KPI contracts (inferred types).
//
// The wire shape for the admin console's dashboard (T4.10): the headline counts
// the KPI widgets render. The API computes these with tenant-scoped Prisma counts
// and the `@fit/admin` console reuses the inferred types, so the widgets and the
// controller can never drift on the wire format.
//
// `GET /dashboard/stats` takes no query — it is always the caller's own gym, a
// single live snapshot — so there is no request schema here, only the response.

/**
 * The headline count pair for one entity on the dashboard: `active` is the
 * primary figure each widget leads with (the gym's current roster / catalogue),
 * `total` is the all-statuses count shown as context beside it. `total >= active`
 * always (an inactive record still counts toward the total).
 */
export interface DashboardStat {
  /** Records in the live/active lifecycle state (the widget's headline number). */
  active: number;
  /** All records regardless of status (active + suspended/inactive). */
  total: number;
}

/**
 * Successful `GET /dashboard/stats` response — one live snapshot of the gym's
 * headline counts, one {@link DashboardStat} per entity the basic dashboard
 * surfaces. Every figure is scoped to the caller's gym server-side; the widgets
 * render `active` large with `total` as the sub-label.
 */
export interface DashboardStatsResponse {
  /** Gym members (the `MEMBER`-role roster) — active vs. all statuses. */
  members: DashboardStat;
  /** Trainer profiles — active (rostered) vs. all. */
  trainers: DashboardStat;
  /** Locations (branches) — active (bookable) vs. all. */
  locations: DashboardStat;
  /** Retail products — active (sellable) vs. all. */
  products: DashboardStat;
}
