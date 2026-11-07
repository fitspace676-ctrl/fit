import { isLocale } from '@fit/i18n';
import { notFound } from 'next/navigation';
import { BlogArticleRoute, postMetadata } from '@/components/blog/blog-routes';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return postMetadata(params, locale);
}
export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BlogArticleRoute lang={locale} params={params} />;
}
