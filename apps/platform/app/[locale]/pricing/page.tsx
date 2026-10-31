import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import PricingPage from '@/components/marketing/pricing-page';
import { pageMetadata } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return pageMetadata({
    locale,
    path: '/pricing',
    title: t('meta.title'),
    description: t('meta.description'),
  });
}

export default async function Page({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PricingPage />;
}
