/// <reference types="nativewind/types" />

// NativeWind augments the React Native component props with `className`. This
// reference makes `tsc --noEmit` accept `className` on the RN primitives these
// components use, the same way the mobile app's own `nativewind-env.d.ts` does.
