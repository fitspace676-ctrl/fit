import { fireEvent } from '@testing-library/react-native';
import NotificationSettingsScreen from './notification-settings';
import { renderApp } from '../../../test-support/render';

const mockSync = jest.fn();
let mockPrefs = {
  userId: 'member',
  push: false,
  permission: 'undetermined',
  busy: false,
  error: false,
};
jest.mock('../../../components/notifications/device-prefs', () => ({
  useDevicePrefs: () => mockPrefs,
  syncPushPreference: (...args: unknown[]) => mockSync(...args) as unknown,
}));
jest.mock('../../../hooks/useSession', () => ({
  useSession: () => ({ status: 'signed-in', userId: 'member' }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
beforeEach(() => {
  mockSync.mockReset();
  mockSync.mockResolvedValue(undefined);
  mockPrefs = {
    userId: 'member',
    push: false,
    permission: 'undetermined',
    busy: false,
    error: false,
  };
});
it('refreshes permission without requesting an opt-in on mount', () => {
  const screen = renderApp(<NotificationSettingsScreen />);
  expect(mockSync).toHaveBeenCalledWith('member');
  expect(screen.getByText('System permission: not requested yet')).toBeTruthy();
  expect(screen.queryByTestId('notification-settings-promotions')).toBeNull();
});
it('requests registration only when the member turns the switch on', () => {
  const screen = renderApp(<NotificationSettingsScreen />);
  fireEvent.press(screen.getByTestId('notification-settings-push'));
  expect(mockSync).toHaveBeenLastCalledWith('member', true);
});
it('unregisters when an enabled switch is turned off', () => {
  mockPrefs = { ...mockPrefs, push: true, permission: 'granted' };
  const screen = renderApp(<NotificationSettingsScreen />);
  fireEvent.press(screen.getByTestId('notification-settings-push'));
  expect(mockSync).toHaveBeenLastCalledWith('member', false);
});
it('exposes system settings after permission is denied', () => {
  mockPrefs = { ...mockPrefs, permission: 'denied' };
  const screen = renderApp(<NotificationSettingsScreen />);
  expect(screen.getByText('Open system settings')).toBeTruthy();
});
it('renders translated copy in both locales', () => {
  for (const locale of ['en', 'ka'] as const) {
    const screen = renderApp(<NotificationSettingsScreen />, { locale });
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/"notifications\./i);
    screen.unmount();
  }
});
