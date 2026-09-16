# Multi-Branch (Location) — Roadmap

> **Status:** implemented; this document is now the record. Stages 0–8 are in code on `feat/multi-branch-location-filter` (PR #327). The architecture below is kept as it was argued; each stage section says what landed, when, and where the code departed from the plan.
>
> **Deploy:** `docs/runbooks/multi-branch-deploy.md`.

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

### 2. Null attribution — backfill, then decide per column

Every existing `locationId` was nullable and most rows were null. Filtering would silently drop them and per-branch totals would not reconcile with the gym total.

The plan was a standard expand/contract: elect a default branch per gym, backfill every NULL onto it, require a branch on write, and tighten every column to `NOT NULL`. The expand half landed as planned:

1. `Location` gained `isDefault Boolean @default(false)`, at most one per gym (partial unique `locations_gymId_default_key`).
2. Migration elects a default per gym (oldest `ACTIVE`; creates a `"Main"` branch for a gym that has none).
3. Existing NULLs were backfilled onto that default, stage by stage, each in its own migration.

**The contract half was narrowed, not completed.** Only two columns became `NOT NULL`: `ClassTemplate.locationId` and `CheckIn.locationId`, in migration `20260915120000_class_template_check_in_location_not_null` (`1cbcda86`, 2026-09-15). Both write paths already required a branch — a template is created with one, and `CheckInService.recordCheckIn` resolves an unstated branch to the gym's default. The migration re-runs the default election and a late backfill first (with a `NOTICE` if it touches anything), so a NULL written by an older build cannot fail the `SET NOT NULL`. It also switches both foreign keys from `SET NULL` to `RESTRICT`: a branch with a schedule or with arrivals is retired to `INACTIVE`, never deleted, and deleting a whole gym still cascades.

**Everywhere else a NULL is permanent and means something**, so tightening would be wrong rather than late:

| Column                         | A NULL means                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Order` / `Payment` / `Refund` | a sale with no desk behind it — a member-app purchase, a credit pack (`credit-packs.service.ts` writes `locationId: null`), a delivery                 |
| `Invoice`                      | stamped from the member at issue; NULL when the member had no home branch (purged, or their branch retired)                                            |
| `PtSession` / `ServiceSession` | no branch given and an ambiguous roster — the coach is not assigned to exactly one branch (`pt-sessions.service.ts`), so nothing honest to default to  |
| `ShiftSlot`                    | a shift is a plan; free text that named no branch of this gym was never defaulted (Stage 6)                                                            |
| `StockMovement`                | kept nullable with the rest (listed in the `NOT NULL` migration's header)                                                                              |
| `ClassInstance`                | historical rows were backfilled; every occurrence a template materialises carries the template's branch (`1188fe08`); the column itself stays nullable |
| `GymMember`                    | un-homed — a self-signup at a gym with no default branch, or a home branch deleted (`onDelete: SetNull`)                                               |
| `Lead`                         | backfilled in Stage 0, but no module in `apps/api` writes leads, so there is no write path to require a branch on                                      |

Consequence for filtering, unchanged from the plan: plain equality, no `OR locationId IS NULL` anywhere. A NULL row is absent from every branch-filtered read and present in the gym-wide one, and no caller folds it into a named branch. `dashboard.service.ts`'s `areas[0]` fold-in was deleted in Stage 3.

### 3. Enforcement — explicit, not ambient

`gymId` is enforced ambiently: `TenantMiddleware` → `AsyncLocalStorage` → a Prisma client extension that rewrites every `where` (`apps/api/src/common/prisma/prisma-tenant.extension.ts`).

**A location filter must NOT copy that.** The tenant extension works because every scoped model carries `gymId`. Location coverage is partial and will stay partial (a `SubscriptionPlan` is not _at_ a branch), so a blanket extension would either fail closed on models that legitimately have no branch, or silently no-op — both worse than an explicit param.

Location stays an **explicit query parameter**, following the one existing implementation (`packages/types/src/schedule-admin.ts:49` + `apps/api/src/classes/admin-schedule.service.ts:145`).

Two consequences to accept:

- Every list endpoint needs the param added by hand. Mechanical, but ~30 sites.
- A forgotten endpoint fails _open_ (shows all branches), not closed. Stage plans therefore carry an explicit endpoint checklist, and `packages/types/src/location-coverage.spec.ts` (`8d34fb13`) asserts every `list*` / `dashboard*` / `report*` `QuerySchema` in `packages/types` either has `locationId` or sits on `LOCATION_EXEMPT` with a reason. Both of its lists fail when an entry goes stale. `LOCATION_PENDING` is empty.

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

### Stage 0 — Default branch + backfill — **DONE (2026-08-31)**

Foundation everything else assumes. Landed in `c2da85b5` as planned:

- `Location.isDefault Boolean @default(false)` + partial unique per gym.
- Migration `20260830120000_location_default_branch_backfill`: elect a default per gym; create `"Main"` for gyms with none; backfill existing nulls on `ClassTemplate`, `ClassInstance`, `Order`, `Lead`.
- Seed reworked: `DOWNTOWN_BRANCHES` in `packages/db/prisma/seed.ts` turns the old rooms into real branches with address, phone and hours — `Main Floor` → **Rustaveli Flagship** (the default), `Studio A` → **Saburtalo Branch** (each entry keeps the old name as `legacyName`). Demo classes, members' payments and till sales are spread across the branches.

What came later, and why:

- **The default is resolved in one place** (`449909a5`, 2026-09-13): `findDefaultLocationId` in `apps/api/src/locations/default-location.ts`, fronted by `LocationsService.defaultLocation(gymId)`. Check-in, members, products and order stock each used to re-query it.
- **The default cannot be switched off (D3, `feeaf737`, 2026-09-14).** Deactivating the gym's ACTIVE default is refused with `409 LOCATION_IS_DEFAULT` — every "no branch given" path resolves to it. Moving it is an explicit act: `POST /admin/locations/:id/make-default`, for an ACTIVE branch only (`409 LOCATION_NOT_ACTIVE`); a concurrent switch loses with `409 LOCATION_DEFAULT_CONFLICT` rather than a `500`. It moves the flag, not the rows already attributed to the old default.

**Risk (recorded before implementation):** `apps/e2e/tests/admin-core-flows.spec.ts:127` selects a location by index and its comment hardcodes "two locations"; `member-booking-checkout.spec.ts:171` relies on pickup defaulting to the first location. Both need updating with the seed.

### Stage 1 — The switcher becomes real — **DONE (2026-08-31)**

Wires the filter end to end against the data that _already_ carries a branch. Landed in `c2da85b5` as designed in §1: `apps/admin/lib/active-location.ts` (cookie as the ambient source, `?locationId=` as the override, read by pages through `getActiveLocationId(searchParams)`), the `useActiveLocation` provider in `apps/admin/components/active-location.tsx`, and `top-bar.tsx` off `localStorage`, covered by `top-bar.test.tsx`. Since Stage 8 the switcher offers "All locations" only to an operator who may select it (`canSelectAll`).

Scope as planned:

- `lib/active-location.ts`, `ActiveLocationProvider`, cookie + URL + `router.refresh()`.
- `top-bar.tsx` rewritten off `localStorage`.
- `locationId` added to: `listOrdersQuerySchema`, `cashReconciliationQuerySchema`, `reportQuerySchema`, `reportExportQuerySchema`, `reportDrilldownQuerySchema`, all six `dashboard*QuerySchema`, `listAdminClassTemplatesQuerySchema`. **Not** `listAdminClassTypesQuerySchema` — its param was removed here and came back in Stage 7, through `availableAtLocation`.
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

### Stage 5 — Money attribution — **DONE (2026-08-31)**

Migration `20260831140000_money_location_branch` (`c2da85b5`).

- `Payment`, `Refund` and `Invoice` gained a denormalised `locationId`: payments and refunds stamped from their order, invoices from the member's home branch at issue, with no fallback to the default. Revenue and sales dashboards and reports read the scalar through `atLocation`, served by `(gymId, locationId, createdAt)`, instead of a relation filter through `order`.
- `/payments/invoices` filtered.
- **`Subscription` got no column. The plan said it would, and that was reversed.** The gym owner was asked directly whether a member who transfers branches takes their recurring revenue with them, and said yes. So MRR, the projection, renewals and retention follow the person live through `memberAtLocation`, while money already taken stays frozen on `Invoice.locationId` where it was earned. The argument is written out in `apps/api/src/common/location-filter.util.ts` ("Two rules coexist on purpose"), so nobody "completes" it by freezing `Subscription`.
- **Mobile.** The file this stage named (`apps/mobile/lib/checkout.ts`) no longer exists. The member app came under version control in `9d3e127d` with `apps/mobile/lib/api/checkout.ts` (`PICKUP` requires a `locationId`) and a location step in the join wizard (`components/checkout/join-state.ts`, `app/(join)/checkout.tsx`), which sends the chosen branch and picks it automatically when the gym has only one.

### Stage 6 — People and scheduling — **DONE (2026-09-01)**

Migration `20260901120000_people_scheduling_location_branch` (`d505a6ed`). Split along one line: **a person can work at several branches; anything that actually happens takes exactly one.**

- `PtSession`, `ServiceSession` and `ShiftSlot` gained `locationId` — events at a place, read with `atLocation`. `ShiftSlot.location` (free text) became a real FK: text that resolved to a live branch of the same gym moved into it, and the rest survives as `locationName` (`@map("location")`) — never defaulted.
- `LocationStaff` replaced `GymMember.assignedLocationIds` as the roster (`assignedAtLocation` / `staffAtLocation`). **The array is not dropped yet.** It is a deprecated shadow: both write paths set it in the same transaction as the roster, and nothing reads it (`staff.service.ts`), so the previous API image keeps working through the deploy window. Dropping it is a follow-up migration.
- **`Trainer` and `Service` got no column. The plan said they would.** A trainer is one-to-one with a staff `GymMember` that already carries a base branch and a roster; a third copy would be the answer nobody updates. A service is offered wherever its coach works. Both are derived through the roster.
- A new staff member is based (`GymMember.locationId`) at their single assigned branch, or at the gym's default when they have several or none (`5c803744`, 2026-09-15). A PT session with no explicit branch takes the coach's single roster branch, or stays NULL (§2).
- `/staff`, `/trainers`, `/services`, `/classes/pt-calendar` filtered. `GET /dashboard/staff` narrows five of its six reads and returns `utilizationRate: null` under a branch filter (see the register); `ptSessionsOverTime` narrows.

### Stage 7 — Catalogue exclusivity — **DONE (2026-09-01)**

Migration `20260901130000_catalogue_location_exclusivity` (`1202c683`).

- Six models gained an optional `locationId` meaning _branch-exclusive_, with `null` meaning _available at every branch_: `SubscriptionPlan`, `PackagePlan`, `Product`, `ClassType`, `PromoCode`, `LoyaltyReward`. No backfill and no `NOT NULL`, ever — the nullability is the feature. Filtered with `availableAtLocation` (NULL or this branch), never `atLocation`, which would empty the catalogue. `GET /admin/class-types` got its branch param back this way.
- **Forms** (`03d1b728`, 2026-09-14): the subscription plan, PT package, product, class type and promo code forms share `apps/admin/hooks/use-branch-exclusivity.ts`. A new item always starts on every branch, whatever the header switcher shows — seeding it with the active branch would make every new plan exclusive to whichever branch the operator happened to be looking at. An edit shows what is stored, including a branch outside the operator's scope.
- The promo code roster narrows to the codes a branch honours (`82c135e5`, 2026-09-15).
- **`Campaign`, `AudienceSegment`, `MessageTemplate` and `AutomationRule` got no column (D5).** A campaign is not offered at a branch, it is sent to people, and the audience criteria have no branch dimension. A column would narrow the list an operator browses while the blast still went to the whole gym. The honest fix is a branch predicate inside the audience criteria and the automation executor's entity scan, through `memberAtLocation` — targeting, and a separate change. `listCampaignsQuerySchema` and `listAutomationRulesQuerySchema` sit on `LOCATION_EXEMPT` with that reason. `ProductCategory` was refused too: a taxonomy label, not a thing sold.

### Stage 8 — Access control — **DONE (2026-09-02; reports 2026-09-15)**

**Decision: the filter is a security boundary, not a convenience.**

- Each staff role carries `branchScope: 'all' | 'assigned'` in the gym's role-permission settings (`packages/types/src/role-permissions.ts`, `9cd572ad`). `OWNER` and `SUPER_ADMIN` resolve to every permission and `all` whatever the stored settings say, so no settings blob can lock the owner out. An unrecognised role fails closed: no grants, `assigned`.
- The server enforces it in `PermissionsGuard.enforceBranchScope` (`apps/api/src/common/rbac/permissions.guard.ts`), which runs on every route, before pipes. For an `assigned` role: a branch named in the query, the route params or the body must be one the caller is rostered at (`403 BRANCH_FORBIDDEN`); a request that names none is forced onto their branch rather than falling through to gym-wide; a caller rostered nowhere is refused (`403 BRANCH_SCOPE_UNASSIGNED`). Self-service routes are untouched.
- The console does not offer a restricted operator "All locations" (`canSelectAll`).
- **Gym-wide reports** (`69036ff5`): a restricted operator has no gym-wide view and these reports cannot be narrowed, so they are dropped from that operator's catalogue, a preview or export is `403 BRANCH_FORBIDDEN`, and the console hides the cards.
- **Stated limit.** The guard clamps the branch _dimension_ of a request; it does not make per-record reads branch-aware. `GET /members/:id` names no branch and is not narrowed — that is a per-resource job.

### Public portal and loose ends (D7) — **DONE (2026-09-14 – 2026-09-15)**

- **Portal listings narrow to the member's home branch** (`f3b7a28b`). `GET /products`, `/class-instances`, `/services` and `/trainers` resolve their branch through `resolvePortalBranch` (`apps/api/src/common/portal-branch.service.ts`): an explicit `?locationId=` must be an ACTIVE branch of the same gym, else `404 LOCATION_NOT_FOUND` — one answer for unknown, inactive and another gym's, so a probe learns nothing. Otherwise a signed-in live `MEMBER` sees their home branch (every branch if they have none, or it is inactive); staff and anonymous visitors see every branch. A token that does not verify, or belongs to another gym, counts as anonymous rather than a `401`.
- The public service slots take the same resolution (`6418c44d`).
- `apps/web` forwards the member's session on those reads (`50a022a6`, `apps/web/lib/fetch-portal-listing.ts`), so a server-rendered page sees the member.
- **Self-signup files a home branch (D1, `2135d745`):** the ACTIVE branch the body names (else `400 LOCATION_NOT_FOUND`), otherwise the gym's default, otherwise NULL.
- The activity feed and loyalty redemptions narrow to one branch (`14a7c09a`).
- **Class template regeneration** stamps the template's branch on every occurrence it creates, and moves the attached future occurrences when the template changes branch; detached occurrences keep theirs, because their seats were booked there (`1188fe08`).
- The reports branch filter was restored onto the new catalogue — `docs/superpowers/plans/2026-09-02-restore-report-branch-filter.md`, CLOSED.
- `NOT NULL` on `ClassTemplate` and `CheckIn` (`1cbcda86`) — see §2.

---

## Cross-cutting

- **i18n:** `admin.common.locationLabel` and `admin.common.allLocations` already exist in both `en.json` and `ka.json` (`:86-87`). New strings follow the existing `admin.locations.*` block; every key lands in both files.
- **Georgian terminology — settled on ფილიალი** (`89ff963b`, 2026-09-15). `ka.json` no longer uses _ლოკაცია_. The word survives only outside the copy: a test fixture and a doc comment in `packages/ui-mobile`, and a comment in `apps/mobile/app/(tabs)/shop/cart.tsx`.
- **Tests:** the switcher has **zero** coverage today (`admin-shell.test.tsx:10` mocks `TopBar` out). Stage 1 adds `top-bar.test.tsx` and unit tests for `resolveActiveLocation`.
- **Cross-tenant leak — FIXED (2026-08-31), before Stage 3 as planned.** `TENANT_SCOPED_MODELS` was missing 13 models carrying `gymId`. 12 were added (52 of 53 now listed); it closed **three real leaks** of the same shape as the `Refund` bug the file already recorded: `reports.service.ts:1379` and `:1905` (both `ptSession.findMany` filtered on the time window **alone**, so trainer utilisation and the PT-hours roll-up summed every gym), `me-goals.service.ts:57` (`memberId` alone) and `credit-packs.service.ts:338` (which pack to draw a seat credit from, by `memberId` + status alone).

  **`AgentChatSession` was deliberately left out.** Its `upsert` probes `findUnique` _across_ gyms on purpose, so a client-minted id colliding with another tenant's returns a clean `404` instead of overwriting their row. Scoping it turns that probe into a within-gym miss, the upsert falls through to a create, and the primary key kills it — a `500` where a `404` belongs. Nothing leaks in exchange: every other query there pins `gymId` **and** `userId`, a per-user scoping this set cannot express. Listing it requires changing `AgentSessionsService` in the same commit.

  Watch item recorded during the fix: `reports/report-delivery.service.ts` is the one timer-driven job running against a _scoped_ service. It already opens its own `tenantStorage.run({ gymId })` per gym — which was incidental before and is now load-bearing.

- **`/packages/*` is an orphan route** — reachable by URL, absent from `NAV_ITEMS`. **Decision (D6): out of scope for multi-branch, left as it is.** It is capability-gated (`apps/admin/lib/route-guards.ts`, `Permission.PackageRead`), and its form carries branch exclusivity like the other Stage 7 catalogues.

---

## Exemption register

All stages are implemented. These are the surfaces that accept a branch and do **not**
narrow by it, or that were deliberately never given the param. Each is a decision,
not an omission — re-adding a filter here without first landing the schema change
named in the last column reintroduces a wrong number.

The shared `where` fragments live in `apps/api/src/common/location-filter.util.ts`:
`atLocation` for a column the row owns, `memberAtLocation` for the person hop,
`availableAtLocation` for the Stage 7 catalogue, and `assignedAtLocation` /
`staffAtLocation` for the roster. (`orderAtLocation` went in Stage 5, when `Payment`
and `Refund` gained their own column.) That module's header carries the same table at
the level of models, with this one mirrored beneath it; keep the two in step.

| Surface                                                          | Behaviour                                                            | Why                                                                                                                                                                                                                           | Unblocked by                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /admin/reports` (catalogue)                                 | takes no param, deliberately                                         | Which reports _exist_ does not change with the branch. An inert param invites someone to later make it hide the un-filterable ones                                                                                            | —                                                             |
| Reports: `discounts-and-promotions`                              | gym-wide (`GYM_WIDE_REPORT_KEYS`)                                    | `PromoRedemption` has no branch, its `orderId` is a relation-less scalar, and `memberId` is null **by design** for an anonymous walk-in — the member hop would drop exactly the walk-in promotions the report exists to price | a Stage 5-shaped attribution column, stamped at the till      |
| Reports: `audit-log`                                             | gym-wide (`GYM_WIDE_REPORT_KEYS`)                                    | An entry names an actor and a polymorphic target id, never a place; most of it is the platform operator acting on the gym as a whole                                                                                          | —                                                             |
| Both reports above, for a branch-restricted operator             | absent from the catalogue; preview and export `403 BRANCH_FORBIDDEN` | That operator has no gym-wide view, and these reports cannot be narrowed to a branch (`69036ff5`)                                                                                                                             | —                                                             |
| Drill-down `staff` — `rating` column                             | never narrows                                                        | A `Review` is written about a trainer and carries no branch. An average rating is a property of the person, not a quantity produced at a branch                                                                               | —                                                             |
| `GET /dashboard/staff` — `utilizationRate` (KPI and per trainer) | `null` under a branch filter                                         | The denominator is `Trainer.availability`, a weekly document with no branch dimension. The numerator would narrow and the denominator could not — one branch's minutes over every branch's availability                       | —                                                             |
| `GET /marketing/campaigns`, `GET /automation/rules`              | take no param, deliberately (D5)                                     | A campaign or rule is not offered at a branch; it reaches people. A list filter would look like targeting without being it (Stage 7)                                                                                          | a branch predicate in the audience criteria and executor scan |

**Left the register — these filter now:**

| Surface                                         | Since                                                             | How                                                                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /dashboard/staff` (its other five reads)   | Stage 6, `d505a6ed`                                               | `ClassInstance` / `PtSession` / `ShiftSlot` by column; `Trainer` / `TimeOffRequest` through the roster                                                      |
| `GET /dashboard/classes` — `ptSessionsOverTime` | Stage 6, `d505a6ed` (controller docblock corrected in `a77c6d27`) | `PtSession.locationId`                                                                                                                                      |
| `GET /admin/class-types`                        | Stage 7, `1202c683`                                               | `availableAtLocation` — a gym-wide type stays visible at every branch. The `/classes` console page does not send the branch yet (see the annotations below) |
| Reports: `pt-sessions`, `trainer-performance`   | Stage 6; re-applied on the new catalogue in `22b4bfd5`            | `PtSession` / `ServiceSession` / `ClassInstance` equality — one population per ranking                                                                      |

### Two visible behaviour changes — both resolved by Stage 2

Recorded because the console was built against them and then had to be un-built:

- **`revenue-summary` no longer returns `null`** for `mrr`, `activeMembers` and `arpm` under a branch filter. It did, because the recurring stock had no branch; the subscription now inherits one from the member holding it, so all three carry real per-branch figures. The console's explanatory note, dotted column headers and em-dash cells went with the nulls, and `GYM_WIDE_REPORT_COLUMNS` is now empty — kept as a live export, because the shape (branch-aware report, one blind column) will recur.
- **`kpis.totalRevenue` and `kpis.revenuePerMember` are no longer composites.** Both attributions now partition the gym, so the sum is a real branch P&L rather than this branch's takings plus everyone's recurring. One wrinkle is documented at the call site: a cross-branch drop-in purchase lands in the selling branch's ratio.

### The "not split by branch" annotations

No dashboard response schema has a field for this and none echoes `locationId` back, so the console carries the wording. Overloading an existing `null` was rejected — `null` on `utilizationRate` already means "no denominator". Nothing is zeroed to make a card look filtered.

Each was retired the moment it became false rather than merely stale. Where they stand now:

- ~~Members tab~~ — retired in Stage 2; every figure on it narrows.
- ~~Revenue tab~~ — retired in Stage 2; recurring, MRR, the projection and outstanding all follow the member.
- ~~Overview~~ — retired in Stage 3; occupancy and check-ins narrow.
- ~~Classes tab~~ — retired in Stage 6; the PT series narrows.
- **Staff tab** — the one dashboard note left (`BranchScope = 'staff'` in `apps/admin/app/(dashboard)/segments/branch-scope-note.tsx`), cut in Stage 6 from the whole tab to one figure: "Utilization is not split by branch — a trainer's availability covers their whole week, at every branch" (`admin.dashboard.branchScope.staff`). Shown only while a branch is selected.

Report-side, **two** reports carry the `admin.common.notSplitByBranch` chip — the `GYM_WIDE_REPORT_KEYS` pair, `discounts-and-promotions` and `audit-log`. `pt-sessions` and `trainer-performance` lost theirs in Stage 6. `GYM_WIDE_REPORT_COLUMNS` and `GYM_WIDE_DRILLDOWNS` are empty; the one blind drill-down column, `staff-performance` → `rating`, is marked through `GYM_WIDE_DRILLDOWN_COLUMNS`.

**One console gap, found while writing this record — closed the same day (`260a367b`).** The `/classes` page (class types) used to call `fetchClassTypes(query)` without the branch and show "Class types are a gym-wide catalogue — not split by branch." while a branch was selected, although the API had filtered class types through `availableAtLocation` since `1202c683`. The page now resolves the branch with `getActiveLocationId` like every other list, the note and its `admin.classTypes.branchScope` key are gone, and the header comment of `segments/branch-scope-note.tsx` describes only the one remaining blind figure (staff `utilizationRate`).

### Surfaced by Stage 0, not caused by it

- **Public `GET /locations` returned empty hours — FIXED (`4fa24c1b`, 2026-08-31).** `LocationsService.toHours` (`apps/api/src/locations/locations.service.ts`) used to keep only values that were already strings, so every structured `{closed, open, close}` day the admin write stores was dropped and the public card got `{}`. It now projects the structured week onto the public `day → display string` map, Monday first; a day never set stays absent rather than being filled from the form's defaults.
- **`ensurePayment` in the seed is not idempotent across runs** — it still guards on `createdAt: paidAt`, and `paidAt` comes from `daysAgo()`, which keeps the current time-of-day, so a re-run minutes later mints fresh membership orders. **Pre-existing, left:** the seed is local-only (`4be5f51c` refuses a production database) and the branch split stays balanced either way.
