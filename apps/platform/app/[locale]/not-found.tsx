import { getTranslations } from 'next-intl/server';
import { Aurora, MarketingFooter, MarketingNav } from '@/components/marketing/marketing-ui';
import { Link } from '@/src/i18n/navigation';

/**
 * The 404 page, in the visitor's language and with the site's navigation, so a
 * stale or mistyped link still leads somewhere instead of a bare error.
 */
export default async function NotFound() {
  const t = await getTranslations('common');
  const links = [
    { href: '/', label: t('notFound.home') },
    { href: '/features', label: t('nav.items.features') },
    { href: '/built-for', label: t('nav.items.builtFor') },
    { href: '/pricing', label: t('nav.items.pricing') },
    { href: '/resources', label: t('nav.items.resources') },
  ] as const;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-surface font-sans text-fg antialiased">
      <Aurora />
      <MarketingNav />
      <main className="relative z-10 mx-auto w-full max-w-[760px] flex-1 px-6 pb-24 pt-40 text-center">
        <p className="font-mono text-sm text-subtle">404</p>
        <h1 className="mt-4 font-display text-4xl font-black tracking-tight sm:text-5xl">
          {t('notFound.title')}
        </h1>
        <p className="mt-5 text-lg text-muted">{t('notFound.body')}</p>
        <ul className="mt-10 flex flex-wrap justify-center gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex rounded-full border border-overlay/15 px-5 py-2.5 text-sm font-semibold transition hover:border-brand-500/60 hover:text-brand-600 dark:hover:text-brand-300"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <MarketingFooter />
    </div>
  );
}
