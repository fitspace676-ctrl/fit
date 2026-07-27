import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocations } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { LocationsBoard } from './locations-board';

const styles = stylex.create({
  page: {
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
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
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

export const metadata: Metadata = {
  title: 'Locations - Fit Admin',
  description:
    'The gym’s locations (branches): live open state, hours, amenities, and per-branch actions.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The locations screen (T2.11), rebuilt to the formacore locations artboard. It
 * server-renders the gym's locations from `GET /admin/locations` and hands them to
 * the client {@link LocationsBoard}, which owns the KPI cards, the status filter +
 * search, and the location card grid (live open/closed, today's hours, amenities,
 * and the activate/deactivate + edit row actions). Gyms run a handful of branches,
 * so the whole roster is loaded in one page (capped generously) and filtered
 * client-side. The `/locations` route already requires staff (middleware) and the
 * API enforces `LocationRead`, so the only failure handled here is the API call
 * itself; `LocationWrite` gates the write affordances.
 */
export default async function LocationsPage() {
  const t = await getTranslations('admin.locations');
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.LocationWrite);

  try {
    const { data } = await fetchLocations({ limit: 100 });
    return <LocationsBoard locations={data} canWrite={canWrite} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadLocations', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div {...stylex.props(styles.page)}>
        <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
          <span>Iron Gym</span>
          <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
          <span {...stylex.props(styles.crumbCurrent)}>{t('breadcrumb.locations')}</span>
        </nav>
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </header>
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }
}
