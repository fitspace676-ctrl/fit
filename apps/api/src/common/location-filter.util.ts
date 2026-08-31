/**
 * How a query narrows to one branch — and, just as importantly, which figures it
 * cannot narrow at all.
 *
 * Stage 1 of the multi-branch roadmap
 * (`docs/superpowers/plans/2026-08-30-multi-branch-location-filter.md`) threads
 * `?locationId=` through the admin read surface. Only FOUR models could answer
 * "which branch" then — `ClassTemplate`, `ClassInstance`, `Order` and `Lead` —
 * and a Stage 0 migration backfilled every NULL `locationId` on them to each
 * gym's default branch. So a branch filter on those is plain equality: there are
 * no unattributed rows left to `OR … IS NULL` for.
 *
 * `GymMember` joined them in Stage 2: it now carries `locationId`, the member's
 * **home branch**, backfilled onto each gym's default and indexed as
 * `(gymId, locationId, status)`. Do not confuse it with
 * `GymMember.assignedLocationIds` on the same model — that is the staff
 * work-assignment array, a different concept with no FK, and it is what a
 * *trainer's* branch will come from in Stage 6.
 *
 * `CheckIn` joined them in Stage 3. Its `locationId` was the one entry in the table
 * below that named a column rather than the lack of one — it existed but was a
 * dangling scalar with no FK, no back-relation and no write path, so every row was
 * NULL and filtering it returned "nobody came here". It is a real `Location`
 * relation now, indexed `(gymId, locationId, checkedInAt)`, with migration
 * `20260831120000_check_in_location_branch` repairing the stale and cross-tenant
 * ids the missing FK had allowed and backfilling every NULL onto the gym's default
 * branch. **It records the branch the member physically WALKED INTO, and it is the
 * one column on a member-owned row that must NOT be resolved through
 * {@link memberAtLocation}**: a drop-in's home branch is a fact about the person and
 * says nothing about which door they came through this morning. Occupancy, footfall
 * and peak-hour figures are about the PLACE, so they read this column and only this
 * column.
 *
 * `Payment`, `Refund` and `Invoice` joined them in Stage 5, and they are the one
 * group that gained a column WITHOUT gaining an attribution: all three could
 * already be narrowed — payments and refunds through their order, invoices through
 * their member — so migration `20260831140000_money_location_branch` denormalised
 * the answer each read was already computing rather than inventing a new one. It
 * is a PERFORMANCE change: a relation filter plans as a join plus a heap filter
 * and can never use an index, and the revenue aggregates issue one in a loop.
 * Every such call site now reads {@link atLocation} against
 * `(gymId, locationId, createdAt)`.
 *
 * **What the copy does change is live versus frozen, and that is the point.** A
 * relation filter re-reads the related row on every query; a column is a snapshot
 * taken at write time. For payments and refunds nothing moves today — no path in
 * `apps/api` re-attributes an order after checkout. For invoices it moves
 * something real: `GymMember.locationId` is editable (a branch move rides with the
 * profile write in `members.service.ts`), so the live hop silently rewrote a
 * transferred member's ENTIRE billing history — months already closed — across
 * both branches. It does not any more. **A past event does not move because a
 * person later did.**
 *
 * ## The attribution rule
 *
 * Stage 2 makes a second-order hop possible: `Subscription` and the loyalty ledger
 * carry no `locationId`, but each names a `GymMember` that does. Attributing them
 * that way is a DEFINITION, not a fact read off a row, so it is written down once,
 * here, and every call site follows it:
 *
 * > **A figure about a PLACE is attributed by the order's branch. A figure about
 * > a PERSON is attributed by that person's home branch.**
 *
 * Concretely: takings, till counts and end-of-day summaries are attributed to the
 * branch the order was rung up at — which since Stage 5 they carry themselves, so
 * the read is {@link atLocation} on `Payment.locationId` / `Refund.locationId`
 * rather than a hop. Memberships, recurring billing, retention cohorts and loyalty
 * points follow {@link memberAtLocation} — a membership belongs to the member's
 * own gym, not to wherever they last swiped a card. Invoices take the PERSON half
 * too, but read it off `Invoice.locationId`, stamped from the member at issue time.
 *
 * ## Two rules coexist on purpose: `Subscription` keeps the LIVE hop
 *
 * Stage 5 stopped one model short, deliberately. **`Subscription` gets no column
 * and keeps {@link memberAtLocation}.** The gym owner was asked the question
 * directly — when a member transfers branches, does their recurring revenue go
 * with them? — and the answer was yes. So MRR, the projection, the renewal and
 * expiry counts and the retention cohorts all FOLLOW THE PERSON, live, and are
 * meant to.
 *
 * The pair of rules therefore reads: **money already taken stays where it was
 * taken; the recurring base follows the person.** A transferred member's past
 * invoices stay with the branch that earned them while their MRR moves the same
 * day. That is not a half-finished migration and must not be "completed" by
 * freezing `Subscription` — it is a product decision, recorded here and at every
 * MRR call site so nobody has to rediscover it.
 *
 * Both rules PARTITION the gym: every order has exactly one branch, every member
 * has exactly one home branch, so per-branch figures add back up to the gym-wide
 * one and no row is counted twice. That property is the whole reason a definition
 * this arbitrary is defensible, and it is what a proxy like "the branch of their
 * last check-in" would destroy.
 *
 * The rule is chosen per FIGURE, never per row inside one. A figure that divides
 * money by a head-count takes the member hop on BOTH terms — one branch's till
 * takings over another population's head-count is not a smaller average, it is a
 * wrong one. The single place the two rules meet in one sum is
 * `dashboard-revenue`'s `kpis.totalRevenue`, and it is specified at that call site.
 *
 * ## What still has no path to a branch
 *
 * | Model | Why it cannot be filtered | Fixed by |
 * |---|---|---|
 * | `PtSession` | no location column, and no relation that reaches one | Stage 6 |
 * | `Trainer` | no location column; a trainer is not a member, so the member hop does not apply | Stage 6 |
 * | `ShiftSlot` | `location` is free text, not an FK | Stage 6 |
 * | `TimeOffRequest` | hangs off a STAFF `GymMember`, whose `locationId` is a backfill artefact rather than a work assignment | Stage 6 |
 * | `Review` | written about a trainer; a rating is a property of the person, not a quantity produced at a branch | — |
 * | `PromoRedemption` | `orderId` is a relation-less scalar — nothing to join through | Stage 7 |
 * | `ClassType` | gym-wide catalogue; its only path is "has occurred at", not "belongs to" | Stage 7 |
 *
 * `Subscription` and `Invoice` used to sit in that table and no longer do — the
 * member hop is their honest path, and Stage 5 froze the invoice half of it onto
 * the row. `CheckIn` left it too, but by the other route: it got a column of its
 * own rather than a hop, which is the only correct outcome for a figure about a
 * place. `Payment` and `Refund` now carry the place answer on the row as well.
 *
 * Where a figure reads one of the models above, the caller leaves it gym-wide and
 * says so at the call site, naming the stage that fixes it. It never quietly
 * presents a gym-wide number as a branch number, and it never fabricates a zero to
 * make a card look filtered.
 *
 * This lives in `common/` rather than beside any one consumer because the
 * dashboard, the reports catalogue, the drill-downs, the member roster and the
 * order roster all need the same three fragments and, more to the point, the same
 * rule above. Three copies of it drifted apart once already.
 */

/**
 * A `where` fragment narrowing a model that OWNS a `locationId` column to one
 * branch — `ClassTemplate`, `ClassInstance`, `Order`, `Lead`, `GymMember`,
 * `CheckIn`, `ProductStock`, and since Stage 5 `Payment`, `Refund` and `Invoice`.
 *
 * Plain equality, no null arm, and **the absence of a null arm is load-bearing on
 * the money tables specifically.** A NULL `locationId` on a payment, refund or
 * invoice means "not attributable" — not "the default branch". A branch filter
 * must exclude it (it is not this branch's money, and nothing knows whose it is),
 * and no aggregate may fold it into a named branch: a breakdown keeps a "no
 * location" bucket, or leaves the row out and says so. Quietly adopting such a row
 * into a named branch is the `areas[0]` mistake Stage 3 deleted.
 *
 * The `(gymId, locationId, startsAt)` / `(gymId, locationId, createdAt)` /
 * `(gymId, locationId, status)` / `(gymId, locationId, checkedInAt)` composites
 * serve exactly this shape (the tenant extension always injects `gymId`, so `gymId`
 * leads every index).
 *
 * Do not reach for this on `Location` itself. The selected branch is that table's
 * primary key, so the fragment there is `{ id: locationId }`; spreading this one
 * would filter a column `Location` does not have.
 *
 * A row CAN go back to NULL — every `location` relation is `onDelete: SetNull`, so
 * deleting a branch un-homes its members, un-places its orders and un-places the
 * check-ins that recorded arrivals there. Those rows then fall out of every branch
 * filter while staying in the gym-wide roll-up, which is why the reports that break
 * a total down by branch keep a "no location" bucket as a safety net rather than
 * assuming the backfill holds forever. A breakdown with no room for such a bucket
 * says so at its call site and leaves the row out of the breakdown rather than
 * assigning it to a branch it was not at — `dashboard.service.ts`'s occupancy card
 * is the worked example, and the `areas[0]` fold-in it used to carry is the mistake
 * that pattern exists to prevent.
 *
 * An absent branch spreads to `{}`, so the caller's `where` is untouched and the
 * query keeps its original, index-served plan.
 */
export function atLocation(locationId: string | undefined): { locationId?: string } {
  return locationId === undefined ? {} : { locationId };
}

/*
 * `orderAtLocation` lived here until Stage 5 and is GONE, not moved.
 *
 * It narrowed a `Payment` or a `Refund` through the `Order` it settled
 * (`{ order: { is: { locationId } } }`) because neither table carried a branch of
 * its own. Both do now, so every one of its ~16 call sites collapsed to
 * {@link atLocation} and nothing was left calling it (30 call sites across five files, all Payment or Refund). Its doc comment always said
 * it was an interim shape; this is the interval ending.
 *
 * Do not reintroduce it. Reaching a payment's branch through its order is now
 * strictly worse on two counts: it cannot use `payments(gymId, locationId,
 * createdAt)`, and it is LIVE where the column is frozen — so a future
 * re-attribution of an order would retroactively move money the branch had already
 * banked. If you need the order's branch for something that is genuinely about the
 * order, filter `Order` with {@link atLocation} directly.
 */

/**
 * The conditions a member-hop fragment carries. Deliberately tiny and structural:
 * it is a hand-written subset of `GymMemberWhereInput`, wide enough for the branch
 * plus the `deletedAt: null` trash guard almost every call site already pairs it
 * with, and narrow enough that it cannot quietly grow into a second query builder.
 */
export interface MemberScope {
  /** The trash guard. `null` means "not soft-deleted"; there is no other useful value. */
  deletedAt?: null;
  /** The member's HOME branch — see {@link memberAtLocation}. */
  locationId?: string;
}

/**
 * A `where` fragment narrowing a model reached through its `GymMember` to that
 * member's HOME branch — the PERSON half of the attribution rule at the top of
 * this file, applied LIVE.
 *
 * After Stage 5 there are exactly three kinds of caller left, and the list is
 * short on purpose — every other member-hop read now owns a frozen column:
 *
 *  1. **`Subscription`** — MRR, the projection, renewals due, expiries, churn and
 *     retention cohorts. It gets no column BY PRODUCT DECISION: a transferred
 *     member's recurring revenue follows them. See the note at the top of this
 *     file; do not "finish the job" by freezing it.
 *  2. **`LoyaltyLedgerEntry` / `LoyaltyRedemption`** — a balance is whose points
 *     these are, and a member holds one account attached to one home branch.
 *     Nothing on the ledger names an order, so there is no place answer available.
 *  3. **The `avgLtv` numerator on the Members tab** — one `Payment` read (through
 *     `order.member`) and one `Invoice` read, deliberately kept live because their
 *     denominator is a live head-count of members homed here. The payment half has
 *     no frozen equivalent — `Payment.locationId` is the TILL, a different
 *     question — so freezing the invoice half alone would assemble one numerator
 *     from two vintages. Both halves move together or neither does.
 *
 * Everywhere else — every other `Invoice`, `Payment` and `Refund` read — this was
 * replaced by {@link atLocation} on the row's own column in Stage 5.
 *
 * **This is an attribution DECISION, not a fact recorded on the row**, which is
 * exactly why it lives in one function instead of at fifteen call sites. A
 * subscription is not sold "at" a branch anywhere in the schema; saying it belongs
 * to the branch its member calls home is a choice. It is defensible because it
 * partitions — `Subscription.memberId`, `LoyaltyLedgerEntry.memberId` and
 * `LoyaltyRedemption.memberId` are all NOT NULL, every member has exactly one home
 * branch, so summing the branches reproduces the gym total exactly once — and
 * because it is stable: a member's home branch changes when an operator moves
 * them, not when they drop in somewhere else on a Tuesday.
 *
 * It has to be the SAME choice everywhere or two cards on one screen disagree.
 * MRR on the Revenue tab, the active-member count under it, the retention cohorts
 * on the Members tab and the `revenue-summary` report all read this one function
 * for that reason.
 *
 * **The one lossy relation was `Invoice.member`, and only after a purge — it is
 * now the `Invoice.locationId` column's problem instead, unchanged in substance.**
 * `Invoice.memberId` is nullable and goes null when a member is hard-deleted,
 * because `Invoice` survives a purge by `SetNull` on purpose; the Stage 5 backfill
 * therefore had nothing to read for such a row and left it NULL. Either way the
 * invoice drops out of every branch figure while the gym-wide roll-up keeps it —
 * the residual class the reports' `NO_LOCATION_LABEL` bucket exists to catch, not
 * a routine outcome. It is also why `Invoice.locationId` may never be tightened to
 * NOT NULL: a purge can null it long after every write path stamps a branch.
 *
 * `and` carries the conditions the caller would otherwise have written on the same
 * `member` key — overwhelmingly `{ deletedAt: null }`. It exists because Prisma
 * takes ONE `member` key per `where`, so a caller cannot spread this beside a trash
 * guard of its own; passing the guard in keeps the branch rule in here rather than
 * inlined next to it.
 *
 * With no branch AND no extra conditions this spreads to `{}`, leaving the
 * caller's `where` — and its query plan — exactly as it was.
 */
export function memberAtLocation(
  locationId: string | undefined,
  and: MemberScope = {},
): { member?: MemberScope } {
  const member: MemberScope = { ...and, ...atLocation(locationId) };
  return Object.keys(member).length === 0 ? {} : { member };
}
