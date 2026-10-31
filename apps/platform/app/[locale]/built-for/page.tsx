import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import BuiltForHub from '@/components/marketing/built-for-hub';
import { localeAlternates } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string }> };

/**
 * "Built For" hub (`formacore.io/built-for`): every business type FormaCore is
 * built for, each linking to its own /built-for/<slug> page. Reached from the
 * homepage's "See all" and the nav.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'builtFor' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: localeAlternates('/built-for'),
  };
}

export default async function Page({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BuiltForHub />;
}
