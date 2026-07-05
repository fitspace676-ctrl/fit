# @fit/mobile

Cross-platform mobile app — [Expo](https://expo.dev/) (SDK 56) with
TypeScript, [Expo Router](https://docs.expo.dev/router/introduction/) (file-based
routing), and [NativeWind](https://www.nativewind.dev/) wired to the shared
`@fit/config` theme tokens. Native builds run on [EAS Build](https://docs.expo.dev/build/introduction/).

## Layout

```
app/
├── _layout.tsx        # root Stack layout — global.css, providers, route guard
├── index.tsx          # splash; the guard redirects to (auth) / onboarding / tabs
├── onboarding.tsx     # 3-slide first-run intro (persists onboarding_done)
└── (auth)/            # sign-in zone, reachable while signed out
    ├── login.tsx          # email/password + Google / Apple
    ├── register.tsx       # create account → "check your email"
    ├── forgot-password.tsx
    ├── reset-password.tsx # opened via fit://auth/reset?token=…
    └── verify.tsx         # opened via fit://auth/verify?token=… (auto-login)
hooks/
├── useAuth.ts         # reactive session + login() / logout()
├── useOnboarding.ts   # reactive first-run flag + complete()
└── useProtectedRoute.ts # auth + onboarding routing guard (mounted in _layout)
lib/
├── auth.ts            # sign-in helpers (password / Google / Apple / register / verify / reset)
├── auth-storage.ts    # SecureStore token + onboarding persistence, biometric unlock
├── api-client.ts      # authed fetch with silent refresh-on-401
├── use-google-sign-in.ts
└── use-apple-sign-in.ts
assets/                # app icon, splash, adaptive icon, favicon
global.css             # Tailwind directives (compiled by NativeWind)
tailwind.config.mjs    # NativeWind preset + @fit/config theme tokens
metro.config.js        # monorepo-aware Metro + withNativeWind
babel.config.js        # babel-preset-expo + nativewind/babel
app.json               # Expo config — bundle IDs, icon, splash
eas.json               # EAS Build profiles (development / preview / production)
```

## Scripts

| Command                     | Description                                  |
| --------------------------- | -------------------------------------------- |
| `pnpm start`                | Start the Expo dev server (Metro)            |
| `pnpm ios` / `pnpm android` | Open on iOS Simulator / Android Emulator     |
| `pnpm build:preview`        | `eas build --profile preview --platform all` |
| `pnpm lint`                 | ESLint (shared `@fit/config` flat config)    |
| `pnpm type-check`           | `tsc --noEmit`                               |
| `pnpm test:smoke`           | Maestro smoke suite (`.maestro`)             |

From the repo root via Turborepo / workspace filters:

```bash
pnpm mobile:start            # === pnpm --filter @fit/mobile start
pnpm mobile:build:preview    # === pnpm --filter @fit/mobile build:preview
pnpm turbo run dev --filter=@fit/mobile
```

## Styling

`tailwind.config.mjs` layers the NativeWind preset over the shared
`@fit/config/tailwind` tokens, so `className` props on React Native primitives
resolve to the same brand colors (`brand-*`), `font-sans`, `rounded-card`, and
`p-gutter` used across every Fit surface.

## Auth & session

Tokens — the short-lived access JWT and the rotating refresh token — are the
app's only secrets, so they live in **`expo-secure-store`** (iOS Keychain /
Android Keystore), never in AsyncStorage and never in a log line. `lib/auth-storage.ts`
owns that persistence plus a tiny in-memory snapshot, so a relaunch restores the
signed-in state without a login prompt.

`lib/api-client.ts` exposes `apiFetch(path, init)` for authenticated calls. It
attaches `Authorization: Bearer <token>` and, on a `401`, silently rotates the
session via `POST /auth/refresh` **once** (de-duplicated across concurrent
requests) and retries; a second `401` clears the keychain and routes to
`/login`.

`hooks/useAuth.ts` is the screen-facing hook: a reactive `session`, an
`isLoading` flag for the first keychain hydration, `login(tokens)`, and a
`logout()` that best-effort revokes the session server-side and unregisters the
push token before clearing local storage.

Biometric unlock (Face ID / Touch ID) is optional: `auth-storage.ts` stores the
opt-in flag in AsyncStorage (a non-secret) and exposes `authenticateWithBiometrics()`
for the authed shell to gate session access on resume.

## Routing & onboarding

`hooks/useProtectedRoute.ts` is the single routing authority, mounted once in the
root layout. Once the persisted session (keychain) and onboarding flag
(SecureStore, `onboarding_done`) have hydrated, it routes the user into one of
three zones and keeps them there: signed out → the `(auth)` group; signed in but
first-run → `app/onboarding.tsx`; signed in and onboarded → the `(tabs)` shell.
Because both flags are reactive, the same guard that gates a cold launch also
reacts to a live sign-in, sign-out, or "Get started" tap — no screen navigates on
success itself. The `(auth)` group is the only zone reachable while signed out, so
the emailed verify / reset deep links (`fit://auth/verify|reset?token=…`,
rewritten in `app/+native-intent.ts`) land there and log the user in.

Onboarding is shown exactly once: tapping **Get started** (or **Skip**) persists
`onboarding_done` via `auth-storage`, after which the guard never routes back to
it. `useOnboarding()` exposes the reactive flag and the `complete()` writer.

## EAS Build

Three profiles are defined in `eas.json`:

- **development** — internal distribution + dev client, for daily local builds.
- **preview** — internal distribution + iOS simulator builds, for stakeholder review.
- **production** — store-ready builds with remote version auto-increment.

First-time setup (run once, requires an Expo account):

```bash
cd apps/mobile
eas login
eas build:configure          # links the project, writes the EAS projectId
eas build --profile preview --platform ios
```

`eas build:configure` populates `extra.eas.projectId` in `app.json`; commit that
value so CI builds resolve the project.

## Smoke tests (Maestro)

`.maestro/` holds the end-to-end smoke suite — four [Maestro](https://maestro.mobile.dev/)
flows (login, book class, show QR, shop checkout) that drive a real build of the
app against a live `@fit/api`. Flows address elements by `testID` so they are
locale-independent. Run them with `pnpm test:smoke` once an emulator and the API
are up; see [`.maestro/README.md`](./.maestro/README.md) for the full setup. They
run nightly / on demand in `.github/workflows/mobile-smoke.yml`, never on the
per-PR path.

## Configuration

Copy `.env.example` → `.env.local` (gitignored) and fill in the values.
`EXPO_PUBLIC_*` vars are inlined into the bundle — never put secrets there.
