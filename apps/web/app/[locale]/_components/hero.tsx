import { getTranslations } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';

/**
 * Landing hero — the first thing a visitor sees. Badge, headline, supporting
 * copy, and the two primary calls to action. All strings come from the `home`
 * message namespace so the section is fully localized (ka default, en
 * fallback). Rendered as a server component; no interactivity here.
 */
export async function Hero() {
  const t = await getTranslations('home.hero');

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-gutter py-20 text-center sm:py-28">
        <span className="rounded-card bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
          {t('badge')}
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {t('title')}
        </h1>
        <p className="max-w-xl text-lg text-slate-600">{t('subtitle')}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="rounded-card bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            {t('ctaPrimary')}
          </Link>
          <Link
            href="/classes"
            className="rounded-card border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
      </div>
    </section>
  );
}
