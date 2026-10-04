'use client';

import Link from 'next/link';
import { BUILT_FOR } from '@/data/built-for';
import { Reveal } from '@/components/ui/scroll-reveal';
import { cn } from '@/lib/utils';
import { AudienceBadge } from './audience-badge';
import { useLeadCta } from './lead-cta-context';
import { Aurora, Btn, I, Icon, MarketingFooter, MarketingNav } from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore — "Built For" hub (/built-for)
   Every business type FormaCore is built for, as a grid of cards in each
   audience's own brand gradient. A card shows the audience's badge, its
   headline and its lead stat, and opens the detailed /built-for/<slug> page.
   The homepage stacks the first few and links here with "See all".
   ──────────────────────────────────────────────────────────────────────── */

export function BuiltForHub() {
  const openLead = useLeadCta();

  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-x-clip selection:bg-brand-500/30">
      <Aurora />
      <MarketingNav active="Built For" />

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pt-12 lg:pt-16 pb-10">
        <h1 className="max-w-3xl font-display text-4xl font-black leading-[0.98] tracking-tight sm:text-5xl lg:text-[3.5rem]">
          Built for how you actually run.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Pick your kind of business and see how FormaCore keeps your members coming back, from the
          front desk to the member app.
        </p>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pb-16">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT_FOR.map((a, i) => {
            const stat = a.stats.find((s) => s.value.includes('%')) ?? a.stats[0];
            return (
              <li key={a.slug}>
                <Reveal delay={(i % 3) * 80} className="h-full">
                  <Link
                    href={`/built-for/${a.slug}`}
                    className={cn(
                      'group relative flex h-full min-h-[19rem] flex-col overflow-hidden rounded-[1.5rem] bg-gradient-to-br p-6 text-white ring-1 ring-inset ring-white/10 shadow-[0_24px_60px_-28px_rgba(2,11,46,0.6)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_-28px_rgba(2,11,46,0.75)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50',
                      a.panelClassName,
                    )}
                  >
                    <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 bg-[radial-gradient(closest-side,rgba(124,196,255,0.25),transparent)]" />
                    <div className="relative">
                      <AudienceBadge audience={a} />
                    </div>
                    <h2 className="relative mt-5 font-display text-xl font-black leading-[1.1] tracking-tight sm:text-2xl">
                      {a.headline}
                    </h2>
                    {stat && (
                      <div className="relative mt-auto pt-6">
                        <div className="font-display text-3xl font-black tracking-tight">
                          {stat.value}
                        </div>
                        <div className="mt-1 text-xs leading-snug text-white/70">{stat.label}</div>
                      </div>
                    )}
                    <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 transition group-hover:text-white">
                      Explore {a.name}
                      <Icon
                        d={I.arrow}
                        c="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pb-24">
        <div className="rounded-[2rem] border border-overlay/10 bg-panel/70 p-8 text-center backdrop-blur-xl sm:p-12 dark:bg-overlay/[0.03]">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-black tracking-tight lg:text-[2.5rem] leading-[1.02]">
            Don&apos;t see your business here?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted leading-relaxed">
            FormaCore runs gyms, studios, clubs and schools of every shape. Tell us how yours works
            and we&apos;ll show you how it fits.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Btn v="primary" size="lg" icon={I.arrow} onClick={() => openLead('demo')}>
              Book a demo
            </Btn>
            <Btn v="glass" size="lg" icon={I.handset} onClick={() => openLead('call')}>
              Request a call
            </Btn>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

export default BuiltForHub;
