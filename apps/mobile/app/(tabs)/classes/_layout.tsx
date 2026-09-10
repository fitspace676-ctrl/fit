// The Classes tab's own stack.
//
// Needed from the moment the tab has a second screen, which it does from this
// stage: without a `_layout` here expo-router mounts `classes/index` and
// `classes/[id]` as two SIBLING TAB ROUTES, so opening a class would swap the
// tab's content with no back gesture on iOS and nothing to pop on Android.
// (`tabKeyForRouteName` in `app/(tabs)/_layout.tsx` already handles both
// shapes — it matches on the head segment — so the capsule is correct before
// and after this file exists.)
//
// The route names stay `index` and `[id]`, which is what `ROUTE_POLICY`'s
// `'(tabs)/classes'` (public) and `'(tabs)/classes/[id]'` (auth-soft) entries
// are written against. The detail is auth-soft rather than auth on purpose: a
// signed-out visitor must be able to READ a class and meet the wall at Book.
import { Stack } from 'expo-router';

export default function ClassesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
