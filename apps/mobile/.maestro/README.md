# Mobile smoke tests (Maestro)

End-to-end smoke flows for the rebuilt Expo app, driven by
[Maestro](https://maestro.mobile.dev/). They exercise the four critical member
journeys against a **real build** of the app talking to a **live `@fit/api`**:

| Flow               | What it proves                                                    |
| ------------------ | ----------------------------------------------------------------- |
| `01-login`         | A seeded member signs in and reaches the authenticated tab shell. |
| `02-book-class`    | Open the schedule, open an occurrence, and book it.               |
| `03-show-qr`       | Open the QR check-in membership pass.                             |
| `04-shop-checkout` | Add a product to the cart and place the order.                    |

Every flow reuses `subflows/launch-and-sign-in.yaml` to cold-start the app, sign
in, and clear first-run onboarding.

## Selectors

Flows address elements by **`testID`** (Maestro `id:`), not by on-screen text, so
they are independent of the app's locale (`en` / `ka`). The ids are set on the
source components:

| `testID`              | Where                                                |
| --------------------- | ---------------------------------------------------- |
| `login-email`         | `app/(auth)/login.tsx`                               |
| `login-password`      | `app/(auth)/login.tsx`                               |
| `login-submit`        | `app/(auth)/login.tsx`                               |
| `onboarding-skip`     | `app/onboarding.tsx`                                 |
| `tab-qr`              | `app/(tabs)/_layout.tsx` (QR floating action button) |
| `class-card`          | `components/classes/ScheduleClassCard.tsx`           |
| `class-book-button`   | `components/classes/ClassBookingActions.tsx`         |
| `member-qr-pass`      | `app/(tabs)/qr.tsx`                                  |
| `product-card`        | `components/shop/ProductCard.tsx`                    |
| `product-add-to-cart` | `app/(tabs)/shop/product/[productId].tsx`            |
| `cart-checkout`       | `app/(tabs)/shop/cart.tsx`                           |
| `order-confirmation`  | `app/(tabs)/shop/order/[orderId].tsx`                |

## Prerequisites

1. **A running API + datastores**, migrated and seeded:

   ```bash
   pnpm db:migrate
   pnpm --filter @fit/db db:seed              # tenants, member, today's classes
   pnpm --filter @fit/db db:seed:mobile-smoke # one shop product (04-shop-checkout)
   pnpm --filter @fit/api start               # http://localhost:3000
   ```

   The base seed creates `sam@example.com` / `Test1234!` — an ACTIVE member of the
   `downtown` gym — plus today's bookable classes. The mobile-smoke seed adds the
   variant-less product the checkout flow buys (products are not in the base seed).

2. **A debug build of the app on a device/emulator**, pointed at the API. Inside
   the Android emulator the CI host is reachable at `10.0.2.2`:

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_API_URL="http://10.0.2.2:3000" npx expo prebuild --platform android --no-install
   (cd android && ./gradlew assembleDebug)
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

   On a local machine / physical device use your machine's LAN IP instead of
   `10.0.2.2`.

3. **Maestro installed** — `curl -Ls https://get.maestro.mobile.dev | bash`.

## Running

```bash
# From the repo root, run the whole suite in order:
pnpm --filter @fit/mobile test:smoke        # === maestro test .maestro

# Or a single flow:
maestro test apps/mobile/.maestro/flows/02-book-class.yaml

# Override the fixture account:
maestro test apps/mobile/.maestro --env MEMBER_EMAIL=other@example.com --env MEMBER_PASSWORD=...
```

## CI

These run in `.github/workflows/mobile-smoke.yml` on a **nightly schedule** and
on **manual dispatch** — not on every pull request. A full run builds the native
app and boots an Android emulator, which is far slower and heavier than the
per-PR checks, so it is kept out of the merge-gating path and exercised
out-of-band instead.
