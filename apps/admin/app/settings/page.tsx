import type { Metadata } from 'next';
import { ApiError, fetchGymSettings } from '@/lib/api';
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
  try {
    const settings = await fetchGymSettings();
    content = <SettingsForm initial={settings} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load settings (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Configure your gym’s brand, default locale and time zone, business hours, and the sender
          used for member emails. These apply across the whole gym.
        </p>
      </header>

      {content}
    </div>
  );
}
