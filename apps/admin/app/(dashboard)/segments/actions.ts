'use server';

import { getTranslations } from 'next-intl/server';
import {
  Permission,
  roleHasPermission,
  setDashboardWidgetsSchema,
  type ConfigurableDashboardSegment,
  type DashboardRange,
  type DashboardSegmentResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardSegment, saveDashboardSegmentWidgets } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Re-assert the reporting capability inside the action. The middleware gates the
 * route, but a Server Action is a POST endpoint in its own right — defence in
 * depth ahead of the API's own guard.
 */
async function requireReportView(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.ReportView);
}

/** Load one segment's widgets. Errors come back as a message, so a failed segment stays local. */
export async function loadSegmentAction(
  segment: ConfigurableDashboardSegment,
  range: DashboardRange,
): Promise<ActionResult<DashboardSegmentResponse>> {
  const t = await getTranslations('admin.dashboard.segments');
  if (!(await requireReportView())) {
    return { ok: false, error: t('loadError') };
  }
  try {
    return { ok: true, data: await fetchDashboardSegment(segment, range) };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('loadError') };
  }
}

/**
 * Replace a segment's widget selection. Gym-wide: this changes what every
 * colleague sees, which the picker states before it is used.
 */
export async function saveSegmentWidgetsAction(
  segment: ConfigurableDashboardSegment,
  widgetKeys: string[],
): Promise<ActionResult> {
  const t = await getTranslations('admin.dashboard.picker');
  if (!(await requireReportView())) {
    return { ok: false, error: t('saveError') };
  }
  const parsed = setDashboardWidgetsSchema.safeParse({ widgetKeys });
  if (!parsed.success) {
    return { ok: false, error: t('lastWidget') };
  }
  try {
    await saveDashboardSegmentWidgets(segment, parsed.data.widgetKeys);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : t('saveError') };
  }
}
