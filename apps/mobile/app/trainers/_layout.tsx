// The Trainers stack — TOP-LEVEL, not a tab, and the copy decided that (D8).
//
// ===========================================================================
// WHY THIS DIRECTORY IS `app/trainers/` AND NOT `app/(tabs)/trainers/`.
//
// The capsule is Home · Classes · Shop · Profile: `common.nav` carries
// exactly seven labels and none of them is "trainers", while
// `member.profile.mobile.menu` lists `trainers` and `training` as PROFILE MENU
// ROWS with their own hints. A copy set that files a screen under a menu is a
// copy set that does not expect it in the tab bar.
//
// But the deciding constraint is mechanical, not editorial. `ROUTE_POLICY`
// (`lib/route-policy.ts`, which C3b does not own) declares:
//
//     trainers: 'public',
//
// and `policyFor` matches by LONGEST PREFIX over `useSegments()`. Under
// `(tabs)` the segments are `['(tabs)', 'trainers']`; neither
// `(tabs)/trainers` nor `(tabs)` is in the table, so the walk falls through to
// `DEFAULT_POLICY`, which is `'auth'` — fail closed, by design. Every
// signed-out visitor tapping a trainer would be bounced to `/login`, which is
// precisely the defect §1 lists as the reason the old app was deleted.
// `lib/route-policy.spec.ts` already pins the intended shape:
//
//     trainers: ['trainers'],
//
// expected `'public'`. So the route lives here, at the root, where the guard
// already says it is public. Same for `app/services/`.
//
// ---------------------------------------------------------------------------
// THE STACK HAS ONE SCREEN (2026-09-09).
//
// `[id].tsx` — the trainer's profile — is gone. Everything it drew is now the
// sheet in `components/classes/trainer-sheet.tsx`, which the roster, class
// detail and home all open, so a coach is read WITHOUT leaving the screen the
// member came from. The stack stays because `/trainers` is still a pushed route
// from four places and needs its own back gesture.
//
// ---------------------------------------------------------------------------
// `headerShown: false` because the frame is `Screen` + `AppBar` from
// `@fit/ui-mobile`, one design system, no second navigation chrome. Back is an
// `IconButton` in each screen's `AppBar`; the platform gestures (iOS swipe,
// Android hardware back) still work because this IS a real stack.
//
// `fit://trainers` lands here directly. `fit://trainers/:id` — the shape web
// still publishes and old emails still carry — is folded onto the roster by
// `app/+native-intent.ts`, because there is no longer a route with that shape
// to land on.
// ===========================================================================
import { Stack } from 'expo-router';

export default function TrainersLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
