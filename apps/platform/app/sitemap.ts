import type { MetadataRoute } from 'next';
import { FEATURE_SLUGS } from '@/data/features';
import { BUILT_FOR_SLUGS } from '@/data/built-for';
import { localeUrl } from '@/src/i18n/metadata';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '/',
    '/pricing',
    '/features',
    '/built-for',
    '/register-gym',
    '/privacy',
    '/terms',
    '/dpa',
    ...FEATURE_SLUGS.map((slug) => `/features/${slug}`),
    ...BUILT_FOR_SLUGS.map((slug) => `/built-for/${slug}`),
  ];
  return paths.flatMap((path) =>
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
}
