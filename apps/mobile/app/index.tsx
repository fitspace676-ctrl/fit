// The entry route, `/`.
//
// `ROUTE_POLICY['']` is `'public'` — deliberately, so a cold launch never
// bounces through `/login` before the keychain read resolves. That means
// `resolveRedirect` answers `null` here for *every* session state, and the
// dispatch is this screen's own job. `route-policy.ts` says so in as many
// words: "the index screen itself redirects a signed-in user on".
//
// ## The loading state is the splash
//
// While `session.status === 'hydrating'` this renders nothing, and that is the
// complete loading branch (plan §6 item 1) for this route: `useAppBootstrap`
// holds the native splash over exactly this window, so drawing a spinner under
// it would paint a frame nobody can see and would need a "Loading…" string that
// no namespace carries. The one thing that must NOT happen here is a redirect
// on a half-known session — `hydrating` is not `signed-out`, and treating it as
// one is the returning-member-sees-a-flash-of-login bug.

import { Redirect } from 'expo-router';

import { useOnboarding } from '../hooks/useOnboarding';
import { useSession } from '../hooks/useSession';
import { HOME_ROUTE, LOGIN_ROUTE, ONBOARDING_ROUTE } from '../lib/route-policy';

export default function Index() {
  const session = useSession();
  const { isComplete } = useOnboarding();

  if (session.status === 'hydrating') {
    return null;
  }

  if (session.status === 'signed-out') {
    return <Redirect href={LOGIN_ROUTE} />;
  }

  // Signed in but the intro has not been seen on this install. Same order
  // `resolveRedirect` uses, so the two can never disagree about which of the
  // two post-sign-in destinations wins.
  if (!isComplete) {
    return <Redirect href={`/${ONBOARDING_ROUTE}`} />;
  }

  return <Redirect href={HOME_ROUTE} />;
}
