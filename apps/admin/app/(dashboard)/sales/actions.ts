'use server';

// WHY THIS ACTION DOES NOT RESOLVE THE BRANCH ITSELF — the convention all five
// dashboard tab actions follow.
//
// A Server Action has `cookies()`, so this file could call
// `getActiveLocationId()` and drop `locationId` from the query type entirely.
// That is less plumbing, and it is the wrong trade:
//
//  • An action is never handed `searchParams`. The cookie is only the AMBIENT
//    truth — `?locationId=` outranks it (`lib/active-location.ts`) — so an
//    action resolving the branch on its own can only ever see the cookie. Open a
//    drilldown link naming branch B while the cookie says A, and the page
//    renders B's Overview above a tab showing A's figures, under one switcher
//    claiming B. The client provider applies the same precedence the page does,
//    so passing the value in keeps the whole screen on one branch.
//  • The tab's response cache is client-side and outlives a branch change
//    (`router.refresh()` re-renders the server tree; a mounted Client Component
//    keeps its state). The view therefore has to know the branch anyway — to key
//    that cache, and to decide whether to show the branch-scope note. Having it
//    pass the value too costs one field and removes a second source of truth.
//
// The value is still not trusted: it arrives as request input like everything
// else, and the schema parse below is what makes it safe.

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  dashboardSalesQuerySchema,
  type DashboardSalesQuery,
  type DashboardSalesResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardSales } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Load the whole Sales tab. Re-asserts the reporting capability first: the
 * middleware gates the route, but a Server Action is a POST endpoint in its own
 * right — defence in depth ahead of the API's own guard. Errors come back as a
 * message so a failed load stays local to the tab.
 */
export async function loadSalesAction(
  query: DashboardSalesQuery,
): Promise<ActionResult<DashboardSalesResponse>> {
  const t = await getTranslations('admin.dashboard.sales');
  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.ReportView)) {
    return { ok: false, error: t('loadError') };
  }
  try {
    // Re-parsed rather than trusted: the argument crosses a network boundary
    // like any other request body, so it is validated here as well as API-side.
    return { ok: true, data: await fetchDashboardSales(dashboardSalesQuerySchema.parse(query)) };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}
