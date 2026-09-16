# Runtime role permissions — Plan

**Goal:** an operator picks a role and toggles what it can see and do, per gym. Denied means the nav item disappears and the page does not open — not merely that the API refuses.

**Decisions taken (2026-09-01):**

1. **The five existing roles stay.** No custom roles: `Role` is a Prisma enum, it rides in the JWT, and `ROLE_PERMISSIONS` is `satisfies Record<GymScopedRoleName, …>` — compile-time exhaustive. What becomes editable is each role's grant set, per gym.
2. **Denied hides the nav item and blocks the route.**
3. **Branch scope ships in the same feature** — this absorbs Stage 8 of the multi-branch roadmap.

## The matrix is View / Manage, not View / Create / Edit / Delete

30 of the 33 `Permission` values are already `X:read` + `X:write|manage` pairs. **No resource in this codebase distinguishes create from edit from delete at the authorization layer** — `MemberWrite` alone authorizes create, patch, deactivate, trash, restore, notes, email and tasks. Four columns would render four checkboxes writing to two booleans.

Delete mostly does not exist either: members, trainers, locations, packages, products, class types and plans all _deactivate_. A delete column would be inapplicable on most rows.

Three resources have **one** column, not two, and must render as a single wide toggle rather than a greyed second cell: Staff (`StaffManage` grants read and write together), Gym settings and member portal (`GymManage`), Reports and Dashboard (`ReportView`, no write action exists).

Six permissions are **self-service** — the subject is the actor, not a resource (`ClassBook`, `ReviewWrite`, `NotificationManage`, `SubscriptionManage`, `CreditPackManage`, `ProfileManage`). They must not appear in a staff role editor at all.

## Storage: a new `permissions` section on `Gym.settings`

`Gym.settings Json?` already holds 18 sections, is validated by `gymSettingsStoredSchema`, and has a `GymManage`-gated `PATCH /gyms/settings`. Adding a section gets persistence, the write path and the settings-form machinery for free — no migration, no new table.

```
permissions: {
  OWNER:        { grants: [...], branchScope: 'all' },      // locked, see below
  MANAGER:      { grants: [...], branchScope: 'all' },
  RECEPTIONIST: { grants: [...], branchScope: 'assigned' },
  TRAINER:      { grants: [...], branchScope: 'assigned' },
}
```

**Absent means "the built-in defaults"** — `ROLE_PERMISSIONS` stays the source of truth for a gym that has never touched the screen, so nothing needs backfilling and a gym that clears its overrides returns to sane behaviour.

**OWNER is a system role: locked, always every permission, always every branch.** This is the lockout guard, and it is why the reference design draws a padlock. Without it an owner can remove their own `GymManage` and no one can ever open the screen again.

## Resolution — and why the JWT staleness problem disappears

Today the whole chain is I/O-free after JWT verification: `role` claim → `TenantState.role` → `roleHasPermission(role, perm)` → static array. `roleHasPermission` is synchronous, pure, gym-unaware, and has ~150 call sites.

Resolving grants from `Gym.settings` **per request** (cached per gym, invalidated on the settings PATCH) means the JWT never carries permissions at all. It carries only the role, which changes rarely and already revokes the refresh-token family. So a toggle takes effect on the next request rather than in up to 15 minutes, and no token surgery is needed.

_(Separately worth fixing, not part of this: `tokenVersion` is signed into every token and bumped on role change but never compared in `verifyAccessToken`. The claim is decorative.)_

- **API:** `PermissionsGuard` gains a resolver. Its deny-by-default fallthrough is preserved exactly — a resolution failure (gym row missing, malformed blob, cache miss) must 403, never silently fall back to the static matrix.
- **Console:** the resolved set is fetched once in `app/(dashboard)/layout.tsx` and shared through context, the way `GymCurrencyProvider` already works. `usePermissions()` reads context instead of the static map.

## Blocking the route, given the Edge constraint

`apps/admin/middleware.ts` runs on the Edge and gates by **minimum role**, not permissions — `ROUTE_PERMISSIONS` + a `ROLE_RANK` ladder that exists nowhere else. It cannot read gym settings cheaply.

So the per-permission route gate belongs in `app/(dashboard)/layout.tsx`, which already fetches settings and runs before any page renders. Middleware keeps doing what it is good at: is this a staff session at all.

This also closes a real hole: **most admin routes have no guard today.** Only seven prefixes are listed; `/members`, `/trainers`, `/classes`, `/shop`, `/pos`, `/reports` and others open for anyone signed in as staff, and only the API stops the data. Without fixing that, unticking "view members" would leave the page opening onto errors — the feature would read as broken.

## Branch scope (absorbs Stage 8)

`branchScope: 'all' | 'assigned'` per role. `assigned` restricts the user to the branches on their `LocationStaff` rows — the join table Stage 6 already built.

Consequences that must be handled together, or the filter becomes a suggestion:

- The header switcher must not offer "All locations" to a restricted user, and must not let them select a branch they do not hold.
- `getActiveLocationId` must clamp to the allowed set rather than trusting the cookie or the URL.
- The API must validate a requested `locationId` against the same set, and force one when the scope is `assigned`. A filter enforced only in the console is not a boundary.

## Three real bugs found while auditing, fixed alongside

- **`MANAGER` and `RECEPTIONIST` cannot use checkout at all.** `checkout.controller.ts:56,68` requires `CreditPackManage` **and** `SubscriptionManage`; the guard is AND; only OWNER and MEMBER hold both.
- **POS sale is authorized by `BillingRead`** — a money-moving write gated by a read permission.
- **`/settings` admits MANAGER but its API requires `GymManage` (OWNER-only)** — a manager opens the page and collects 403s.

Also: `WorkoutRead` / `WorkoutWrite` are granted to four roles and gate nothing — no workouts controller exists. They must not appear in the editor.
