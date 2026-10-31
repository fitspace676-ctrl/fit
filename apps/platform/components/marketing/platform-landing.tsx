'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { AuroraText } from '@/components/ui/aurora-text';
import { CardStack } from '@/components/ui/card-stack';
import { LiquidGlassCard } from '@/components/ui/liquid-glass';
import { Marquee } from '@/registry/magicui/marquee';
import { getBuiltFor } from '@/data/built-for';
import { getFeatures } from '@/data/features';
import { Link } from '@/src/i18n/navigation';
import { AudienceBadge, AudienceEmblem } from './audience-badge';
import { HeroDevices } from './hero-devices';
import { useLeadCta } from './lead-cta-context';
import { ProductTour } from './product-tour';
import { Aurora, Btn, I, Icon, MarketingFooter, MarketingNav } from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore — Platform overview  ·  "Aurora Glass"
   A product page selling FormaCore's modules to gym & studio owners: the
   hero, the capability marquee, the product tour, the audience tabs and contact.

   Faithful port of the "Marketing / platform" design. Shared chrome (nav,
   footer, buttons, icon set) lives in `./marketing-ui`. The site has two
   calls to action, "Book a demo" and "Request a call"; both open a lead form
   (`./lead-cta-provider`) that posts to `/api/leads`. The plans live on their
   own `/pricing` page, reached from the nav and footer; the homepage carries no
   pricing band.
   ──────────────────────────────────────────────────────────────────────── */

/** How many audience cards the landing stacks before "See all" (the rest live on /built-for). */
const LANDING_AUDIENCES = 4;

/* Contact form field styling — mirrors the lead-modal inputs but taller, to
   match the dedicated contact panel. */
const contactInputCls =
  'mt-2 w-full h-12 rounded-btn border border-brand-500/25 bg-brand-500/[0.05] dark:border-white/15 dark:bg-white/[0.05] px-4 text-sm text-fg placeholder:text-faint outline-none transition focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/25';

const FeatureCard = ({
  icon,
  title,
  body,
  className = 'w-80',
}: {
  icon: string;
  title: string;
  body: string;
  /** Width utility — defaults to the fixed `w-80` the marquee needs; the static
      grid passes `w-full` so cards fill their column. */
  className?: string;
}) => (
  <figure
    className={`group/card relative h-full overflow-hidden rounded-card border border-overlay/10 bg-panel/70 p-5 shadow-[0_10px_30px_-14px_rgba(16,18,33,0.25)] backdrop-blur-xl transition dark:bg-overlay/[0.03] dark:shadow-none ${className}`}
  >
    {/* gradient that slides up from the bottom on hover */}
    <div className="absolute inset-0 translate-y-full bg-gradient-to-r from-brand-600 to-iris-600 transition-transform duration-300 ease-out group-hover/card:translate-y-0" />
    {/* oversized decorative corner icon */}
    <Icon
      d={icon}
      c="pointer-events-none absolute -top-10 -right-10 z-10 h-36 w-36 text-fg/[0.04] transition-transform duration-300 group-hover/card:rotate-12 group-hover/card:text-white/25"
      sw={1.5}
    />
    <div className="relative z-10 flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-gradient-to-br from-brand-400/30 to-iris-600/20 ring-1 ring-inset ring-brand-500/20 transition-colors duration-300 group-hover/card:bg-none group-hover/card:bg-white/20 group-hover/card:ring-white/30">
        <Icon
          d={icon}
          c="w-5 h-5 text-brand-600 transition-colors duration-300 dark:text-brand-300 group-hover/card:text-white"
          sw={2}
        />
      </span>
      <figcaption className="font-display text-base font-bold tracking-tight text-fg transition-colors duration-300 group-hover/card:text-white">
        {title}
      </figcaption>
    </div>
    <blockquote className="relative z-10 mt-3 text-sm text-muted leading-relaxed transition-colors duration-300 group-hover/card:text-white/80">
      {body}
    </blockquote>
  </figure>
);

export default function PlatformLanding() {
  const t = useTranslations('landing');
  const tCommon = useTranslations('common');
  const tBuiltFor = useTranslations('builtFor');
  const tFeatures = useTranslations('features');

  /* Capability marquee — the platform's modules scroll past in two rows.
     Themed to the platform tokens (overlay glass + semantic text); icons reuse
     the shared `I` set. The Marquee primitive lives in `registry/magicui/marquee`. */
  const features = getFeatures(tFeatures).map((f) => ({
    icon: f.icon,
    title: f.name,
    body: f.summary ?? f.subline,
  }));
  const firstRow = features.slice(0, features.length / 2);
  const secondRow = features.slice(features.length / 2);

  /* "Built for" — audience-specific value props, one card per audience in a
     scroll-driven stack. The data is the single source of truth in
     `@/data/built-for` (it also feeds the dedicated /built-for/<slug> pages and
     the nav dropdown); the cards read the `name / icon / headline / subline /
     stats` fields off each entry. The cover gradient is local to this stack,
     identical in both themes; dedicated audience pages keep their own palette. */
  const audiences = getBuiltFor(tBuiltFor);

  // Hero product showcase eases in once mounted (slide + fade), matching the
  // member app's animated hero element without pulling in a motion dependency.
  const [showcaseIn, setShowcaseIn] = useState(false);
  useEffect(() => setShowcaseIn(true), []);
  // Opens the shared "Book a demo" / "Request a call" forms.
  const openLead = useLeadCta();

  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-x-clip selection:bg-brand-500/30">
      <Aurora />

      <MarketingNav active="core" overlay forceDark />

      {/* hero — LIGHT mode: deep brand-blue aurora backdrop with white
          type, copy on the left, the
          live product recording on the right easing in on mount. Hidden in
          dark mode, which shows the dark hero below. */}
      <section className="relative z-10 isolate overflow-hidden dark:hidden min-h-screen flex items-center text-white">
        <AuroraBackground tone="deep" />

        <div className="relative z-10 w-full max-w-[1180px] mx-auto px-6 lg:px-10 pt-28 pb-36 lg:pb-10">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* left: copy — slides in from the left (linear) */}
            <div
              className={`text-left transition-all duration-1000 ease-linear ${
                showcaseIn ? 'translate-x-0 opacity-100' : '-translate-x-16 opacity-0'
              }`}
            >
              <h1 className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4rem] font-black tracking-tight leading-[0.95]">
                {t('hero.titleLead')}{' '}
                <AuroraText colors={['#B8DDFF', '#67D9F8', '#7CC4FF']}>
                  {t('hero.titleAccent')}
                </AuroraText>
              </h1>
              <p className="mt-6 text-lg text-white/80 max-w-xl leading-relaxed">
                {t('hero.body')}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-9">
                <Btn v="onBlue" size="lg" icon={I.arrow} onClick={() => openLead('demo')}>
                  {tCommon('cta.bookDemo')}
                </Btn>
                <Btn
                  v="glassOnBlue"
                  size="lg"
                  icon={I.handset}
                  onClick={() => openLead('call')}
                  ripple
                  rippleColor="#7CC4FF"
                >
                  {tCommon('cta.requestCall')}
                </Btn>
              </div>
            </div>

            {/* right: the product showcase, with its own entrance animation.
                On phones it comes first, above the copy. */}
            <div className="relative order-first lg:order-none">
              <div className="w-full max-w-none lg:w-[100%] min-[1400px]:w-[110%]">
                <HeroDevices theme="light" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* hero — DARK mode: brand aurora backdrop, copy on the left, the
          live product recording on the right easing in on mount. Hidden in
          light mode, which shows the light hero above. */}
      <section className="relative z-10 isolate overflow-hidden hidden dark:flex min-h-screen items-center">
        <AuroraBackground />

        <div className="relative z-10 w-full max-w-[1180px] mx-auto px-6 lg:px-10 pt-28 pb-10">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* left: copy — slides in from the left (linear) */}
            <div
              className={`text-left transition-all duration-1000 ease-linear ${
                showcaseIn ? 'translate-x-0 opacity-100' : '-translate-x-16 opacity-0'
              }`}
            >
              <h1 className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4rem] font-black tracking-tight leading-[0.95]">
                {t('hero.titleLead')}{' '}
                <AuroraText colors={['#7CC4FF', '#67D9F8', '#93B4FD']}>
                  {t('hero.titleAccent')}
                </AuroraText>
              </h1>
              <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">{t('hero.body')}</p>
              <div className="flex flex-wrap items-center gap-3 mt-9">
                <Btn v="primary" size="lg" icon={I.arrow} onClick={() => openLead('demo')}>
                  {tCommon('cta.bookDemo')}
                </Btn>
                <Btn
                  v="glass"
                  size="lg"
                  icon={I.handset}
                  onClick={() => openLead('call')}
                  ripple
                  rippleColor="#7FB3C8"
                >
                  {tCommon('cta.requestCall')}
                </Btn>
              </div>
            </div>

            {/* right: the product showcase, with its own entrance animation.
                On phones it comes first, above the copy. */}
            <div className="relative order-first lg:order-none">
              <div className="w-full max-w-none lg:w-[100%] min-[1400px]:w-[110%]">
                <HeroDevices theme="dark" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* capability marquee — every module, one platform */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24 pb-[60px]">
        <div className="max-w-2xl mb-10">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            {t('capabilities.title')}
          </h2>
        </div>
        {/* Edges fade via a mask on the track itself (not a colour overlay), so the
            cards dissolve to transparent over any background instead of leaving
            half-visible "ghost" cards. py-4 keeps card shadows from being clipped. */}
        <div className="relative flex w-full flex-col items-center justify-center overflow-hidden py-4 [mask-image:linear-gradient(to_right,transparent,#000_14%,#000_86%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,#000_14%,#000_86%,transparent)]">
          <Marquee pauseOnHover className="[--duration:40s]">
            {firstRow.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </Marquee>
          <Marquee reverse pauseOnHover className="[--duration:40s]">
            {secondRow.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </Marquee>
        </div>
      </section>

      {/* product tour — the console and the portal, scene by scene */}
      <ProductTour />

      {/* built for — one card per audience, stacking up as you scroll */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-12 pb-24">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            {t('builtFor.title')}
          </h2>
          <p className="mt-4 text-lg text-muted leading-relaxed">{t('builtFor.intro')}</p>
        </div>

        <CardStack
          items={audiences.slice(0, LANDING_AUDIENCES)}
          getKey={(a) => a.slug}
          cardClassName="flex min-h-[43rem] md:h-[37rem] md:min-h-0"
        >
          {(a) => (
            <div
              className="relative h-full w-full overflow-hidden rounded-[2rem] p-7 ring-1 ring-inset ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.65)] sm:p-10 md:p-12"
              style={{
                backgroundColor: '#1F4A72',
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' filter='url(%23n)' opacity='.65' d='M0 0h160v160H0z'/%3E%3C/svg%3E"), radial-gradient(ellipse at top left, #7FB3C8, transparent 55%), linear-gradient(120deg, #2F7896 15%, #1F4A72 100%)`,
                backgroundSize: '160px 160px, cover, cover',
                backgroundBlendMode: 'soft-light, normal, normal',
              }}
            >
              <AudienceEmblem audience={a} cover />

              <div className="relative flex h-full flex-col">
                <AudienceBadge audience={a} cover />
                <h3 className="mt-4 sm:mt-5 max-w-2xl md:max-w-[min(42rem,calc(100%-21rem))] font-display text-2xl font-black leading-[1.05] tracking-tight text-white sm:text-3xl md:text-[2.5rem]">
                  {a.headline}
                </h3>
                <p className="mt-4 max-w-xl md:max-w-[min(36rem,calc(100%-21rem))] text-sm leading-relaxed text-white/85 sm:text-base md:text-lg">
                  {a.subline}
                </p>

                <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openLead('demo')}
                    className="inline-flex h-11 items-center gap-2 rounded-btn bg-white px-5 text-sm font-semibold text-neutral-900 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] transition hover:bg-white/90 active:bg-white/80"
                  >
                    {tCommon('cta.bookDemo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openLead('call')}
                    className="inline-flex h-11 items-center gap-1.5 rounded-btn px-3 text-sm font-semibold text-white/90 transition hover:text-white"
                  >
                    <Icon d={I.handset} c="h-4 w-4" />
                    {tCommon('cta.requestCall')}
                  </button>
                </div>

                {/* stats strip */}
                <div className="mt-auto grid grid-cols-2 gap-x-6 gap-y-4 pt-5 sm:gap-y-5 sm:pt-6 md:grid-cols-4">
                  {a.stats.map((s) => (
                    <div key={s.label}>
                      <div className="font-display text-2xl font-black tracking-tight text-white md:text-3xl">
                        {s.value}
                      </div>
                      <div className="mt-1.5 text-xs leading-snug text-white/70">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardStack>

        <div className="mt-10 flex justify-center">
          <Link
            href="/built-for"
            className="group relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-pill bg-[radial-gradient(ellipse_at_top_left,rgba(127,179,200,0.9),transparent_60%),linear-gradient(120deg,#2F7896_15%,#1F4A72_100%)] py-2 pl-2 pr-2 text-sm font-semibold text-white shadow-[0_14px_34px_-12px_rgba(31,74,114,0.75)] ring-1 ring-inset ring-white/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-14px_rgba(31,74,114,0.9)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50"
          >
            {/* light sweeping across on hover */}
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-[420%]" />
            {/* the next few audiences, stacked */}
            <span className="relative flex -space-x-2">
              {audiences.slice(LANDING_AUDIENCES, LANDING_AUDIENCES + 3).map((a) => (
                <span
                  key={a.slug}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#2F7896] ring-2 ring-[#2F7896]"
                >
                  <Icon d={a.icon} c="h-4 w-4" sw={2} />
                </span>
              ))}
            </span>
            <span className="relative">{t('builtFor.seeAll', { count: audiences.length })}</span>
            <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white/15 ring-1 ring-inset ring-white/30 transition duration-300 group-hover:bg-white group-hover:text-[#1F4A72]">
              <Icon
                d={I.arrow}
                c="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        </div>
      </section>

      {/* contact */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-8 pb-24">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* left: copy + map */}
          <div>
            <h2 className="font-display text-4xl lg:text-[3.25rem] font-black tracking-tight leading-[0.95]">
              {t('contact.title')}
            </h2>
            <p className="mt-5 max-w-md text-lg text-muted leading-relaxed">{t('contact.body')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-strong">
              <a
                href="mailto:info@formacore.io"
                className="-my-3 inline-block py-3 transition hover:text-fg"
              >
                info@formacore.io
              </a>
              <span className="text-dim">•</span>
              <a
                href="tel:+995593100733"
                className="-my-3 inline-block py-3 transition hover:text-fg"
              >
                +995 593 10 07 33
              </a>
            </div>

            {/* dotted world map + "we are here" pin */}
            <div className="relative mt-12 aspect-[139/70] w-full max-w-lg">
              <div
                className="absolute inset-0 bg-fg/[0.22]"
                style={{
                  maskImage: 'url(/dotted-world-map.svg)',
                  WebkitMaskImage: 'url(/dotted-world-map.svg)',
                  maskSize: 'contain',
                  WebkitMaskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  WebkitMaskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  WebkitMaskPosition: 'center',
                }}
              />
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: '62%', top: '32%' }}
              >
                {/* beam */}
                <span className="absolute bottom-2 left-1/2 h-6 w-px -translate-x-1/2 bg-gradient-to-t from-brand-500/0 to-brand-500/80" />
                {/* glowing pin */}
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500 shadow-[0_0_14px_3px_rgba(26,127,214,0.7)]" />
                </span>
                {/* label */}
                <div className="absolute bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-overlay/[0.08] px-2.5 py-1 text-xs font-medium text-fg ring-1 ring-inset ring-overlay/15 backdrop-blur">
                  {t('contact.here')}
                </div>
              </div>
            </div>
          </div>

          {/* right: form */}
          <div className="relative">
            {/* colored backdrop so the glass refraction reads — kept small and
                soft so it tints the panel without bleeding out */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
              <div className="absolute -right-4 -top-4 h-40 w-40 rounded-full bg-brand-400/[0.16] blur-[60px]" />
              <div className="absolute -bottom-4 -left-4 h-40 w-40 rounded-full bg-accent-400/[0.12] blur-[60px]" />
            </div>
            <LiquidGlassCard
              glowIntensity="md"
              shadowIntensity="lg"
              blurIntensity="lg"
              borderRadius="2rem"
              className="relative z-10 p-7 lg:p-10"
            >
              {/* subtle grid */}
              <div
                className="pointer-events-none absolute inset-0 text-brand-600 opacity-[0.08] dark:text-white dark:opacity-[0.06]"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
                  backgroundSize: '38px 38px',
                  maskImage: 'radial-gradient(circle at top right, black, transparent 75%)',
                  WebkitMaskImage: 'radial-gradient(circle at top right, black, transparent 75%)',
                }}
              />
              <form
                className="relative space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const v = (k: string): string => {
                    const val = fd.get(k);
                    return typeof val === 'string' ? val : '';
                  };
                  const name = `${v('name')} ${v('surname')}`.trim();
                  // The draft lands in FormaCore's own inbox, so its field
                  // labels stay English for the team reading it.
                  const body = `Name: ${name}\nEmail: ${v('email')}\nCompany: ${v('company')}\n\n${v('message')}`;
                  window.location.href = `mailto:info@formacore.io?subject=${encodeURIComponent(
                    `Contact: ${name || 'Website'}`,
                  )}&body=${encodeURIComponent(body)}`;
                }}
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-fg">{t('contact.form.name')}</span>
                    <input
                      className={contactInputCls}
                      type="text"
                      name="name"
                      autoComplete="given-name"
                      placeholder={t('contact.form.namePlaceholder')}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-fg">{t('contact.form.surname')}</span>
                    <input
                      className={contactInputCls}
                      type="text"
                      name="surname"
                      autoComplete="family-name"
                      placeholder={t('contact.form.surnamePlaceholder')}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-fg">{t('contact.form.email')}</span>
                  <input
                    className={contactInputCls}
                    type="email"
                    name="email"
                    placeholder={t('contact.form.emailPlaceholder')}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-fg">{t('contact.form.company')}</span>
                  <input
                    className={contactInputCls}
                    type="text"
                    name="company"
                    placeholder={t('contact.form.companyPlaceholder')}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-fg">{t('contact.form.message')}</span>
                  <textarea
                    className="mt-2 h-40 w-full resize-none rounded-btn border border-brand-500/25 bg-brand-500/[0.05] dark:border-white/15 dark:bg-white/[0.05] px-4 py-3 text-sm text-fg placeholder:text-faint outline-none transition focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/25"
                    name="message"
                    placeholder={t('contact.form.messagePlaceholder')}
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-btn bg-[radial-gradient(ellipse_at_top_left,rgba(127,179,200,0.9),transparent_60%),linear-gradient(120deg,#2F7896_15%,#1F4A72_100%)] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(31,74,114,0.7)] ring-1 ring-inset ring-white/15 transition hover:brightness-110"
                >
                  {t('contact.form.submit')}
                </button>
              </form>
            </LiquidGlassCard>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
