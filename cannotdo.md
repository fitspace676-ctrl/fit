# Reports we cannot build yet, and why

Status of the 35 reports specified for the admin Reports module, audited against
`packages/db/prisma/schema.prisma` and the API write paths.

|                                  | Count  |
| -------------------------------- | ------ |
| Shipped                          | **27** |
| Partial — builds, but incomplete | **5**  |
| Blocked — cannot be built at all | **7**  |

This codebase refuses fabricated figures (see the header of
`packages/types/src/reports.ts`): a report either aggregates rows that exist, or it does not ship.
Nothing below is a missing _query_. Every item is a missing _fact_ — the product never asks the
question, so the answer was never recorded.

Written in English to match the rest of `docs/` and the code comments.

---

## The short version

**Seven of the nine gaps are capture problems, not engineering ones.** The migration is a day's
work in each case. The open question is _who gets asked, when, and whether the answer is mandatory_ —
and that is a product decision, not a schema one. Until it is made, writing the schema is guessing.

---

## Blocked

### 1. Cancellation Reasons (Members)

**Missing.** No cancellation reason is captured anywhere — not in the schema, not in either UI.
`Subscription` (`schema.prisma:1769`) records _that_ someone left (`canceledAt`, `status`) and never
_why_.

**Consequence.** We can report how many cancelled and when. "Why" — the entire point of the
report — is unavailable.

**Needs.**

- `Subscription.cancelReason` (enum) plus an optional free-text note.
- The question asked at cancellation time on **both** paths: the staff console and the member portal.
- A reason list somebody has to author (price / moved away / injury / no time / switched gym / …).

**To decide.** The list itself, and whether answering is mandatory. Mandatory yields better data and
adds friction to a moment where the member is already unhappy.

**Size.** Small.

---

### 2. New Member Source (Members)

**Missing.** `GymMember` (`schema.prisma:608`) has no acquisition field. `Lead.source`
(`schema.prisma:2028`) exists, but **a lead is never linked to the member it became** — there is no
foreign key between them, so the CRM's source cannot be carried onto the membership.

**Consequence.** We cannot say where new members came from.

**Needs.**

- `GymMember.source` (enum: referral / walk-in / online / social / …).
- A choice on every signup path: the staff form, the public self-signup wizard, and POS.
- _Or_ a `Lead → GymMember` link, which only helps if every member starts as a lead. Today they do not.

**To decide.** The channel list, and who fills it in — staff, or the member themselves.

**Size.** Small.

---

### 3. Trainer Commission / Payroll (Staff)

**Missing.** `Trainer` (`schema.prisma:805`) carries no rate of any kind — not hourly, not
per-session, not a commission percentage. `PtSession` (`schema.prisma:1240`) carries neither a price
nor the member it was for; PT money sits in the `CreditPack` or package that paid for it and is never
tied back to the session delivered.

**Consequence.** Sessions delivered per trainer works today and ships as **Trainer performance**.
"Sessions × rate" does not.

**Needs.**

- A rate on `Trainer` (and probably a commission percentage beside it).
- `PtSession` linked to the member and to the payment or credit that covered it.
- Somewhere in the admin console to enter a rate. Without that form the column is always null and the
  report is permanently empty.

**To decide.** The compensation model — flat per session, a percentage of revenue, or hourly. The
schema follows from that answer; it cannot precede it.

**Size.** Medium.

---

### 4. Staff Shift Coverage (Staff)

**Missing.** `ShiftSlot` (`schema.prisma:2798`) is a recurring **weekly template**: `dayOfWeek` (0–6)
and `startTime`/`endTime` as plain strings. There is no record of a shift on a specific date, and no
record of anyone having worked one. Its `location` is also **free text**, not a `Location` foreign
key, so "by location" would group on typed strings.

**Consequence.** "Scheduled vs covered" has nothing to compare. Only the scheduled half exists.

This is already documented in the code — `apps/api/src/dashboard/dashboard-staff.service.ts:45`:

> **The tab has two halves that this service cannot join.** `Trainer` carries the availability that
> utilization divides by; `ShiftSlot` hangs off a staff `GymMember`. The schema has no foreign key
> between them, so no figure here crosses that line and no total spans both.
>
> **Nothing here claims a staff member worked.** `ShiftSlot` is the standing plan and
> `TimeOffRequest` the approved absence; attendance is not recorded anywhere.

**Needs.**

- A dated shift record, generated from the weekly template.
- A real `Location` reference instead of the free-text field.
- A way to mark a shift covered — which means the identity problem below has to be solved first.

**Size.** Medium to large, UI included.

---

### 5. Staff Attendance / Timesheet (Staff)

**Missing.** No clock-in or clock-out exists anywhere in the schema or the API.

**Consequence.** The report has no source at all.

**Needs.** A clock-event model, plus somewhere staff actually clock in — a tablet at reception, or a
manual "I worked this shift" confirmation.

**To decide.** Whether you want real clock-in/out, or whether staff confirming a shift afterwards is
enough. These are very different builds.

**Size.** Medium to large, UI included.

---

### 6. Payment Reconciliation vs TBC Bank (Revenue)

**Missing.** There is no bank integration. `Payment.provider` (`schema.prisma:1580`) is `stub` for
online purchases and `pos` for till sales; no real transaction reference and no settlement or payout
feed reaches the system.

**Consequence.** "Received vs settled" has no second side to compare against.

**Needs.** The real TBC integration first (so `providerRef` is populated), then the payout/settlement
file or API.

**Size.** Large. This is a project in its own right and belongs before the report, not beside it.

---

### 7. Tax / VAT Summary (Revenue)

**Missing.** No tax fields exist — no rate, no breakdown of an amount into net and tax.

**Consequence.** No tax report can be assembled.

**Needs.** The **rule** first: what rate, what it applies to, who is liable. Then the schema: a rate
on plans and products, and a tax split stored on the order.

**To decide.** You have already flagged that the Georgian requirements are not finalised. Designing
the schema before the rule is settled means designing it twice — the second time as a migration over
live financial data.

**Size.** Unknown until the rule is.

---

## Partial — ships, but incomplete

### Freeze / Hold History (Members) — time-sensitive

`Subscription` holds only the **current** freeze: `frozenAt`, `frozenUntil`, `freezeDaysUsed`
(`schema.prisma:1789`). Freezing again **overwrites** the previous values.

Past holds are therefore not merely missing — they are **being destroyed**. Every re-freeze erases a
record that no longer exists anywhere. A `SubscriptionFreeze` history table would stop the loss; it
cannot recover what has already gone.

This is the only gap on the list where delay actively costs data.

### Audit Log (Platform)

The `AuditLog` model exists (`schema.prisma:1667`) and is tenant-scoped, but the entire API writes to
it in **three places**:

- `apps/api/src/superadmin/superadmin.service.ts:94`
- `apps/api/src/superadmin/superadmin.service.ts:139`
- `apps/api/src/reviews/reviews.service.ts:262`

Member edits, price changes and staff role grants are never logged. The report builds and renders
almost empty. Needs write calls on the actions you actually care about, plus a retention decision.

### PT Sessions revenue (Classes)

Session **count** per trainer ships as **PT sessions**. Revenue does not, for the reason in item 3.
The report states this in its own description rather than showing a column of guesses.

### Revenue by Location (Revenue)

`Order.locationId` (`schema.prisma:1399`) is nullable and not every path fills it — the online wizard
only records a branch when it genuinely belongs to the gym. The report ships and groups the remainder
under **"No location"** rather than dropping it, so the rows still add up to the gym's total. On the
current seed that bucket is the largest one.

**To decide.** Whether a branch becomes mandatory on a sale, or whether "No location" stays as an
honest row.

### Refunds & Chargebacks (Revenue)

The refund half ships as **Refunds (accounting)**. There is no dispute or chargeback model, and no
provider sending dispute events — so chargebacks are absent, and the report says so in its
description instead of showing a column that is always zero. Only meaningful after item 6.

---

## The structural issue behind three of these

**`Trainer` and `GymMember` are two unlinked identities.** There is no foreign key between them.
`ShiftSlot.staffId` points at `GymMember`; classes and PT sessions point at `Trainer`. The same human
being is two rows that the schema cannot join.

Consequences:

- Hours scheduled and sessions delivered cannot be reported for one person.
- Payroll cannot combine class teaching with PT work.
- Shift coverage cannot be attributed to whoever taught the class.

Any serious Staff reporting needs this link before the individual gaps are worth closing.

---

## Suggested order

1. **Freeze history** — first, because every week of delay destroys more of it.
2. **Cancellation reason** and **member source** — both small, both answer a direct business question
   ("why do they leave", "where do they come from").
3. **`Trainer ↔ GymMember` link** — the precondition for anything else in Staff.
4. **Trainer rate**, then **actual shifts**, then **clock-in/out**.
5. **TBC**, then **chargebacks**. **Tax/VAT** whenever the rule lands.
