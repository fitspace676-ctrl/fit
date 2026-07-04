import { Stack } from 'expo-router';

/** Stack for the Trainers section: roster (index) → trainer detail (`[trainerId]`). */
export default function TrainersStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
