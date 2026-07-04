import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';

import '../global.css';
// Validate EXPO_PUBLIC_* env once at app launch (throws on a malformed value).
import '../lib/env';
import { useProtectedRoute } from '../hooks/useProtectedRoute';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { AppProviders } from '../providers';

// Mobile Sentry bootstrap. Runs once when this module is first evaluated; no-op
// without a public DSN, so Expo Go / preview builds run without an account.
// (Full native capture requires an EAS build with the `@sentry/react-native`
// Expo plugin configured in app.json.)
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.1,
  });
}

// Renders the route tree behind the auth + onboarding guard. `useProtectedRoute`
// must run inside the Expo Router navigation context (it reads segments and
// calls `router.replace`), so it lives here in a child of the root navigator
// rather than at module scope. While the persisted session / onboarding flags
// are still hydrating it returns `true`, and we hold a splash over the Stack so
// the user never sees a redirect flash on a cold launch with a live session.
function RootNavigator() {
  const hydrating = useProtectedRoute();
  // Register for push + handle notification-tap deep links. Lives here (a child
  // of the navigator) so `router.push` from a tapped notification is live.
  usePushNotifications();
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {hydrating ? <SplashScreen /> : null}
      <StatusBar style="light" />
    </>
  );
}

// Full-screen splash shown while the keychain / onboarding state hydrates.
function SplashScreen() {
  return (
    <View className="absolute inset-0 items-center justify-center bg-ink-950">
      <ActivityIndicator color="#ffffff" size="large" />
    </View>
  );
}

// Root layout — wraps every route. `SafeAreaProvider` sits outermost so the
// toast host (inside `AppProviders`) can read the top inset; `AppProviders`
// then layers Theme → Query → I18n → Toast around the Expo Router `Stack` that
// renders the file-based routes under `app/`. `global.css` is imported here so
// NativeWind's Tailwind layer is registered once for the whole tree.
function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </SafeAreaProvider>
  );
}

// `Sentry.wrap` enables touch/navigation breadcrumbs and is a no-op until the
// SDK is initialised.
export default Sentry.wrap(RootLayout);

// Exporting `ErrorBoundary` from the root layout makes Expo Router catch any
// render error thrown anywhere in the route tree and show this fallback instead
// of a crash. `retry` re-mounts the tree.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    // Report to Sentry and keep the event id so the user can quote it to
    // support. Returns a generated id even when Sentry is not configured.
    setEventId(Sentry.captureException(error));
  }, [error]);

  return (
    <SafeAreaView className="flex-1 bg-brand-950">
      <View className="flex-1 items-center justify-center gap-4 p-gutter">
        <View className="rounded-card bg-brand-500 px-3 py-1">
          <Text className="text-sm font-medium text-white">Something went wrong</Text>
        </View>
        <Text className="text-3xl font-bold tracking-tight text-white">Unexpected error</Text>
        <Text className="max-w-xs text-center text-base text-brand-200">{error.message}</Text>
        {eventId ? <Text className="text-xs text-brand-300">Reference: {eventId}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void retry();
          }}
          className="rounded-card bg-brand-500 px-4 py-2"
        >
          <Text className="text-base font-medium text-white">Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
