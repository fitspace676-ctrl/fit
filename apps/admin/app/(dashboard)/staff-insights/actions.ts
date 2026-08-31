'use server';

// The branch arrives in `query`, resolved by the view from `useActiveLocation()`;
// this action does not read the cookie itself. See `sales/actions.ts` for why —
// briefly, an action cannot see `?locationId=`, and the view needs the value
// anyway to key its own response cache.

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  dashboardStaffQuerySchema,
  type DashboardStaffQuery,
  type DashboardStaffResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardStaff } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Load the whole Staff tab. Re-asserts the reporting capability first: the
 * middleware gates the route, but a Server Action is a POST endpoint in its own
 * right — defence in depth ahead of the API's own guard. Errors come back as a
 * message so a failed load stays local to the tab.
 */
export async function loadStaffAction(
  query: DashboardStaffQuery,
): Promise<ActionResult<DashboardStaffResponse>> {
  const t = await getTranslations('admin.dashboard.staff');
  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.ReportView)) {
    return { ok: false, error: t('loadError') };
  }
  try {
    // Re-parsed rather than trusted: the argument crosses a network boundary like
    // any other request body, so it is validated here as well as API-side.
    return {
      ok: true,
      data: await fetchDashboardStaff(dashboardStaffQuerySchema.parse(query)),
    };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}
