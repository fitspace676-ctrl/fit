// `/membership` — a redirect, and the reason it exists is a locked test.
//
// ===========================================================================
// THIS ROUTE HAS NO SCREEN. IT KEEPS AN EXISTING LINK ALIVE.
//
// `components/classes/booking-notice.tsx` (C3a) renders the 403
// `SUBSCRIPTION_FROZEN` refusal with a way out — `router.push('/membership')` —
// and `app/(tabs)/classes/[id].test.tsx:450` asserts that exact href. Both were
// written against `ROUTE_POLICY`'s top-level `membership: 'auth'` row, at a time
// when C5 had not yet decided where the screen would live.
//
// C5 put it under the Profile stack (`app/(tabs)/profile/membership.tsx`),
// because that is where `profile/_layout.tsx` gives it a back stack and where
// the Profile menu's other rows already point (`/profile/billing`,
// `/profile/notifications`, both asserted by `profile/index.test.tsx`). With no
// route at `/membership`, that frozen-membership link would land on expo-router's
// "Unmatched Route" screen — a real, shipped dead end.
//
// The three ways to close it, and why this is the one taken:
//
//   * Edit `booking-notice.tsx` to push `/profile/membership` — but
//     `app/(tabs)/classes/**` is another package's territory this stage may not
//     write to, and the assertion lives there.
//   * Move the screen to the app root — but then it leaves the Profile stack and
//     loses its back gesture, and every other account route would have to move
//     with it for consistency.
//   * **Keep both**: one canonical screen, and this three-line alias. The alias
//     costs nothing at runtime (expo-router unmounts it immediately) and it is
//     the only one of the three that touches no file this stage does not own.
//
// `ROUTE_POLICY` already governs it: `membership: 'auth'`, so a signed-out
// visitor is sent to `/login?next=/membership` and arrives here — and then at
// the real screen — once signed in.

import { Redirect } from 'expo-router';

/** `/membership` → the canonical screen inside the Profile stack. */
export default function MembershipAlias() {
  return <Redirect href="/profile/membership" />;
}
