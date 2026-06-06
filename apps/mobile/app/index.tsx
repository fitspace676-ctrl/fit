import { ActivityIndicator, View } from 'react-native';

// App entry. The real routing decision lives in the root layout's
// `useProtectedRoute` guard, which sends the user to the (auth) group, the
// onboarding screens, or the tab shell once the persisted session / onboarding
// state has hydrated. Until that redirect fires this route just shows a splash,
// so launch never flashes a blank or half-built screen.
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-brand-950">
      <ActivityIndicator color="#ffffff" size="large" />
    </View>
  );
}
