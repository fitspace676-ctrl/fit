// The Services stack — TOP-LEVEL, not a tab (D8, Q6).
//
// The reasoning is `app/trainers/_layout.tsx`'s, verbatim, and the mechanical
// half is sharper here: `ROUTE_POLICY` declares
//
//     services: 'public',
//     'services/[id]': 'auth-soft',
//
// — a detail route deliberately STRICTER than its list, which is the whole
// point of the longest-prefix match. Under `(tabs)` neither key would ever be
// reached (`['(tabs)','services','[id]']` walks `(tabs)/services/[id]` →
// `(tabs)/services` → `(tabs)`, none declared) and both would fall through to
// `DEFAULT_POLICY: 'auth'`. `lib/route-policy.spec.ts` pins the intended
// segments as `['services']` and `['services','[id]']`; this directory is what
// makes those the real ones.
//
// `auth-soft` is the interesting policy and it is the reason this stack exists
// in the shape it does: the screen RENDERS signed out — a visitor can read the
// service, its price and its free slots — and only the booking CTA prompts,
// returning through `?next=`. That is the join funnel's own rule (§7, D9)
// applied to personal training.
import { Stack } from 'expo-router';

export default function ServicesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
