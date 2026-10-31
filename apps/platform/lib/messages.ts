/**
 * What the data modules (`@/data/*`) need from a next-intl translator to read
 * their copy: `t.raw`, which returns a whole message subtree as it is in the
 * JSON. Both `useTranslations(...)` (client) and `getTranslations(...)`
 * (server) return one, so a page can resolve its data on either side.
 */
export type MessageReader = {
  raw(key: string): unknown;
};

/**
 * Lists in the catalogues are objects keyed `"0"`, `"1"`, … (next-intl messages
 * are nested objects with string leaves; arrays are not supported). Integer-like
 * keys enumerate in ascending order, so this is the list back in its order.
 */
export function messageList<T>(record: Record<string, T>): T[] {
  return Object.values(record);
}
