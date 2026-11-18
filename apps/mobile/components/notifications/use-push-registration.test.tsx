import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import type { DevicePushToken } from 'expo-notifications';
import { clearPushSnapshot, syncPushPreference, useDevicePrefs } from './device-prefs';
import { usePushRegistration } from './use-push-registration';

const mockValues = new Map<string, string>();
const mockRegister = jest.fn();
const mockToken = jest.fn();
const mockRequestPermissions = jest.fn();
const mockListen = jest.fn();
const mockRemove = jest.fn();
let mockGranted = false;
let mockRotation: (token: DevicePushToken) => void;
const nativeToken: DevicePushToken = { type: 'ios', data: 'native-token' };
const mockPermission = () => ({
  granted: mockGranted,
  status: mockGranted ? 'granted' : 'undetermined',
  canAskAgain: true,
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => Promise.resolve(mockValues.get(key) ?? null),
  setItem: (key: string, value: string) => {
    mockValues.set(key, value);
    return Promise.resolve();
  },
}));
jest.mock('expo-constants', () => ({ easConfig: { projectId: 'project' } }));
jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getPermissionsAsync: () => Promise.resolve(mockPermission()),
  requestPermissionsAsync: () => mockRequestPermissions() as unknown,
  getExpoPushTokenAsync: (...args: unknown[]) => mockToken(...args) as unknown,
  setNotificationHandler: jest.fn(),
  addPushTokenListener: (listener: (token: DevicePushToken) => void) => {
    mockRotation = listener;
    mockListen();
    return { remove: mockRemove };
  },
}));
jest.mock('../../hooks/useSession', () => ({
  useSession: () => ({ status: 'signed-in', userId: 'member' }),
}));
jest.mock('../../lib/auth/session', () => ({
  getSessionState: () => ({ status: 'signed-in', userId: 'member' }),
}));
jest.mock('../../lib/auth/device-id', () => ({ hydrateDeviceId: () => Promise.resolve('device') }));
jest.mock('../../lib/api/notifications', () => ({
  registerPushToken: (...args: unknown[]) => mockRegister(...args) as unknown,
  unregisterPushToken: () => Promise.resolve(),
}));

it('registers once per enable despite native token and foreground events during and after enable', async () => {
  clearPushSnapshot();
  mockValues.clear();
  mockGranted = false;
  mockRegister.mockResolvedValue({ id: 'registration' });
  let foreground: (state: AppStateStatus) => void = () => undefined;
  const foregroundSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    foreground = listener;
    return { remove: jest.fn() };
  });
  mockRequestPermissions.mockImplementation(() => {
    mockGranted = true;
    // The iOS permission dialog returns the app to active during opt-in.
    foreground('inactive');
    foreground('active');
    return Promise.resolve(mockPermission());
  });
  let nativeFetches = 0;
  mockToken.mockImplementation((options: { devicePushToken?: DevicePushToken }) => {
    if (!options.devicePushToken) {
      // Model the iOS native registration callback, including unchanged tokens.
      // Bound a regression so the old feedback loop fails instead of hanging Jest.
      nativeFetches += 1;
      if (nativeFetches > 8) throw new Error('native token feedback loop');
      mockRotation(nativeToken);
    }
    return Promise.resolve({ data: 'ExponentPushToken[test]' });
  });
  const hook = renderHook(() => {
    usePushRegistration();
    return useDevicePrefs();
  });
  try {
    await act(async () => {
      await syncPushPreference('member');
    });
    await act(async () => {
      await syncPushPreference('member', true);
      // Drain queued callbacks with a foreground refresh as a queue barrier.
      await syncPushPreference('member');
    });
    expect(mockRegister).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockRotation(nativeToken);
      foreground('active');
      await syncPushPreference('member');
    });
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(nativeFetches).toBeLessThanOrEqual(8);
    expect(mockToken).toHaveBeenCalledWith({ projectId: 'project', devicePushToken: nativeToken });
    expect(hook.result.current).toMatchObject({ push: true, busy: false, error: false });
    expect(mockListen).toHaveBeenCalledTimes(1);
    await act(async () => {
      await syncPushPreference('member', false);
      await syncPushPreference('member', true);
      mockRotation(nativeToken);
      foreground('active');
      await syncPushPreference('member');
    });
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(nativeFetches).toBeLessThanOrEqual(8);
    expect(hook.result.current).toMatchObject({ push: true, busy: false, error: false });
  } finally {
    hook.unmount();
    foregroundSpy.mockRestore();
  }
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
