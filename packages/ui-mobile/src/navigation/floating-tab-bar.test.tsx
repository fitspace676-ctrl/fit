// Render tests for `FloatingTabBar`.
//
// This is the component the previous app shipped TWICE — once from the design
// package as an emoji-glyph `TabBarIcon`, once as a local re-implementation —
// so the tests here are deliberately about the contract a screen depends on
// rather than about how it looks: N tabs, exactly one selected, every item
// routed through `onSelect`, and the bar out of the way of the keyboard.

import { act } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { capsuleMetricsFor, tabBarBottomOffset } from '../layout/metrics';
import { darkColors } from '../tokens/semantic';

import { FloatingTabBar, type TabItem } from './floating-tab-bar';

/**
 * A five-item bar with an intercepting slot in the middle.
 *
 * This is the shape the artboards drew, and it is kept here on purpose even
 * though `apps/mobile` now ships four tabs and no intercepting item: these are
 * the PACKAGE's tests, and `intercept` plus an odd item count are contracts the
 * component still honours. The app's own four-tab wiring is asserted in
 * `apps/mobile/app/(tabs)/_layout.test.tsx`.
 */
const ITEMS: TabItem[] = [
  { key: 'home', icon: 'home', accessibilityLabel: 'მთავარი' },
  { key: 'classes', icon: 'calendar', accessibilityLabel: 'გაკვეთილები' },
  { key: 'qr', icon: 'qr', accessibilityLabel: 'გამოცხადება', intercept: true },
  { key: 'shop', icon: 'bag', accessibilityLabel: 'მაღაზია' },
  { key: 'profile', icon: 'user', accessibilityLabel: 'პროფილი' },
];

const showEvent = () => (Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow');
const hideEvent = () => (Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide');

/**
 * Capture the component's own keyboard subscriptions.
 *
 * `Keyboard` is not a public event emitter in RN 0.85 — there is no `emit` to
 * drive it from a test — so the listeners are intercepted at
 * `Keyboard.addListener` and invoked directly. That is the stronger test
 * anyway: it asserts WHICH events the component subscribed to, which is the
 * half of trap 3 that differs between the two platforms.
 */
function captureKeyboardListeners(): Map<string, () => void> {
  const listeners = new Map<string, () => void>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
    listeners.set(event, handler);
    return {
      remove: () => {
        listeners.delete(event);
      },
    };
  }) as unknown as typeof Keyboard.addListener);
  return listeners;
}

function a11yState(node: unknown): { selected?: boolean } {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  return props.accessibilityState ?? {};
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function renderBar(
  props: Partial<React.ComponentProps<typeof FloatingTabBar>> = {},
  insets = { top: 0, bottom: 0, left: 0, right: 0 },
) {
  return render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <FloatingTabBar
        items={ITEMS}
        activeKey="home"
        onSelect={jest.fn()}
        accessibilityLabel="ნავიგაცია"
        testID="tab"
        {...props}
      />
    </SafeAreaInsetsContext.Provider>,
  );
}

describe('FloatingTabBar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is a tablist of N tabs with exactly one selected', () => {
    renderBar({ activeKey: 'shop' });

    expect(screen.getByTestId('tab').props.accessibilityRole).toBe('tablist');
    expect(screen.getByTestId('tab').props.accessibilityLabel).toBe('ნავიგაცია');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(ITEMS.length);
    expect(tabs.filter((tab) => a11yState(tab).selected === true)).toHaveLength(1);
    expect(a11yState(screen.getByTestId('tab-shop')).selected).toBe(true);
    expect(a11yState(screen.getByTestId('tab-home')).selected).toBe(false);
  });

  it('every item is icon-only and therefore labelled', () => {
    // There is not a word of text in the capsule on any artboard. Without
    // these labels the whole navigation of the app is unreachable.
    renderBar();
    for (const item of ITEMS) {
      expect(screen.getByTestId(`tab-${item.key}`).props.accessibilityLabel).toBe(
        item.accessibilityLabel,
      );
    }
  });

  it('routes a plain tab through onSelect', () => {
    const onSelect = jest.fn();
    renderBar({ onSelect });
    fireEvent.press(screen.getByTestId('tab-classes'));
    expect(onSelect).toHaveBeenCalledWith('classes', ITEMS[1]);
  });

  // ==========================================================================
  // `intercept`: the bar calls `onSelect` and THE CALLER decides.
  // ==========================================================================
  it('routes an INTERCEPT item through onSelect too, carrying the flag back', () => {
    const onSelect = jest.fn();
    renderBar({ onSelect });

    fireEvent.press(screen.getByTestId('tab-qr'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [key, item] = onSelect.mock.calls[0] as [string, TabItem];
    expect(key).toBe('qr');
    // The flag comes back with it, so the caller branches on the item rather
    // than re-deriving the decision from a string it also chose.
    expect(item.intercept).toBe(true);
  });

  it('still paints an intercept item active when the caller DID navigate to it', () => {
    // `intercept` says "ask the caller", not "never selected": a caller that
    // does navigate to an intercepting item must still see it painted active.
    renderBar({ activeKey: 'qr' });
    expect(a11yState(screen.getByTestId('tab-qr')).selected).toBe(true);
  });

  // ==========================================================================
  // TRAP 1 — the geometry, at whatever width this runner reports.
  // ==========================================================================
  it('draws the items at the width-appropriate size', () => {
    const { width } = Dimensions.get('window');
    const metrics = capsuleMetricsFor(width, ITEMS.length);

    renderBar();
    const style = flatten(screen.getByTestId('tab-home').props.style);
    expect(style.width).toBe(metrics.itemSize);
    expect(style.height).toBe(metrics.itemSize);
    // Whatever the branch, the item clears the touch floor on its own.
    expect(Number(style.width)).toBeGreaterThanOrEqual(44);
  });

  it('the active plate is the lime, and the idle one has no plate at all', () => {
    renderBar({ activeKey: 'home' });
    expect(flatten(screen.getByTestId('tab-home').props.style).backgroundColor).toBe(
      darkColors.accent,
    );
    expect(flatten(screen.getByTestId('tab-shop').props.style).backgroundColor).toBeUndefined();
  });

  // ==========================================================================
  // TRAP 2 — the safe area.
  // ==========================================================================
  it('sits 24 from the edge with no home indicator', () => {
    renderBar({}, { top: 0, bottom: 0, left: 0, right: 0 });
    expect(flatten(screen.getByTestId('tab').props.style).bottom).toBe(24);
  });

  it('clears a home indicator rather than sitting on it', () => {
    renderBar({}, { top: 59, bottom: 34, left: 0, right: 0 });
    const bottom = flatten(screen.getByTestId('tab').props.style).bottom;
    expect(bottom).toBe(tabBarBottomOffset(34));
    expect(Number(bottom)).toBeGreaterThan(34);
  });

  it('renders with no SafeAreaProvider above it instead of throwing', () => {
    // `useSafeAreaInsets` throws without a provider. A design component that
    // takes the screen down because it was rendered in a test or a detached
    // modal is a component people stop using.
    expect(() =>
      render(
        <FloatingTabBar
          items={ITEMS}
          activeKey="home"
          onSelect={jest.fn()}
          accessibilityLabel="ნავიგაცია"
          testID="bare"
        />,
      ),
    ).not.toThrow();
    expect(flatten(screen.getByTestId('bare').props.style).bottom).toBe(24);
  });

  // ==========================================================================
  // TRAP 3 — the keyboard.
  // ==========================================================================
  it('subscribes to the events the RUNNING platform actually emits', () => {
    // Android never fires `keyboardWillShow`; iOS fires it at the START of the
    // show animation, so the capsule leaves as the keyboard arrives rather
    // than a frame after it. Getting this pair wrong on Android is a bar that
    // simply never hides.
    const listeners = captureKeyboardListeners();
    renderBar();

    const expected =
      Platform.OS === 'ios'
        ? ['keyboardWillShow', 'keyboardWillHide']
        : ['keyboardDidShow', 'keyboardDidHide'];
    expect([...listeners.keys()].sort()).toEqual([...expected].sort());
  });

  it('gets out of the way while the keyboard is up', () => {
    const listeners = captureKeyboardListeners();
    renderBar();
    expect(screen.getByTestId('tab')).toBeTruthy();

    act(() => {
      listeners.get(showEvent())?.();
    });
    // A 72pt capsule over a keyboard accessory bar makes the bottom fifth of
    // the keyboard untappable — a form the user cannot finish, not a polish
    // issue.
    expect(screen.queryByTestId('tab')).toBeNull();

    act(() => {
      listeners.get(hideEvent())?.();
    });
    expect(screen.getByTestId('tab')).toBeTruthy();
  });

  it('keepVisibleWithKeyboard opts out, for a screen that needs it', () => {
    const listeners = captureKeyboardListeners();
    renderBar({ keepVisibleWithKeyboard: true });
    act(() => {
      listeners.get(showEvent())?.();
    });
    expect(screen.getByTestId('tab')).toBeTruthy();
  });

  it('lets touches through its gutters', () => {
    // The bar spans the full width and is absolutely positioned over the page,
    // so without `box-none` its 20pt gutters would swallow every touch on the
    // last row of content.
    renderBar();
    expect(screen.getByTestId('tab').props.pointerEvents).toBe('box-none');
  });
});
