'use client';

import { useTranslations } from 'next-intl';
import { getBuiltFor, type AudiencePage } from '@/data/built-for';
import { Reveal } from '@/components/ui/scroll-reveal';
import { cn } from '@/lib/utils';
import { Link } from '@/src/i18n/navigation';
import { AudienceBadge } from './audience-badge';
import { COVER_SURFACE } from './cover-surface';
import { useLeadCta } from './lead-cta-context';
import {
  Aurora,
  Btn,
  CtaMark,
  I,
  Icon,
  MarketingFooter,
  MarketingNav,
  type NavItem,
} from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore — "Built For" hub (/built-for)
   Every business type FormaCore is built for, as a grid of cards in each
   audience's own brand gradient. A card shows the audience's badge, its
   headline and its lead stat, and opens the detailed /built-for/<slug> page.
   The homepage stacks the first few and links here with "See all".
   The /features hub reuses it with the modules and its own copy passed in.
   ──────────────────────────────────────────────────────────────────────── */

export function BuiltForHub({
  items,
  base = '/built-for',
  section = 'builtFor',
  title,
  intro,
  ctaTitle,
  ctaBody,
}: {
  items?: AudiencePage[];
  base?: string;
  section?: Extract<NavItem, 'builtFor' | 'features'>;
  title?: string;
  intro?: string;
  ctaTitle?: string;
  ctaBody?: string;
} = {}) {
  const t = useTranslations('builtFor');
  const tCommon = useTranslations('common');
  const openLead = useLeadCta();
  const cards = items ?? getBuiltFor(t);

  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-x-clip selection:bg-brand-500/30">
      <Aurora />
      <MarketingNav active={section} />

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pt-12 lg:pt-16 pb-10">
        <h1 className="max-w-3xl font-display text-4xl font-black leading-[0.98] tracking-tight sm:text-5xl lg:text-[3.5rem]">
          {title ?? t('hub.title')}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          {intro ?? t('hub.intro')}
        </p>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pb-16">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((a, i) => {
            // The hub card carries its own copy (name, headline, one stat).
            const stat = a.card?.stat ?? a.stats.find((s) => s.value.includes('%')) ?? a.stats[0];
            return (
              <li
                key={a.slug}
                // A card left alone on the last desktop row sits in the middle column.
                className={cn(i === cards.length - 1 && cards.length % 3 === 1 && 'lg:col-start-2')}
              >
                <Reveal delay={(i % 3) * 80} className="h-full">
                  <Link
                    href={`${base}/${a.slug}`}
                    style={COVER_SURFACE}
                    className={cn(
                      'group relative flex h-full min-h-[19rem] flex-col overflow-hidden rounded-[1.5rem] p-6 text-white ring-1 ring-inset ring-white/10 shadow-[0_24px_60px_-28px_rgba(2,11,46,0.6)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_-28px_rgba(2,11,46,0.75)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50',
                    )}
                  >
                    <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 bg-[radial-gradient(closest-side,rgba(124,196,255,0.25),transparent)]" />
                    <div className="relative">
                      <AudienceBadge audience={a.card ? { ...a, name: a.card.name } : a} cover />
                    </div>
                    <h2 className="relative mt-5 font-display text-xl font-black leading-[1.1] tracking-tight sm:text-2xl">
                      {a.card?.headline ?? a.headline}
                    </h2>
                    {stat ? (
                      <div className="relative mt-auto pt-6">
                        <div className="font-display text-3xl font-black tracking-tight">
                          {stat.value}
                        </div>
                        <div className="mt-1 text-xs leading-snug text-white/70">{stat.label}</div>
                      </div>
                    ) : a.summary ? (
                      <p className="relative mt-auto pt-6 text-sm leading-relaxed text-white/80">
                        {a.summary}
                      </p>
                    ) : null}
                    <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 transition group-hover:text-white">
                      {t('hub.explore', { name: a.name })}
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
        <div className="relative overflow-hidden rounded-[2rem] border border-overlay/10 bg-panel/70 p-8 text-center backdrop-blur-xl sm:p-12 dark:bg-overlay/[0.03]">
          <CtaMark />
          <h2 className="relative mx-auto max-w-2xl font-display text-3xl font-black tracking-tight lg:text-[2.5rem] leading-[1.02]">
            {ctaTitle ?? t('hub.ctaTitle')}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-muted leading-relaxed">
            {ctaBody ?? t('hub.ctaBody')}
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Btn v="primary" size="lg" icon={I.arrow} onClick={() => openLead('demo')}>
              {tCommon('cta.bookDemo')}
            </Btn>
            <Btn v="glass" size="lg" icon={I.handset} onClick={() => openLead('call')}>
              {tCommon('cta.requestCall')}
            </Btn>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

export default BuiltForHub;
