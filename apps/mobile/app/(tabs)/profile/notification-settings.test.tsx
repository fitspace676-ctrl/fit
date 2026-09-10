// `/profile/notification-settings` — the screen whose most important assertion
// is that it calls NOTHING.
//
// Plan §7: "The deleted app shipped a settings screen that called nothing and
// stored toggles in AsyncStorage. Do not rebuild that illusion: either drop the
// screen or make it plainly device-local." The three tests below are the three
// halves of "plainly":
//
//   1. a disclaimer is on screen before any control;
//   2. flipping a toggle sends nothing anywhere;
//   3. nothing is persisted — a remount starts from the defaults.
//
// If a later change wires these to a preferences endpoint, tests 2 and 3 are the
// ones that should be deleted, deliberately, in the same commit.
import { fireEvent } from '@testing-library/react-native';

import NotificationSettingsScreen from './notification-settings';
import { resetDevicePrefs } from '../../../components/notifications/device-prefs';
import { renderApp } from '../../../test-support/render';

jest.setTimeout(30_000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

// Every route the notification surface HAS, so the test can prove none is hit.
const mockList = jest.fn();
const mockUnread = jest.fn();
const mockMarkRead = jest.fn();
const mockRegisterPush = jest.fn();
const mockUnregisterPush = jest.fn();
jest.mock('../../../lib/api/notifications', () => ({
  listNotifications: () => mockList() as unknown,
  getUnreadCount: () => mockUnread() as unknown,
  markNotificationsRead: () => mockMarkRead() as unknown,
  registerPushToken: () => mockRegisterPush() as unknown,
  unregisterPushToken: () => mockUnregisterPush() as unknown,
}));

beforeEach(() => {
  mockPush.mockClear();
  for (const fake of [mockList, mockUnread, mockMarkRead, mockRegisterPush, mockUnregisterPush]) {
    fake.mockReset();
    fake.mockResolvedValue({});
  }
  resetDevicePrefs();
});

/**
 * A host node's `accessibilityState`, typed.
 *
 * RNTL types host props as `any`, so reaching into them is three
 * `no-unsafe-*` lint errors at every call site. Narrowed once here, the way the
 * other screen tests narrow `props.children` for the header assertions.
 */
function a11yState(node: unknown): { disabled?: boolean; checked?: boolean } {
  return (
    (node as { props?: { accessibilityState?: { disabled?: boolean; checked?: boolean } } }).props
      ?.accessibilityState ?? {}
  );
}

describe('the disclaimer', () => {
  it('leads the screen, before any control', () => {
    const { getByTestId } = renderApp(<NotificationSettingsScreen />);
    // TODO(i18n) `notifications.deviceOnly` — a marked English placeholder.
    // The branch ships; the sentence is owed.
    expect(getByTestId('notification-settings-disclaimer')).toBeTruthy();
  });

  it('renders the catalogue s own admission that delivery is not live', () => {
    // `notifications.subtitle` was authored as "…Delivery is enabled in a later
    // update." Someone already knew; this screen does not contradict them.
    const { getByText } = renderApp(<NotificationSettingsScreen />);
    expect(getByText(/Delivery is enabled in a later update/)).toBeTruthy();
  });
});

describe('what the toggles do', () => {
  it('calls NO endpoint — not even the push-token routes', () => {
    const { getByTestId } = renderApp(<NotificationSettingsScreen />);
    fireEvent.press(getByTestId('notification-settings-push'));
    fireEvent.press(getByTestId('notification-settings-promotions'));

    // The push-token pair DOES exist and will back the master switch when C6
    // wires `expo-notifications`. Until a real token can be produced, calling
    // them would register a device that cannot receive anything.
    expect(mockRegisterPush).not.toHaveBeenCalled();
    expect(mockUnregisterPush).not.toHaveBeenCalled();
    // And there is no preferences controller at all to call.
    expect(mockList).not.toHaveBeenCalled();
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('persists NOTHING — a fresh mount starts from the defaults', () => {
    const first = renderApp(<NotificationSettingsScreen />);
    fireEvent.press(first.getByTestId('notification-settings-push'));
    expect(a11yState(first.getByTestId('notification-settings-push')).checked).toBe(true);
    first.unmount();

    // `resetDevicePrefs()` in `beforeEach` stands in for a process restart.
    // AsyncStorage is deliberately not used: a toggle that survives a relaunch
    // is indistinguishable from a setting that was SAVED, and nothing is.
    resetDevicePrefs();
    const second = renderApp(<NotificationSettingsScreen />);
    expect(a11yState(second.getByTestId('notification-settings-push')).checked).toBe(false);
  });

  it('gates the categories behind the master switch, and says why', () => {
    const { getByTestId, queryByTestId } = renderApp(<NotificationSettingsScreen />);
    expect(a11yState(getByTestId('notification-settings-classReminders')).disabled).toBe(true);
    expect(getByTestId('notification-settings-disabled')).toBeTruthy();

    fireEvent.press(getByTestId('notification-settings-push'));
    expect(a11yState(getByTestId('notification-settings-classReminders')).disabled).toBe(false);
    expect(queryByTestId('notification-settings-disabled')).toBeNull();
  });
});

describe('the chrome', () => {
  it('announces the title, then the categories section', () => {
    const { getAllByRole } = renderApp(<NotificationSettingsScreen />);
    const headers = getAllByRole('header').map(
      (node) => (node as unknown as { props?: { children?: unknown } }).props?.children,
    );
    expect(headers).toEqual(['Notifications', 'Categories']);
  });

  it('renders no key paths, in either locale', () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<NotificationSettingsScreen />, { locale });
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/"notifications\./i);
      screen.unmount();
    }
  });
});
