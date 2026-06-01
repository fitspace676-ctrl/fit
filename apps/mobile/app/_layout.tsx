import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
