# Mobile member app — rebuild plan

_Written 2026-08-30, after deleting `apps/mobile` + `packages/ui-mobile` (last good commit `a4efec2`)._
_Backend `apps/api` is frozen. Design source: `forma-core-app/.workstation/design/`._

This is a work-distribution plan. Each package below has an owner boundary (files it
may write), preconditions, and a done-criterion. Packages in different lanes never
touch the same file, so they can run concurrently.

---

## 1. Why the old app was deleted

Three independent foundations were wrong. None was a bug you could fix in place.

1. **Tokens ~6 weeks stale.** `ui-mobile` carried the July indigo palette; the design
   was repainted to "Lime Block" on 2026-08-18 (`bea6e41`). Four of nine ramps were a
   different colour system. The four that matched byte-for-byte were the four the
   design had _retired_.
2. **Broken contract.** Shop checkout called `POST /orders`, which does not exist, and
   `GET /orders/:id`, which requires `BillingRead` (member → 403). Purchase could never
   succeed. Zero unit tests, and the Maestro shop flow was green because it asserted UI
   state, not a completed order.
3. **Two design systems.** 9 screens NativeWind, 5 + tab bar on older inline styles.

Plus: home's membership card was hardcoded `ACTIVE`/`22/30`/`73%`; the cart lived only
in memory; the route guard sent every signed-out user to `/login`, making public
discovery unreachable and a signed-out purchase impossible; `POST /auth/logout` was
never called, leaving 30-day refresh tokens alive after sign-out.

## 2. Decisions already made

| #   | Decision                                                                                                                                                             | Rationale                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Tokens transcribed from `packages/astryx-theme/src/formacoreTheme.ts`, **not** `_design/tokens.json`                                                                 | Only formacoreTheme has light+dark, semantic slots, the radius ladder and WCAG reasoning. tokens.json has no light mode and still ships 6 retired ramps.                     |
| D2  | Octagon `clip-path` → radii                                                                                                                                          | RN has no clip-path. astryx already made this mapping for web (`formacoreTheme.ts:16-25`).                                                                                   |
| D3  | Server-side cart (`/cart/*` + `POST /cart/checkout`)                                                                                                                 | `CartIdentityMiddleware` scopes the cart by Bearer; the cookie is guest-only. Gains promo, pickup location, cross-device sync. Send `credentials: 'omit'`.                   |
| D4  | `gymSlug` sent at login from day one; v1 single-gym                                                                                                                  | No tenant-switch endpoint exists; switching = re-login. Structuring for it now costs nothing.                                                                                |
| D5  | JetBrains Mono bundled via `expo-font`; sans = system                                                                                                                | Mono numerals are the direction's signature accent at 26–34px.                                                                                                               |
| D6  | Icons: `react-native-svg` + dictionary ported from `packages/ui-web/src/icon.tsx`                                                                                    | One icon vocabulary across web + mobile. Artboard path data, web dictionary names. Stroke 1.9.                                                                               |
| D7  | Client throws `ApiError` on non-2xx                                                                                                                                  | TanStack Query's whole error model needs a rejection. The old non-throwing client is how a 404-on-every-call shipped unnoticed.                                              |
| D8  | Tabs: **Home · Classes · QR(action) · Shop · Profile**; Services + Trainers are stacks — _amended 2026-08-31: the QR action was removed, leaving four tabs. See §7._ | Decided by copy already in the catalogues, not taste — `common.nav` uniquely carries a `qr` label, and `member.profile.mobile.menu` lists trainers/training as Profile rows. |

## 3. Open decisions — must close before the stage that needs them

| #   | Question                                                                                                                                                                                                                                 | Needed by | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **CLOSED 2026-08-31 — no, and the screen was removed. See §7.** **Does a QR scanner side exist?** No member-scoped check-in endpoint exists at all (`/admin/check-ins` is `MemberWrite`). The QR is an identity claim, not a credential. | WP-9      | If no scanner integration exists, this screen does nothing — confirm before building. Either way, **do not ship the rotating countdown**: the nonce is cosmetic and a timer reads as "this expires, therefore it's secure".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q2  | **Fix `packages/config/tailwind.config.base.mjs` now or later?** Its `brand` is still indigo and `fontFamily.sans` still Inter. The drift guard fails on it immediately.                                                                 | WP-0      | Fix now. It is one file, it affects `@fit/superadmin` today, and `docs/design-parity-audit.md` claims T10.6 already closed it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Q3  | **Radius ladder shape.** Token and component agents proposed different ladders.                                                                                                                                                          | WP-1      | Ship 6 named steps + a numeric escape hatch (`SurfaceRadius = name \| number`), record the CUT\_\*→radius table in the token package, and let literal artboard radii (18/20/22/28/30) pass through as numbers. Do not force-snap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Q4  | **Android heading weight.** Roboto has no 800; ~40 nodes are `font-extrabold`.                                                                                                                                                           | WP-1      | Bundle Noto Sans Georgian variable (~180KB) for headings alongside JetBrains Mono. Otherwise display type reads visibly lighter on Android and the direction's headline weight is lost.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Q5  | **Dark-only v1?** All six artboards are dark; `mobile-profile.tsx:316` ships an appearance/system row.                                                                                                                                   | WP-6      | Dark only for v1 (`userInterfaceStyle: "dark"`), tokens still expressed as roles so light is a swap. Disable or remove that settings row until light exists. **REOPENED AND CLOSED 2026-09-09 — light mode is ON.** The role tokens made it the swap this row promised: `ThemePreferenceProvider` (`apps/mobile/providers/`) owns a two-value choice — light or dark, no "follows system", default dark — persisted on the device by `lib/theme-preference.ts` and offered as a `Segmented` on `/profile`, beside the language switch, exactly as the member portal's header does it. `app.json` moved to `userInterfaceStyle: "automatic"` so `Appearance.setColorScheme()` can carry that choice into the keyboard, alerts and sheets; a pinned `"dark"` would have made that call a no-op. |
| Q6  | **Services: tab or stack?** Copy says stack; the portal has it as top-level nav.                                                                                                                                                         | WP-6      | Stack. If a 5th tab is later approved, swap Shop→Services and move the cart badge to the Home header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 4. Lanes

Two lanes run concurrently after WP-0. They share no files.

- **Lane A — design system** (`packages/ui-mobile/**`): a dependency chain. One agent at a time per stage, but stages D/E/F fan out.
- **Lane B — data layer** (`apps/mobile/lib/**`, `apps/mobile/hooks/**`): pure TypeScript, no UI, no dependency on Lane A. Fully parallel from day one.
- **Lane C — screens** (`apps/mobile/app/**`, `apps/mobile/components/**`): needs both. Starts when A-stage-C and B-core land.

---

## WP-0 · Scaffold _(blocking — nothing starts until this lands)_

**Owns:** `apps/mobile/` root config, `packages/ui-mobile/` skeleton, root `package.json`,
`packages/config/tailwind.config.base.mjs`, `.github/workflows/`.

1. Expo app scaffold: expo-router, NativeWind 4, `tailwind.config.mjs` presetting
   `@fit/ui-mobile/tailwind`. **`content` must include `packages/ui-mobile/src/**`\*\* —
   a missed glob is the classic "the shared package renders unstyled" bug.
2. `packages/ui-mobile` skeleton + eslint with the **import-ban rule**: no `@fit/types`,
   `@fit/i18n`, `expo-router`, `@tanstack/react-query` under `src/**`. This rule is what
   keeps the package/app line where §7 draws it.
3. Native deps in **one** EAS dev-client build: `react-native-svg`,
   `react-native-safe-area-context`, `react-native-reanimated`, `expo-font`.
4. Close **Q2** — repaint `tailwind.config.base.mjs` brand → lime, sans → the real stack.
5. Restore `.github/workflows/mobile-smoke.yml` as nightly-only (never gates a merge),
   plus mobile steps in the existing `verify` job.

**Done:** app boots on device; `pnpm --filter @fit/mobile test` runs a real (empty) suite;
CI green.

---

## WP-1 · Token layer _(Lane A, after WP-0)_

**Owns:** `packages/ui-mobile/src/tokens/**`, `tailwind.preset.mjs`, `assets/fonts/**`.

Single literal source: `src/palette.mjs` (plain ESM — Tailwind's loader cannot import
`.ts`), imported by both the preset and the typed re-export. The old package asked humans
to keep two hand-written copies in sync; that instruction _was_ the bug.

- **Ship:** `ink` (warm charcoal, 11 stops), `brand` (lime, 11), `danger` (11), `white`,
  `transparent`. That is the entire palette.
- **Do not ship:** `accent`, `iris`, `success`, `warning`, `info`, `flame`. Web keeps them
  as aliases for legacy call sites; mobile has none, so `bg-iris-500` must be a build error.
  Replacements: success→lime, warning→ink, the rest→ink.
- Semantic light+dark map transcribed from `formacoreTheme.ts:212-325`, including the
  `--fc-*` vocabulary (tile/quiet/ghost/booked/glass/header/control/focusRing) and
  `scrim: rgba(19,19,18,0.85)`.
- Radii per **Q3**. Typography: absolute px for `letterSpacing` and `lineHeight` — RN has
  no `em`, and Georgian text ≥20px clips on Android without an explicit `lineHeight`.
- Fonts: JetBrains Mono 400/500/600/700 as four registered family names (RN does not
  synthesise weights for custom families on Android). Plus **Q4**.
- Shadows: 4 steps → iOS `shadow*` + Android `elevation`. RN gets one shadow per view,
  so each web two-layer shadow collapses to its ambient layer; the inset rim light
  becomes a hairline border on dark surfaces.

**Done:** `themeColors(isDark)` returns a complete map; the preset and the runtime map
provably derive from one literal; fonts load behind a splash gate.

---

## WP-2 · Drift guard _(Lane A, small, right after WP-1)_

**Owns:** `scripts/check-design-tokens.ts`, `packages/ui-mobile/src/tokens/*.spec.ts`.

Five diffs, modelled on the existing `scripts/check-tailwind-guardrail.ts`:
palette vs `_design/tokens.json` (brand/ink/danger only — that file is stale for
everything else); retired ramps absent; `tailwind.config.base.mjs` brand correct;
every semantic value is a palette member or an allowlisted rgba; mobile icon dictionary
matches `ui-web`'s for shared names.

**Done:** the July→August drift would have failed CI in one line.

---

## WP-3 · Data layer core _(Lane B, parallel with WP-1)_

**Owns:** `apps/mobile/lib/env.ts`, `lib/http/**`, `lib/auth/**`, `lib/query-keys.ts`, `lib/query-client.ts`.

- **`ApiError`** with `{status, code, details, requestId, retryAfterSec}`. Throws on
  non-2xx (D7), with two documented exceptions: `POST /cart/checkout` 409/422 return a
  discriminated result so `newPrices`/`removedItems` survive the exception filter, and
  `GET /cart` signed-out resolves to an empty cart.
- **401 → refresh → retry once**, de-duplicated. Three concurrent 401s must produce
  **one** `POST /auth/refresh` — rotation revokes the consumed token and a second
  concurrent spend is treated as reuse and **kills the whole family**. Second 401 →
  clear keychain + `queryClient.clear()` + throw.
- Read the token from the sync in-memory snapshot, not the Keychain, on every request.
- 15s timeout via `AbortSignal`; retry policy never retries a 4xx.
- **Query keys: `gymId` at index 1 on every gym-scoped key.** Switching gym = re-login,
  so a stale cache from gym A under gym B is a data-leak-shaped bug.
- `onlineManager` ↔ NetInfo and `focusManager` ↔ AppState — ~20 lines, non-negotiable
  on mobile; without them `refetchOnWindowFocus` is a no-op.

**Done:** unit tests green for the concurrency, refresh-recursion, and throw behaviours.

---

## WP-4 · Auth & session _(Lane B, after WP-3)_

**Owns:** `lib/auth/**` (completing WP-3's skeleton), `lib/api/auth.ts`, `hooks/useSession.ts`, `hooks/useActiveGym.ts`.

- SecureStore + in-memory snapshot + `useSyncExternalStore`. Store `accessTokenExp` so
  the client refreshes ~60s early instead of paying a 401 every 15 minutes.
- `login({email, password, gymSlug})` — slug always in the signature (D4). The API
  silently ignores an unknown slug, so the **client** is the only place a
  "asked for X, got Y" mismatch can be detected: log to Sentry, don't block.
- **Logout closes the leak:** push-unregister → `POST /auth/logout` → clear + `queryClient.clear()`.
  Both network calls best-effort with a 5s cap, but _attempted_.
- Social sign-in: `POST /auth/google` / `/auth/apple` take an ID token (native-friendly).
  Neither accepts `gymSlug` — social always lands on the primary gym. Capture Apple's
  `fullName` on first authorization or the account is nameless forever.

---

## WP-5 · Primitives _(Lane A, after WP-1)_

**Owns:** `packages/ui-mobile/src/primitives/**`.

Order: `Icon` → `Text`/`Heading`/`Eyebrow`/`Mono`/`Money` → `Surface`/`Card` →
`IconButton` → `Pill`/`CountBadge`/`DotBadge` → `Divider`/`Avatar`/`Spinner`/`Skeleton`.

**`Text` is first-class and non-negotiable.** The old package had no text primitive — and
RN `Text` inherits nothing — so every screen hand-wrote `{fontSize, fontWeight, color,
letterSpacing}`; having done that, the package's `Card` bought nothing and a local kit
was born. This is the root cause of "zero consumers", and `Text` in Stage A is the fix.

`IconButton` is the highest-frequency element in the design (~20 instances, 6/6 screens).
Its 36px and 40px variants violate the 44px minimum — `hitSlopFor(size)` is applied by
the component, never left to call sites.

**Done:** a `/dev/kit` route reproducing the gallery's Foundations group.

---

## WP-6 · Controls + frame + navigation _(Lane A)_

**Owns:** `src/forms/**`, `src/layout/**`, `src/navigation/**`.

`Button` (6 variants × 3 sizes, `busy` ≠ `disabled`), `Chip`, `Switch`, `QtyStepper`,
`OptionRow`, `TextField`; then `Screen`/`ScreenHeader`, `SectionHeader`, `ScrollRail`,
`TileGrid`, `FloatingTabBar`.

Two concrete traps found in the artboards:

- **The capsule overflows the smallest device.** 5 × 56 + 2 × 8 = 296 against
  320 − 40 = 280 on an iPhone SE. Not visible on the 390pt artboard. Shrink capsule
  padding to 4 (or items to 52) below 340pt.
- **Safe area.** `bottom-6` is 24 from the screen edge — on a home-indicator phone that
  overlaps the indicator. Compute `insets.bottom > 0 ? insets.bottom + 4 : 24`.
  `useTabBarInset()` must return 128 at inset 0, matching every artboard's `pb-32`.

**Done:** five empty tab routes with the real floating capsule, correct on a notched and
a non-notched device. Unblocks Lane C.

---

## WP-7 · Domain fetchers + query hooks _(Lane B, after WP-4)_

**Owns:** `lib/api/*.ts`, `hooks/queries/**`, `hooks/mutations/**`.

Screens may import from `hooks/`, **never** from `lib/api/`. `lib/api/*` never imports
React — that boundary is what makes the fetchers testable with a `fetch` mock and no
renderer, and it is the architectural rule that prevents a repeat of zero coverage.

The **invalidation matrix** is the deliverable, one table-driven test per mutation.
Gaps the old app had: booking must invalidate credit packs (a seat can be drawn from a
pack); freeze/unfreeze must invalidate classes and bookings (a frozen membership makes
booking fail with 409); `POST /checkout` must invalidate membership + credit packs +
catalogue + bookings. No screen may call `.refetch()`.

---

## WP-8 · Data display + feedback _(Lane A, fan-out: two agents)_

**8a owns** `src/data-display/**`: `StatTile`, `DurationBadge`, `ListRow`, `FactTile`,
`PersonRow`, `ProductRow` (3 layouts), `DayCell`, `AchievementTile`.

**8b owns** `src/feedback/**`: `ProgressBar`/`OccupancyMeter`/`ProgressRing`/`Pips`,
`Alert`, `EmptyState`, **`Sheet`**, `ConfirmSheet`, `ToastProvider`.

**`Sheet` is the long pole — spike it during WP-6.** Use RN `Modal` (gives Android
hardware-back via `onRequestClose`, renders above the navigator, and `statusBarTranslucent`
lets the scrim reach the status bar). Reject `@gorhom/bottom-sheet`: it needs
gesture-handler, which is not in the dep set, and that is a second native gesture system
plus an EAS rebuild for one drag affordance. Animate with Reanimated only; keep the
Modal mounted through the exit animation. Drag-to-dismiss is out of scope for v1 — so
the grabber must be `accessible={false}`, or it announces an affordance that does not exist.

`occupancyTone()` is exported as a pure function: the ≥100 → danger, >85 → ink, else
accent thresholds appear in three places in the design and must not be able to disagree.

---

## WP-9 · Composites _(Lane A, after 8)_

**Owns:** `src/composites/**`.

`ClassCard`, `MembershipBlock`, `CheckInPass`, `QrCode`.

These four are in the package because each appears on **more than one screen with
identical visuals** — the exact condition that, unmet last time, produced two tab bars.

**The line:** a component belongs in the package iff it can be fully specified by the
artboards without naming a backend field, a route, an i18n key, or a query hook. Every
label — including every `accessibilityLabel` — is a required prop. No component ships copy.

**Salvage:** `QrCode.tsx` and `lib/qrcode.ts` are **promoted** (encoder unexported).
Keep the `View` renderer rather than switching to SVG: it snaps every module to an
integer pixel, and a half-pixel-soft module edge is the classic cause of a code that
scans in the office and fails at the gym door. `ToastProvider` keeps its API, gets a new
skin (lime pill, not a rectangle) and moves to bottom-anchored above the nav.
`buildCheckInPayload` stays app-local — it encodes a URI scheme, which the package must
not know. Fix the `fitspace://` vs `fit://` mismatch with one shared constant.

---

## WP-10..15 · Screens _(Lane C — 28 routes, staged)_

Each stage ends at something runnable on a device.

| Stage        | Screens                                                                                             | Demo                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| C1 Auth      | login, register, forgot, reset, verify                                                              | sign in, kill, relaunch still signed in, reset from an emailed link                    |
| C2 Shell     | tabs + QR modal + onboarding + settings                                                             | show a real member code; switch to Georgian and see the whole app in ka                |
| C3 Discovery | classes, class detail, trainers ×2, services ×2, booking                                            | browse and book **signed out**, hit the prompt at the CTA, sign in, land back and book |
| C4 Commerce  | shop, product, cart, order, join checkout ×2                                                        | buy a membership from a cold start with no account                                     |
| C5 Account   | home, bookings, membership (+change-plan/freeze/credits), profile, billing, goals, notifications ×2 | a real membership meter — not `22/30`                                                  |
| C6 Polish    | social sign-in, SSE occupancy, offline, push, a11y sweep                                            | nightly Maestro green                                                                  |

**Route guard rewrite.** The old guard's zone table was wrong. Replace with a
`ROUTE_POLICY` map → pure `resolveRedirect(segments, session, isComplete)`, so it is
unit-testable. Signed-out on a public route must return `null`; an `auth` route
redirects to `/login?next=<path>` so an `auth-soft` CTA returns the user where they were.

**Home is built last on purpose.** It aggregates eight endpoints, and building it first
is exactly how the hardcoded `ACTIVE / 22/30 / 73%` happened. Every section gets its own
loading/empty/error — never one page-level spinner.

---

## WP-16 · i18n _(Lane C, parallel)_

**~190 keys of ka+en already exist for screens that were never built.** Six namespaces at
full parity — `notifications` (21), `qr` (12), `settings` (25), `onboarding` (9, a complete
3-slide script), `training` (31), `billing` (31) — plus `member.profile.mobile` (57 keys,
describing the mobile Profile down to `stats.dayStreak`). Someone wrote the mobile IA into
the catalogues. New authoring needed: ~25–40 keys.

Keep the salvaged `I18nProvider` shape. Three amendments: a `plural(key, count)` helper
selecting `…One`/`…Other` siblings (or "1 sessions left" ships); typed `MessageKey` so a
typo fails `type-check` instead of rendering a raw key; and **never call `Intl`** — the
catalogues exist because browsers ship no Georgian locale data, and Hermes' `Intl` is
smaller than a browser's. Enforce with a lint rule banning `new Intl.` and `toLocale*`.

**Bundle hygiene:** `admin` is 2410 of 3670 keys (66%) and would ship on the phone. Add a
`@fit/i18n/member` entry and ban the full `messages` import in `apps/mobile`.

---

## WP-17 · Contract test _(cross-cutting, land with WP-7)_

The defect class: calling a path that does not exist, or that a MEMBER cannot call.
`POST /orders` was both.

Generalise the existing `scripts/check-controller-guards.ts` (already an AST walker,
already in CI) into a route manifest of `{method, path, auth}`. Funnel every mobile
request through one typed `ENDPOINTS` table — enforced by a lint rule banning `fetch(`
outside the api client — and assert: every entry exists in the manifest, and every entry
is `@Public()` or needs only permissions MEMBER holds. `POST /orders` fails both.

Nightly, add a live smoke against the seeded API: any 404 or 403 fails. That catches
drift the AST cannot see.

---

## 5. Test strategy

**Two runners, one hard boundary.** Vitest for everything that does not import
`react-native` — consistent with every other package in the repo (api, web, types, utils,
ui-web, i18n) and it runs in the existing CI step with zero new wiring. `jest-expo` +
`@testing-library/react-native` only for render tests: RN ships Flow-typed source Vitest
cannot parse, and NativeWind's supported test path is the jest-expo preset.

If a "pure" module needs `react-native`, that is a design smell to fix, not a reason to
move it across the boundary.

**Must have unit tests:** the api client's concurrency and refresh behaviour; the JWT
decoder; **`lib/qrcode.ts`** — 585 lines of hand-rolled GF(256) arithmetic with golden-vector
tests, the single most valuable test in the package; the deep-link rewriter (including
stripping the web `[locale]` segment); `resolveRedirect`; the invalidation matrix;
`occupancyTone`; `clampRadius`; `hitSlopFor` (as a property: `size + 2×slop ≥ 44`).

**Render tests assert the a11y contract, not pixels.** One cross-cutting sweep over every
barrel export checking `testID` reaches the root, `accessibilityRole` is set, and
`minHeight + hitSlop ≥ 44`. That single test catches the class of regression that shipped
an emoji tab icon into a "no emoji" design system.

**E2E stays Maestro, nightly.** Locale-independent by construction — every selector is a
`testID`. Rewrite `04-shop-checkout` against `POST /cart/checkout` and assert a real
`orderId`; it was green while calling a route that did not exist.

## 6. Definition of done, per screen

1. Loading — skeletons, per section where the screen fans out. 2. Empty, with a next
   action. 3. **Error with a working retry** — the box the old app skipped on home, QR and
   profile. 4. Offline. 5. Signed-out branch on public/auth-soft routes, returning via `next=`.
2. Zero hardcoded strings; both locales; plurals via the helper; no `Intl`.
3. Labels, roles, ≥44px targets, one `role="header"`, `accessibilityViewIsModal` on sheets.
4. Render tests for every branch in 1–5. 9. Every endpoint in `ENDPOINTS` and passing the
   manifest test. 10. Tokens only — no literal colours, spacing or radii — and the `testID`s
   its Maestro flow needs.

---

## 7. Decisions taken during implementation

### D9 — the shop cart is sign-in-gated on mobile; the join funnel is not

WP-7 raised this as a tension with §1, which lists "a signed-out purchase impossible"
among the old app's defects. It is not a contradiction — two different purchases were
being conflated:

- **The join funnel** (buying a _membership_) is `(join)/checkout` → `POST /auth/signup`
  → `POST /checkout`. Signup precedes the charge, so the buyer is authenticated by the
  time money moves. A signed-out user can start and finish it. **This still works**, and
  it is what §1 was about — the old route guard bounced them to `/login` before they
  could begin.
- **The retail cart** (buying a shaker) is `@Public()` on the API, but a _guest_ cart is
  identified by the `fit_cart_sid` cookie. RN has no cookie jar and D3 sends
  `credentials: 'omit'`, so on mobile the cart is Bearer-scoped only.

**Decision:** accept it. The shop sits inside the tab bar, i.e. behind the shell anyway,
and the add-to-cart CTA prompts sign-in and returns via `?next=` — the copy already
exists as `member.cart.signInToAdd`. Building cookie-jar support to allow an anonymous
shaker purchase is real work against the grain of the platform for a marginal flow.

### Product constraints the API imposes — found by WP-7, not previously known

These are not bugs and not backend work (the backend is frozen). They bound what the
screens can offer, and each would otherwise have been discovered mid-screen:

| Wanted                      | Reality                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cancel membership" button  | No member route. `GetMeSubscriptionResponse` exposes `cancelAtPeriodEnd`, but the only member routes are enroll / freeze / unfreeze; cancellation is `admin/subscriptions` (`BillingManage`). **Cannot be built.**                                                  |
| Release a booked PT session | No member route. `admin/service-sessions/:id/cancel` is `ClassWrite`. A member can book a session but not cancel it.                                                                                                                                                |
| Notification preferences    | **No preferences controller exists at all** — only inbox + push-token. The deleted app shipped a settings screen that called nothing real and stored toggles in AsyncStorage. Do not rebuild that illusion: either drop the screen or make it plainly device-local. |
| Invoice list endpoint       | Only the PDF route. The list arrives inside `GET /me/subscription`.                                                                                                                                                                                                 |
| Member check-in             | Confirms Q1. Only `@Controller('admin/check-ins')`, `MemberRead`/`MemberWrite`. The QR screen has nothing to talk to — ship it as a member card, not a credential.                                                                                                  |

### Follow-ups owed to WP-3's `lib/query-keys.ts`

1. **No `services` key factory.** WP-7 needed one for `GET /services` and refused to invent
   a sanctioned-looking key; it exports `SERVICES_KEY_GAP(gymId)` from
   `hooks/queries/useServices.ts`, named so it cannot be mistaken for the real thing.
   Move it into `queryKeys` as `services: (gymId) => ['services', gymId]`.
2. **Four resources have no root factory.** `notifications`, `products`, `serviceSlots`
   and `myServiceSessions` return a _filter bucket_, so invalidating the factory's key
   misses sibling buckets — including the unread badge, i.e. exactly the "badge says 3,
   inbox is empty" bug the factory's own doc warns about. WP-7 added `resourceRoot(key)
= key.slice(0,2)`, derived from the factory rather than hand-written. Promote it.

### Correction — `OptionRow` / `ListRow` were the same component

The plan assigned one artboard element (`mobile-profile.tsx:62-104`, the settings menu
row) to two work packages: WP-6 as `OptionRow` and WP-8a as `ListRow`. Both agents built
it. WP-8a spotted the fork, matched every colour to the other so the two could not
diverge while both existed, and flagged it rather than shipping a silent duplicate.

`OptionRow` has been deleted; `ListRow` survives — the conventional name, and it belongs
in `data-display/` rather than `forms/` since it is a display row, not a form control.

Worth recording _why_ the plan produced this: `OptionRow` was originally specified as a
**radio group** (the 3-up freeze-duration picker, the wrapped filter chip groups), and
the WP-6 agent built a menu row instead — correctly, because that is what the artboard
at that line shows. The brief named the wrong comp. The radio-group need is covered by
`Segmented` (equal-width) and by `Chip` in a wrapping layout (filters), both shipped.

**Lesson for the remaining packages:** when two briefs cite the same artboard line range,
they are the same component. Check the citations across work packages before splitting.

### The QR encoder had two shipping-grade bugs

Found by WP-9 while writing the golden vectors the plan asked for — not by reading the
code, which had been reviewed twice and called "sound". Both were in `lib/qrcode.ts` as
the deleted app shipped it, and both are invisible in a screenshot:

1. **`drawCodewords` never wrote column 0, and wrote column 4 twice.** Nayuki mutates the
   loop variable where the two-module column pair straddles the vertical timing column;
   the port expressed it as `const col = right === 6 ? 5 : right`, leaving `right` on the
   even ladder 6 → 4 → 2. Every symbol the app ever drew carried ~3 corrupt trailing
   codewords. At level M on a short payload that sits inside Reed–Solomon's budget — so
   it scans on a desk with **zero** margin left for glare, blur or a cheap camera.
2. **`drawVersionInfo` was only ever called with `reserveOnly: true`.** Every symbol at
   version 7+ shipped 36 blank version modules. A Georgian name plus a check-in URI is
   already version 7+.

Verified against an independent implementation (`qrcode@1.5.4`): **before, 224/224
payload × level × mask combinations differed; after, 224/224 match exactly.**

Two things worth carrying forward from this:

- **A parity audit cannot see it.** A wrong QR code looks exactly like a right one. The
  only instruments that catch this class are golden vectors and a second implementation.
- **The most valuable vectors were the ones about our own data.** `chooseVersion(272,'L')`
  pins the 8→16-bit character-count widening at v10 — a port using one width everywhere
  passes every small-payload test and truncates long ones. And "6 Georgian characters =
  18 bytes" catches sizing by `text.length`, which overruns _only_ in the app's primary
  language, where an English-speaking developer would never see it.

### D10 — which copy family each screen reads

The catalogues carry two parallel families and WP-16 correctly refused to guess: a
top-level `classes`/`trainers`/`shop`/`services` (web's) and a `member.*` set. Choosing
per-string is how the two drift, so the choice is made **once per screen**:

| Screen                        | Namespace                                            | Why                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes list                  | `member.classes`                                     | Carries `periods` (morning/afternoon/evening — the artboard's own grouping), `today`, `prevWeek`/`nextWeek`, and the tri-state `book`/`booked`/`waitlisted`/`full`/`spotsLeft`. This _is_ the mobile card. |
| Class detail                  | `classes.detail` (+ `classes.modal`)                 | `member.classes` has **no** `detail` block at all; the top-level one has 12 keys.                                                                                                                          |
| Class filter sheet            | `classes.filters`                                    | Same — 13 keys, no `member.*` equivalent.                                                                                                                                                                  |
| Trainers list + detail        | `member.trainers`, falling back to `trainers.detail` | Has the mobile-only `search`, `searchPlaceholder`, `noMatch`, `eyebrow`; its `detail` is 5 keys against the top-level's 6.                                                                                 |
| Shop · product · cart · order | `member.shop` — **never** top-level `shop`           | A strict superset: the same `detail`/`cart`/`checkout` blocks plus `search`, `perk`, `add`, `soldOut`, `from`, `miniCart`, `noMatch`, and a richer `order` (11 vs 9).                                      |
| Services · service detail     | `services`                                           | There is no `member.services`.                                                                                                                                                                             |

The shape of the split is itself evidence: the `member.*` entries describe the mobile
artboards (a search field, a day strip, a mini-cart, time-of-day buckets), which is the
same hand that wrote `member.profile.mobile`, `qr` and `onboarding`. The top-level family
is web's, and mobile borrows from it only where the member set is silent.

### Copy still to author — 24 keys, and one of the gaps is a whole DoD state

WP-16 confirmed the low end of the estimate. The largest single gap: **there are zero
`offline` keys anywhere in either catalogue**, so §6's definition-of-done state 4 has no
copy at all. The rest are error/loading branches on exactly the screens the old app
skipped them on — `qr` (4), `member.home` (3), `member.profile.mobile` (3),
`notifications` (2) — plus six shared-chrome keys, because "Try again" is currently
spelled fifteen different ways across fifteen namespaces and `ui-mobile` takes every
label as a required prop.

### The `qr` copy still promises a scanner — a copy decision, not a code one

Q1 closed the other way: there is no scanner integration and no member check-in endpoint.
The rotation countdown was caught and removed, but the **sentences survived**, and they
are rendered today:

- `qr.subtitle` — "Hold this up to the scanner at the front desk"
- `qr.instruction` — "Hold your phone up to the scanner at reception"

They were written when a scanner was assumed. They tell a member to do something that
cannot work. The truthful instruction is the one that _does_ work today: give the member
ID at the front desk, where staff enter it in the admin console.

Also dead for the same reason: `qr.daysLeft`, `qr.recentTitle`, `qr.recentEmpty`,
`qr.yesterday` — a check-ins history needs an endpoint that does not exist.

**Owed:** a copy pass on the `qr` namespace, in both locales, replacing the scanner
instruction and dropping the history keys. Until then the screen renders the member ID
and the code without an instruction line rather than an instruction that misleads.

### Amendment to §6 item 7 — "one `accessibilityRole="header"` per screen"

Not literally satisfiable, and C2 was right to say so. React Native has no
`accessibilityLevel`, so `AppBar`'s `Heading level={2}` and `SectionHeader`'s `level={3}`
both emit a bare `accessibilityRole="header"`; any screen with sections has several.
The rule becomes: **assert the ordered list of headers**, which still catches the two
failures that matter — a missing screen title, and a stray heading. C2's
`getAllByRole('header')` is the pattern; note that `UNSAFE_root.findAll` walks composite
instances too and counts one `Heading` three times.

### C3b corrected two errors in its own brief — both would have shipped

**1. Trainers and Services must live at the app root, not under `(tabs)`.**
The brief said to put them at `app/(tabs)/{trainers,services}/**`. That would have
re-shipped §1's defect verbatim. `lib/route-policy.ts` declares `trainers: 'public'`,
`services: 'public'`, `'services/[id]': 'auth-soft'`, and `policyFor` matches by longest
prefix over `useSegments()`. Under `(tabs)` the segments are `['(tabs)','trainers']` —
neither `(tabs)/trainers` nor `(tabs)` is in the table, so the walk falls through to
`DEFAULT_POLICY: 'auth'` and **every signed-out visitor is bounced to `/login`**, which is
exactly the bug that made discovery unreachable in the deleted app. `route-policy.spec.ts`
already pinned the intended shape (`trainers: ['trainers']`). Routes are now at
`app/trainers/**` and `app/services/**`, with the reason in both `_layout.tsx` headers.

**2. The query hooks cannot serve a `@Public()` route — owed back to WP-7.**
`useTrainers()` / `useServices()` / `useServiceSlots()` take `gymId` from `useGymId()`,
i.e. from the **access token**, and `gymScope(null)` returns `enabled: false`. Signed out,
all four discovery screens would sit on skeletons forever with nothing on the wire — even
though every one of those endpoints takes an explicit `gymId` query param _precisely_ so a
visitor can read it. C3b resolved the tenant the way `app/qr.tsx` already does
(`resolveGymSlug()` → `GET /gyms/by-subdomain/:slug`) and drove the exported
`*QueryOptions` factories. **WP-7 owes a `useDiscoveryGymId()` in `hooks/`, or a `gymId`
argument on those three hooks.**

### A Georgian-only bug: `toUpperCase()` on Mkhedruli

`trainerInitials('ნინო ბერიძე').toUpperCase()` returned **`ᲜᲑ`** — Unicode 11 gave the
caseless Mkhedruli script an uppercase mapping onto **Mtavruli**, which Georgian readers
parse as shouting. Like the QR encoder's byte-length bug, it misfires _only_ in the app's
primary language, so an English-speaking developer never sees it. Fixed by skipping casing
for the three Georgian blocks, pinned by a test.

**The pattern is now three for three** — the QR encoder sized by `text.length`, the i18n
argument-parity gap, and this. Anything that touches text needs a Georgian case in its
tests, not just an ASCII one.

### Gym-timezone rendering is not possible on mobile, and that is a fix

Web reads every instant in the gym's IANA zone via `Intl.DateTimeFormat({timeZone})`.
`Intl` is banned in `apps/mobile` (the catalogues exist because browsers ship no Georgian
locale data, and Hermes' `Intl` is smaller still), and `createDateTimeFormat` is UTC-only.
So mobile renders the **device's** wall clock throughout, via one `wallClock()` shift.

Upside worth recording: web's `SlotCalendar` mixes gym-zone grouping keys with device-zone
column keys and can drop a slot into no column at all. That bug is not ported.

### The discovery-gym gap: three agents, three workarounds, one missing seam

C3a, C3b and C4a each hit the same wall independently and each solved it locally:

- `components/classes/use-discovery-gym.ts` (C3a)
- `components/services/discovery-gym.ts` (C3b)
- C4a chose to gate the shop behind sign-in rather than work around it

**The gap:** every query hook takes its tenant from `useGymId()`, i.e. from the **access-token
claim**. `gymScope(null)` returns `enabled: false`. So on a `@Public()` route a signed-out
visitor gets a forever-skeleton with nothing on the wire — even though `GET /class-instances`,
`/trainers`, `/services`, `/service-sessions`, `/products`, `/packages`, `/locations` and
`/catalogue` all take an explicit `gymId` query param **precisely so a visitor can read them**.

Each agent resolved it the way `app/qr.tsx` already does — `resolveGymSlug()` →
`GET /gyms/by-subdomain/:slug` — and drove the exported `*QueryOptions` factories directly,
staying inside `hooks/` rather than reaching into `lib/api/`. That is the right instinct, but
three copies of one seam is how drift starts.

**Owed to Lane B:** a single `hooks/useDiscoveryGym.ts` returning the effective `gymId`
(token claim when signed in, slug-resolved otherwise), and either a `gymId` argument on the
public query hooks or a `useDiscoveryGymId()` they consume. Then delete the three local
copies. **Until that lands, C4a's decision to gate the shop is inconsistent with C3a/C3b's
decision to serve it** — one answer is owed across all of them.

### Further corrections from C3a

- **`SUBSCRIPTION_FROZEN` is 403, not 409** (`apps/api/src/classes/bookings.service.ts:456`,
  carrying `frozenUntil`). The brief said 409. Branching on `code` rather than status made it
  moot, which is the argument for branching on `code`.
- **`classes.modal` is three keys** (`close`, `capacity`, `signInToBook`), not a booking-sheet
  namespace. The sheet's title, confirm label, busy labels and note all live in
  `classes.detail.booking.*`. D10's table should say so.
- **No trainer profile link from a class.** `classInstanceDetailSchema` carries `trainerName`
  as a denormalised string and no id, so there is nothing to route to. The artboard's coach
  row keeps its action only on screens that have an id.

### Two test mechanics worth stating once

- **Jest's default `testTimeout` is 5000ms — the same budget as a generous `waitFor`.** On a
  loaded machine the failure reports as _the test_ timing out at the `waitFor` line, which
  reads like a broken assertion rather than a slow box. Screen tests should set
  `jest.setTimeout(30_000)` with a ~10s wait. This produced one real flake during C3.
- **`getAllByRole('header')` does not see a heading inside a card's single accessibility
  node** — correctly, since the card collapses to one node. Anything inside it needs
  `{ includeHiddenElements: true }`.

### The QR screen was removed — 2026-08-31 (closes Q1, amends D8)

**The decision.** "qr ის გვერდი არ უნდა იყოს აპლიკაციაში ჯერჯერობით" — the QR page should
not be in the app _for now_. This is Q1 arriving at its own conclusion rather than a change
of direction: §7 already recorded that the only check-in surface on the API is
`@Controller('admin/check-ins')`, behind `MemberRead`/`MemberWrite`, which a `MEMBER` token
cannot call, and that there is no scanner integration on the other side. A screen whose
entire purpose is to be scanned had nothing to talk to.

**Removed** (`apps/mobile`):

- `app/qr.tsx`, `app/qr.test.tsx` — the screen and its 21 tests.
- `lib/checkin.ts`, `lib/checkin.spec.ts` — the payload builder and the session→state
  resolver. `APP_SCHEME` moved into `app/+native-intent.ts`, which was its only other
  consumer; the "the code's scheme is the one `app.json` registers" assertion moved with it
  and now drives `redirectSystemPath` with `appJson.expo.scheme` directly, which is the
  stronger form of the same test.
- `components/qr/member-card.tsx`, `components/qr/clipboard.ts`.
- The capsule's centre slot and its `intercept` wiring in `app/(tabs)/_layout.tsx`. **The
  tab bar is now four items: Home · Classes · Shop · Profile**, evenly spaced, no centre
  highlight, and no fifth destination invented to fill the hole. `FloatingTabBar` takes its
  count from `items.length`, so nothing in `@fit/ui-mobile` changed for it.
- The `fit://qr` arm of `app/+native-intent.ts`, the `qr` and `(tabs)/qr` rows of
  `lib/route-policy.ts`, and the Profile menu's member-card row — each with its spec cases.
- **The middle onboarding slide.** The intro was three slides and the middle one was the QR;
  with no QR it has no subject. It is now two — classes and shop — rather than a third
  invented to keep the count. `onboarding.qr.title` / `.body` are simply unread.

**Parked, not deleted** (`packages/ui-mobile`, each file headed with the note):
`src/composites/check-in-pass.tsx`, `src/composites/qr/qr-code.tsx`,
`src/composites/qr/qrcode.ts`, with all their tests. An export with no consumer is exactly
the rot that killed the previous design package, and the exception is earned: the encoder
carried two shipping-grade bugs found and fixed during WP-9 (the zig-zag walk that never
wrote column 0, and the version block that was reserved and never drawn), verified
module-for-module against `qrcode@1.5.4` and pinned by 71 golden vectors. Re-porting it
later would re-introduce both — the salvaged version had been reviewed twice and called
"sound" before the vectors found them. `TabItem.intercept` stays on the same grounds: a
capability with no current consumer, and a routing decision that does not belong in a
design component.

**Bringing it back costs one screen.** The components, the encoder and their tests are here
and green. What is missing is on the other side: a scanner, and a member-scoped check-in
endpoint to call. Nothing in this removal has to be undone except re-adding a route, a way
to reach it, and the `intercept` item if the centre action is wanted again.

**Copy that went dead** — no locale file was edited; unused keys cost nothing and these are
authored copy in both `en` and `ka`:

| Key                                         | Note                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the whole `qr` namespace (12 keys)          | Includes `qr.subtitle` and `qr.instruction`, which told the member to hold their phone up to a scanner that does not exist — the copy decision §7 records as owed. Removing the screen makes it moot. |
| `common.nav.qr`                             | The centre slot's accessible label.                                                                                                                                                                   |
| `member.profile.mobile.showQr`              | The Profile menu row.                                                                                                                                                                                 |
| `onboarding.qr.title`, `onboarding.qr.body` | The dropped slide.                                                                                                                                                                                    |

**Test counts.** `@fit/mobile` 605 → 593 (Vitest, −12: all of `checkin.spec.ts`) and 449 →
427 (Jest, −22: `qr.test.tsx`'s 21, plus one net from the layout/profile/onboarding edits).
`@fit/ui-mobile` is unchanged at 593 (Jest) and 289 → 290 (Vitest — one added case pinning
the four-item arithmetic at 320pt). Every parked QR test still runs: the 71 golden vectors,
`qr-code.test.tsx` and `check-in-pass.test.tsx` are all in those totals.

**One thing to know before writing the smoke suite.** `.maestro/` was deliberately not
restored, so nothing breaks today — but the salvaged flows targeted `testID="tab-qr"`:
`03-show-qr` is now meaningless, and **`01-login` used it as the signed-in marker**. That
marker no longer exists. `tab-home` is the natural replacement (the capsule only mounts
inside `(tabs)`, and `home` is `auth` in `ROUTE_POLICY`), or `profile-screen` for a stricter
one.

### C4b — the join funnel, and the bug that would have taken money silently

**The route guard would have hijacked the purchase mid-flight.** `resolveRedirect` zone 2
sends any signed-in user with `isComplete === false` to `/onboarding` from any route. A
signed-out visitor never sees the intro (zone 1 lets them through), so a join buyer
_always_ carries that flag false. The funnel signs the buyer up and **then** charges — so
the instant `signUpMember` resolved, the guard would `router.replace('/onboarding')`
**between the signup and the charge**. The charge still completes, invisibly, on an
unmounted screen: money moves and nobody sees a receipt.

Fixed at the site — `app/(join)/checkout.tsx` calls `onboarding.complete()` immediately
before signup, which is the honest reading: someone who has just walked a four-step
purchase has been introduced to the app. Exempting `public` routes in zone 2 was tried and
**reverted**: `route-policy.spec.ts` deliberately asserts "public ones included", and the
exemption buys the funnel nothing the local fix does not while costing the invariant
everywhere else. The reasoning now lives in the guard.

### Two more seams owed to Lane B

1. **`queryKeys.catalogue(gymId)` takes no filters, but `GET /catalogue?locationId=`
   narrows the package list.** Same request key for two different requests: switching
   branch returns the previous branch's catalogue from cache and never refetches. C4b
   appended a filter-bucket segment _derived from the factory_ so prefix invalidation
   still matches. Owed: `catalogue: (gymId, locationId?) => …`, the shape `products` and
   `notifications` already have.
2. **`useCreateCheckout()` cannot serve a signed-out purchase.** `useMutationDeps()` reads
   `gymId` from the access-token claim captured at render; signed out that is `null`, and
   the re-render from `saveTokens` has not happened when `signUpMember` returns — so
   `requireGymId` throws on the exact call D9 exists to make. C4b drove
   `createCheckoutMutationOptions({ gymId: discoveryGymId })` instead. This is the same
   root as the discovery-gym gap, now with **four** consumers.

### Bugs in the web portal that mobile did not port

- **Web's `EMAIL_TAKEN` banner is unreachable.** It renders inside `<section hidden={step
!== 2}>` while submit only ever runs at step 3, and the catch does no `setStep`. After a
  real 409 the buyer sits on the payment step with a re-enabled button and no message.
  Mobile dispatches back to the details step.
- **Web branches on neither `PRODUCT_UNAVAILABLE` nor `ALREADY_SUBSCRIBED`** — the copy for
  both is authored in en and ka and goes unread there; it falls through to the API's raw
  English sentence.
- **Web reads no `Retry-After` in this flow**, so a 429 on `authStrict` (5 per 900s) shows
  a generic sentence with no countdown.
- **Web's step 1 dead-ends a branchless gym**: `done[0]` is `Boolean(locationId)`, but
  `createCheckoutSchema.locationId` is optional and `memberSignupSchema` has no location,
  so such a gym can legitimately sell and the buyer cannot advance.

### No date picker, on purpose

`@react-native-community/datetimepicker` is not in the dependency set, and adding a native
module costs everyone a new EAS dev-client build. The two dates are typed through a
`dd.mm.yyyy` mask storing `YYYY-MM-DD` — which is exactly what
`checkout.details.fields.datePlaceholder` (`"dd.mm.yyyy"`) was authored for. The four
`checkout.details.calendar.*` keys stay unread.

### Class cover images — the scrim is arithmetic, and null is not a state

`imageUrl` has been on `classInstanceCardSchema` since the contract was written (nullable,
on the CARD and not just the detail, so the booking modal costs no round-trip per click)
and the public service populated it on both routes. Mobile ignored it. It is now drawn on
the classes list, on home and as the class detail's hero — one optional `coverImageUrl` on
`ClassCard`, full-bleed behind the card's own content, which is the shape
`mobile-home-v2.tsx:339` was already built for (`relative overflow-hidden rounded-[30px]`
around a separate `relative p-5`). The artboard author left the hook and never drew the
layer, so the treatment is new. Three things fix it in place:

- **A null cover renders today's card, exactly.** No image node, no scrim, no placeholder,
  no skeleton. On the seeded downtown gym three templates carry a photo and the other seven
  do not, and most real classes never will, so "no cover" is the common case, not an empty
  state — and a grey box where a
  photograph might have been is a fabrication in a different hat. A **failed remote load**
  degrades to the same card (`onError` drops the URL), never to a broken-image plate. The
  failure is keyed by URL rather than a boolean, so a recycled row cannot inherit the
  previous class's dead image.
- **The scrim is measured.** A photo can be any colour, so the worst case is a white one,
  and over white the scrim IS the background the text is read against. `coverScrim`
  (ink-950 @ 72%) composites there to rgb(85,85,84): the title on `onDark` measures
  **7.45:1** and the meta on `onCoverMuted` **5.43:1**. `textSecondary` would be **2.30:1**,
  so the muted stop is **promoted** (ink-200) rather than the scrim being pushed darker
  until grey works — the layer exists to show the photograph. `tokens.spec.ts` computes all
  of it, so lowering the alpha or the stop fails with the number it would have shipped.
  Flat rgba, not a gradient: `expo-linear-gradient` is not in the dependency set and a
  native module costs everyone a dev-client build, the same trade as the date picker above.
- **The cover is decoration.** The card is already ONE accessibility node carrying the
  caller's sentence, and the API ships no alt text — so both layers are `DECORATIVE` and no
  Georgian was invented for them.

Two consequences worth knowing. The card's pressed tint is painted on the Surface, i.e.
UNDER the photo, so over a cover the press feedback moves to the scrim (72% → the sheet
scrim's 85%) — darker, where the plain card goes lighter, because a photo tile that
lightens under a finger reads as an image still loading. And the padding moves from the
Surface to a wrapper inside it when a cover is present, so the absolute layers fill the
whole card: Yoga's inset origin for an absolute child relative to its parent's padding is
a version-dependent detail, and a cover 20pt short on every edge is not something a render
test can see.

The hero takes the same layer plus a 240pt `minHeight` with its content bottom-aligned —
the "photo hero" the deleted app's parity audit named and deferred for want of data that
was there all along. Without a cover the hero is untouched, at its content height.

### The discovery seam landed — `hooks/useDiscoveryGym.ts` (Lane B, 2026-09-02)

The gap §7 recorded three times over is closed. **`apps/mobile/hooks/useDiscoveryGym.ts`**
is now the single answer to "which gym does a public screen read?": the access-token claim
when there is a session, otherwise `resolveGymSlug()` → the `@Public()`
`GET /gyms/by-subdomain/:slug`. `components/classes/use-discovery-gym.ts` (C3a) and
`components/services/discovery-gym.ts` (C3b) are **deleted**; nothing imports them.

**What it exposes**, deliberately small — `{ gymId, isPending, isError, retry }`, enough
for the three branches §6 asks for and nothing more. `name` and `slug` were on the two
local copies and had **no consumer**: `slug` existed only so a screen could invalidate
`queryKeys.gymBySlug` by hand, which `retry()` now owns.

**Four rules, stated once in the file:** the session claim wins outright and terminally;
no slug is an _error_, not a wait; retry is `invalidateQueries`, never `.refetch()`;
`gymId` is nullable and that is a state, not an assertion failure.

**Two bugs the consolidation found in the copies it replaced.**

- **C3a's version ran the public lookup even when signed in** (`useGymBySlug(slug)`
  unconditionally), then preferred the session id in the return value. So every mount of
  the classes tab cost a `GET /gyms/by-subdomain/:slug` a member never needed, and parked
  a second, independently-resolved gym id in the cache next to the authoritative one.
  C3b had this right. The unified hook passes `null` to the lookup when there is a session,
  so the query is _disabled_, and `useDiscoveryGym.test.tsx` asserts zero network calls.
- **C3b's screens offered a retry that could not fix what had failed.**
  `app/services/index.tsx` computed `failed = gym.isError || catalogue.isError` but its
  retry only invalidated the services key — so a screen that failed _because the tenant
  lookup failed_ had a dead button. `trainers/index`, `trainers/[id]` and `services/[id]`
  hand-rolled the `gymBySlug` invalidation instead; they now all call `gym.retry()`.

**Mutations, not just queries.** `useDiscoveryMutationDeps()` returns `MutationDeps`
scoped by the discovery gym. `useMutationDeps()` cannot serve the join funnel: it reads the
claim _captured at render_, and the re-render from `saveTokens` has not happened when
`signUpMember()` resolves, so `requireGymId` throws on the exact `POST /checkout` D9 exists
to make. `app/(join)/checkout.tsx` no longer assembles that by hand.

**Known cost, not a bug.** On a cold start the session hydrates asynchronously, so for the
first frames `useGymId()` is `null` and a public screen starts the slug lookup even for a
returning member. Gating on `useSession().status !== 'hydrating'` was considered and
**rejected for now**: `renderScreen` never calls `hydrateAuth()`, so every existing screen
test would sit in `hydrating` forever and render a permanent skeleton. The cost is one
cheap `@Public()` GET with a 10-minute `staleTime`, already warmed by the login screen.

### `queryKeys.catalogue(gymId, locationId?)` — and `packages` with it

C4b's workaround (appending a segment to the factory's key at the call site) is gone. Both
factories now carry the branch at index 2, the filter-bucket shape `products` and
`notifications` already have:

    catalogue: (gymId, locationId?) => ['catalogue', gymId, locationId ?? null]
    packages:  (gymId, locationId?) => ['packages',  gymId, locationId ?? null]

`packages` had the identical latent bug — `packagesQueryOptions` put `locationId` on the
wire and not in the key — and its own doc comment admitted it while pointing at WP-3. It
has no consumer passing a branch _yet_, which is exactly why it was worth fixing now.

**The invalidation matrix still matches by prefix**, and `RESOURCE_ROOTS.catalogue` is now
**sliced** (`resourceRoot(queryKeys.catalogue(gymId))` → `['catalogue', gymId]`) for the
same reason `notifications` and `products` are: an unsliced row would refresh only the
no-branch bucket and leave a buyer looking at the catalogue they just bought from.
`invalidation.spec.ts` asserts the slice; `query-keys.spec.ts` asserts two branches are two
buckets _and_ that the two-segment root still finds all three.

`app/(tabs)/profile/membership.tsx` was left untouched and stays correct: it invalidates
`queryKeys.catalogue(scoped)` — now `['catalogue', gymId, null]` — which is exactly the
bucket the plan sheet's `useCatalogue()` reads.

### The shop is un-gated. D9's line is between browsing and writing.

**Decision: the shop lists signed out; the cart still does not.** C4a's gate is removed
from `app/(tabs)/shop/index.tsx` and `app/(tabs)/shop/product/[id].tsx`.

The argument is that C4a's own header already made the case for removal: it recorded the
gate as "a consequence of the data layer, not a choice here" — the only sanctioned source
of a `gymId` was the token claim. That constraint is what `useDiscoveryGym` removes.
`GET /products` is `@Public()` and takes `gymId` as a query param precisely so a visitor
can read it, and `/classes`, `/trainers` and `/services` all serve discovery signed out.
A shop that alone demanded a login was the odd one out, and a member app whose first
screen to a prospective member is a login wall is the defect §1 opens with.

**What did NOT change is the reason D9 gated the cart**, which is still true and still
platform-specific: `CartController` is `@Public()`, but a guest cart is identified by the
`fit_cart_sid` cookie, RN has no cookie jar, and D3 sends `credentials: 'omit'` — so a
signed-out `POST /cart/items` lands in a cart nobody can read back. `useSignInGate` is
untouched, `useCartOrEmpty` stays **session**-scoped, and every write still prompts. The
shop screens now hold both tenants at once, the same split `classes/index.tsx` already had
between the public schedule and `useMyBookings`.

**The `gymId === null` branch changed meaning**, so its copy did too. It used to mean
"signed out"; it now means "no tenant could be resolved at all" — which signing in would
not fix, so offering to would be a dead button. It renders `LoadFailed` with a working
retry instead. **No locale keys are owed**: `member.shop.error` / `member.shop.retry` are
the sentences for exactly that, and `member.shop.loading` covers the resolving frame. The
`member.cart.signInToAdd` prompt is still read — by `useSignInGate`, where it belongs.

One test moved rather than died: the shop's "`SignInGate.ready` holds the press while the
keychain is read" assertion now presses the row's "+" instead of a sign-in CTA that no
longer exists. `gate.ready` keeps a real call site in `app/(tabs)/shop/cart.tsx`.

### One more explicit-tenant seam: `useProducts(gymId?)`

`useProducts()` omitted scopes itself by the session — right for `auth` routes, and what
`app/(tabs)/home.tsx` wants. `useProducts(gymId)` uses exactly what it is given, which is
how the two public shop screens hand it the discovery gym. `null` still means "no gym, stay
disabled". This is the second option §7 offered ("a `gymId` argument on the public query
hooks"), taken where a hook already had a session-scoped caller worth keeping; the other
public screens keep driving their exported `*QueryOptions` factories.

### `hooks/**/*.test.tsx` now runs under jest-expo

`jest.config.js`'s `testMatch` gained `hooks`. §5's boundary is unchanged and still enforced
by the extension: `hooks/**/*.spec.ts` is Vitest's, `hooks/**/*.test.tsx` is jest-expo's,
and the two globs cannot overlap. `useDiscoveryGym` needs both sides. The decision is a pure
function (`resolveDiscoveryGym`) and is exhaustively tested renderer-free; but "the retry
actually refetches" is a fact about whether TanStack re-runs an errored _active_ query on
invalidation, and asserting that against a mocked client would be asserting a fiction. That
test mounts a probe with a real `QueryClient`, the real session store over a fake keychain,
and only `lib/api/gyms` stubbed.
