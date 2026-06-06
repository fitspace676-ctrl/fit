import { Stack } from 'expo-router';

/** Stack for the Profile tab: profile (index) → notifications. */
export default function ProfileStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
