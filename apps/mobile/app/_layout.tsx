import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import '../global.css';

// Root layout — wraps every route. The single Stack renders the Expo Router
// file-based routes under `app/`. `global.css` is imported here so NativeWind's
// Tailwind layer is registered once for the whole tree.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

// Exporting `ErrorBoundary` from the root layout makes Expo Router catch any
// render error thrown anywhere in the route tree and show this fallback instead
// of a crash. `retry` re-mounts the tree.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // TODO(observability): forward to Sentry once the mobile SDK is wired up.
  console.error(error);

  return (
    <SafeAreaView className="flex-1 bg-brand-950">
      <View className="flex-1 items-center justify-center gap-4 p-gutter">
        <View className="rounded-card bg-brand-500 px-3 py-1">
          <Text className="text-sm font-medium text-white">Something went wrong</Text>
        </View>
        <Text className="text-3xl font-bold tracking-tight text-white">Unexpected error</Text>
        <Text className="max-w-xs text-center text-base text-brand-200">{error.message}</Text>
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
