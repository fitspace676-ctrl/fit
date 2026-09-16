// @fit/mobile — notification preferences that are HONESTLY device-local.
//
// ===========================================================================
// READ THIS BEFORE ADDING PERSISTENCE. THE ABSENCE OF IT IS THE POINT.
//
// **There is no notification-preferences endpoint on this API.** The whole
// notification surface is three routes — `GET /notifications`,
// `GET /notifications/unread-count`, `POST /notifications/mark-read` — plus the
// push-token pair. Nothing accepts a preference. Plan §7 records it as one of
// the four product constraints the API imposes, and it names the failure it
// produced last time:
//
//   > The deleted app shipped a settings screen that called nothing and stored
//   > toggles in AsyncStorage. Do not rebuild that illusion: either drop the
//   > screen or make it plainly device-local.
//
// AsyncStorage is what made it an illusion. A toggle that survives a relaunch
// is indistinguishable, to the member, from a setting that has been SAVED — and
// nothing was being saved anywhere that could act on it. So this store is
// deliberately **in-memory for the life of the app process**: the choice lasts
// as long as the session that made it and no longer, which is exactly as long
// as it means anything.
//
// The screen states this in words as well (`notifications.subtitle` already
// admits "Delivery is enabled in a later update"), because a user should not
// have to infer a product limitation from a reset toggle.
//
// ---------------------------------------------------------------------------
// WHEN THIS FILE SHOULD CHANGE.
//
// When delivery lands (C6 wires `expo-notifications` and the push-token
// routes), the MASTER toggle becomes real — it maps onto `POST /notifications/
// push-token` and `DELETE /notifications/push-token/:deviceId`, which do exist —
// and at that point persisting it is honest, because a real registration is
// what survives. The CATEGORY toggles stay fiction until a preferences
// controller exists. Splitting them here, rather than treating "notifications"
// as one setting, is what makes that migration a small diff.
//
// `useSyncExternalStore` rather than React state in the screen: the master
// toggle gates the categories, and a store keeps that relationship in one
// testable place instead of in a component's `useEffect`.

import { useSyncExternalStore } from 'react';

/** The categories the artboard and `notifications.*` name. */
export type NotificationCategoryKey = 'classReminders' | 'bookingUpdates' | 'promotions';

/** Every category, in the order the screen draws them. */
export const CATEGORY_KEYS: readonly NotificationCategoryKey[] = [
  'classReminders',
  'bookingUpdates',
  'promotions',
];

/** What the screen renders. */
export interface DevicePrefs {
  /** The master switch. Gates every category below it. */
  readonly push: boolean;
  readonly categories: Readonly<Record<NotificationCategoryKey, boolean>>;
}

/**
 * The defaults a fresh process starts from.
 *
 * `push: false` deliberately. Claiming a member is opted in to a delivery
 * channel that does not exist yet would be the same lie in the other direction.
 */
const DEFAULTS: DevicePrefs = {
  push: false,
  categories: { classReminders: true, bookingUpdates: true, promotions: false },
};

let current: DevicePrefs = DEFAULTS;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The live preferences. Reference-stable between changes. */
export function getDevicePrefs(): DevicePrefs {
  return current;
}

/** Flip the master switch. */
export function setPushEnabled(enabled: boolean): void {
  if (current.push === enabled) return;
  current = { ...current, push: enabled };
  emit();
}

/** Flip one category. */
export function setCategoryEnabled(key: NotificationCategoryKey, enabled: boolean): void {
  if (current.categories[key] === enabled) return;
  current = { ...current, categories: { ...current.categories, [key]: enabled } };
  emit();
}

/** Back to `DEFAULTS`. For tests — nothing in the app resets these. */
export function resetDevicePrefs(): void {
  current = DEFAULTS;
  emit();
}

/** The store, as a hook. */
export function useDevicePrefs(): DevicePrefs {
  return useSyncExternalStore(subscribe, getDevicePrefs, getDevicePrefs);
}
