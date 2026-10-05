import { getTranslations } from 'next-intl/server';
import { fetchMobileAppSettings } from '@/lib/api';
import { AppSettingsForm } from './app-settings-form';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const t = await getTranslations('admin.appSettings');
  return { title: t('title') };
}
export default async function AppSettingsPage() {
  const t = await getTranslations('admin.appSettings');
  try {
    return <AppSettingsForm initial={await fetchMobileAppSettings()} />;
  } catch {
    return (
      <div>
        <h1>{t('title')}</h1>
        <p role="alert">{t('loadError')}</p>
      </div>
    );
  }
}
