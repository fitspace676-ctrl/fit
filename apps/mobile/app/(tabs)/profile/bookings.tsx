// `/profile/bookings` — the member's classes and PT sessions.
//
// ===========================================================================
// THE CONTENT MOVED; THE ROUTE DID NOT.
//
// Everything below the `AppBar` is `components/classes/my-bookings-view.tsx`,
// because the schedule screen grew a "My bookings" tab that shows the same
// thing (`app/(tabs)/classes/index.tsx`). Two copies of a list with a cancel
// confirmation and a review composer in it is two places for the `ATTENDED`
// rule to drift, so there is one, and it carries the reasoning.
//
// This file stays because the route does: Profile links here, and a deep link
// to `/profile/bookings` that used to resolve should keep resolving. What is
// left is exactly the chrome a stack screen owes — the frame, the title, and a
// back button the tab version has no use for.
//
// ---------------------------------------------------------------------------
// WHY IT LIVES UNDER `profile/` AND NOT AS `(tabs)/bookings.tsx`.
//
// Two reasons, and the first is a bug the second only makes worse.
//
//   1. **The capsule would lie.** `app/(tabs)/_layout.tsx` derives the selected
//      tab from the navigator's current route via `tabKeyForRouteName`, which
//      matches the HEAD SEGMENT against `TAB_KEYS = ['home','classes','shop',
//      'profile']`. A file at `app/(tabs)/bookings.tsx` is a fifth route in that
//      navigator whose head segment is `bookings`, so `tabKeyForRouteName`
//      answers `null` and the capsule falls back to `home` — highlighting Home
//      while the member is looking at their bookings. Nothing in that file may
//      be edited to fix it: `(tabs)/_layout.tsx` is C2's and its four-item
//      arithmetic is pinned by a test. (The tab version does not have this
//      problem: it is a VIEW inside `(tabs)/classes`, not a fifth route.)
//
//   2. **It would have no back stack.** A sibling tab route swaps the tab's
//      content, so there is no iOS back gesture and nothing for Android's back
//      button to pop. Under `profile/` it joins the stack `profile/_layout.tsx`
//      already declares — the stack that exists precisely because Profile grew a
//      second screen.
//
// `ROUTE_POLICY` agrees either way: `'(tabs)/profile'` is `auth`, and
// `policyFor` matches by longest prefix, so `['(tabs)','profile','bookings']`
// resolves to `auth` without a new row. The bare `bookings: 'auth'` row in that
// table stays true for a future top-level route and is not relied on here.
// ===========================================================================

import { useRouter } from 'expo-router';
import { AppBar, IconButton, Screen } from '@fit/ui-mobile';

import { MyBookingsView } from '../../../components/classes/my-bookings-view';
import { useI18n } from '../../../providers/I18nProvider';

export default function BookingsScreen() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <Screen
      testID="bookings-screen"
      header={
        <AppBar
          eyebrow={t('account.bookings.eyebrow')}
          title={t('account.bookings.title')}
          subtitle={t('account.bookings.subtitle')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="bookings-back"
            />
          }
        />
      }
    >
      <MyBookingsView />
    </Screen>
  );
}
