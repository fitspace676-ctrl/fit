import type { MetadataRoute } from 'next';
import { fetchBlogIndex } from '@/lib/blog';
import { postPath } from '@/components/blog/dictionary';

export const revalidate = 60;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = 'https://formacore.io';
  const { items } = await fetchBlogIndex();
  return [
    ...[
      '',
      '/features',
      '/pricing',
      '/privacy',
      '/terms',
      '/dpa',
      '/built-for',
      '/blog',
      '/ka/blog',
    ].map((path) => ({ url: `${origin}${path}` })),
    ...items.flatMap((post) =>
      post.langs.map((lang) => ({
        url: `${origin}${postPath(post.slug, lang)}`,
        lastModified: post.updatedAt,
        alternates: {
          languages: Object.fromEntries(
            post.langs.map((language) => [language, `${origin}${postPath(post.slug, language)}`]),
          ),
        },
      })),
    ),
  ];
}
