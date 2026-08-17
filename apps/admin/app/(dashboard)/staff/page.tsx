import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, gymStaffDirectorySettingsSchema, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchGymSettings,
  fetchLocations,
  fetchStaff,
  fetchStaffRoles,
  fetchWorkingNow,
} from '@/lib/api';
import { Icon } from '@/components/ui';
import { StaffConsole } from './staff-console';

export const metadata: Metadata = {
  title: 'Staff - Fit Admin',
  description: 'Invite staff, assign roles, and manage your gym’s team.',
};

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The staff management page, rebuilt to the reference staff artboard. It
 * server-renders the gym's active staff (`GET /staff`), the read-only roles
 * matrix (`GET /staff/roles`) and the on-shift-now roster
 * (`GET /staff/working-now`), then hands them to the client {@link StaffConsole}
 * — which owns the "Who's Working Now" card, the Staff List / Roles &
 * Permissions tabs, filtering, the roster table, the Manage Roles drawer, the
 * Add Staff drawer and the invite modal. The whole `/staff` route already
 * requires an OWNER session (middleware + the API's `StaffManage` guard), so the
 * only failure handled here is the API call itself; the signed-in user's id is
 * passed through so the table can flag their own row and stop them self-removing.
 */
export default async function StaffPage() {
  const t = await getTranslations('admin.staff');
  const session = await getServerSession();
  const canManage = session !== null && roleHasPermission(session.role, Permission.StaffManage);

  try {
    const [{ staff }, roles, workingNow, locations, display] = await Promise.all([
      fetchStaff(),
      fetchStaffRoles(),
      fetchWorkingNow(),
      fetchLocations({ status: 'ACTIVE', limit: 100 }),
      // What this gym shows on the page (Settings → Staff page). Falls back to
      // schema defaults — which reproduce the stock page — so a settings outage
      // costs a couple of optional columns rather than the whole roster.
      fetchGymSettings()
        .then((s) => s.staffDirectory)
        .catch(() => gymStaffDirectorySettingsSchema.parse({})),
    ]);

    return (
      <StaffConsole
        staff={staff}
        currentUserId={session?.userId ?? null}
        canManage={canManage}
        roles={roles}
        workingNow={workingNow.shifts}
        locations={locations.data.map((loc) => ({ id: loc.id, name: loc.name }))}
        display={display}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadStaff', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div {...stylex.props(styles.stack)}>
        <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
          <span>{t('breadcrumb.home')}</span>
          <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
          <span {...stylex.props(styles.crumbCurrent)}>{t('breadcrumb.staff')}</span>
        </nav>
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </header>
        <Card padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }
}
