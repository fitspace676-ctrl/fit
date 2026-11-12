import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import PricingPage from '@/components/marketing/pricing-page';
import { PLANS } from '@/data/plans';
import { JsonLd, breadcrumbLd, softwareApplicationLd } from '@/components/seo/json-ld';
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
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const plans = PLANS.map((tier) => ({
    name: t(`tiers.${tier.id}.name`),
    monthly: tier.monthly,
  }));
  return (
    <>
      <JsonLd data={softwareApplicationLd(locale, t('meta.description'), plans)} />
      <JsonLd
        data={breadcrumbLd(locale, [
          { name: 'FormaCore', path: '/' },
          { name: tCommon('nav.items.pricing'), path: '/pricing' },
        ])}
      />
      <PricingPage />
    </>
  );
}
