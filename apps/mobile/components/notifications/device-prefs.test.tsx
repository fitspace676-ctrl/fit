import { clearPushSnapshot, syncPushPreference } from './device-prefs';

const mockValues = new Map<string, string>();
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockToken = jest.fn();
const mockRegister = jest.fn();
const mockUnregister = jest.fn();
const mockSettings = jest.fn();
let mockUserId = 'member';
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
  getPermissionsAsync: () => mockGetPermissions() as unknown,
  requestPermissionsAsync: () => mockRequestPermissions() as unknown,
  getExpoPushTokenAsync: () => mockToken() as unknown,
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: {
    openSettings: () => mockSettings() as unknown,
  },
}));
jest.mock('../../lib/auth/device-id', () => ({ hydrateDeviceId: () => Promise.resolve('device') }));
jest.mock('../../lib/auth/session', () => ({
  getSessionState: () => ({ status: 'signed-in', userId: mockUserId }),
}));
jest.mock('../../lib/api/notifications', () => ({
  registerPushToken: (...args: unknown[]) => mockRegister(...args) as unknown,
  unregisterPushToken: (...args: unknown[]) => mockUnregister(...args) as unknown,
}));
const granted = { granted: true, status: 'granted', canAskAgain: true };
beforeEach(() => {
  clearPushSnapshot();
  jest.clearAllMocks();
  mockValues.clear();
  mockUserId = 'member';
  mockGetPermissions.mockResolvedValue({
    granted: false,
    status: 'undetermined',
    canAskAgain: true,
  });
  mockRequestPermissions.mockResolvedValue(granted);
  mockToken.mockResolvedValue({ data: 'ExponentPushToken[test]' });
  mockRegister.mockResolvedValue({ id: 'registration' });
  mockUnregister.mockResolvedValue(undefined);
  mockSettings.mockResolvedValue(undefined);
});
it('does not prompt on startup', async () => {
  await syncPushPreference('member');
  expect(mockRequestPermissions).not.toHaveBeenCalled();
  expect(mockRegister).not.toHaveBeenCalled();
});
it('registers a permitted device and restores its saved choice without another prompt', async () => {
  await syncPushPreference('member', true);
  expect(mockRegister).toHaveBeenCalledWith({
    deviceId: 'device',
    platform: 'ios',
    token: 'ExponentPushToken[test]',
  });
  expect(mockValues.get('notifications.push.member')).toBe('true');
  mockGetPermissions.mockResolvedValue(granted);
  await syncPushPreference('member');
  expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  expect(mockRegister).toHaveBeenCalledTimes(2);
});
it('opens system settings for a permanent denial without registering', async () => {
  mockGetPermissions.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
  await syncPushPreference('member', true);
  expect(mockSettings).toHaveBeenCalledTimes(1);
  expect(mockRequestPermissions).not.toHaveBeenCalled();
  expect(mockRegister).not.toHaveBeenCalled();
});
it('unregisters and saves opt-out', async () => {
  mockValues.set('notifications.push.member', 'true');
  mockGetPermissions.mockResolvedValue(granted);
  await syncPushPreference('member', false);
  expect(mockUnregister).toHaveBeenCalledWith({ deviceId: 'device' });
  expect(mockValues.get('notifications.push.member')).toBe('false');
});
it('does not save an opt-in if API registration fails', async () => {
  mockRegister.mockRejectedValueOnce(new Error('offline'));
  await syncPushPreference('member', true);
  expect(mockValues.has('notifications.push.member')).toBe(false);
});
it('does not transfer another account’s saved opt-in', async () => {
  mockValues.set('notifications.push.other', 'true');
  mockGetPermissions.mockResolvedValue(granted);
  await syncPushPreference('member');
  expect(mockRegister).not.toHaveBeenCalled();
});
