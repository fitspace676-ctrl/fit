// The `(auth)` group: login, register, forgot-password, reset-password, verify.
//
// The group name is load-bearing — `resolveRedirect` matches `segments[0] ===
// '(auth)'` to decide two whole zones of its table (signed out here is always
// `null`; signed in and onboarded here is always `/home`). Renaming this
// directory silently breaks both.
//
// A plain `Stack`, headerless: every screen draws its own `AppBar` through
// `AuthScreen`, which is what keeps the safe-area inset, the title and the one
// `accessibilityRole="header"` in a single place instead of split between the
// navigator's chrome and the screen's body.
//
// `animation: 'slide_from_right'` is the platform default for a stack push and
// is left alone deliberately: these five screens are a linear flow (sign in →
// forgot → back), and a modal presentation would put a dismiss gesture on
// screens that have nothing to dismiss to.

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
