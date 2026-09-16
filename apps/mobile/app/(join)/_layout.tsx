// The join funnel — its own route group, with no shell at all.
//
// ===========================================================================
// WHY `(join)` IS NOT UNDER `(tabs)`, AND WHY IT HAS NO NAVIGATION.
//
// The person in this stack is NOT A MEMBER YET. That is not a stylistic
// observation, it is what the whole group is for:
//
//   * **No tab bar.** Home, Classes, Shop and Profile are all `auth` or member
//     surfaces; the capsule under a buyer who has no account is four
//     destinations that either bounce them to `/login` or show them someone
//     else's data. `Screen` therefore takes `reserveTabBar={false}` on every
//     screen in here, or the funnel would end 128pt above the fold with a band
//     of dead canvas under it.
//   * **No back chevron in a header of its own.** The funnel's own Back button
//     moves between STEPS (see `components/checkout/join-state.ts` — four
//     steps, one route), and a navigator chevron beside it would mean something
//     different: pop the stack. Two "back"s on one screen meaning two things is
//     how a buyer loses four steps of typing.
//   * **`ROUTE_POLICY['(join)'] = 'public'`**, and it must stay that way. D9:
//     "a signed-out purchase impossible" is listed in §1 among the reasons the
//     old app was deleted, and this funnel is the flow that was impossible. The
//     group name is load-bearing for that — `policyFor` matches on
//     `useSegments()` WITH the route groups left in, so moving these screens
//     under `(tabs)` would make the segments `['(tabs)','checkout']`, fall
//     through to `DEFAULT_POLICY: 'auth'`, and bounce every signed-out visitor
//     to `/login` before they could begin. That is exactly the mistake C3b
//     caught in its own brief for `trainers` / `services`.
//
// What the group DOES inherit is everything above it: the theme, the
// catalogues, the query client and the toast host all come from `AppProviders`
// in the root layout. This file adds a `Stack` and nothing else.
// ===========================================================================

import { Stack } from 'expo-router';

export default function JoinLayout() {
  // `headerShown: false` for the reason above — every screen in here draws its
  // own `AppBar` inside `Screen`, which is what puts the title under the safe
  // area rather than in a navigator chrome the design has no comp for.
  return <Stack screenOptions={{ headerShown: false }} />;
}
