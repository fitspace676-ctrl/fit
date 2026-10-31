import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import BuiltForPage from '@/components/marketing/built-for-page';
import { BUILT_FOR_SLUGS, getAudience } from '@/data/built-for';
import { pageMetadata } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string; slug: string }> };

/**
 * Per-audience "Built For" surface (`formacore.io/built-for/<slug>`) — one page
 * per audience in `@/data/built-for`, linked from the "Built For" nav dropdown.
 * Statically generated for every known slug (in every locale); unknown slugs 404.
 */
export function generateStaticParams(): { slug: string }[] {
  return BUILT_FOR_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'builtFor' });
  const audience = getAudience(t, slug);
  if (!audience) notFound();
  return pageMetadata({
    locale,
    path: `/built-for/${slug}`,
    title: t(`pages.${slug}.meta.title`),
    description: t(`pages.${slug}.meta.description`),
  });
}

export default async function Page({ params }: Params) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('builtFor');
  const audience = getAudience(t, slug);
  if (!audience) notFound();
  return <BuiltForPage audience={audience} />;
}
