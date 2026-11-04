import { isLocale } from '@fit/i18n';
import { notFound } from 'next/navigation';
import {
  BlogListingRoute,
  listMetadata,
  type BlogSearchParams,
} from '@/components/blog/blog-routes';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string }>; searchParams: BlogSearchParams };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return listMetadata(locale);
}
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BlogListingRoute lang={locale} searchParams={searchParams} />;
}
