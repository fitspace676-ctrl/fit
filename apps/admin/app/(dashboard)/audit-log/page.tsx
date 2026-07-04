import { redirect } from 'next/navigation';

// @fit/admin — the audit-log viewer moved under the Activity area as a tab (T3.10).
//
// The standalone `/audit-log` screen is gone; its viewer now lives as the "Audit
// log" tab of `/activity`. This route is kept only to redirect any bookmarks or
// deep links there. Both routes require `MANAGER`+ staff (middleware), so the
// redirect never lands a caller somewhere they could not already reach.
export default function AuditLogPage() {
  redirect('/activity?tab=audit');
}
