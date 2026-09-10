# Restore the report branch filter onto the 43-report catalogue

**Status: OPEN. `feat/multi-branch-location-filter` must not merge until this closes.**

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

## What is currently broken

`ReportQuery.locationId` still parses, still rides the URL, and both export routes
still forward it. **The service ignores it.** So a console pinned to one branch
shows, and downloads, gym-wide figures — with no caveat saying so. That is worse
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

Do not rebuild these — they are already in place:

- `locationId` on `reportQuerySchema` / `reportExportQuerySchema`, and on
  `reportDrilldownQuerySchema` through it (`packages/types/src/reports.ts`).
- `reportQueryParams()` serialising it, so one helper spells the window _and_ the
  branch for links, fetchers and download URLs alike.
- Both export route handlers resolving the branch through `getActiveLocationId`
  (explicit param → cookie → all branches) and forwarding it upstream, pinned by
  `apps/admin/app/(dashboard)/reports/export-routes.spec.ts`.
- `atLocation` / `memberAtLocation` and the exemption register in
  `apps/api/src/common/location-filter.util.ts`.

## The work

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
