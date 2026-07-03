import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ApiError, fetchGymSettings } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = {
  title: 'Settings — Fit Admin',
  description: 'Configure your gym’s brand, locale, business hours, and notifications.',
};

// Settings reflect live tenant state and the staff session token, so the page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The gym settings page (T2.12), rebuilt to the formacore settings artboard.
 * Server-renders the gym's current brand, locale, business hours, and notification
 * settings from `GET /gyms/settings`, then hands them to the client
 * {@link SettingsForm} (section rail + sticky save bar). The `/settings` route is
 * already gated to a privileged session (middleware + the API's `GymManage` guard),
 * so the only failure handled here is the API call itself.
 */
export default async function SettingsPage() {
  const t = await getTranslations('admin.settings');
  try {
    const settings = await fetchGymSettings();
    return <SettingsForm initial={settings} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadSettings', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div className="flex flex-col gap-6">
        <nav
          aria-label={t('breadcrumb.label')}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
        >
          <span>Iron Gym</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <span className="text-ink-600 dark:text-ink-300">{t('breadcrumb.settings')}</span>
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
