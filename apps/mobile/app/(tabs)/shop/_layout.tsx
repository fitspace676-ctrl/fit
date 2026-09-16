// The Shop tab's own stack — list · product · cart · order.
//
// Needed for the same reason `profile/_layout.tsx` is: without it expo-router
// mounts `shop/index`, `shop/cart`, `shop/product/[id]` and
// `shop/order/[orderId]` as FOUR SIBLING TAB ROUTES. Pushing the cart would
// swap the tab's content with no back gesture on iOS and no back stack to pop
// on Android, and the confirmation screen would have nothing to return to.
//
// `FloatingTabBar` keeps working across the change either way —
// `tabKeyForRouteName` matches on the HEAD segment, so `shop` and `shop/cart`
// both resolve to the Shop tab — which is what let the placeholder ship before
// this file existed.
//
// `initialRouteName` is stated because the deep link `fit://orders/:id` lands
// on `shop/order/:orderId` directly (`app/+native-intent.ts` rewrites it there,
// since the member-safe read is `GET /checkout/:orderId` and NOT the staff
// console's `GET /orders/:id`). Without it, a cold launch on that link has no
// screen beneath the order and the back gesture leaves the tab empty.
import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: 'index' };

export default function ShopLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
