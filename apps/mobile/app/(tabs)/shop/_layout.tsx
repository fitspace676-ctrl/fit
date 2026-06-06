import { Stack } from 'expo-router';

/** Stack for the Shop tab: catalogue (index) → order detail (`order/[orderId]`). */
export default function ShopStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
