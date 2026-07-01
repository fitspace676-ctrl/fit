import { getTranslations } from 'next-intl/server';
import { Link } from '@/src/i18n/navigation';
import { buttonClasses } from '@/src/components/ui';
import { HeroElement } from './hero-element';

/**
 * Landing hero — the first thing a visitor sees. Badge, headline, supporting
 * copy, and the two primary calls to action. All strings come from the `home`
 * message namespace so the section is fully localized (ka default, en
 * fallback).
 *
 * Reskinned onto the formacore design system: a dark-friendly aurora/gradient
 * treatment (brand blur blobs) instead of the old light image background, a
 * `font-display` extrabold headline, and the brand-gradient primary CTA. The
 * decorative element still slides in on the right (see HeroElement).
 */
export async function Hero() {
  const t = await getTranslations('home.hero');

  return (
    <section className="relative isolate overflow-hidden">
      {/* Formacore aurora: soft brand/iris/accent blobs behind the content. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-40 h-[560px] w-[560px] rounded-full bg-iris-500/10 blur-[140px] dark:bg-iris-600/25" />
        <div className="absolute -top-24 right-0 h-[520px] w-[520px] rounded-full bg-brand-500/[0.09] blur-[150px] dark:bg-brand-500/25" />
        <div className="absolute -left-32 top-[55%] h-[480px] w-[480px] rounded-full bg-accent-500/[0.07] blur-[150px] dark:bg-accent-600/20" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-gutter py-20 sm:py-28 lg:grid-cols-2">
        {/* Left: text content. */}
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="inline-flex items-center rounded-pill bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/30">
            {t('badge')}
          </span>
          <h1 className="max-w-xl font-display text-4xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-5xl">
            {t('title')}
          </h1>
          <p className="max-w-lg text-lg text-ink-600 dark:text-ink-300">{t('subtitle')}</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className={buttonClasses('primary', 'lg')}>
              {t('ctaPrimary')}
            </Link>
            <Link href="/classes" className={buttonClasses('outline', 'lg')}>
              {t('ctaSecondary')}
            </Link>
          </div>
        </div>
        {/* Right: decorative element, slides in from the left on load. */}
        <HeroElement />
      </div>
    </section>
  );
}
