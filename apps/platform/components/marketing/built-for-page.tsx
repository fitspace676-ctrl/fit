'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AudiencePage } from '@/data/built-for';
import { Reveal } from '@/components/ui/scroll-reveal';
import { cn } from '@/lib/utils';
import { DemoModal, TrialModal } from './lead-modals';
import { Aurora, Btn, I, Icon, MarketingFooter, MarketingNav } from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore — "Built For" audience page  ·  "Aurora Glass"
   The shared template for every /built-for/<slug> page. Driven entirely by a
   single `AudiencePage` record (see `@/data/built-for`): a gradient hero with
   the retention angle + stat strip, a stack of alternating feature blocks (each
   with supporting bullets), an optional "recommended plan" band, and a closing
   CTA. Reuses the marketing chrome so it reads identically to the homepage and
   pricing page. "Book a free demo" opens the demo modal; "See pricing" routes
   to /pricing.
   ──────────────────────────────────────────────────────────────────────── */

export function BuiltForPage({ audience }: { audience: AudiencePage }) {
  // Which CTA form modal is open (null = none) — mirrors the landing page.
  const [modal, setModal] = useState<null | 'trial' | 'demo'>(null);

  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-hidden selection:bg-brand-500/30">
      <Aurora />

      <MarketingNav active="Built For" />

      {/* hero — the audience's gradient panel, matching the landing tabs */}
      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pt-12 lg:pt-16 pb-12">
        <div
          className={cn(
            'relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-7 ring-1 ring-inset ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.65)] sm:p-10 md:p-14',
            audience.panelClassName,
          )}
        >
          {/* decorative glow + oversized corner icon */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          {audience.iconImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={audience.iconImage}
              alt=""
              aria-hidden
              className="pointer-events-none absolute -bottom-12 -right-12 h-64 w-64 object-contain opacity-[0.06] brightness-0 invert"
            />
          ) : (
            <Icon
              d={audience.icon}
              c="pointer-events-none absolute -bottom-12 -right-12 h-64 w-64 text-white/[0.06]"
              sw={1.5}
            />
          )}

          <div className="relative">
            <span className="inline-flex w-fit items-center rounded-pill bg-white/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-white/90 ring-1 ring-inset ring-white/20">
              {audience.eyebrow}
            </span>
            <h1 className="mt-5 max-w-3xl font-display text-3xl font-black leading-[1.03] tracking-tight text-white sm:text-4xl md:text-[3.25rem]">
              {audience.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
              {audience.subline}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
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
            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
              {audience.stats.map((s) => (
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
      </section>

      {/* feature blocks — alternating rows: copy on one side, bullets on the other */}
      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pt-8 pb-8">
        <div className="space-y-12 md:space-y-20">
          {audience.features.map((f, i) => (
            <div
              key={f.eyebrow}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
            >
              {/* copy */}
              <Reveal className={cn(i % 2 === 1 && 'lg:order-2')}>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-btn bg-gradient-to-br from-brand-400/30 to-iris-600/20 ring-1 ring-inset ring-brand-500/20">
                    <Icon d={f.icon} c="h-5 w-5 text-brand-600 dark:text-brand-300" sw={2} />
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-600 dark:text-brand-300">
                    {f.eyebrow}
                  </span>
                </div>
                <h2 className="mt-5 font-display text-2xl font-black tracking-tight lg:text-[2rem] leading-[1.04]">
                  {f.headline}
                </h2>
                <p className="mt-4 text-base text-muted leading-relaxed md:text-lg">{f.body}</p>
              </Reveal>

              {/* bullets */}
              <Reveal delay={140} className={cn(i % 2 === 1 && 'lg:order-1')}>
                <ul className="space-y-3 rounded-card border border-overlay/10 bg-panel/70 p-6 backdrop-blur-xl shadow-[0_10px_30px_-14px_rgba(16,18,33,0.25)] dark:bg-overlay/[0.03] dark:shadow-none sm:p-7">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-iris-600 text-white">
                        <Icon d={I.check} c="h-3 w-3" sw={3} />
                      </span>
                      <span className="text-sm leading-relaxed text-strong sm:text-[15px]">{b}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          ))}
        </div>
      </section>

      {/* recommended plan + closing CTA — combined into one card */}
      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pt-12 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-overlay/10 bg-panel/70 p-8 backdrop-blur-xl sm:p-12 dark:bg-overlay/[0.03]">
            <div className="pointer-events-none absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-brand-500/20 blur-[90px]" />

            {audience.planRecommendation && (
              <>
                <div className="relative">
                  <span className="inline-flex w-fit items-center rounded-pill bg-brand-500/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-brand-600 ring-1 ring-inset ring-brand-500/25 dark:text-brand-300">
                    {audience.planRecommendation.eyebrow}
                  </span>
                  <h2 className="mt-5 max-w-2xl font-display text-2xl font-black tracking-tight lg:text-[2.25rem] leading-[1.05]">
                    {audience.planRecommendation.headline}
                  </h2>
                  <p className="mt-4 max-w-2xl text-base text-muted leading-relaxed md:text-lg">
                    {audience.planRecommendation.body}
                  </p>
                </div>
                <div className="relative my-8 h-px w-full bg-overlay/10 sm:my-10" />
              </>
            )}

            <div className="relative text-center">
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-black tracking-tight lg:text-[2.5rem] leading-[1.02]">
                {audience.footerCta.headline}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-muted leading-relaxed">
                {audience.footerCta.subline}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Btn v="primary" size="lg" icon={I.arrow} onClick={() => setModal('demo')}>
                  Book a free demo
                </Btn>
                <Btn v="glass" size="lg" href="/pricing">
                  See all plans
                </Btn>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <MarketingFooter />

      {/* CTA form modals — opened by the demo buttons throughout. */}
      <TrialModal open={modal === 'trial'} onClose={() => setModal(null)} />
      <DemoModal open={modal === 'demo'} onClose={() => setModal(null)} />
    </div>
  );
}

export default BuiltForPage;
