import { getTranslations } from 'next-intl/server';
import { fetchGymSettings } from '@/lib/api';
import { ShopSettingsForm } from './shop-settings-form';

export const dynamic = 'force-dynamic';

export default async function ShopSettingsPage() {
  const t = await getTranslations('shopDiscount');
  const settings = await fetchGymSettings();
  return (
    <section>
      <h1>{t('title')}</h1>
      <ShopSettingsForm initialPercent={settings.shop?.memberDiscountPercent ?? 0} />
    </section>
  );
}
