import { Redirect } from 'expo-router';

// App entry. Auth-gated routing (session → tabs, otherwise → login/onboarding)
// lands in T6.2; for now the root simply enters the tab navigator at the
// Classes tab so the navigation shell is reachable on launch.
export default function Index() {
  return <Redirect href="/classes" />;
}
