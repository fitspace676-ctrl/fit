import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchStaff } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { StaffConsole } from './staff-console';

export const metadata: Metadata = {
  title: 'Staff — Fit Admin',
  description: 'Invite staff, assign roles, and manage your gym’s team.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The staff management page (T2.10), rebuilt to the formacore staff artboard. It
 * server-renders the gym's active staff and its pending invitations from
 * `GET /staff` and hands both to the client {@link StaffConsole}, which owns the
 * KPI cards, People / Invitations tabs, filtering, the shared roster table, and
 * the invite modal. The whole `/staff` route already requires an OWNER session
 * (middleware + the API's `StaffManage` guard), so the only failure handled here
 * is the API call itself; the signed-in user's id is passed through so the table
 * can flag their own row and stop them removing themselves.
 */
export default async function StaffPage() {
  const t = await getTranslations('admin.staff');
  const session = await getServerSession();
  const canManage = session !== null && roleHasPermission(session.role, Permission.StaffManage);

  try {
    const { staff, invites } = await fetchStaff();
    return (
      <StaffConsole
        staff={staff}
        invites={invites}
        currentUserId={session?.userId ?? null}
        canManage={canManage}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadStaff', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div className="flex flex-col gap-6">
        <nav
          aria-label={t('breadcrumb.label')}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
        >
          <span>Iron Gym</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <span className="text-ink-600 dark:text-ink-300">{t('breadcrumb.staff')}</span>
        </nav>
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
        </header>
        <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {message}
          </p>
        </Card>
      </div>
    );
  }
}
