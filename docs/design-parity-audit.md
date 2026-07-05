# Final design-parity audit — all apps (T10.6)

_Audit date: 2026-07-05 · Design: formacore (`6MfRKxx4LyI1`) · Surfaces: admin console, member web portal, Expo mobile, marketing — light **and** dark._

This is the **final cross-app parity sweep** before the pilot go-live. It rolls up
the two per-surface audits it depends on — the member portal audit (T6.8, shipped
across the FormaCore redesign PRs) and the [mobile parity audit](./mobile-parity-audit.md)
(T7.10) — verifies the shared design-token layer against the authoritative
formacore tokens, closes the diffs that were still open, and records the residual
punch list with an explicit disposition for every item.

## Scope

Every formacore artboard has a shipped counterpart that was checked against its
design in both themes:

| Surface           | App / package                      | Artboards | Themes       |
| ----------------- | ---------------------------------- | --------- | ------------ |
| Admin console     | `@fit/admin`                       | 18        | light + dark |
| Member web portal | `@fit/web`                         | 8         | light + dark |
| Mobile app        | `@fit/mobile` (+ `@fit/ui-mobile`) | 9         | light + dark |
| Marketing         | `@fit/platform`                    | 1         | (single)     |

`@fit/superadmin` is **out of scope**: it has no formacore artboard (it is the
operator console, deliberately a lean utility surface), so there is no design to
match it against. It is covered only by the brand-token consistency check below.

## Method

The sweep was run at the layer that a parity audit can verify deterministically —
the **shared design system** — plus the structural/state review captured in the
two per-surface audits:

1. **Token fidelity.** Pull `get_design_tokens` from the formacore design and diff
   it against every surface's implemented Tailwind theme and runtime token map.
2. **Brand-drift scan.** Grep the whole monorepo for the legacy pre-formacore
   brand blue and any raw hex that bypasses the palette on a design surface.
3. **Font wiring.** Confirm the web faces (Manrope / Archivo / JetBrains Mono)
   are actually loaded and bound to the `--font-*` variables the Tailwind
   families read, so no surface silently falls back to system fonts.
4. **Roll-up.** Fold the still-open diffs and deferred deltas from T6.8 / T7.10
   into one punch list with dispositions.

## Token fidelity — ✅ exact parity

Verified identical to `get_design_tokens` on every surface that has an artboard:

- **`@fit/web`** (`apps/web/tailwind.config.mjs`) — full `brand` (electric indigo),
  `accent`, `ink`, `success`, `warning`, `danger`, `info`, `iris`, `flame` scales
  (50–950), the Manrope/Archivo/JetBrains families, and the `field`/`btn`/`card`/`pill`
  radii — all byte-for-byte with the design tokens.
- **`@fit/admin`** — same full palette, families, and radii; matches the design.
- **`@fit/platform`** — same palette + families layered on the shared preset.
- **`@fit/mobile`** — `@fit/ui-mobile/tailwind.preset.mjs` (className side) and
  `@fit/ui-mobile/src/tokens.ts` (runtime side) both mirror the palette exactly;
  radii match. Fonts are intentionally the platform system family (the web faces
  are not bundled into the Expo binary — a documented decision, not a drift).

**Fonts (web + admin)** are wired through `next/font/google` in each app's root
layout, exposed as `--font-manrope` / `--font-archivo` / `--font-jetbrains` and
read by the `font-sans` / `font-display` / `font-mono` families. No fallback drift.

## Fixed in this pass

Two genuine token-parity defects — both a **stale pre-formacore brand blue
(`#2f7bff`)** that survived the redesign — were found and closed:

1. **Shared brand token drifted to the legacy blue.**
   `@fit/config`'s `tailwind.config.base.mjs` — the preset every app extends —
   still defined `brand` as the old blue scale. The four formacore apps each
   re-declare `brand` with the indigo, so they were unaffected, but any surface
   that inherits the preset's brand straight through (the superadmin console, and
   any surface added later) rendered the **wrong brand colour**. Updated the
   shared `brand` scale to the formacore electric-indigo — one source of truth,
   and the superadmin console's `brand-*` utilities now match the platform brand.
2. **Mobile toast colours were off-token.** `apps/mobile/providers/ToastProvider.tsx`
   hard-coded `success:#16a34a`, `error:#dc2626`, `info:#2f7bff` (Tailwind/legacy
   hexes — the `info` value was the old brand blue). Repointed them at the
   formacore status ramps via `@fit/ui-mobile` `palette` (`success[600]` /
   `danger[600]` / `info[600]`) so toasts sit on the design system.

The class-detail "What to expect" heading was already fixed under T7.10 (see the
mobile audit).

## Residual punch list — deferred, tracked, not fabricated

Every remaining delta is a case where the artboard shows an element the API has
no data for yet; building it would mean **fabricating values**, which is out of
scope. These carry forward as tracked follow-ups (they do **not** block go-live —
each screen is a faithful, data-driven adaptation of its artboard):

- **Member web + mobile — data-backed embellishments.** Live "gym right now"
  occupancy, trainer ratings/availability/goals, shop category chips &
  discount/rating badges, cart promo-codes & member pricing, profile
  achievements. These need Phase-8 data (notifications/live updates) and
  billing/catalogue fields that don't exist on the wire yet. Full per-screen
  list in the [mobile parity audit](./mobile-parity-audit.md).
- **Member web — responsive + i18n polish** is its own tracked task (T6.9):
  breakpoint pass and full ka/en coverage across the redesigned portal.
- **Mobile — iconography.** The app uses emoji glyphs where the artboards use a
  stroked line-icon set; there is no vector-icon dependency yet. This is one
  focused app-wide swap, recorded in the mobile audit as the largest single
  parity item, recommended as a dedicated follow-up.

## Verdict

The **shared design-token layer is at exact parity** across every surface that
has a formacore artboard, in both themes; the two stale-brand defects this sweep
surfaced are fixed; fonts are correctly bound. Every structural/state diff from
the per-surface audits is either closed or listed above with a disposition. The
parity punch list is **closed for launch**: what remains is data-dependent
embellishment and one iconography swap, each explicitly tracked rather than
fabricated. This satisfies the go-live "parity audit clean" gate (T10.10).
