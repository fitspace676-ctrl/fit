# Multi-Branch (Location) — Roadmap

> **Status:** roadmap / architecture. Each stage below gets its own task-by-task plan doc before it is implemented. This document is the shared contract those plans are written against.
>
> **For agentic workers:** do not implement from this file. Implement from the per-stage plan it links to.

**Goal:** Make the admin console's top-bar location switcher real. Selecting a branch filters every page to that branch; selecting "All locations" shows every branch's data together.

**Product decision (2026-08-30):** branches are **fully separate operating units** — each has its own members, stock, staff, schedule, takings. The filter is therefore not a cosmetic lens over gym-wide data; it is the primary axis the product is organised around, second only to the tenant.

## Why this is not a small change

The switcher already exists (`apps/admin/components/top-bar.tsx:145-169`) and is inert: it holds its value in `useState` + `localStorage`, and **nothing reads it**. That is not an oversight to patch — `localStorage` is invisible to React Server Components, and every admin page is an RSC that fetches through `apps/admin/lib/api.ts`. The value structurally cannot reach a fetch.

Behind that wiring gap sit two larger ones:

| Layer          | State today                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI**         | Switcher inert. One page (`/classes/schedule`) has its own working `?locationId=`; POS has a third, separate selector. Three competing conventions for "all": `'all'`, `''`, `undefined`. |
| **API**        | Of ~40 admin list endpoints, **one** accepts `locationId` — `GET /admin/schedule` (`apps/api/src/classes/admin-schedule.service.ts:145`).                                                 |
| **Data model** | Of ~60 models, **four** can answer "which branch": `ClassTemplate`, `ClassInstance`, `Order`, `Lead`. A fifth, `CheckIn`, has the column but no relation and no write path.               |

Members, subscriptions, invoices, products/stock, trainers, services, PT sessions, shifts, loyalty and marketing have **no path to a Location at all**. Filtering them is not a query change; it is a schema change.

---

## Architecture

### 1. Where the selection lives

**Cookie is the ambient source of truth; `?locationId=` is an explicit per-page override.**

Rejected alternatives, and why:

- _URL only_ — every internal link on every page would have to carry the param, or the filter silently resets on navigation. ~25 pages, dozens of link sites.
- _Cookie only_ — a report or drilldown link could not encode its branch, and the back button would not restore one.

Cookie-primary gives correct behaviour on a bare navigation with zero link changes; the URL override keeps report/drilldown links shareable and lets `/classes/schedule` keep the param it already has.

New module `apps/admin/lib/active-location.ts`, following the `lib/sidebar-collapse.ts` precedent (a plain module, because the RSC layout and a `'use client'` component both import it):

```ts
/** Cookie the active branch is persisted under. */
export const ACTIVE_LOCATION_COOKIE = 'fit-admin-active-location';

/** Sentinel meaning "every branch, shown together". */
export const ALL_LOCATIONS = 'all';

/**
 * Resolve the branch a request is scoped to. An explicit `?locationId=` wins
 * (shareable links, drilldowns); otherwise the cookie; otherwise all branches.
 * An id that is not one of the gym's live locations degrades to ALL_LOCATIONS
 * rather than 404-ing — a deactivated branch must not brick a bookmark.
 */
export function resolveActiveLocation(
  param: string | undefined,
  cookieValue: string | undefined,
  locations: readonly { id: string }[],
): string;

/** The value to send to the API: `undefined` for "all branches". */
export function locationFilter(active: string): string | undefined;
```

Server helper `getActiveLocationId()` reads `cookies()` + the page's `searchParams` and returns `string | undefined`, so a page adds one line:

```ts
const locationId = await getActiveLocationId(searchParams);
const data = await fetchMembers({ ...query, locationId });
```

Client side, `ActiveLocationProvider` mirrors the `GymCurrencyProvider` pattern (`apps/admin/components/gym-currency.tsx:19`) — seeded server-side in `app/(dashboard)/layout.tsx` so there is no SSR flash, which today's `useEffect` restore does have.

On change the switcher writes the cookie, then `router.replace` (preserving other params) + `router.refresh()`.

**The `'all'` sentinel is unified.** `top-bar.tsx` keeps `'all'`; `schedule-board.tsx`'s `''` and the API's `undefined` are normalised through `locationFilter()` at exactly one boundary. `apps/admin/lib/api.ts:566` already drops empty strings, so no query string ever carries `locationId=all`.

### 2. Null attribution — backfill, do not special-case

Every existing `locationId` is nullable and most rows are null. Filtering would silently drop them and per-branch totals would not reconcile with the gym total.

Chosen policy: **backfill to a default branch, then require a branch on write.** Standard expand/contract:

1. `Location` gains `isDefault Boolean @default(false)`, one per gym.
2. Migration elects a default per gym (oldest `ACTIVE`; creates a `"Main"` branch for a gym that has none).
3. Every nullable `locationId` on existing rows is backfilled to that default.
4. Write paths start requiring a branch, so no new nulls appear.
5. Columns are tightened to `NOT NULL` in a follow-up migration, once the write paths have shipped.

Consequence: filtering is plain equality, no `OR locationId IS NULL` anywhere, and `reports.service.ts`'s `NO_LOCATION_LABEL` bucket (`apps/api/src/reports/reports.service.ts:771`) becomes a safety net rather than a routine outcome. `dashboard.service.ts:253-257`, which folds unattributed check-ins into `areas[0]`, is deleted — it exists only to paper over the nulls.

### 3. Enforcement — explicit, not ambient

`gymId` is enforced ambiently: `TenantMiddleware` → `AsyncLocalStorage` → a Prisma client extension that rewrites every `where` (`apps/api/src/common/prisma/prisma-tenant.extension.ts`).

**A location filter must NOT copy that.** The tenant extension works because every scoped model carries `gymId`. Location coverage is partial and will stay partial (a `SubscriptionPlan` is not _at_ a branch), so a blanket extension would either fail closed on models that legitimately have no branch, or silently no-op — both worse than an explicit param.

Location stays an **explicit query parameter**, following the one existing implementation (`packages/types/src/schedule-admin.ts:49` + `apps/api/src/classes/admin-schedule.service.ts:145`).

Two consequences to accept:

- Every list endpoint needs the param added by hand. Mechanical, but ~30 sites.
- A forgotten endpoint fails _open_ (shows all branches), not closed. Stage plans therefore carry an explicit endpoint checklist, and a lint-style test asserts every `list*QuerySchema` in `packages/types` either has `locationId` or is on a documented exemption list.

### 4. Indexing

Only one index on `locationId` exists today (`ClassTemplate`). Because the tenant extension _always_ injects `gymId`, every new index is `(gymId, locationId, …)` — a bare `locationId` index is the wrong shape for any query this codebase can issue.

Adding `locationId` to an existing `(gymId, createdAt)` range scan turns it into an index scan + heap filter, so the hot paths need composite replacements, not additions:

| Table                               | Index                                                             |
| ----------------------------------- | ----------------------------------------------------------------- |
| `class_instances`                   | `(gymId, locationId, startsAt)`                                   |
| `orders`                            | `(gymId, locationId, createdAt)`, `(gymId, locationId, status)`   |
| `check_ins`                         | `(gymId, locationId, checkedInAt)`                                |
| `payments` / `refunds` / `invoices` | `(gymId, locationId, createdAt)`                                  |
| `gym_members`                       | `(gymId, locationId, status)`                                     |
| `leads`                             | `(gymId, locationId, status)`                                     |
| `class_templates`                   | `(gymId, locationId)` — replaces the bare `@@index([locationId])` |

### 5. Denormalise the money tables

`Payment` and `Refund` reach a branch only through `Order`. Filtering revenue via `payment.order.locationId` is a relation filter — it cannot use an index and it is exactly the shape the revenue aggregates run in a loop.

Both gain a denormalised `locationId`, stamped from the order at write time. `Invoice` gains one too, which also closes the subscription-invoice gap (`Invoice.orderId` is nullable, so subscription invoices — the recurring-revenue majority — have no path to a branch at all today).

### 6. Selector reconciliation

Three location controls will exist. They are not the same thing and must not be collapsed blindly:

| Control                                    | Semantics                                        | Outcome                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top bar (`top-bar.tsx:195`)                | **Filter** — what data am I looking at           | Becomes the global one                                                                                                                                       |
| Schedule board (`schedule-board.tsx:1211`) | Filter, page-local                               | **Removed**; the global one replaces it. Its `?locationId=` contract is preserved, so existing links keep working                                            |
| POS "Selling at" (`pos-board.tsx:226`)     | **Write target** — which till am I ringing up on | **Kept.** A sale must be attributed to one branch even in "All locations" mode. The global filter seeds its default; it does not override a cashier's choice |

The POS control also has a hardcoded English label (`pos-board.tsx:228`) — fixed in passing.

### 7. Create forms inherit the active branch

When a branch is selected, every create form defaults its location to it. In "All locations" mode the field is required and empty, so nothing is created unattributed. Forms already carrying a location: class template (required), schedule instance, staff assignment, POS sale. Forms that will gain one: member, trainer, service, product stock, invoice, PT session.

---

## Stages

Each is independently shippable and leaves the console coherent.

### Stage 0 — Default branch + backfill _(no user-visible change)_

Foundation everything else assumes.

- `Location.isDefault Boolean @default(false)` + partial unique per gym.
- Migration: elect a default per gym; create `"Main"` for gyms with none.
- Backfill existing nulls on `ClassTemplate`, `ClassInstance`, `Order`, `Lead`.
- `LocationsService.defaultLocation(gymId)` helper.
- Seed (`packages/db/prisma/seed.ts:526`) reworked: today's `['Main Floor', 'Studio A']` are rooms, not branches, and carry no address/hours/phone. Replace with two realistic branches so multi-branch behaviour is actually exercised in dev.

**Risk:** `apps/e2e/tests/admin-core-flows.spec.ts:127` selects a location by index and its comment hardcodes "two locations"; `member-booking-checkout.spec.ts:171` relies on pickup defaulting to the first location. Both need updating with the seed.

### Stage 1 — The switcher becomes real

Wires the filter end to end against the data that _already_ carries a branch. After this stage the switcher visibly works on a meaningful subset, and the plumbing every later stage plugs into exists.

- `lib/active-location.ts`, `ActiveLocationProvider`, cookie + URL + `router.refresh()`.
- `top-bar.tsx` rewritten off `localStorage`.
- `locationId` added to: `listOrdersQuerySchema`, `cashReconciliationQuerySchema`, `reportQuerySchema`, `reportExportQuerySchema`, `reportDrilldownQuerySchema`, all six `dashboard*QuerySchema`, `listAdminClassTemplatesQuerySchema`. **Not** `listAdminClassTypesQuerySchema` — see the exemption register.
- Pages wired: `/`, `/classes`, `/classes/schedule` (page-local control removed), `/pos/orders`, `/pos/reconciliation`, `/reports`, `/reports/[metric]` + both export routes.
- Pages that cannot filter yet render an explicit "not split by branch" note rather than lying.
- `revenue-by-location-card.tsx` becomes redundant when a single branch is selected — hidden in that mode, kept for "All locations".

### Stage 2 — Members get a home branch — **DONE (2026-08-31)**

The single biggest unlock, and it landed as predicted: members gate subscriptions, invoices, loyalty, retention and most dashboard KPIs.

- `GymMember.locationId String?` with a real `Location` relation, `@@index([gymId, locationId, status])`, migration `20260830130000_gym_member_home_branch` backfilling every member onto their gym's default branch. **Not yet `NOT NULL`** — that tightening still waits on every write path requiring it.
- `createMemberSchema` / `updateMemberSchema` / `listMembersQuerySchema` / `MemberRow.locationName` all carry it. The roster, its pager, its tab badges and its plan-mix bar narrow together.
- Console: a branch column (all-branches mode only), a page-level branch filter that hands off to the header switcher, and a branch select on the member form.

**The attribution rule this stage established**, written once in `apps/api/src/common/location-filter.util.ts`:

> A figure about a **place** is attributed by the order's branch. A figure about a **person** is attributed by that person's home branch.

Both partition the gym — every order has one branch, every member one home branch — so per-branch rows still sum to the gym-wide roll-up with nothing double-counted. That partition property is the only thing that makes a definition this arbitrary defensible, and it is the test any future attribution hop has to pass.

**Two consequences worth carrying forward.** `Invoice` is attributed through the **member**, never the order, in every read — `Invoice.orderId` is nullable and subscription billing leaves it null, so a hybrid rule would make `outstanding` mean something different row by row. And the **Staff tab was deliberately left gym-wide** although it is now technically filterable: on a staff row `locationId` is a backfill artefact pointing every employee at the default branch, so filtering would report the whole payroll at one branch and none anywhere else.

### Stage 3 — Check-ins and occupancy — **DONE (2026-08-31)**

- `CheckIn.locationId` promoted from dangling scalar to a real FK with a `Location.checkIns` back-relation and `@@index([gymId, locationId, checkedInAt])`. Migration `20260831120000_check_in_location_branch`.
- `recordCheckInSchema` gains `locationId` (optional on the wire, defaulted to the gym's branch server-side — a front desk that cannot check anyone in is a worse failure than an under-specified arrival). `GET /admin/check-ins/today` and `/stats` gained query objects; `checkInRowSchema` carries `locationName`.
- Occupancy, `kpis.checkInsToday` and `recentCheckIns` narrow by branch. The `areas[0]` fold-in is **deleted**.

**The migration had to catch two classes of bad data, not one.** The column never had a constraint, so besides ids pointing at deleted branches it could hold ids belonging to _another gym_ — which a plain foreign key would happily accept, because that location does exist. Caught by joining on id **and** `gymId`; both classes are reattributed to the gym's default rather than deleted, because an arrival at an unknown branch is still an arrival.

**Where a branchless arrival goes, now that the fold-in is gone.** `onDelete: SetNull` means retiring a branch can make `locationId` NULL again. Such a person counts in the live headline (they really were in the building) but gets no bar in the per-branch breakdown, and is excluded entirely under a branch filter — they were not at the selected branch, and nothing knows where they were. A synthetic "No location" bucket was rejected: `DashboardArea` demands a capacity it has no honest value for.

Consequence, pinned by a test: gym-wide, the bars can sum to **less** than the live count (a branchless arrival) or **more** (one member, two swipes — the headline is distinct members, a bar counts arrivals). The fold-in bought exact reconciliation by attributing the whole gym's footfall to one named branch, which is the worse trade.

**Two reports read check-ins nested under a member and must NOT be filtered — Stage 3 turned "can't" into "won't", so both now say so in writing.** In `members-at-risk` and `member-roster`'s `lastVisit`, the check-in is a _predicate about the member_, not a row being listed. Filtering the nested `checkIns` would change **who appears in the output**: a member who trains twice a week at the other site would be manufactured into a churn risk. This is the sharpest example of why the place/person distinction has to be applied per read rather than per model.

One meaning does shift under the filter, and is documented at the call site: the `attendance` drill-down's `uniqueMembers` becomes unique visitors _to this branch_, so the daily `checkIns` column still sums to the gym total while the unique head-count deliberately does not — someone who uses both sites counts once at each door.

### Stage 4 — Per-branch inventory — **DONE (2026-08-31)**

Confirmed as real by the gym owner: each branch holds its own stock.

- New `ProductStock` — one row per (product, branch), carrying `stock`, positionally-aligned `variants` counts, and its own `lowStockThreshold`. `@@unique([productId, locationId])`. Migration `20260831130000_product_stock_per_branch`.
- **`Product.stock` survives as a roll-up**, not the source. The schema carries a drift-detection query; keeping the denormalisation honest is a standing obligation, not a one-off.
- `StockMovement` gained a real `locationId` **and** `orderId` finally became a real relation — a relation-less scalar is how branch attribution got lost in the first place.
- **The till now deducts from the branch it sold at.** This is a correctness fix, not a filter: a sale at one branch used to reduce another's shelf.

**⚠️ Deploying this requires a manual stock-take per branch.** The migration puts each product's whole existing count on the gym's default branch and starts the others at zero, because **the split is not derivable from any data we hold**. Any "smart" split would be invented.

**Three decisions worth carrying forward:**

- **Inventory aggregates, it does not expand.** One row per (product, variant) in both modes — with a branch, that branch's count; without, the gym roll-up, which is what the field always meant. Expanding to one row per branch would multiply the default view by the branch count, duplicate the axis the header switcher already owns, and make `total` mean something different from every other screen. The cost is stated rather than hidden: in all-branches mode you cannot see _where_ the stock is, which is exactly the blind spot the stock-take closes.
- **A sale at a branch with no stock row completes, draws nothing, records nothing.** Refusing would break the till at every non-default branch on deploy morning — an outage manufactured out of an admitted gap in the data. A negative would be foreign to every downstream reader (`resolveStockLevel` collapses it to "out", valuation turns it into negative money, and the manual adjust endpoint already refuses to write one). The refund path is the one asymmetry: returned units are physically on that shelf, so it upserts.
- **`adjustStockSchema.locationId` is REQUIRED**, unlike every other stage's optional branch. Stages 2 and 3 made it optional because refusing fails the wrong way round — a front desk that cannot check anyone in. Nothing about a stocktake works like that: it is a claim about a physical shelf, and a default would apply the satellite's count sheet to the flagship's row — a wrong count that reconciles perfectly and that nobody goes looking for.

**Bug fixed in passing:** `listLowStock` ignored `Product.lowStockThreshold` entirely and applied one flat number. The cushion is now a three-rung chain — branch → product → gym default — resolved in one place.

### Stage 5 — Money attribution

- Denormalised `locationId` on `Payment`, `Refund`, `Invoice`; `Subscription.locationId` for the branch a membership belongs to.
- Revenue/sales dashboards and reports filter on the scalar, not through `order`.
- `/payments/invoices` filtered.
- **Web + mobile:** `apps/mobile` accepts `locationId` but never passes it (`apps/mobile/lib/checkout.ts:31`), so every mobile purchase at a multi-branch gym is currently unattributed. Fixed here.

### Stage 6 — People and scheduling

- `Trainer.locationId`, `Service.locationId`, `PtSession.locationId`.
- `ShiftSlot.location` (free text) replaced with a real FK.
- `/staff`, `/trainers`, `/services`, `/classes/pt-calendar` filtered; "who's working now" per branch.
- `GymMember.assignedLocationIds` (a loose `String[]` with no FK integrity) replaced by a `LocationStaff` join table.

### Stage 7 — Catalogue and marketing exclusivity

Lower value, listed for completeness. Plans, packages, products, campaigns, promo codes, automation rules and segments gain an optional `locationId` meaning _branch-exclusive_; `null` keeps meaning _available at every branch_. Not a filter so much as a scoping capability.

### Stage 8 — Access control _(needs a decision before planning)_

"Branches are separate" implies a receptionist at branch A should not see branch B. That is not implemented and not implied by anything above: authorization today is strictly **tenant × role** (`packages/types/src/permissions.ts`), and `location:read` / `location:write` gate _managing the branch catalogue_, not _whose data you may see_.

Making the filter a **permission boundary** rather than a **convenience** requires: a staff→location membership, a new `TenantState` field, and a guard — and it changes the switcher's meaning (a restricted user must not be offered "All locations"). **Open question: is the filter a convenience or a security boundary?** Left unanswered deliberately; it does not block Stages 0–7.

---

## Cross-cutting

- **i18n:** `admin.common.locationLabel` and `admin.common.allLocations` already exist in both `en.json` and `ka.json` (`:86-87`). New strings follow the existing `admin.locations.*` block; every key lands in both files.
- **Georgian terminology is inconsistent** — `ka.json` uses both _ლოკაცია_ and _ფილიალი_. Settle on **ფილიალი** for the branch-as-business-unit and sweep the existing keys.
- **Tests:** the switcher has **zero** coverage today (`admin-shell.test.tsx:10` mocks `TopBar` out). Stage 1 adds `top-bar.test.tsx` and unit tests for `resolveActiveLocation`.
- **Cross-tenant leak — FIXED (2026-08-31), before Stage 3 as planned.** `TENANT_SCOPED_MODELS` was missing 13 models carrying `gymId`. 12 were added (52 of 53 now listed); it closed **three real leaks** of the same shape as the `Refund` bug the file already recorded: `reports.service.ts:1379` and `:1905` (both `ptSession.findMany` filtered on the time window **alone**, so trainer utilisation and the PT-hours roll-up summed every gym), `me-goals.service.ts:57` (`memberId` alone) and `credit-packs.service.ts:338` (which pack to draw a seat credit from, by `memberId` + status alone).

  **`AgentChatSession` was deliberately left out.** Its `upsert` probes `findUnique` _across_ gyms on purpose, so a client-minted id colliding with another tenant's returns a clean `404` instead of overwriting their row. Scoping it turns that probe into a within-gym miss, the upsert falls through to a create, and the primary key kills it — a `500` where a `404` belongs. Nothing leaks in exchange: every other query there pins `gymId` **and** `userId`, a per-user scoping this set cannot express. Listing it requires changing `AgentSessionsService` in the same commit.

  Watch item recorded during the fix: `reports/report-delivery.service.ts` is the one timer-driven job running against a _scoped_ service. It already opens its own `tenantStorage.run({ gymId })` per gym — which was incidental before and is now load-bearing.

- **`/packages/*` is an orphan route** — reachable by URL, absent from `NAV_ITEMS`. Confirm intent before spending effort on it.

---

## Exemption register

Stages 1, 2 and 3 are implemented. These are the endpoints that accept a branch and do **not**
narrow by it, or that were deliberately never given the param. Each is a decision,
not an omission — re-adding a filter here without first landing the schema change
named in the last column reintroduces a wrong number.

The shared `where` fragments live in `apps/api/src/common/location-filter.util.ts`
(`atLocation` for models that own the column, `orderAtLocation` for `Payment` /
`Refund` through their order). That module's header carries the same table at the
level of models rather than endpoints; keep the two in step.

| Surface                                         | Behaviour                    | Why                                                                                                                                                                                                                                                                                                           | Unblocked by                     |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `GET /admin/class-types`                        | param **removed**            | A `ClassType` is gym-wide catalogue with no location column. Its only path is `instances: { some: { locationId } }` — "has occurred at", not "belongs to". That hides a freshly created type from _every_ branch until first scheduled, and pins a type scheduled once at branch B to branch B forever        | Stage 7 (`ClassType.locationId`) |
| `GET /admin/reports` (catalogue)                | takes no param, deliberately | Which reports _exist_ does not change with the branch. An inert param invites someone to later make it hide the un-filterable ones                                                                                                                                                                            | —                                |
| `GET /dashboard/staff`                          | accepts, applies to nothing  | Now _technically_ filterable via `GymMember.locationId` and deliberately not: on a staff row that column is a backfill artefact pointing the whole payroll at the default branch. Work assignment is `assignedLocationIds`. `utilizationRate` would also still divide branch minutes by gym-wide availability | Stage 6 (`LocationStaff`)        |
| `GET /dashboard/classes` — `ptSessionsOverTime` | gym-wide                     | `PtSession` has no location column. Standalone series, so nothing on the tab blends PT with a class figure                                                                                                                                                                                                    | Stage 6                          |
| Reports: pt-sessions                            | gym-wide                     | `PtSession` has no branch                                                                                                                                                                                                                                                                                     | Stage 6                          |
| Reports: discounts-and-promotions               | gym-wide                     | `PromoRedemption.memberId` is null **by design** for an anonymous walk-in, so the member hop would drop exactly the walk-in promotions the report exists to price                                                                                                                                             | Stage 7                          |
| Reports: trainer-performance                    | gym-wide                     | Mixed scope: `ClassInstance` could filter, `PtSession` could not, and the ranking _adds_ the two columns — half a filter would order the table from two populations                                                                                                                                           | Stage 6                          |
| Drill-down `staff` — `rating` column            | never narrows                | A `Review` is written about a trainer and carries no branch. An average rating is a property of the person, not a quantity produced at a branch                                                                                                                                                               | —                                |

### Two visible behaviour changes — both resolved by Stage 2

Recorded because the console was built against them and then had to be un-built:

- **`revenue-summary` no longer returns `null`** for `mrr`, `activeMembers` and `arpm` under a branch filter. It did, because the recurring stock had no branch; the subscription now inherits one from the member holding it, so all three carry real per-branch figures. The console's explanatory note, dotted column headers and em-dash cells went with the nulls, and `GYM_WIDE_REPORT_COLUMNS` is now empty — kept as a live export, because the shape (branch-aware report, one blind column) will recur.
- **`kpis.totalRevenue` and `kpis.revenuePerMember` are no longer composites.** Both attributions now partition the gym, so the sum is a real branch P&L rather than this branch's takings plus everyone's recurring. One wrinkle is documented at the call site: a cross-branch drop-in purchase lands in the selling branch's ratio.

### The "not split by branch" annotations

No dashboard response schema has a field for this and none echoes `locationId` back, so the console carries the wording. Overloading an existing `null` was rejected — `null` on `utilizationRate` already means "no denominator". Nothing is zeroed to make a card look filtered.

Stage 2 retired two of the five outright, because they became false rather than merely stale:

- ~~Members tab~~ — retired; every figure on it now narrows.
- ~~Revenue tab~~ — retired; recurring, MRR, the projection and outstanding all follow the member.
- **Overview:** "Occupancy and check-ins are gym-wide." _(was "Occupancy, check-ins, members and subscriptions are gym-wide.")_
- **Staff tab:** "Not split by branch — trainers, PT sessions and shifts have no branch yet"
- **Classes tab:** "PT sessions are gym-wide."

Report-side, three reports still carry the generic `admin.common.notSplitByBranch` chip: `discounts-and-promotions`, `pt-sessions`, `trainer-performance`. `GYM_WIDE_DRILLDOWNS` is now empty — every drill-down narrows.

### Surfaced by Stage 0, not caused by it

- **Public `GET /locations` now returns empty hours.** `LocationsService.toHours` (`apps/api/src/locations/locations.service.ts:78`) flattens stored `hours` to `day → string` and **drops every non-string value**. The admin write stores the structured `{closed, open, close}` shape, which the reworked seed now also writes — so every day is dropped and the public card gets `{}`. The old empty `{}` hid this; the public summary and the admin record genuinely disagree on the shape. Needs an owner on the `apps/api` side.
- **`ensurePayment` in the seed is not idempotent across runs** — it guards on `createdAt: paidAt` where `paidAt` keeps the current time-of-day, so a re-run minutes later mints fresh membership orders. Pre-existing; the branch split stays balanced either way.
