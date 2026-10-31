import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import BuiltForHub from '@/components/marketing/built-for-hub';
import { getFeatures } from '@/data/features';
import { localeAlternates } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string }> };

/** Features hub (`formacore.io/features`): every module, each opening its own page. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'features' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: localeAlternates('/features'),
  };
}

export default async function Page({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('features');
  return (
    <BuiltForHub
      items={getFeatures(t)}
      base="/features"
      section="features"
      title={t('hub.title')}
      intro={t('hub.intro')}
      ctaTitle={t('hub.ctaTitle')}
      ctaBody={t('hub.ctaBody')}
    />
  );
}
