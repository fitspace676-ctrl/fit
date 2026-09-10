// The Profile tab's own stack.
//
// Needed the moment Profile has a second screen, and it has nine: billing,
// membership, activity, notifications, notification-settings, bookings, goals
// and the profile editor. Without a `_layout` here, expo-router mounts every
// one of them as a SIBLING TAB ROUTE: pushing `/profile/billing` would swap the
// tab's content with no back gesture on iOS and no back stack to pop on
// Android, and `FloatingTabBar` would see several routes whose head segment is
// `profile` (which `tabKeyForRouteName` handles, but only because it matches on
// the head).
import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
