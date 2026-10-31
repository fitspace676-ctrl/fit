import type { Metadata } from 'next';

export const SITE_URL = 'https://formacore.io';
const SHARE_IMAGE = `${SITE_URL}/og/formacore-og.jpg`;

export function localeUrl(locale: string, path: string): string {
  return `${SITE_URL}${locale === 'ka' ? '/ka' : ''}${path === '/' ? '' : path}`;
}

/** English is unprefixed and is also the default language. */
export function localeAlternates(path: string): NonNullable<Metadata['alternates']> {
  return {
    languages: {
      en: localeUrl('en', path),
      ka: localeUrl('ka', path),
      'x-default': localeUrl('en', path),
    },
  };
}

/** Supply the complete social metadata because Next replaces nested layout fields. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
}: {
  locale: string;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const url = localeUrl(locale, path);
  const alt = 'FormaCore: Built For The Businesses That Move People.';
  return {
    title,
    description,
    alternates: { ...localeAlternates(path), canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'FormaCore',
      locale: locale === 'ka' ? 'ka_GE' : 'en_US',
      alternateLocale: [locale === 'ka' ? 'en_US' : 'ka_GE'],
      images: [{ url: SHARE_IMAGE, width: 1200, height: 630, alt, type: 'image/jpeg' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: SHARE_IMAGE, alt }],
    },
  };
}
