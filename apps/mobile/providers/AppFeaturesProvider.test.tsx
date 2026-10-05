import { Text as MockText } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_MOBILE_APP_FEATURES, type MobileAppSettings } from '@fit/types';
import { AppFeature, AppFeatureScreen, AppFeaturesProvider } from './AppFeaturesProvider';

const mockGetSettings = jest.fn<Promise<MobileAppSettings>, [string, unknown]>();
let mockPath = '/shop';
let mockSlug = 'downtown';
jest.mock('../lib/api/app-settings', () => ({
  getMobileAppSettings: (...args: [string, unknown]) => mockGetSettings(...args),
}));
jest.mock('../lib/auth/session', () => ({ resolveGymSlug: () => mockSlug }));
jest.mock('../hooks/useSession', () => ({ useSession: () => ({ status: 'signed-in' }) }));
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  Redirect: ({ href }: { href: string }) => <MockText testID="redirect">{href}</MockText>,
}));

function app() {
  return (
    <AppFeaturesProvider>
      <AppFeature name="shop">
        <MockText>Shop tab</MockText>
      </AppFeature>
      <AppFeature name="classes">
        <MockText>Classes tab</MockText>
      </AppFeature>
      <AppFeatureScreen>
        <MockText>Screen contents</MockText>
      </AppFeatureScreen>
    </AppFeaturesProvider>
  );
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return { client, ...render(<QueryClientProvider client={client}>{app()}</QueryClientProvider>) };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/shop';
  mockSlug = 'downtown';
});
it('hides a disabled tab and redirects a direct link after loading API settings', async () => {
  mockGetSettings.mockResolvedValue({
    enabled: true,
    features: { ...DEFAULT_MOBILE_APP_FEATURES, shop: false },
  });
  setup();
  await waitFor(() => expect(screen.getByText('Classes tab')).toBeTruthy());
  expect(screen.queryByText('Shop tab')).toBeNull();
  expect(screen.queryByText('Screen contents')).toBeNull();
  expect(screen.getByTestId('redirect').props.children).toBe('/home');
  expect(mockGetSettings.mock.calls[0]?.[0]).toBe('downtown');
  expect(mockGetSettings.mock.calls[0]?.[1]).toHaveProperty('signal');
});
it('holds a deep-linked scene while settings are loading without redirecting', () => {
  mockGetSettings.mockReturnValue(new Promise(() => undefined));
  setup();
  expect(screen.queryByText('Screen contents')).toBeNull();
  expect(screen.queryByTestId('redirect')).toBeNull();
});
it('applies server changes when settings refresh', async () => {
  mockGetSettings.mockResolvedValue({ enabled: true, features: DEFAULT_MOBILE_APP_FEATURES });
  const { client } = setup();
  await waitFor(() => expect(screen.getByText('Shop tab')).toBeTruthy());
  mockGetSettings.mockResolvedValue({
    enabled: true,
    features: { ...DEFAULT_MOBILE_APP_FEATURES, shop: false },
  });
  await client.invalidateQueries({ queryKey: ['mobile-app-settings', 'downtown'] });
  await waitFor(() => expect(screen.queryByText('Shop tab')).toBeNull());
});
it('keeps home available but hides all optional features for an unprovisioned gym', async () => {
  mockPath = '/home';
  mockGetSettings.mockResolvedValue({ enabled: false, features: DEFAULT_MOBILE_APP_FEATURES });
  setup();
  await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
  expect(screen.getByText('Screen contents')).toBeTruthy();
  expect(screen.queryByText('Shop tab')).toBeNull();
});
