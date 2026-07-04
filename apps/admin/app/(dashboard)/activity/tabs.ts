// @fit/admin — the Activity area's tab model (T3.10).
//
// Shared by the server page (which parses `?tab=` off the URL) and the client tab
// bar (which writes it) so the two never drift on the tab keys. `feed` is the
// default — the live event stream — and `audit` is the folded-in audit-log
// viewer.

export const ACTIVITY_TABS = ['feed', 'audit'] as const;

/** One of the Activity area's tabs — {@link ACTIVITY_TABS}. */
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

/** Narrow a raw `?tab=` value to a known tab, defaulting to `feed`. */
export function parseActivityTab(value: string | string[] | undefined): ActivityTab {
  return value === 'audit' ? 'audit' : 'feed';
}
