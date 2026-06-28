import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BuiltForPage from '@/components/marketing/built-for-page';
import { BUILT_FOR, getAudience } from '@/data/built-for';

/**
 * Per-audience "Built For" surface (`formacore.io/built-for/<slug>`) — one page
 * per entry in `@/data/built-for`, linked from the "Built For" nav dropdown.
 * Statically generated for every known slug; unknown slugs 404.
 */
export function generateStaticParams(): { slug: string }[] {
  return BUILT_FOR.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const audience = getAudience(slug);
  if (!audience) return { title: 'Built For - FormaCore' };
  return {
    title: `${audience.navLabel} - FormaCore`,
    description: audience.subline,
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const audience = getAudience(slug);
  if (!audience) notFound();
  return <BuiltForPage audience={audience} />;
}
