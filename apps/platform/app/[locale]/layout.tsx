import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Archivo, JetBrains_Mono, Manrope, Noto_Sans_Georgian } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@fit/i18n';
import '../globals.css';
import { LeadCtaProvider } from '@/components/marketing/lead-cta-provider';
import { SiteLoader } from '@/components/marketing/site-loader';
import { pageMetadata } from '@/src/i18n/metadata';
import { routing } from '@/src/i18n/routing';
import { SentryInit } from '../sentry-init';

/**
 * Marketing type pairing from the design system: Manrope for body/UI, Archivo
 * for display headings, JetBrains Mono for code/eyebrow accents. Loaded via
 * `next/font` so the weights are self-hosted (no layout shift, no external
 * font request) and exposed as CSS variables the Tailwind config consumes.
 */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

/**
 * Georgian type. Neither Manrope nor Archivo carries Georgian glyphs, so on
 * the Georgian site (`html[lang='ka']`, see globals.css) Noto Sans Georgian goes
 * first in both the sans and the display stack; English keeps the pairing
 * above. Self-hosted like the rest, with unicode-range subsetting, so an
 * English page never downloads it.
 */
const notoGeorgian = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-noto-georgian',
  display: 'swap',
});

type Params = { params: Promise<{ locale: string }> };

/** Pre-render every supported locale at build time. */
export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  return {
    metadataBase: new URL('https://formacore.io'),
    // `?v=` busts browsers' sticky favicon cache; bump it when the icon changes.
    icons: { icon: '/favicon.ico?v=2', apple: '/apple-icon.png?v=2' },
    ...pageMetadata({
      locale,
      path: '/',
      title: t('meta.title'),
      description: t('meta.description'),
    }),
  };
}

/**
 * Sets the `.dark` class on <html> before first paint, from a saved choice or
 * the OS preference, so the page never flashes the wrong theme. Kept tiny and
 * inline; the in-page toggle updates the same class + localStorage key.
 */
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

/** Hide the splash before it paints when it has already played this session. */
const splashScript = `(function(){try{if(sessionStorage.getItem('fcl-seen'))document.documentElement.classList.add('fcl-seen');}catch(e){}})();`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  // Opt this layout into static rendering for the resolved locale.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${manrope.variable} ${archivo.variable} ${jetbrainsMono.variable} ${notoGeorgian.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
        <link rel="preload" as="image" href="/brand-mark.png" />
        <link rel="preload" as="image" href="/logo-dark.webp" />
      </head>
      <body className="min-h-screen bg-surface font-sans text-fg antialiased">
        <SentryInit />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SiteLoader />
          <LeadCtaProvider>{children}</LeadCtaProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
