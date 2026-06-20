import { getTranslations } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { HeroElement } from './hero-element';

/**
 * Landing hero — the first thing a visitor sees. Badge, headline, supporting
 * copy, and the two primary calls to action. All strings come from the `home`
 * message namespace so the section is fully localized (ka default, en
 * fallback).
 *
 * Light mode gets the redesigned layout: a full-bleed `herolight.webp`
 * background, the text content on the left, and a decorative `elementlight.webp`
 * on the right that animates in from the left on load (see HeroElement). Dark
 * mode keeps the original centered gradient hero as a fallback.
 */
export async function Hero() {
  const t = await getTranslations('home.hero');

  const badge = (
    <span className="rounded-card bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
      {t('badge')}
    </span>
  );
  const ctas = (
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
  );

  return (
    <>
      {/* Light-mode redesign: image background + animated element on the right. */}
      <section className="relative isolate overflow-hidden dark:hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/herolight.webp')" }}
        />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-gutter py-20 sm:py-28 lg:grid-cols-2">
          {/* Left: text content (placeholder — will be replaced later). */}
          <div className="flex flex-col items-start gap-6 text-left">
            {badge}
            <h1 className="max-w-xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              {t('title')}
            </h1>
            <p className="max-w-lg text-lg text-slate-600">{t('subtitle')}</p>
            {ctas}
          </div>
          {/* Right: decorative element, slides in from the left on load. */}
          <HeroElement />
        </div>
      </section>

      {/* Dark-mode fallback: original centered gradient hero. */}
      <section className="relative hidden overflow-hidden bg-gradient-to-b from-brand-50 to-white dark:block">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-gutter py-20 text-center sm:py-28">
          {badge}
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {t('title')}
          </h1>
          <p className="max-w-xl text-lg text-slate-600">{t('subtitle')}</p>
          {ctas}
        </div>
      </section>
    </>
  );
}
