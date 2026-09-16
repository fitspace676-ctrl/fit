// @fit/admin — which reporting figures a branch filter actually narrows.
//
// The API is the authority on this and it does NOT echo the answer back: neither
// `ReportResult` nor `ReportDrilldown` carries a "was this filtered?" field, and
// adding one was rejected upstream (see the roadmap's "not split by branch"
// section — overloading an existing `null` trades one wrong reading for another).
// So the console has to carry the wording, and this module is the one place it is
// written down rather than re-derived per component.
//
// EVERY ENTRY BELOW MIRRORS A ROW OF THE EXEMPTION REGISTER in
// `docs/superpowers/plans/2026-08-30-multi-branch-location-filter.md`, which in
// turn mirrors the table in `apps/api/src/common/location-filter.util.ts`. Three
// copies of that list drifted apart once already; when a roadmap stage lands a
// schema change, all three move together or none of them do.
//
// A report is on one of these lists because the DATA cannot answer "which
// branch", never because filtering it was awkward. Removing a key from here
// without first landing the migration named in the register reintroduces exactly
// the wrong number the register exists to prevent.
//
// No `'use client'`: the server page reads these to decide nothing (it always
// sends the branch — the API decides what to do with it), and the client views
// read them to decide what to say. StyleX-free, i18n-free — the wording lives in
// `branch-scope-note.tsx` against `admin.common.notSplitByBranch`.

import { GYM_WIDE_REPORT_KEYS, type ReportKey, type ReportMetric } from '@fit/types';
import type { BranchAccess } from '@/lib/active-location';

/**
 * The catalogue reports that stay GYM-WIDE however a branch filter is set.
 *
 * NOT a copy any more: the list lives in `@fit/types` (`GYM_WIDE_REPORT_KEYS`) and
 * the API service reads the same constant to decide which reports never receive
 * the branch, so the caveat on screen and the query behind it cannot disagree.
 * The reasons are recorded beside the constant; today they are:
 *
 *   - `discounts-and-promotions` - a redemption has no branch, no order relation,
 *     and no member for a walk-in, so neither hop is honest.
 *   - `audit-log` - an entry names an actor and a target id, never a place.
 *
 * Everything else narrows, including the three reports this set used to hold:
 * `pt-sessions` and `trainer-performance` left it when Stage 6 gave `PtSession` a
 * branch (both halves of trainer performance now take the same equality, so the
 * ranking is one population again), and `member-check-in-log` left in Stage 3.
 * That is the only way a key comes off: the data gains a real branch first.
 */
export const GYM_WIDE_REPORTS: ReadonlySet<ReportKey> = new Set<ReportKey>(GYM_WIDE_REPORT_KEYS);

/**
 * The catalogue entries this operator may open: every one for a gym-wide role, and
 * none of {@link GYM_WIDE_REPORTS} for a role restricted to its assigned branches.
 *
 * Such a person has no gym-wide view — the same reason "All locations" is not a
 * choice they are offered — and these reports cannot be narrowed to a branch. The
 * API already drops them from the catalogue and `403`s a preview or export; this
 * keeps the page from rendering a card or a `?report=` it would only fail on. A
 * pasted `?report=audit-log` then falls back to the first offered report, like any
 * other key the catalogue does not carry.
 */
export function reportsWithinBranchAccess<T extends { key: ReportKey }>(
  reports: readonly T[],
  access: Pick<BranchAccess, 'canSelectAll'>,
): T[] {
  return access.canSelectAll
    ? [...reports]
    : reports.filter((report) => !GYM_WIDE_REPORTS.has(report.key));
}

/**
 * Reports that ARE branch-aware but carry individual columns that are not, keyed
 * by the row-object key the column reads.
 *
 * **Currently empty, and that is a result rather than an oversight.**
 * `revenue-summary` used to be the entry here: with a branch selected the API
 * skipped the subscription query and returned `null` for `mrr`, `activeMembers`
 * and `arpm`, because the recurring base had no branch. Stage 2 gave the member a
 * home branch, the subscription inherits it, and all three now carry real
 * per-branch figures — so the annotation, the dotted column headers and the
 * em-dash cells that explained the nulls were removed with it. Kept as a live
 * export because the shape recurs: a report can be branch-aware in most columns
 * and blind in one, and when that happens again this is where it is recorded.
 */
export const GYM_WIDE_REPORT_COLUMNS: Partial<Record<ReportKey, readonly string[]>> = {};

/**
 * `revenue-by-location` is DELIBERATELY ON NEITHER LIST, and it is the one report
 * where that needs saying out loud.
 *
 * It is the report whose subject IS the branch axis, so a branch filter turns it
 * from a breakdown into a single row — the selected branch's own takings. Nothing
 * about that is dishonest and nothing needs annotating: the row names the branch
 * in its first column, so the table says what it is without help, and its total
 * reconciles with every neighbouring report on the screen. The chip stays in the
 * catalogue row (its `pin` glyph is wayfinding, not a claim about scope) because
 * a one-row confirmation of "what did Vake take" is a reasonable thing to want
 * and to download.
 *
 * The tempting alternative — hiding it, or ignoring the filter for this one report
 * — was rejected on both counts: hiding it removes a report the operator asked
 * for, and ignoring the filter would print a table naming every OTHER branch on a
 * screen scoped to one, whose total would then disagree with the revenue summary
 * beside it. (The dashboard's `revenue-by-location-card.tsx` IS hidden in
 * single-branch mode, but that is a card competing for space on a summary screen,
 * not a report someone chose.)
 */

/** The branch-blind column keys of one report — empty when every column narrows. */
export function gymWideColumnKeys(key: ReportKey): readonly string[] {
  return GYM_WIDE_REPORT_COLUMNS[key] ?? [];
}

/**
 * The drill-downs that stay GYM-WIDE however a branch filter is set.
 *
 * **Currently empty, and — like {@link GYM_WIDE_REPORT_COLUMNS} — that is a result
 * rather than an oversight.** Every one of the eight metrics now narrows: `sales`,
 * `revenue` and `pos` through `Order.locationId`; `classes` and `staff` through
 * `ClassInstance.locationId`; `members` and `loyalty` through the member's home
 * branch, which they gained in Stage 2 (a points balance is an account belonging to
 * a person, so it follows the person); and `attendance` through
 * `CheckIn.locationId`, which Stage 3 promoted to a real FK and gave a write path,
 * so a visit finally records the door it came through.
 *
 * `attendance` was the last entry and it is worth saying which filter it took. A
 * check-in is an event at a PLACE, so it narrows by the branch walked into and
 * NEVER by the visitor's home branch — the member hop that unblocked `members` and
 * `loyalty` would have produced a peak-hours heatmap of "members homed here,
 * wherever they actually trained", read as this branch's footfall and used to
 * roster staff against it.
 *
 * Kept as a live export rather than deleted: an empty set is the honest statement
 * that nothing here is currently blind, and the next metric whose source model has
 * no branch goes in here rather than being annotated ad hoc at a call site. The
 * consumers already call `.has()` on it, so a new entry needs no other change.
 * Note this is about WHOLE drill-downs — `staff`'s `rating` column is still
 * branch-blind and is recorded below, not here.
 */
export const GYM_WIDE_DRILLDOWNS: ReadonlySet<ReportMetric> = new Set<ReportMetric>();

/**
 * Branch-blind columns inside an otherwise branch-aware drill-down, keyed by
 * section id and then listing the row-object keys.
 *
 * `staff` is the only one: its delivery figures scope through
 * `ClassInstance.locationId` and stay reconcilable with the `classes` metric, but
 * `rating` deliberately never narrows — a `Review` is written about a TRAINER,
 * carries no branch, and an average rating is a property of the person rather
 * than a quantity produced at a branch.
 */
export const GYM_WIDE_DRILLDOWN_COLUMNS: Partial<
  Record<ReportMetric, Readonly<Record<string, readonly string[]>>>
> = {
  staff: { 'staff-performance': ['rating'] },
};

/** The branch-blind column keys of one drill-down section — empty when it has none. */
export function gymWideSectionColumnKeys(
  metric: ReportMetric,
  sectionId: string,
): readonly string[] {
  return GYM_WIDE_DRILLDOWN_COLUMNS[metric]?.[sectionId] ?? [];
}
