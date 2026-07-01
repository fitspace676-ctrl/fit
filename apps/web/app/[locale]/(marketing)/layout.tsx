import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';

/**
 * Marketing chrome — the public landing page's slim top nav and locale switcher.
 * Split out of the root layout so the member portal ({@link (member)}) and the
 * chrome-less auth pages don't inherit it.
 */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-ink-100 px-gutter py-4 dark:border-white/10">
        <nav className="flex items-center gap-6 text-sm font-medium text-ink-600 dark:text-ink-300">
          <Link href="/" className="font-display font-extrabold text-brand-600 dark:text-brand-300">
            {t('appName')}
          </Link>
          <Link href="/classes" className="hover:text-brand-600 dark:hover:text-white">
            {t('nav.classes')}
          </Link>
          <Link href="/trainers" className="hover:text-brand-600 dark:hover:text-white">
            {t('nav.trainers')}
          </Link>
          <Link href="/shop" className="hover:text-brand-600 dark:hover:text-white">
            {t('nav.shop')}
          </Link>
        </nav>
        <LocaleSwitcher />
      </header>
      {children}
    </>
  );
}
