import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FeaturePageEditorial } from '@/components/marketing/feature-page-editorial';
import BuiltForPage from '@/components/marketing/built-for-page';
import { getFeaturePage } from '@/data/feature-pages';
import { FEATURE_SLUGS, getFeature } from '@/data/features';
import { localeAlternates } from '@/src/i18n/metadata';

type Params = { params: Promise<{ locale: string; slug: string }> };

/**
 * Per-feature page (`formacore.io/features/<slug>`): one per module in
 * `@/data/features`, linked from the "Features" nav dropdown. The long-form
 * editorial template where the feature has its copy, the "Built For" template
 * otherwise. Statically generated for every known slug (in every locale).
 */
export function generateStaticParams(): { slug: string }[] {
  return FEATURE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'features' });
  const feature = getFeature(t, slug);
  if (!feature) return { title: t('meta.title') };
  return {
    title: t('meta.pageTitle', { name: feature.name }),
    description: feature.subline,
    alternates: localeAlternates(`/features/${slug}`),
  };
}

export default async function Page({ params }: Params) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('features');
  const feature = getFeature(t, slug);
  if (!feature) notFound();
  const page = getFeaturePage(t, slug);
  return page ? (
    <FeaturePageEditorial page={page} />
  ) : (
    <BuiltForPage audience={feature} section="features" />
  );
}
