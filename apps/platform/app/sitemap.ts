import type { MetadataRoute } from 'next';
import { fetchBlogIndex } from '@/lib/blog';
import { FEATURE_SLUGS } from '@/data/features';
import { BUILT_FOR_SLUGS } from '@/data/built-for';
import { localeUrl } from '@/src/i18n/metadata';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await fetchBlogIndex();
  const paths = [
    '/',
    '/pricing',
    '/blog',
    '/features',
    '/built-for',
    '/register-gym',
    '/privacy',
    '/terms',
    '/dpa',
    ...FEATURE_SLUGS.map((slug) => `/features/${slug}`),
    ...BUILT_FOR_SLUGS.map((slug) => `/built-for/${slug}`),
  ];
  const staticPages = paths.flatMap((path) =>
    ['en', 'ka'].map((locale) => ({
      url: localeUrl(locale, path),
      alternates: {
        languages: {
          en: localeUrl('en', path),
          ka: localeUrl('ka', path),
          'x-default': localeUrl('en', path),
        },
      },
    })),
  );
  return [...staticPages, ...items.flatMap((post) =>
    post.langs.map((lang) => ({
      url: localeUrl(lang, `/blog/${post.slug}`),
      lastModified: post.updatedAt,
      alternates: {
        languages: Object.fromEntries(post.langs.map((language) =>
          [language, localeUrl(language, `/blog/${post.slug}`)]
        )),
      },
    }))
  )];
}

