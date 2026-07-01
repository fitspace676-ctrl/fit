'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatedTabs } from '@/components/ui/animated-tabs';
import { AuroraText } from '@/components/ui/aurora-text';
import { ContainerScroll } from '@/components/ui/container-scroll';
import { LiquidGlassCard } from '@/components/ui/liquid-glass';
import { SplineScene } from '@/components/ui/spline-scene';
import { Marquee } from '@/registry/magicui/marquee';
import { BUILT_FOR } from '@/data/built-for';
import { PricingCards } from './pricing-cards';
import { cn } from '@/lib/utils';
import { DemoModal, TrialModal } from './lead-modals';
import { Aurora, Btn, I, Icon, MarketingFooter, MarketingNav } from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore — Platform overview  ·  "Aurora Glass"
   A product page selling FormaCore's modules to gym & studio owners.
   Interactive module explorer: pick a pillar on the left, the detailed
   mock + capability list updates on the right. Same dark aurora identity.

   Faithful port of the "Marketing / platform" design. Shared chrome (nav,
   footer, buttons, icon set) lives in `./marketing-ui`. Every signup CTA
   funnels into the owner-signup flow (`/register-gym`) and "Book a demo"
   opens a mail draft; the "Pricing" nav routes to the dedicated /pricing page.
   ──────────────────────────────────────────────────────────────────────── */

/* ---- module mock screens ---- */
/* Capability marquee — the platform's modules scroll past in two rows.
   Themed to the platform tokens (overlay glass + semantic text); icons reuse
   the shared `I` set. The Marquee primitive lives in `registry/magicui/marquee`. */
const features = [
  {
    icon: I.grid,
    title: 'Manager Core',
    body: 'The full admin panel — members, staff, classes, billing, automation, and reports.',
  },
  {
    icon: I.globe,
    title: 'Member Portal',
    body: 'Branded self-service web portal for members.',
  },
  {
    icon: I.calendar,
    title: 'Online Booking & Scheduling',
    body: 'Class timetable, bookings, and waitlists.',
  },
  {
    icon: I.pos,
    title: 'Reception POS',
    body: 'Front desk application — check-in and sales.',
  },
  {
    icon: I.phone,
    title: 'Mobile App',
    body: 'White-label member app.',
  },
  {
    icon: I.chart,
    title: 'Analytics & Reporting',
    body: 'Dashboards, retention data, and reports.',
  },
  {
    icon: I.spark,
    title: 'AI Assistant',
    body: 'Your operations co-pilot.',
  },
];

const firstRow = features.slice(0, features.length / 2);
const secondRow = features.slice(features.length / 2);

/* "Built for" — audience-specific value props shown in the animated stacked
   tabs. The data is the single source of truth in `@/data/built-for` (it also
   feeds the dedicated /built-for/<slug> pages and the nav dropdown); the tabs
   read the `eyebrow / headline / subline / stats / panelClassName` fields off
   each entry. The bold per-card gradients are intentional here (the cards fan
   out behind each other) — self-contained dark gradients with white text, so
   they read in both themes. */
const audiences = BUILT_FOR;

/* Contact form field styling — mirrors the lead-modal inputs but taller, to
   match the dedicated contact panel. */
const contactInputCls =
  'mt-2 w-full h-12 rounded-btn border border-violet-500/25 bg-violet-500/[0.05] dark:border-white/15 dark:bg-white/[0.05] px-4 text-sm text-fg placeholder:text-faint outline-none transition focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/25';

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
  // Hero product showcase eases in once mounted (slide + fade), matching the
  // member app's animated hero element without pulling in a motion dependency.
  const [showcaseIn, setShowcaseIn] = useState(false);
  useEffect(() => setShowcaseIn(true), []);
  // Which CTA form modal is open (null = none).
  const [modal, setModal] = useState<null | 'trial' | 'demo'>(null);

  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-hidden selection:bg-brand-500/30">
      <Aurora />

      <MarketingNav active="Core" overlay />

      {/* hero — LIGHT mode: herolight photo backdrop, copy on the left, the
          elementlight product shot on the right easing in on mount. Hidden in
          dark mode, which keeps the original centred aurora hero below. */}
      <section className="relative z-10 isolate overflow-hidden dark:hidden min-h-screen flex items-center">
        {/* full-bleed photo backdrop, lightened on the left for legibility */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <img
            src="/herolight.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-surface/20" />
        </div>

        <div className="relative z-10 w-full max-w-[1180px] mx-auto px-6 lg:px-10 pt-28 pb-10">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* left: copy — slides in from the left (linear) */}
            <div
              className={`text-left transition-all duration-1000 ease-linear ${
                showcaseIn ? 'translate-x-0 opacity-100' : '-translate-x-16 opacity-0'
              }`}
            >
              <h1 className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4rem] font-black tracking-tight leading-[0.95]">
                Built For The Businesses{' '}
                <AuroraText colors={['#5044D2', '#7A5AF8', '#2342EB']}>
                  That Move People.
                </AuroraText>
              </h1>
              <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
                Every great fitness business runs on something. Members who stay, staff who know
                what to do, numbers that tell the truth. FormaCore pulls it all together.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-9">
                <Btn v="primary" size="lg" icon={I.arrow} onClick={() => setModal('trial')}>
                  Start 14-day trial
                </Btn>
                <Btn
                  v="glass"
                  size="lg"
                  onClick={() => setModal('demo')}
                  ripple
                  rippleColor="#6257E3"
                >
                  Book a demo
                </Btn>
              </div>
            </div>

            {/* right: visual — slides in from the right (linear) */}
            <div
              className={`relative transition-all duration-1000 ease-linear ${
                showcaseIn ? 'translate-x-0 opacity-100' : 'translate-x-16 opacity-0'
              }`}
            >
              <img
                src="/lptlight.webp"
                alt="The FormaCore back-office and member app, side by side"
                draggable={false}
                className="w-[125%] -ml-[12%] max-w-none lg:w-[192%] lg:-ml-[22%] lg:-mt-[4.5rem] select-none drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* hero — DARK mode: herodark photo backdrop, copy on the left, the
          lptdark product shot on the right easing in on mount. Hidden in
          light mode, which shows the herolight hero above. */}
      <section className="relative z-10 isolate overflow-hidden hidden dark:flex min-h-screen items-center">
        {/* full-bleed photo backdrop, darkened on the left for legibility */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <img
            src="/herodark.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-surface/20" />
        </div>

        <div className="relative z-10 w-full max-w-[1180px] mx-auto px-6 lg:px-10 pt-28 pb-10">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* left: copy — slides in from the left (linear) */}
            <div
              className={`text-left transition-all duration-1000 ease-linear ${
                showcaseIn ? 'translate-x-0 opacity-100' : '-translate-x-16 opacity-0'
              }`}
            >
              <h1 className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4rem] font-black tracking-tight leading-[0.95]">
                Built For The Businesses{' '}
                <AuroraText colors={['#9184F1', '#9B8AFB', '#96B2FF']}>
                  That Move People.
                </AuroraText>
              </h1>
              <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
                Every great fitness business runs on something. Members who stay, staff who know
                what to do, numbers that tell the truth. FormaCore pulls it all together.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-9">
                <Btn v="primary" size="lg" icon={I.arrow} onClick={() => setModal('trial')}>
                  Start 14-day trial
                </Btn>
                <Btn
                  v="glass"
                  size="lg"
                  onClick={() => setModal('demo')}
                  ripple
                  rippleColor="#6257E3"
                >
                  Book a demo
                </Btn>
              </div>
            </div>

            {/* right: visual — slides in from the right (linear) */}
            <div
              className={`relative transition-all duration-1000 ease-linear ${
                showcaseIn ? 'translate-x-0 opacity-100' : 'translate-x-16 opacity-0'
              }`}
            >
              <img
                src="/lptdark.webp"
                alt="The FormaCore back-office and member app, side by side"
                draggable={false}
                className="w-[125%] -ml-[12%] max-w-none lg:w-[192%] lg:-ml-[22%] lg:-mt-[4.5rem] select-none drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* scroll-reveal — the product flattens into view as you scroll */}
      <section className="relative z-10 flex flex-col overflow-hidden">
        <ContainerScroll
          titleComponent={
            <h2 className="mx-auto max-w-3xl text-2xl font-semibold text-fg md:text-3xl">
              Your members feel it. Your staff lives it. You see it in the numbers.
              <span className="mt-3 block text-5xl font-black leading-[1.05] md:text-[4rem]">
                <AuroraText colors={['#6257E3', '#7A5AF8', '#2342EB']}>
                  FormaCore connects all three
                </AuroraText>
              </span>
            </h2>
          }
        >
          {/* light theme dashboard */}
          <img
            src="/dashlight.webp"
            alt="FormaCore dashboard"
            draggable={false}
            height={720}
            width={1400}
            className="mx-auto h-full w-full rounded-2xl object-cover object-[50%_22%] dark:hidden"
          />
          {/* dark theme dashboard */}
          <img
            src="/dashdark.webp"
            alt="FormaCore dashboard"
            draggable={false}
            height={720}
            width={1400}
            className="mx-auto hidden h-full w-full rounded-2xl object-cover object-[50%_22%] dark:block"
          />
        </ContainerScroll>
      </section>

      {/* spline 3D scene (left) + copy (right) */}
      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 py-8 md:py-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          {/* left: spline animation (Spline logo stripped in SplineScene) */}
          <div className="relative">
            <SplineScene
              sceneUrl="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="h-[400px] w-full md:h-[520px]"
            />
          </div>

          {/* right: copy */}
          <div className="text-left">
            <h2 className="font-display text-4xl font-black tracking-tight text-fg lg:text-[3rem] leading-[0.98]">
              The platform that thinks with your business.
            </h2>
            <p className="mt-5 text-lg text-muted leading-relaxed">
              FormaCore brings analytics, financial flow and retention into one AI-powered platform,
              so you don&apos;t just see what&apos;s happening, you know what to do next.
            </p>
          </div>
        </div>
      </section>

      {/* capability marquee — every module, one platform */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24 pb-[60px]">
        <div className="max-w-2xl mb-10">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            Everything your front desk runs on.
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

      {/* pricing — the three plans, shared with the /pricing page */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-12 pb-8">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            One platform. One simple price.
          </h2>
          <p className="mt-4 text-lg text-muted leading-relaxed">
            Every plan is the full platform - pick the tier that fits where your business is today.
          </p>
        </div>
        <PricingCards />
        <div className="mt-10 flex justify-center">
          <Btn v="glass" size="md" icon={I.arrow} href="/pricing">
            See full pricing & comparison
          </Btn>
        </div>
      </section>

      {/* built for — audience-specific value props in animated stacked tabs */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-12 pb-24">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            Built for how you actually run.
          </h2>
          <p className="mt-4 text-lg text-muted leading-relaxed">
            Whatever shape your business takes, FormaCore fits the way you work — pick yours.
          </p>
        </div>

        <AnimatedTabs tabs={audiences} autoAdvanceMs={6000}>
          {(a) => (
            <div
              className={cn(
                'relative h-full w-full overflow-hidden rounded-[2rem] bg-gradient-to-br p-7 ring-1 ring-inset ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.65)] sm:p-10 md:p-12',
                a.panelClassName,
              )}
            >
              {/* decorative glow + oversized corner icon */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              {a.iconImage ? (
                <img
                  src={a.iconImage}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 object-contain opacity-[0.06] brightness-0 invert"
                />
              ) : (
                <Icon
                  d={a.icon}
                  c="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 text-white/[0.06]"
                  sw={1.5}
                />
              )}

              <div className="relative flex h-full flex-col">
                <span className="inline-flex w-fit items-center rounded-pill bg-white/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-white/90 ring-1 ring-inset ring-white/20">
                  {a.eyebrow}
                </span>
                <h3 className="mt-5 max-w-2xl font-display text-2xl font-black leading-[1.05] tracking-tight text-white sm:text-3xl md:text-[2.5rem]">
                  {a.headline}
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base md:text-lg">
                  {a.subline}
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModal('demo')}
                    className="inline-flex h-11 items-center gap-2 rounded-btn bg-white px-5 text-sm font-semibold text-neutral-900 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] transition hover:bg-white/90 active:bg-white/80"
                  >
                    Book a free demo
                  </button>
                  <Link
                    href="/pricing"
                    className="inline-flex h-11 items-center gap-1.5 rounded-btn px-3 text-sm font-semibold text-white/90 transition hover:text-white"
                  >
                    See pricing
                    <Icon d={I.arrow} c="h-4 w-4" />
                  </Link>
                </div>

                {/* stats strip */}
                <div className="mt-auto grid grid-cols-2 gap-x-6 gap-y-5 pt-6 md:grid-cols-4">
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
        </AnimatedTabs>
      </section>

      {/* contact */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-8 pb-24">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* left: copy + map */}
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-card bg-gradient-to-br from-violet-600/35 to-pink-500/30 ring-1 ring-inset ring-violet-600/25 shadow-[0_10px_30px_-8px_rgba(124,58,237,0.45)]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-violet-600 dark:text-violet-300"
              >
                <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                <path d="m3 6.5 9 6 9-6" />
              </svg>
            </span>
            <h2 className="mt-7 font-display text-4xl lg:text-[3.25rem] font-black tracking-tight leading-[0.95]">
              Contact us
            </h2>
            <p className="mt-5 max-w-md text-lg text-muted leading-relaxed">
              We are always looking for ways to improve our products and services. Contact us and
              let us know how we can help you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-strong">
              <a href="mailto:contact@formacore.io" className="transition hover:text-fg">
                contact@formacore.io
              </a>
              <span className="text-dim">•</span>
              <a href="tel:+995322000000" className="transition hover:text-fg">
                +995 (32) 2 00 00 00
              </a>
              <span className="text-dim">•</span>
              <a href="mailto:support@formacore.io" className="transition hover:text-fg">
                support@formacore.io
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
                <span className="absolute bottom-2 left-1/2 h-6 w-px -translate-x-1/2 bg-gradient-to-t from-violet-500/0 to-violet-500/80" />
                {/* glowing pin */}
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_14px_3px_rgba(124,58,237,0.7)]" />
                </span>
                {/* label */}
                <div className="absolute bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-overlay/[0.08] px-2.5 py-1 text-xs font-medium text-fg ring-1 ring-inset ring-overlay/15 backdrop-blur">
                  We are here
                </div>
              </div>
            </div>
          </div>

          {/* right: form */}
          <div className="relative">
            {/* colored backdrop so the glass refraction reads — kept small and
                soft so it tints the panel without bleeding out */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
              <div className="absolute -right-4 -top-4 h-40 w-40 rounded-full bg-violet-400/[0.16] blur-[60px]" />
              <div className="absolute -bottom-4 -left-4 h-40 w-40 rounded-full bg-pink-400/[0.12] blur-[60px]" />
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
                  const body = `Name: ${v('name')}\nEmail: ${v('email')}\nCompany: ${v('company')}\n\n${v('message')}`;
                  window.location.href = `mailto:hello@formacore.io?subject=${encodeURIComponent(
                    `Contact: ${v('name') || 'Website'}`,
                  )}&body=${encodeURIComponent(body)}`;
                }}
              >
                <label className="block">
                  <span className="text-sm font-medium text-fg">Full name</span>
                  <input
                    className={contactInputCls}
                    type="text"
                    name="name"
                    placeholder="David Iobashvili"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-fg">Email Address</span>
                  <input
                    className={contactInputCls}
                    type="email"
                    name="email"
                    placeholder="support@formacore.io"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-fg">Company</span>
                  <input
                    className={contactInputCls}
                    type="text"
                    name="company"
                    placeholder="FormaCore Labs LLC"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-fg">Message</span>
                  <textarea
                    className="mt-2 h-40 w-full resize-none rounded-btn border border-violet-500/25 bg-violet-500/[0.05] dark:border-white/15 dark:bg-white/[0.05] px-4 py-3 text-sm text-fg placeholder:text-faint outline-none transition focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/25"
                    name="message"
                    placeholder="Type your message here"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(124,58,237,0.7)] ring-1 ring-inset ring-white/15 transition hover:brightness-110"
                >
                  Submit
                </button>
              </form>
            </LiquidGlassCard>
          </div>
        </div>
      </section>

      <MarketingFooter />

      {/* CTA form modals — opened by the trial / demo buttons throughout. */}
      <TrialModal open={modal === 'trial'} onClose={() => setModal(null)} />
      <DemoModal open={modal === 'demo'} onClose={() => setModal(null)} />
    </div>
  );
}
