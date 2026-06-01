import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder home screen. Confirms Expo Router + NativeWind (shared brand
// tokens) render on simulator/device. Real screens land in later tasks.
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-brand-950">
      <View className="flex-1 items-center justify-center gap-4 p-gutter">
        <View className="rounded-card bg-brand-500 px-3 py-1">
          <Text className="text-sm font-medium text-white">@fit/mobile</Text>
        </View>
        <Text className="text-4xl font-bold tracking-tight text-white">Fit</Text>
        <Text className="max-w-xs text-center text-base text-brand-200">
          Expo Router + NativeWind are wired up. If you can read this on a simulator, the mobile
          shell is working.
        </Text>
      </View>
    </SafeAreaView>
  );
}
