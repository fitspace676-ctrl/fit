import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FeaturePageEditorial } from '@/components/marketing/feature-page-editorial';
import { getFeaturePage } from '@/data/feature-pages';
import BuiltForPage from '@/components/marketing/built-for-page';
import { FEATURES, getFeature } from '@/data/features';

/**
 * Per-feature page (`formacore.io/features/<slug>`): one per entry in
 * `@/data/features`, linked from the "Features" nav dropdown. Same template as
 * the "Built For" pages. Statically generated for every known slug.
 */
export function generateStaticParams(): { slug: string }[] {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) return { title: 'Features - FormaCore' };
  return { title: `${feature.name} - FormaCore`, description: feature.subline };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) notFound();
  const page = getFeaturePage(slug);
  return page ? (
    <FeaturePageEditorial page={page} />
  ) : (
    <BuiltForPage audience={feature} section="Features" />
  );
}
