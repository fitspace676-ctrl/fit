import { isLocale } from '@fit/i18n';
import { blogFeed } from '@/lib/blog-feed';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response(null, { status: 404 });
  return blogFeed(locale);
}
