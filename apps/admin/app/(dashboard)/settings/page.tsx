import type { Metadata } from 'next';
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
 * The gym settings page (T4.8). Server-renders the gym's current brand, locale,
 * business hours, and notification settings from `GET /gyms/settings`, then hands
 * them to the client form. The `/settings` route is already gated to a privileged
 * session (middleware + the API's `GymManage` guard), so the only failure handled
 * here is the API call itself.
 */
export default async function SettingsPage() {
  let content;
  let gymName: string | null = null;
  try {
    const settings = await fetchGymSettings();
    gymName = settings.brand.name;
    content = <SettingsForm initial={settings} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load settings (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
        <Icon
          name="info"
          className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
        />
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
          {message}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Settings
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Configure how {gymName ?? 'your gym'} runs on FormaCore.
        </p>
      </header>

      {content}
    </div>
  );
}
