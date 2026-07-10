'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createDashboardPinSchema,
  Permission,
  roleHasPermission,
  type CreateDashboardPin,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { addDashboardPin, ApiError, removeDashboardPin } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Translator for the `admin.reports` namespace (from `getTranslations`). */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Re-assert the reporting capability inside the action. The middleware gates the
 * `/reports` route, but a Server Action is a POST endpoint in its own right and the
 * pin API is `ReportView`-gated — defence in depth ahead of the API's own guard.
 */
async function requireReportView(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, Permission.ReportView);
}

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    return t('drilldown.pinError', { status: error.status });
  }
  return error instanceof Error ? error.message : t('drilldown.pinError', { status: 0 });
}

/** Refresh the report page the pin was toggled from and the dashboard it surfaces on. */
function refreshPinned(metric: string): void {
  revalidatePath(`/reports/${metric}`);
  revalidatePath('/');
}

/**
 * Pin one drill-down report section to the caller's dashboard. Re-validates the
 * body with the same Zod schema the API uses, enforces `ReportView`, then refreshes
 * the report page + dashboard so the pin state and the new widget appear.
 */
export async function pinReportAction(input: CreateDashboardPin): Promise<ActionResult> {
  const t = await getTranslations('admin.reports');
  if (!(await requireReportView())) {
    return { ok: false, error: t('drilldown.notAuthorized') };
  }
  const parsed = createDashboardPinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('drilldown.pinInvalid') };
  }
  try {
    await addDashboardPin(parsed.data);
    refreshPinned(parsed.data.metric);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Unpin one of the caller's dashboard widgets by pin id. `metric` is passed only to
 * revalidate the originating report page; the API scopes the delete to the caller.
 */
export async function unpinReportAction(id: string, metric: string): Promise<ActionResult> {
  const t = await getTranslations('admin.reports');
  if (!(await requireReportView())) {
    return { ok: false, error: t('drilldown.notAuthorized') };
  }
  try {
    await removeDashboardPin(id);
    refreshPinned(metric);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
