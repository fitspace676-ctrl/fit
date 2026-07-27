# Tailwind decommission plan (T11.6)

_Owner: web platform · Tracks the Astryx + StyleX migration (Epic T11) · Last updated: 2026-07-06_

`apps/web` and `apps/admin` ship **Tailwind CSS 3.4** today. The Astryx design
system + compiled **StyleX** replaces it (foundation landed in T11.1–T11.5). This
document defines how the two coexist during the screen-by-screen migration, the
CI guardrail that stops migrated screens from regressing, and the exact removal
checklist for when the last screen of each app is off Tailwind.

Scope is `apps/web` and `apps/admin`. Out of scope: `apps/platform` (marketing,
separate surface) and `apps/mobile` (NativeWind — its own token pipeline).

## Coexistence rules

1. **Tailwind stays active** for not-yet-migrated screens. `globals.css` keeps
   `@tailwind base/components/utilities`, `tailwind.config.mjs` and
   `postcss.config.mjs` remain, and the formacore token layer (the palette /
   type / radii in each app's `tailwind.config.mjs`, layered on
   `@fit/config/tailwind`) keeps painting legacy screens.
2. **Migrated screens are Astryx + StyleX only.** They style with Astryx
   components and StyleX (`xstyle` / `stylex.props`) — never Tailwind utility
   classes. This is enforced (see below), not just a convention.
3. **The `@fit/ui-web` primitives are a deliberate exception.** `Btn`, `Badge`,
   `Card`, `DataTable` etc. now render Astryx underneath but retain a few Tailwind
   helpers during coexistence — most visibly `buttonClasses()` (link-buttons on
   ~30 unmigrated screens) and icon-sizing utilities (`h-4 w-4`). These retire
   with the Tailwind removal, **not** per-screen, so the package is intentionally
   **not** under the guardrail.

## CI guardrail

`scripts/check-tailwind-guardrail.ts` (npm: `pnpm check:tailwind-guardrail`, wired
into `.github/workflows/ci.yml` right after the controller-guard step) fails the
build if any **migrated** file authors a Tailwind utility class.

- It scans only the paths in its `MIGRATED_PATHS` manifest — an **opt-in** list.
- It is AST-based: only string tokens that reach a JSX `className` / `class`
  attribute (directly, via a template literal, or through a class-composer call
  like `clsx` / `cn` / `cva` / `buttonClasses`) are tested against a
  Tailwind-utility heuristic, so ids / URLs / aria text don't trip it.
- A genuine non-Tailwind class that collides with the heuristic can be exempted
  with a same-line `tw-guardrail-allow` comment.

**Workflow for each screen-migration task (T11.7 … T11.24):** when the screen is
rebuilt on Astryx, add its route path to `MIGRATED_PATHS` in the script **and**
tick its row in the [Migration progress](#migration-progress) table below. CI
then locks that screen Tailwind-free for good.

## Migration progress

Guarded (in `MIGRATED_PATHS`, enforced Tailwind-free):

| Path                                                      | Task   | Status |
| --------------------------------------------------------- | ------ | ------ |
| `apps/web/app/[locale]/astryx-smoke`                      | T11.1  | ✅     |
| `apps/admin/app/astryx-smoke`                             | T11.1  | ✅     |
| `apps/web/src/components/theme/astryx-provider.tsx`       | T11.1  | ✅     |
| `apps/admin/components/theme/astryx-provider.tsx`         | T11.1  | ✅     |
| `apps/web/app/[locale]/login`                             | T11.7  | ✅     |
| `apps/web/app/[locale]/_components/auth`                  | T11.7  | ✅     |
| `apps/web/app/[locale]/register`                          | T11.8  | ✅     |
| `apps/web/app/[locale]/forgot-password`                   | T11.9  | ✅     |
| `apps/web/app/[locale]/reset-password`                    | T11.9  | ✅     |
| `apps/web/app/[locale]/(member)/home/page.tsx`            | T11.11 | ✅     |
| `apps/web/src/components/member/home/membership-hero.tsx` | T11.11 | ✅     |
| `apps/web/app/[locale]/(member)/classes`                  | T11.12 | ✅     |
| `apps/web/src/components/classes`                         | T11.12 | ✅     |
| `apps/web/app/[locale]/(member)/trainers`                 | T11.13 | ✅     |
| `apps/web/src/components/trainers`                        | T11.13 | ✅     |
| `apps/web/app/[locale]/(member)/account/bookings`         | T11.14 | ✅     |
| `apps/web/src/components/account`                         | T11.14 | ✅     |
| `apps/web/app/[locale]/(member)/shop`                     | T11.15 | ✅     |
| `apps/web/src/components/shop`                            | T11.15 | ✅     |
| `apps/web/app/[locale]/(member)/cart`                     | T11.15 | ✅     |
| `apps/web/src/components/member/cart`                     | T11.15 | ✅     |
| `apps/web/app/[locale]/(join)/checkout`                   | T11.15 | ✅     |
| `apps/web/src/components/checkout`                        | T11.15 | ✅     |
| `apps/web/app/[locale]/(member)/account/profile`          | T11.16 | ✅     |
| `apps/web/app/[locale]/(member)/account/membership`       | T11.16 | ✅     |
| `apps/web/src/components/member/profile`                  | T11.16 | ✅     |
| `apps/web/src/components/member/notification-bell.tsx`    | T11.16 | ✅     |
| `apps/admin/components/admin-shell.tsx`                   | T11.17 | ✅     |
| `apps/admin/components/sidebar.tsx`                       | T11.17 | ✅     |
| `apps/admin/components/top-bar.tsx`                       | T11.17 | ✅     |
| `apps/admin/components/nav-icon.tsx`                      | T11.17 | ✅     |
| `apps/admin/components/locale-switcher.tsx`               | T11.17 | ✅     |
| `apps/admin/app/(dashboard)/page.tsx`                     | T11.18 | ✅     |
| `apps/admin/app/(dashboard)/dashboard-view.tsx`           | T11.18 | ✅     |
| `apps/admin/app/(dashboard)/charts.tsx`                   | T11.18 | ✅     |
| `apps/admin/app/(dashboard)/members`                      | T11.19 | ✅     |
| `apps/admin/app/(dashboard)/classes`                      | T11.20 | ✅     |
| `apps/admin/app/(dashboard)/staff`                        | T11.21 | ✅     |
| `apps/admin/app/(dashboard)/locations`                    | T11.21 | ✅     |
| `apps/admin/app/(dashboard)/settings`                     | T11.21 | ✅     |
| `apps/admin/app/(dashboard)/payments/transactions`        | T11.22 | ✅     |
| `apps/admin/app/(dashboard)/pos`                          | T11.22 | ✅     |
| `apps/admin/app/(dashboard)/shop`                         | T11.22 | ✅     |
| `apps/admin/app/(dashboard)/reports`                      | T11.22 | ✅     |
| `apps/admin/components/pos`                               | T11.22 | ✅     |

### Rows retired by the IA consolidation

The console's information architecture was reshaped after these screens migrated
(`622a269`, plus the later CRM removal). Their Astryx work is not lost — where a
screen moved, the destination above guards it — but the old paths are gone, so the
manifest no longer lists them:

| Was                                    | Task   | Now                                      |
| -------------------------------------- | ------ | ---------------------------------------- |
| `apps/admin/app/(dashboard)/analytics` | T11.18 | folded into the dashboard landing        |
| `apps/admin/app/(dashboard)/trainers`  | T11.19 | removed — no reference equivalent        |
| `apps/admin/app/(dashboard)/check-in`  | T11.20 | removed — no reference equivalent        |
| `apps/admin/app/(dashboard)/schedule`  | T11.20 | `classes/schedule`, guarded by `classes` |
| `apps/admin/app/(dashboard)/activity`  | T11.21 | removed — no reference equivalent        |
| `apps/admin/app/(dashboard)/audit-log` | T11.21 | removed — no reference equivalent        |
| `apps/admin/app/(dashboard)/orders`    | T11.22 | `payments/transactions`                  |
| `apps/admin/app/(dashboard)/products`  | T11.22 | `shop` (via `payments/products`)         |
| `apps/admin/app/(dashboard)/crm`       | T12.3  | removed with the CRM workspace           |

Pending screens (still on Tailwind — add to the manifest as each lands). Counts
are files currently using `className=` under each app, as a rough burn-down:
`apps/web` ≈ 22, `apps/admin` ≈ 25.

| Area                                  | Tasks                  |
| ------------------------------------- | ---------------------- |
| Web — member shell + home             | T11.10, T11.11         |
| Web — classes / trainers / bookings   | T11.12, T11.13, T11.14 |
| Web — shop / cart / checkout          | T11.15                 |
| Web — account / profile / membership  | T11.16                 |
| Admin — shell + dashboard             | T11.17, T11.18         |
| Admin — billing (plans/subs/invoices) | T11.23                 |
| Parity + a11y + dead-code sweep       | T11.24, T11.25, T11.26 |

The demo/showcase route `apps/web/app/[locale]/astryx-primitives` is **not**
migrated and never enters the manifest — it uses Tailwind on purpose to scaffold
the primitives it exhibits.

## Removal checklist (final step)

Do this only once **every** screen of an app is migrated and the guardrail covers
all of them — i.e. `grep -rl "className=" apps/<app>` returns only Astryx files
already in the manifest. Per app (`web`, then `admin`):

- [ ] Delete `apps/<app>/tailwind.config.mjs`.
- [ ] Delete `apps/<app>/postcss.config.mjs` (or drop the `tailwindcss` +
      `autoprefixer` plugins if PostCSS is still needed for anything else).
- [ ] Remove `@tailwind base/components/utilities` from `apps/<app>/app/globals.css`
      (keep the Astryx `@import` lines — reset, astryx, theme).
- [ ] Remove the `content` globs, including the `../../packages/ui-web/**` glob.
- [ ] Drop `tailwindcss`, `autoprefixer`, and `postcss` from `apps/<app>/package.json`.

Once **both** apps are done:

- [ ] Retire the Tailwind helpers still in `@fit/ui-web` (`buttonClasses`,
      `modalPanelClasses`, `drawerPanelClasses`, icon-sizing utilities) — replace
      call sites with Astryx equivalents (T11.25).
- [ ] Delete the **formacore CSS-variable / token layer**: the `theme.extend`
      palette + type + radii blocks in the (now-removed) app `tailwind.config.mjs`
      files, and the formacore-only tokens in `packages/config/tailwind.config.base.mjs`
      that no remaining Tailwind surface consumes. `apps/platform` and
      `apps/mobile` still read `@fit/config`, so trim only what web/admin owned.
- [ ] Remove the now-dead guardrail once Tailwind is gone from both apps
      (`scripts/check-tailwind-guardrail.ts`, its `package.json` script, and the
      CI step) — its job is done when there is no Tailwind left to regress to.
- [ ] Update this document's status to **complete**.

## Acceptance (T11.6)

- ✅ Guardrail rule active in CI (`check:tailwind-guardrail` step in `ci.yml`).
- ✅ Documented removal checklist exists (this file).
- ✅ No Astryx screen depends on a Tailwind class (every migrated surface in the
  manifest passes the guardrail; verified `pnpm check:tailwind-guardrail`).
