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

import type { ReportKey, ReportMetric } from '@fit/types';

/**
 * The catalogue reports that stay GYM-WIDE however a branch filter is set — 3 of
 * the 27. The API accepts `locationId` for all of them and applies it to none of
 * these, so with a branch selected the rows on screen are still every branch's.
 *
 * Stage 2 emptied most of this list and Stage 3 took one more off it. What is left
 * is blocked on data that genuinely does not exist yet:
 *
 *   • `discounts-and-promotions` — `PromoRedemption.memberId` is null by design
 *     for an anonymous walk-in, so the member hop would drop exactly the walk-in
 *     promotions the report exists to price. Stage 7.
 *   • `pt-sessions` — `PtSession` has no branch. Stage 6.
 *   • `trainer-performance` — mixed scope: `ClassInstance` could filter and
 *     `PtSession` could not, and the ranking ADDS the two columns, so half a
 *     filter would order the table from two populations. Stage 6.
 *
 * `member-check-in-log` LEFT this set in Stage 3, and how it left is the part
 * worth keeping. Its old entry said the column existed but nothing wrote it, so
 * filtering returned an empty log reading as "nobody came here"; that entry also
 * recorded the shortcut it had refused — attributing a VISIT to the visitor's home
 * branch, which would print a log whose own `location` column named a different
 * branch from the one filtered on. Stage 3 fixed the report by fixing the DATA:
 * `CheckIn.locationId` is a real FK, reception writes it, and the filter reads the
 * branch the member walked into. The refused shortcut is still refused. That is
 * the only way a key comes off this list — the migration lands first, and the
 * report answers the question it was actually asked.
 */
export const GYM_WIDE_REPORTS: ReadonlySet<ReportKey> = new Set<ReportKey>([
  'discounts-and-promotions',
  'pt-sessions',
  'trainer-performance',
]);

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
