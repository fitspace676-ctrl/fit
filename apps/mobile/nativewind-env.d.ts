/// <reference types="nativewind/types" />
/// <reference types="expo/types" />

// NativeWind augments React Native component props with `className`; the Expo
// types provide the Metro/asset module declarations. Committed (unlike the
// auto-generated `expo-env.d.ts`) so `tsc --noEmit` works in CI without a
// prior `expo start`.
