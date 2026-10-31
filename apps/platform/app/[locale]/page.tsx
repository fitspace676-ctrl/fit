import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import PlatformLanding from '@/components/marketing/platform-landing';
import { localeAlternates } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  return { title: t('meta.title'), alternates: localeAlternates('/') };
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
  return <PlatformLanding />;
}
