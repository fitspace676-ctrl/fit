# @fit/mobile

Cross-platform mobile app — [Expo](https://expo.dev/) (SDK 56) with
TypeScript, [Expo Router](https://docs.expo.dev/router/introduction/) (file-based
routing), and [NativeWind](https://www.nativewind.dev/) wired to the shared
`@fit/config` theme tokens. Native builds run on [EAS Build](https://docs.expo.dev/build/introduction/).

## Layout

```
app/
├── _layout.tsx        # root Stack layout — imports global.css, SafeAreaProvider
├── index.tsx          # placeholder home screen
└── login.tsx          # sign-in screen (Google / Apple)
hooks/
└── useAuth.ts         # reactive session + login() / logout()
lib/
├── auth.ts            # sign-in helpers (Google / Apple / password reset)
├── auth-storage.ts    # SecureStore token persistence + biometric unlock
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

## Configuration

Copy `.env.example` → `.env.local` (gitignored) and fill in the values.
`EXPO_PUBLIC_*` vars are inlined into the bundle — never put secrets there.
