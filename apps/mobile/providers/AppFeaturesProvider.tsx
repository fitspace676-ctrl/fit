import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Redirect, usePathname } from 'expo-router';
import {
  DEFAULT_MOBILE_APP_FEATURES,
  MOBILE_APP_FEATURES,
  type MobileAppFeature,
  type MobileAppFeatures,
} from '@fit/types';
import { getMobileAppSettings } from '../lib/api/app-settings';
import { resolveGymSlug } from '../lib/auth/session';
import { useSession } from '../hooks/useSession';
import { appFeaturesForPath, appPathVisible } from '../lib/app-feature-policy';

const HIDDEN_FEATURES = Object.fromEntries(
  MOBILE_APP_FEATURES.map((key) => [key, false]),
) as MobileAppFeatures;
const AppFeaturesContext = createContext<{
  features: MobileAppFeatures;
  ready: boolean;
  loginImageUrl: string | null;
}>({ features: DEFAULT_MOBILE_APP_FEATURES, ready: true, loginImageUrl: null });

export function AppFeaturesProvider({ children }: { children: ReactNode }) {
  // Re-render when hydration resolves the remembered slug. A white-label build
  // uses EXPO_PUBLIC_GYM_SLUG; the query cache is always isolated by that slug.
  useSession();
  const slug = resolveGymSlug();
  const settings = useQuery({
    queryKey: ['mobile-app-settings', slug ?? ''],
    queryFn: ({ signal }) => getMobileAppSettings(slug!, { signal }),
    enabled: Boolean(slug),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  // Hide optional features until configuration arrives; failed initial reads
  // cannot briefly expose a feature the gym disabled. Cached reads survive offline.
  const features = settings.data?.enabled ? settings.data.features : HIDDEN_FEATURES;
  // Already resolved API-side: the app's own photo, else the member portal's.
  const loginImageUrl = settings.data?.enabled ? (settings.data.loginImageUrl ?? null) : null;
  return (
    <AppFeaturesContext.Provider
      value={{ features, ready: !slug || !settings.isPending, loginImageUrl }}
    >
      {children}
    </AppFeaturesContext.Provider>
  );
}
export function useAppFeatures() {
  return useContext(AppFeaturesContext).features;
}
/** The gym's sign-in hero photo, or `null` for the plain sign-in screen. */
export function useAppLoginImage(): string | null {
  return useContext(AppFeaturesContext).loginImageUrl;
}
export function AppFeature({
  name,
  children,
}: {
  name: MobileAppFeature | MobileAppFeature[];
  children: ReactNode;
}) {
  const features = useAppFeatures();
  return (Array.isArray(name) ? name : [name]).every((key) => features[key]) ? children : null;
}
/** Mounted inside Stack's screenLayout so disabled scenes never mount or fetch. */
export function AppFeatureScreen({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { features, ready } = useContext(AppFeaturesContext);
  if (!ready && appFeaturesForPath(path).length > 0) return null;
  return appPathVisible(path, features) ? children : <Redirect href="/home" />;
}
