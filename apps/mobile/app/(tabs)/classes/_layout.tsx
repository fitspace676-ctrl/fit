import { Stack } from 'expo-router';

/** Stack for the Classes tab: list (index) → class detail (`[instanceId]`). */
export default function ClassesStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
