# Mobile design-parity audit (T7.10)

_Audit date: 2026-07-04 · Design: formacore (`6MfRKxx4LyI1`), page **Mobile** · App: `@fit/mobile` (Expo + NativeWind)_

This document records the parity audit of the rebuilt Expo screens (T7.1–T7.9)
against the **9 mobile artboards**, the diffs fixed in this pass, and the diffs
**deliberately deferred** with their reasons. It is the reference for the final
cross-app parity sweep (T10.6) and the mobile smoke tests (T9.5).

## Method

Each rebuilt screen was compared field-by-field against its formacore mobile
artboard: layout, sections, states (loading / error / empty / disabled), copy,
colour-token intent, and iconography. Findings were triaged into **fix now**
(concrete, safe, backed by data already on the wire) vs **deferred** (would
require inventing data the API does not yet return, or an app-wide capability
that does not exist). Fabricated UI — stock photos, fake avatars, invented
ratings/prices — is explicitly out of scope: a screen must not render data it
cannot truthfully source.

## Design tokens — ✅ exact parity

The formacore token set is shared into the Expo app through
`@fit/ui-mobile/tailwind.preset.mjs`, layered over `@fit/config`. Verified
identical to `get_design_tokens`:

- **Colour scales** — `brand`, `accent`, `ink`, `success`, `warning`, `danger`,
  `info`, `iris`, `flame` (all 50–950 stops) match the design tokens byte-for-byte.
- **Radii** — `field` `0.5rem`, `btn` `0.75rem`, `card` `1rem`, `pill` `9999px`.

**Fonts** are intentionally the platform system family. The formacore web faces
(Manrope / Archivo / JetBrains Mono) are not bundled into the Expo binary, so
overriding `fontFamily` would only fall back anyway — this is a documented
decision in the preset, not a drift, and is **not** counted as a diff.

## Per-screen results

| #   | Artboard                    | Implementation                                         | Verdict                                      |
| --- | --------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| 1   | `member-signin-mobile`      | `app/(auth)/login.tsx`                                 | ✅ parity (deferred: icon set, biometric)    |
| 2   | `member-home-mobile`        | `app/(tabs)/home.tsx`                                  | ✅ parity (deferred: data-backed sections)   |
| 3   | `member-classes-mobile`     | `app/(tabs)/classes/index.tsx`                         | ✅ parity (deferred: search, intensity)      |
| 4   | `member-classdetail-mobile` | `app/(tabs)/classes/[instanceId].tsx`                  | ✅ **fixed** "What to expect" heading        |
| 5   | `member-trainer-mobile`     | `app/(tabs)/trainers/*`                                | ✅ parity (deferred: ratings, availability)  |
| 6   | `member-shop-mobile`        | `app/(tabs)/shop/index.tsx`, `product/[productId].tsx` | ✅ parity (deferred: categories, badges)     |
| 7   | `member-cart-mobile`        | `app/(tabs)/shop/cart.tsx`                             | ✅ parity (deferred: promo, member discount) |
| 8   | `member-checkin-mobile`     | `app/(tabs)/qr.tsx`                                    | ✅ parity (deferred: gym open-status card)   |
| 9   | `member-profile-mobile`     | `app/(tabs)/profile/*`                                 | ✅ parity (deferred: achievements, icon set) |

Every screen's **structure, tokens, and states already match** the artboard
within the bounds of the data the API returns. The screens are faithful,
data-driven adaptations of the artboards — the mock's photo heroes, social rows,
and marketing embellishments are pared back to what the app can truthfully show.

## Fixed in this pass

- **Class detail — "What to expect" section.** The occurrence description rendered
  as bare body text; the artboard frames it under a section heading. Added an
  `classes.detail.about` label (en + ka) and wrapped the description
  (`app/(tabs)/classes/[instanceId].tsx`). Backed by existing `description` data.
- **Tailwind content glob (build hygiene).** The mobile `content` array scanned
  `../../packages/ui-mobile/**`, which reaches into that package's `node_modules`
  and triggered Tailwind's content-configuration perf warning on every Metro
  build. Narrowed to `index.ts` + `src/**` (its real sources). The warning is
  gone and the export bundle is unchanged (2186 modules) and faster.

## Deferred deltas — require backend data (do NOT fabricate)

These artboard elements were intentionally **not** built because the wire
contracts carry no such data. Rendering them would mean fabricating values.
Each should become a follow-up once the supporting API exists (tracked toward
T10.6 and the relevant Phase-8 data work):

- **Home** — "Gym right now" live-occupancy card, "Your trainer" card,
  PT-sessions-left stat, product `-10%` discount badges.
- **Class detail** — photo hero, kcal estimate, "What to bring" list,
  "Who's going" attendee avatars, richer "Your coach" card with rating/reviews
  (no photo / social / estimate fields on `ClassInstanceDetail`).
- **Trainer** — star rating + review count, experience/members stat grid,
  availability day-strip + slot picker with a book CTA, PT-credits card,
  "Your goals" progress, message-trainer action (no rating/availability/goals
  data on the trainer contract).
- **Shop** — category filter chips, per-card rating / sold count,
  discount / "Bestseller" / "New" badges, wishlist, member `-10%` pricing
  (`ProductSummary` has no `category`, rating, or discount fields).
- **Cart** — promo-code entry, member `-10%` discount row and discounted line
  math (no promo or member-pricing on the cart contract).
- **QR check-in** — current-gym "open until … · N training now" status card
  (needs location hours + a live occupancy source).
- **Profile** — achievements section, "Renew now" membership action (renewal
  billing not yet wired), the fuller settings list (only backed screens are
  linked today — a documented decision in `profile/index.tsx`).

## Deferred delta — iconography (app-wide)

The artboards use a consistent stroked SVG line-icon set; the Expo app uses
**emoji glyphs** throughout (including the shared `@fit/ui-mobile` tab bar). The
app currently has **no vector-icon dependency** (`react-native-svg`,
`@expo/vector-icons`, or similar) — emoji are the deliberate MVP icon system.
Swapping to line icons is a single app-wide change (add `react-native-svg` + an
icon component, migrate ~26 files) and should be done as one focused task, not
piecemeal per screen (which would leave the app visually inconsistent). Recorded
here as the largest single parity item; recommended as a dedicated follow-up.

## EAS preview build

The preview build profile is configured and the JS bundle is verified to build;
the actual cloud binary must be cut with Expo credentials (not available in CI).

- **Config** — `apps/mobile/eas.json` `preview` profile: internal distribution,
  `preview` channel, iOS simulator build, Sentry env wired. `app.json` carries
  the EAS `projectId` (`d425affe-…`) and `owner` (`formacore`). ✅ ready.
- **Command** — `pnpm --filter @fit/mobile build:preview`
  (= `eas build --profile preview --platform all`), or from the app:
  `eas build --profile preview --platform ios` for a simulator build.
  Requires `eas login` / `EXPO_TOKEN` — run by a maintainer with the `formacore`
  Expo account. This is the "cut a build for device testing" step; it produces a
  binary artifact, not a code change, so it lives outside the PR.
- **Local verification** — `npx expo export --platform ios` bundles the whole app
  (2186 modules) with no errors, proving the preview build's JS compiles. `tsc`
  type-check and `eslint` both pass.
- **Next** — once a maintainer cuts the preview build, install on a device/
  simulator and run the mobile smoke path (T9.5): login → book class → show QR →
  shop checkout.
