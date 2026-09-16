# Restore the report branch filter onto the 43-report catalogue

**Status: CLOSED (2026-09-15).** Landed in `22b4bfd5` (catalogue), `1d30d5c7`
(drill-downs), `182728e1` (Reports screens) and `69036ff5` (branch-restricted
operators). The merge blocker this file recorded is gone. The outcome is under
[How it closed](#how-it-closed); everything above that heading is the record of
the problem as it stood.

## What happened

Two changes landed on the same files from opposite directions.

`#325` (on `main`) rewrote reporting: a 43-report catalogue, `today` / `7d` / `mtd` /
`custom` windows in place of the old presets, Georgian copy throughout, and a
`ReportStrings` argument threaded through every report method.

This branch's Stage 1 threaded `ReportQuery.locationId` through the _old_ catalogue —
each report deciding its own attribution and applying it with `atLocation` /
`memberAtLocation` from `common/location-filter.util.ts`.

Merging `main` here put 43 conflict hunks in `reports.service.ts` alone, in methods
`#325` had largely rewritten. The merge took **main's** version of the reporting
cluster wholesale, which is why this file exists.

## What was broken

`ReportQuery.locationId` still parsed, still rode the URL, and both export routes
still forwarded it. **The service ignored it.** So a console pinned to one branch
showed, and downloaded, gym-wide figures — with no caveat saying so. That is worse
than an unfiltered report, because it reads as an answer about the branch.

## What was removed, and where it is

Everything below is preserved verbatim at tag `backup/pre-main-merge` (commit
`9cd572a`):

| What                                                | Where it was                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `locationId` threading through ~45 report methods   | `apps/api/src/reports/reports.service.ts`                            |
| `describe('branch filter')`, ~380 lines             | `apps/api/src/reports/reports.service.spec.ts`                       |
| The drill-down's branch filter                      | `apps/api/src/reports/report-drilldown.service.ts` (+ spec)          |
| The "screen → link" half of the file/screen proof   | `apps/admin/app/(dashboard)/reports/reports-view.test.tsx` (deleted) |
| Branch wiring in the catalogue and drill-down pages | `apps/admin/app/(dashboard)/reports/**`                              |

## What survived the merge

These were already in place and were not rebuilt:

- `locationId` on `reportQuerySchema` / `reportExportQuerySchema`, and on
  `reportDrilldownQuerySchema` through it (`packages/types/src/reports.ts`).
- `reportQueryParams()` serialising it, so one helper spells the window _and_ the
  branch for links, fetchers and download URLs alike.
- Both export route handlers resolving the branch through `getActiveLocationId`
  (explicit param → cookie → all branches) and forwarding it upstream, pinned by
  `apps/admin/app/(dashboard)/reports/export-routes.spec.ts`.
- `atLocation` / `memberAtLocation` and the exemption register in
  `apps/api/src/common/location-filter.util.ts`.

## The work, as planned

Re-decide the attribution for each report in the **new** catalogue and apply it.
The five attributions, and the rule that decides between them, are unchanged:

- **Order-backed** (sales, POS, revenue, refunds) — the branch that _rang the sale
  up_: `Order.locationId` / `Payment.locationId` / `Refund.locationId`, all plain
  equalities since Stage 5.
- **Class-backed** (attendance, utilization, cancellations, waitlist, no-shows) —
  `ClassInstance.locationId`.
- **Member-backed** (roster, retention, churn, movement, at-risk, expiries,
  occasions, projected revenue, outstanding invoices) — the member's _home_
  branch. `GymMember` and `Invoice` carry it on the row; `Subscription` reaches it
  through `member` deliberately, so a transferring member's recurring revenue
  follows them.
- **Visit-backed** (the check-in log) — the branch the member _walked into_:
  `CheckIn.locationId`. An event at a place is attributed like an order, not like
  a membership.
- **Coaching-backed** (pt-sessions, trainer-performance) — the branch the hour was
  _delivered_ at: `PtSession.locationId`.

Two rules govern the edges, and they matter more than the list:

1. **Never mix attributions inside one figure.** Trainer-performance is the worked
   example: half its row comes from `ClassInstance` and half from `PtSession`, and
   the ranking adds the two columns — half a filter would order the table from two
   populations.
2. **A report that cannot honestly answer "which branch" stays gym-wide and says
   so.** `discounts-and-promotions` is the standing case: `PromoRedemption.memberId`
   is null by design for an anonymous walk-in, so a member hop would drop exactly
   the promotions the report exists to price. Inventing a proxy path is worse than
   not filtering — an empty table reads as "this branch had no activity".

Reports new in `#325` have no prior decision on record and need one made.

## How it closed

**The catalogue it closed against is 41 keys** (`REPORT_KEYS` in
`packages/types/src/reports.ts`), not the 43 this file was opened for.
`ReportsService.computeRows` resolves the branch once — `isGymWideReport(key) ?
undefined : requested` — so a gym-wide report never receives it, and an edit inside
its method cannot start filtering it on a proxy by accident.

Coaching-backed was widened to **delivery-backed** on the way: the new catalogue has
reports about shifts, stock movements and PT sales, and all of them follow the same
rule — the branch where the hour, the shift or the movement happened.

| Attribution     | Read                                                                                                                      | Reports                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order-backed    | `Order` / `Payment` / `Refund.locationId`                                                                                 | `sales-summary`, `sales-by-payment-method`, `plan-performance`, `sales-by-staff`, `refunds-detail`, `pos-transaction-log`, `sales-transactions`, `daily-reconciliation`, `revenue-by-channel`, `revenue-by-location`, `revenue-by-payment-method`, `refunds-accounting`, `product-sales`, `product-sales-detail` |
| Both, apart     | takings on `Payment` / `Refund`; MRR through `Subscription.member`                                                        | `revenue-summary` — the two rules in separate columns, never added together                                                                                                                                                                                                                                      |
| Member-backed   | `GymMember.locationId`; `Subscription` / `CreditPack` through `member`; `Invoice.locationId` frozen at issue              | `membership-movement`, `retention-and-churn`, `members-at-risk`, `expiring-memberships`, `member-roster`, `upcoming-occasions`, `projected-revenue`, `credit-usage`, `outstanding-invoices`                                                                                                                      |
| Visit-backed    | `CheckIn.locationId`                                                                                                      | `member-check-in-log`                                                                                                                                                                                                                                                                                            |
| Class-backed    | `ClassInstance.locationId`, directly or through the booking's instance                                                    | `attendance-by-class`, `class-utilization`, `waitlist-demand`, `class-cancellations`, `no-show-rate`                                                                                                                                                                                                             |
| Delivery-backed | `PtSession` / `ServiceSession` / `ClassInstance` / `ShiftSlot` / `StockMovement.locationId`; `ProductStock` for the shelf | `pt-sessions`, `trainer-activity`, `trainer-activity-detail`, `trainer-performance`, `trainer-sales`, `trainer-sales-detail`, `staff-schedule`, `stock-movements`, `stock-inventory`                                                                                                                             |
| Gym-wide        | —                                                                                                                         | `discounts-and-promotions`, `audit-log` (`GYM_WIDE_REPORT_KEYS`)                                                                                                                                                                                                                                                 |

15 + 9 + 1 + 5 + 9 + 2 = 41.

**Trainer-performance is no longer the counter-example of rule 1.** Stage 6 gave
`PtSession` a branch, so both halves of its row take the same equality and the
ranking is one population again. `trainer-sales` does read two models — the package
sale off its `Order`, the booked session off its `ServiceSession` — but each line is
one sale and is attributed on its own row. Nothing adds the two.

**The gym-wide set has one list, shared by both sides.** `GYM_WIDE_REPORT_KEYS` in
`@fit/types` is what the service reads to withhold the branch, what
`apps/admin/app/(dashboard)/reports/branch-scope.ts` re-exports as `GYM_WIDE_REPORTS`
for the "not split by branch" chip, and what the specs pin to exactly
`['discounts-and-promotions', 'audit-log']`.

**Drill-downs (`1d30d5c7`).** All eight metrics narrow again — `GYM_WIDE_DRILLDOWNS`
is empty. `staff`'s `rating` column is the one blind column
(`GYM_WIDE_DRILLDOWN_COLUMNS`): a `Review` has no branch.

**Screens (`182728e1`).** The catalogue and drill-down pages send the active branch
and mark the two gym-wide reports while a branch is selected.

**Branch-restricted operators (`69036ff5`).** A role with `branchScope: 'assigned'`
has no gym-wide view, and these two reports cannot be narrowed. So the API drops them
from that operator's catalogue and answers a preview or export with
`403 BRANCH_FORBIDDEN` (`reports.controller.ts`), and the console hides the cards
(`reportsWithinBranchAccess`).
