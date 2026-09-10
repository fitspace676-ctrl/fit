import { fireEvent } from '@testing-library/react-native';

import { AppTabBar, QR_KEY, QR_ROUTE, TAB_KEYS, tabKeyForRouteName } from './_layout';
import { renderScreen } from '../../test-support/render-screen';

/**
 * RNTL types a host node's `props` as `any`, so reaching into it is an unsafe
 * member access the shared lint config (correctly) refuses. Narrowed once
 * here, the way `@fit/ui-mobile`'s own tests do — inline rather than in
 * `test-support/`, which C1 owns for this stage.
 */
function a11yState(node: unknown): { disabled?: boolean; selected?: boolean; busy?: boolean } {
  const props = (node as { props?: { accessibilityState?: unknown } }).props;
  return (props?.accessibilityState as { selected?: boolean } | undefined) ?? {};
}

// `mock`-prefixed so the hoisted factory may close over it — jest's own rule.
// The bar holds exactly ONE `router.push`, for the QR centre action, which is
// the one item that does not go through the navigator at all.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
// `expo-router/js-tabs` is imported by the module under test for its default
// export, which this file never renders. Stubbed so the navigator's native
// dependencies stay out of the graph.
jest.mock('expo-router/js-tabs', () => ({ Tabs: () => null }));

/** The nested-stack state a tab route carries once its `_layout` has mounted. */
type NestedState = { key: string; index: number };

/** A minimal navigator state, in the shape `tabBar` actually receives. */
function stateFor(
  routeNames: readonly string[],
  index: number,
  nested: Readonly<Record<string, NestedState>> = {},
) {
  return {
    index,
    routes: routeNames.map((name, i) => ({
      key: `${name}-${i}`,
      name,
      ...(nested[name] ? { state: nested[name] } : {}),
    })),
  } as never;
}

const ROUTES = ['home', 'classes/index', 'shop/index', 'profile'];

/**
 * The navigator helpers the bar uses. `emit` answers the way react-navigation
 * does — a `tabPress` sent with `canPreventDefault` comes back with a verdict,
 * and the bar reads it.
 */
function navigationMock(defaultPrevented = false) {
  const navigate = jest.fn();
  const dispatch = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented }));
  return { navigate, dispatch, emit };
}

function renderBar(activeIndex = 0, nested: Readonly<Record<string, NestedState>> = {}) {
  const navigation = navigationMock();
  const utils = renderScreen(
    <AppTabBar
      state={stateFor(ROUTES, activeIndex, nested)}
      navigation={navigation as never}
      descriptors={{}}
      insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
    />,
  );
  return { ...utils, ...navigation };
}

beforeEach(() => {
  mockPush.mockClear();
});

describe('tabKeyForRouteName', () => {
  it('matches on the head segment, so a tab survives becoming a stack', () => {
    // `classes/index` today, `classes` once C3 adds `classes/_layout.tsx`.
    expect(tabKeyForRouteName('classes/index')).toBe('classes');
    expect(tabKeyForRouteName('classes')).toBe('classes');
    expect(tabKeyForRouteName('classes/[id]')).toBe('classes');
    expect(tabKeyForRouteName('profile/billing')).toBe('profile');
  });

  it('returns null for anything that is not a tab', () => {
    expect(tabKeyForRouteName('onboarding')).toBeNull();
    expect(tabKeyForRouteName('')).toBeNull();
    // `qr` is the centre ACTION, not a tab: it is a root modal with no route
    // under `(tabs)`, so it must never light one up.
    expect(tabKeyForRouteName(QR_KEY)).toBeNull();
    expect(TAB_KEYS).not.toContain(QR_KEY);
  });
});

describe('the capsule', () => {
  it('renders four tabs and the centre action — five slots, four routes', () => {
    const { getByTestId } = renderBar();
    for (const key of TAB_KEYS) {
      expect(getByTestId(`tab-${key}`)).toBeTruthy();
    }
    expect(getByTestId(`tab-${QR_KEY}`)).toBeTruthy();
    // The count split is the point: five items in the capsule, four of which
    // are navigator routes. `capsuleMetricsFor` sizes the row from the item
    // count, so a fifth slot is a layout fact as well as a routing one.
    expect(TAB_KEYS).toHaveLength(4);
    expect(ROUTES).toHaveLength(4);
  });

  it('labels every item — the capsule has no text on any artboard', () => {
    const { getByTestId } = renderBar();
    for (const key of [...TAB_KEYS, QR_KEY]) {
      const label = getByTestId(`tab-${key}`).props.accessibilityLabel as unknown;
      expect(typeof label).toBe('string');
      expect(label).not.toBe('');
    }
  });

  it('routes every TAB through the navigator and pushes nothing', () => {
    // The bar holds exactly one `router.push`, and it is the centre action's.
    // This is the assertion that keeps a tab from quietly growing a second
    // navigation authority beside the navigator.
    const { getByTestId, navigate } = renderBar();
    for (const key of TAB_KEYS) {
      fireEvent.press(getByTestId(`tab-${key}`));
    }
    expect(navigate).toHaveBeenCalledTimes(TAB_KEYS.length);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('selects exactly one item at a time, and never the centre action', () => {
    const { getByTestId } = renderBar(0);
    const selected = [...TAB_KEYS, QR_KEY].filter(
      (key) => a11yState(getByTestId(`tab-${key}`)).selected,
    );
    expect(selected).toEqual(['home']);
  });

  /**
   * The centre action, which is the whole reason `intercept` exists on
   * `TabItem`. It pushes a ROOT route the tab navigator cannot reach, and it
   * must leave the shell exactly as it found it: same tab open, same tab
   * selected, no `tabPress`, no stack popped.
   */
  describe('the QR centre action', () => {
    it('pushes the scanner instead of switching tabs', () => {
      const { getByTestId, navigate, dispatch, emit } = renderBar(0);
      fireEvent.press(getByTestId(`tab-${QR_KEY}`));
      expect(mockPush).toHaveBeenCalledWith(QR_ROUTE);
      expect(navigate).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
      // No `tabPress` either: emitting it would pop the focused tab's stack
      // out from under the modal, so returning from the scanner would land
      // somewhere the member never left.
      expect(emit).not.toHaveBeenCalled();
    });

    it('leaves the open tab selected underneath the modal', () => {
      const { getByTestId } = renderBar(3);
      fireEvent.press(getByTestId(`tab-${QR_KEY}`));
      expect(a11yState(getByTestId('tab-profile')).selected).toBe(true);
      expect(a11yState(getByTestId(`tab-${QR_KEY}`)).selected).toBe(false);
    });
  });

  it('navigates within the navigator for a real tab', () => {
    const { getByTestId, navigate } = renderBar(0);
    fireEvent.press(getByTestId('tab-shop'));
    // The ROUTE name, not the tab key — `shop/index` until C3 adds a stack.
    expect(navigate).toHaveBeenCalledWith('shop/index');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('selects the tab the navigator says is active, through a nested route', () => {
    const { getByTestId } = renderBar(3);
    expect(a11yState(getByTestId('tab-profile')).selected).toBe(true);
    expect(a11yState(getByTestId('tab-home')).selected).toBe(false);
  });

  it('falls back to home for an unknown route', () => {
    const navigation = navigationMock() as never;
    const { getByTestId } = renderScreen(
      <AppTabBar
        state={stateFor(['some-later-screen'], 0)}
        navigation={navigation}
        descriptors={{}}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
    );
    expect(a11yState(getByTestId('tab-home')).selected).toBe(true);
    expect(a11yState(getByTestId('tab-classes')).selected).toBe(false);
  });

  it('renders its labels in the active locale', () => {
    const navigation = navigationMock() as never;
    const en = renderScreen(
      <AppTabBar
        state={stateFor(ROUTES, 0)}
        navigation={navigation}
        descriptors={{}}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
      { locale: 'en' },
    );
    const ka = renderScreen(
      <AppTabBar
        state={stateFor(ROUTES, 0)}
        navigation={navigation}
        descriptors={{}}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
      { locale: 'ka' },
    );
    expect(en.getByTestId('tab-home').props.accessibilityLabel).toBe('Home');
    // Not asserted as a literal: the point is that it CHANGES, not what it is.
    expect(ka.getByTestId('tab-home').props.accessibilityLabel).not.toBe('Home');
  });
});

/**
 * The bug this covers: Profile → My bookings → Home → Profile used to come
 * back to My bookings, with nothing on screen able to reach the profile root.
 * A tab press lands on the tab's ROOT, every time.
 */
describe('a tab press resets that tab to its root', () => {
  const POPPED = { profile: { key: 'profile-stack', index: 2 } };

  it('pops the target stack even when the tab is not the focused one', () => {
    // Focus is on Home (index 0); Profile is two screens deep from an earlier
    // visit. This is the reported bug, in exactly its reported order.
    const { getByTestId, dispatch, navigate } = renderBar(0, POPPED);
    fireEvent.press(getByTestId('tab-profile'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'POP_TO_TOP', target: 'profile-stack' }),
    );
    expect(navigate).toHaveBeenCalledWith('profile');
  });

  it('pops on a re-tap of the tab that is already open', () => {
    const { getByTestId, dispatch } = renderBar(3, POPPED);
    fireEvent.press(getByTestId('tab-profile'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'POP_TO_TOP', target: 'profile-stack' }),
    );
  });

  it('dispatches nothing for a stack already at its root, or a tab without one', () => {
    const { getByTestId, dispatch, navigate } = renderBar(0, {
      profile: { key: 'profile-stack', index: 0 },
    });
    fireEvent.press(getByTestId('tab-profile'));
    // `home` is a single file and never carries nested state at all.
    fireEvent.press(getByTestId('tab-home'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('emits tabPress at the target route, so the stack and lists can react', () => {
    // `createNativeStackNavigator` pops a focused stack off this event and
    // `useScrollToTop` scrolls a list to the top. The custom bar replaced
    // react-navigation's own, which is what dropped the event in the first
    // place — losing it again is the regression this line catches.
    const { getByTestId, emit } = renderBar(0, POPPED);
    fireEvent.press(getByTestId('tab-classes'));
    expect(emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'classes/index-1',
      canPreventDefault: true,
    });
  });

  it('does nothing at all when a listener prevents the default', () => {
    const navigation = navigationMock(true);
    const { getByTestId } = renderScreen(
      <AppTabBar
        state={stateFor(ROUTES, 0, POPPED)}
        navigation={navigation as never}
        descriptors={{}}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
    );
    fireEvent.press(getByTestId('tab-profile'));
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
