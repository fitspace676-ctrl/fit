import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import PricingPage from '@/components/marketing/pricing-page';
import { localeAlternates } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: localeAlternates('/pricing'),
  };
}

export default async function Page({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PricingPage />;
}
