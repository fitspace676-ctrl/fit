import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import PlatformLanding from '@/components/marketing/platform-landing';
import { PLANS } from '@/data/plans';
import { JsonLd, softwareApplicationLd, websiteLd } from '@/components/seo/json-ld';
import { pageMetadata } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string }> };

/** The plans as the pricing cards show them, for the SoftwareApplication offers. */
async function planOffers(locale: string) {
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return PLANS.map((tier) => ({ name: t(`tiers.${tier.id}.name`), monthly: tier.monthly }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  return pageMetadata({
    locale,
    path: '/',
    title: t('meta.title'),
    description: t('meta.description'),
  });
}

/**
 * Marketing homepage — the apex (`formacore.io`) acquisition surface. A faithful
 * build of the "Marketing / platform" design: a dark "Aurora Glass" product page
 * with an interactive module explorer. Its two calls to action are "Book a demo"
 * and "Request a call".
 */
export default async function HomePage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'landing' });
  return (
    <>
      <JsonLd data={websiteLd(locale)} />
      <JsonLd
        data={softwareApplicationLd(locale, t('meta.description'), await planOffers(locale))}
      />
      <PlatformLanding />
    </>
  );
}
