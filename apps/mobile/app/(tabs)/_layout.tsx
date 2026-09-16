// The app shell: four tabs.
//
// ===========================================================================
// HOME · CLASSES · SHOP · PROFILE.
//
// D8 settled the tab set from copy that already existed: `common.nav` carries
// the labels, and `member.profile.mobile.menu` lists `trainers` and `training`
// as PROFILE MENU ROWS with their own hints. So Services and Trainers are
// top-level stacks reached from Home sections and Profile rows, not tabs.
//
// ---------------------------------------------------------------------------
// THE CENTRE ACTION IS BACK (2026-09-09), AND IT IS A SCANNER NOW.
//
// D8 seated a QR slot in the middle of the capsule — `intercept: true`, handed
// back through `onSelect`, pushing the `/qr` modal. It was removed on
// 2026-08-31 with the screen it opened: that screen showed the member's own
// code, and Q1 closed the other way (no scanner side, and the only check-in
// surface on the API is `@Controller('admin/check-ins')` behind `MemberRead` /
// `MemberWrite`).
//
// WHAT CAME BACK IS NOT WHAT LEFT. `/qr` is now a CAMERA that reads a code and
// shows it — a test surface, marked as one on screen. Nothing about the API
// changed: there is still no member-scoped check-in endpoint, and the screen
// still sends nothing. So the slot returns on the strength of the artboards
// (`mobile-home-v2.tsx:484` lists it third of five) rather than on a backend
// that does not exist.
//
// FLUSH, NOT RAISED. `design-system.tsx:600` draws a raised-FAB bar; all five
// mobile artboards draw an equal 56pt round item in the capsule, and
// `floating-tab-bar.tsx` implements the artboards. The centre item is the same
// size as its neighbours and carries no highlight of its own.
//
// FIVE ITEMS FIT, and the arithmetic is already written down:
// `capsuleMetricsFor(width, items.length)` sizes the row from the count, and it
// SHRINKS below 340pt precisely for this case — 5 × 56 + 16 = 296 overflows the
// 280 a 320pt device leaves, 5 × 52 + 8 = 268 does not. The compact branch has
// been there since WP-6 and is now load-bearing again.
//
// `intercept` on `TabItem` in `@fit/ui-mobile` has a consumer again; it is the
// one item here whose press does not go through the navigator.
// ===========================================================================

import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StackActions } from 'expo-router/react-navigation';
import { FloatingTabBar, type IconName, type TabItem } from '@fit/ui-mobile';

import { useI18n } from '../../providers/I18nProvider';

/** The first tab shown on a cold launch into the shell. */
export const unstable_settings = { initialRouteName: 'home' };

/** The capsule's four TABS, in artboard order. Every one of them is a route. */
export const TAB_KEYS = ['home', 'classes', 'shop', 'profile'] as const;

export type TabKey = (typeof TAB_KEYS)[number];

/**
 * The centre action's key — deliberately NOT in {@link TAB_KEYS}.
 *
 * Nothing under `app/(tabs)/` answers to it: `/qr` is a root modal, so it has
 * no navigator route here, can never be the active key, and must never light a
 * tab up ({@link tabKeyForRouteName} returns `null` for it).
 */
export const QR_KEY = 'qr';

/** Where the centre action goes. A root `Stack` screen, `presentation: 'modal'`. */
export const QR_ROUTE = '/qr';

/** Everything the capsule draws: the four tabs plus the one action. */
export type CapsuleKey = TabKey | typeof QR_KEY;

/** The slot each tab draws. All four exist in the 60-glyph dictionary. */
const TAB_ICONS: Readonly<Record<TabKey, IconName>> = {
  home: 'home',
  classes: 'calendar',
  shop: 'bag',
  profile: 'user',
};

/**
 * Which tab a navigator route belongs to, or `null` for a route that is not a
 * tab at all.
 *
 * Matches on the FIRST path segment, so it is stable across the shape a tab
 * happens to have today: `profile` is a directory with a nested stack, so its
 * route name is `profile`, but a directory WITHOUT a `_layout` yields
 * `classes/index` and `classes/[id]` as two sibling routes. C3 converts those
 * to stacks; this function does not need to change when it does, and does not
 * break in the window before it happens.
 *
 * Exported for `_layout.test.tsx` — the alternative is asserting it through a
 * mounted navigator, which is how the deleted app's route table ended up
 * untested.
 */
export function tabKeyForRouteName(routeName: string): TabKey | null {
  const head = routeName.split('/')[0];
  if (head === undefined) return null;
  return (TAB_KEYS as readonly string[]).includes(head) ? (head as TabKey) : null;
}

/**
 * A tab's own stack, if it has one — `classes`, `shop` and `profile` are
 * directories with a `_layout`, `home` is a single file and never has one.
 *
 * The tab navigator's route carries the nested navigator's state once that
 * navigator has mounted; `key` is what a targeted action is addressed to, and
 * `index > 0` is "there is something pushed on top of the root".
 */
function nestedStackToReset(route: { state?: { key?: string; index?: number } }): string | null {
  const nested = route.state;
  if (!nested?.key) return null;
  return (nested.index ?? 0) > 0 ? nested.key : null;
}

/** The floating capsule, wired to the navigator. Mounted ONCE, here. */
export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useI18n();
  // The bar's ONE piece of navigation authority outside the navigator, and it
  // is the centre action's alone — `/qr` lives at the app root, so the tab
  // navigator cannot reach it.
  const router = useRouter();

  const current = state.routes[state.index]?.name ?? '';
  // Falls back to `home`: an unrecognised route (a stray screen a later stage
  // adds under `(tabs)`) should leave the capsule showing a real tab rather
  // than none at all.
  const activeKey: TabKey = tabKeyForRouteName(current) ?? 'home';

  // Third of five, which is the artboards' own order (`mobile-home-v2.tsx:481`)
  // and the only position that reads as an action rather than a destination.
  const items: readonly TabItem<CapsuleKey>[] = [
    { key: 'home', icon: TAB_ICONS.home, accessibilityLabel: t('common.nav.home') },
    { key: 'classes', icon: TAB_ICONS.classes, accessibilityLabel: t('common.nav.classes') },
    {
      key: QR_KEY,
      icon: 'qr',
      accessibilityLabel: t('qr.scanner.title'),
      // The whole point: the bar hands this straight back and does not touch
      // the navigator. Without it the press would look for a `qr` route under
      // `(tabs)`, find none, and do nothing at all.
      intercept: true,
    },
    { key: 'shop', icon: TAB_ICONS.shop, accessibilityLabel: t('common.nav.shop') },
    { key: 'profile', icon: TAB_ICONS.profile, accessibilityLabel: t('common.nav.profile') },
  ];

  return (
    <FloatingTabBar
      testID="tab"
      items={items}
      activeKey={activeKey}
      accessibilityLabel={t('member.shell.primaryNav')}
      // ====================================================================
      // A TAB PRESS ALWAYS LANDS ON THE TAB'S ROOT.
      //
      // `navigation.navigate(name)` alone restores whatever the tab was left
      // showing. Open Profile → My bookings, go to Home, come back to
      // Profile, and you are on My bookings with no way back to the profile
      // root — the capsule is the only affordance and it has just been used.
      // Same shape on Classes (`classes/[id]`) and Shop (`shop/product/[id]`).
      //
      // Two parts, and both are needed:
      //
      // 1. EMIT `tabPress`. The custom bar replaced react-navigation's own,
      //    and this event went with it — which is why even RE-TAPPING the
      //    open tab did nothing. `createNativeStackNavigator` listens for it
      //    and pops a FOCUSED stack to its root; so does `useScrollToTop` for
      //    a list. Emitting restores both, and `canPreventDefault` keeps the
      //    door open for a screen that must veto (an unsaved form).
      //
      // 2. POP THE TARGET STACK OURSELVES. The built-in listener only fires
      //    for the stack that is already focused, so it does not cover the
      //    switch-away-and-return case above. A targeted `popToTop` does, and
      //    is a no-op when the stack is already at its root.
      //
      // NOT `unmountOnBlur`: it would also reset the tab's query cache and
      // scroll position, so every return to a tab would re-fetch and jump.
      // Popping the stack is the smaller hammer, and the one iOS uses.
      // ====================================================================
      onSelect={(key, item) => {
        // THE INTERCEPTING ITEM SHORT-CIRCUITS EVERYTHING BELOW, and it is read
        // off the item rather than compared against `QR_KEY`: the flag is what
        // says "this one does not navigate", and a key comparison here would be
        // a second place to keep in sync with the array above.
        if (item.intercept) {
          // No `tabPress`, no `popToTop`, no `navigate` — the open tab stays
          // open and stays selected underneath the modal, which is what makes
          // this an action and not a fifth destination.
          router.push(QR_ROUTE);
          return;
        }

        const target = state.routes.find((route) => tabKeyForRouteName(route.name) === key);
        if (!target) return;

        const event = navigation.emit({
          type: 'tabPress',
          target: target.key,
          canPreventDefault: true,
        });
        if (event.defaultPrevented) return;

        const stackKey = nestedStackToReset(target);
        if (stackKey) {
          navigation.dispatch({ ...StackActions.popToTop(), target: stackKey });
        }
        navigation.navigate(target.name);
      }}
    />
  );
}

/**
 * The tab navigator.
 *
 * No `<Tabs.Screen>` children: the routes come from the file system, and
 * naming them here would pin a shape that is about to change — `classes/` and
 * `shop/` are directories with no `_layout` yet, so their route names are
 * `classes/index` and `shop/index` until C3 gives each one a stack. The
 * capsule reads the head segment ({@link tabKeyForRouteName}), so it is
 * correct both before and after that lands.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // Replaces react-navigation's bar entirely. The deleted repo shipped TWO
      // tab bars because a local kit grew one beside the shared one; there is
      // exactly one `FloatingTabBar` mount in this app, and it is this line.
      tabBar={(props: BottomTabBarProps) => <AppTabBar {...props} />}
    />
  );
}
