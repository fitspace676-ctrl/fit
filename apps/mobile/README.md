# @fit/mobile

Cross-platform member app — [Expo](https://expo.dev/) SDK 56, TypeScript,
[Expo Router](https://docs.expo.dev/router/introduction/) (file-based routing) and
[NativeWind 4](https://www.nativewind.dev/) fed by the `@fit/ui-mobile` token preset.
Native builds run on [EAS Build](https://docs.expo.dev/build/introduction/).

This app is a **rebuild**. See [`docs/mobile-rebuild-plan.md`](../../docs/mobile-rebuild-plan.md)
for why the previous one was deleted and what each work package owns. WP-0 (this
scaffold) is the only blocking package; everything else runs in three lanes.

## Layout

```
app/                    # Expo Router routes (Lane C)
├── _layout.tsx         # root Stack — imports global.css, hosts the providers
└── index.tsx           # WP-0 placeholder; replaced by the guarded entry route
components/             # app-local composition (Lane C) — design lives in @fit/ui-mobile
hooks/                  # query/mutation hooks; the only data surface screens may import (Lane B)
lib/                    # env, http client, auth, query keys, api fetchers (Lane B)
assets/                 # app icon, splash, adaptive icon, favicon
global.css              # Tailwind directives, compiled by NativeWind into the RN style runtime
tailwind.config.mjs     # nativewind/preset → @fit/config/tailwind → @fit/ui-mobile/tailwind
metro.config.js         # monorepo-aware Metro + withNativeWind
babel.config.js         # babel-preset-expo (jsxImportSource: nativewind) + nativewind/babel
app.json                # Expo config — dark-only, portrait, scheme `fit`, typed routes
eas.json                # EAS Build profiles (development / preview / production)
```

## Scripts

| Command                     | Description                                  |
| --------------------------- | -------------------------------------------- |
| `pnpm start`                | Start the Expo dev server (Metro)            |
| `pnpm ios` / `pnpm android` | Open on iOS Simulator / Android Emulator     |
| `pnpm build:preview`        | `eas build --profile preview --platform all` |
| `pnpm lint`                 | ESLint (shared `@fit/config` flat config)    |
| `pnpm type-check`           | `tsc --noEmit`                               |
| `pnpm test`                 | Vitest — the non-React-Native unit suite     |
| `pnpm test:smoke`           | Maestro smoke suite (`.maestro`)             |

From the repo root:

```bash
pnpm mobile:start            # === pnpm --filter @fit/mobile start
pnpm mobile:build:preview    # === pnpm --filter @fit/mobile build:preview
```

## Two runners, one boundary

Vitest runs everything in this app that does **not** import `react-native` —
`lib/**` is pure TypeScript by design, which is what makes the http client, the
refresh de-duplication and `resolveRedirect` testable with a `fetch` mock and no
renderer. Render tests live in `@fit/ui-mobile` under `jest-expo`, because React
Native ships Flow-typed source Vitest cannot parse.

If a module under `lib/` needs `react-native` to be tested, that is a design
smell to fix, not a reason to move it across the boundary.

## Styling

`tailwind.config.mjs` layers `nativewind/preset` over the shared
`@fit/config/tailwind` base, then `@fit/ui-mobile/tailwind` **last** so the
design-system tokens win. Its `content` array deliberately names
`packages/ui-mobile/index.ts` and `packages/ui-mobile/src/**` rather than a bare
`packages/ui-mobile/**`: the wide glob reaches into that package's
`node_modules` and trips Tailwind's content-configuration perf warning on every
Metro build. Widening it is a regression, not a convenience.

The app is **dark-only for v1** (`userInterfaceStyle: "dark"`). Tokens are still
expressed as semantic roles, so adding light later is a value swap rather than a
rewrite.

## Native modules

Every native dependency is fixed at scaffold time so the team needs **one** EAS
dev-client build, not one per work package: `react-native-svg`,
`react-native-safe-area-context`, `react-native-reanimated` (+ `react-native-worklets`),
`react-native-screens`, `expo-font`, `expo-secure-store`, `expo-crypto`,
`expo-notifications`, `expo-apple-authentication`, `expo-web-browser`,
`expo-splash-screen`, `expo-system-ui`, `expo-file-system`, `expo-sharing`,
`@react-native-community/netinfo`, `@react-native-async-storage/async-storage`
and `@sentry/react-native`. Adding one later costs everyone a rebuild.

## Configuration

Copy `.env.example` → `.env.local` (gitignored) and fill in the values.
`EXPO_PUBLIC_*` vars are inlined into the bundle — never put secrets there.

## Smoke tests

`.maestro/` holds the Maestro end-to-end suite. Flows address elements by
`testID`, so they are locale-independent by construction. They run nightly and on
demand from [`.github/workflows/mobile-smoke.yml`](../../.github/workflows/mobile-smoke.yml)
and **never** gate a merge.
