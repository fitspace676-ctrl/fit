import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocations } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { LocationsBoard } from './locations-board';

export const metadata: Metadata = {
  title: 'Locations — Fit Admin',
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
      <div className="flex flex-col gap-6">
        <nav
          aria-label={t('breadcrumb.label')}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
        >
          <span>Iron Gym</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <span className="text-ink-600 dark:text-ink-300">{t('breadcrumb.locations')}</span>
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
