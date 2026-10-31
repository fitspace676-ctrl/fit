'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { PricingCards, TIER_META, getTiers } from './pricing-cards';
import { useLeadCta } from './lead-cta-context';
import { FlowBackground } from '@/components/ui/flow-background';
import { Aurora, Btn, CtaMark, I, Icon, MarketingFooter, MarketingNav } from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore - Pricing  ·  "Aurora Glass"
   The /pricing surface. Same dark aurora identity and shared chrome as the
   homepage. A platform-capability grid, the three tiers (Studio / Club /
   Core), a grouped feature-comparison table, a "which plan is right for you"
   guide and the implementation timeline. The two calls to action, "Book a
   demo" and "Request a call", open the shared lead forms.
   The tier figures only print while `@/lib/pricing-visibility` says so.
   Every string on the page comes from the `pricing` area of the catalogue;
   what stays here is structure: which rows exist and which tiers tick them.
   ──────────────────────────────────────────────────────────────────────── */

/* ---- grouped feature comparison ---- */
type Cells = [boolean, boolean, boolean];
/** Groups and rows by id; labels live at `comparison.groups.<group>.title` / `.rows.<row>`. */
const COMPARISON: { id: string; rows: { id: string; cells: Cells }[] }[] = [
  {
    id: 'operations',
    rows: [
      { id: 'pos', cells: [true, true, true] },
      { id: 'profiles', cells: [true, true, true] },
      { id: 'scheduling', cells: [true, true, true] },
      { id: 'inventory', cells: [true, true, true] },
      { id: 'staff', cells: [true, true, true] },
      { id: 'onsitePayments', cells: [true, true, true] },
      { id: 'multiLocation', cells: [false, false, true] },
    ],
  },
  {
    id: 'memberExperience',
    rows: [
      { id: 'portal', cells: [false, true, true] },
      { id: 'app', cells: [false, true, true] },
      { id: 'onlineBooking', cells: [false, true, true] },
      { id: 'onlinePayments', cells: [false, true, true] },
    ],
  },
  {
    id: 'checkin',
    rows: [
      { id: 'manual', cells: [true, true, true] },
      { id: 'qr', cells: [false, true, true] },
      { id: 'turnstile', cells: [false, true, true] },
    ],
  },
  {
    id: 'retention',
    rows: [
      { id: 'templates', cells: [true, true, true] },
      { id: 'retentionAutomations', cells: [false, true, true] },
      { id: 'custom', cells: [false, false, true] },
    ],
  },
  {
    id: 'reporting',
    rows: [
      { id: 'dashboard', cells: [true, true, true] },
      { id: 'reports', cells: [false, true, true] },
      { id: 'aiAssistant', cells: [false, true, true] },
      { id: 'aiInsights', cells: [false, false, true] },
    ],
  },
  {
    id: 'integrations',
    rows: [
      { id: 'api', cells: [false, false, true] },
      { id: 'roles', cells: [false, false, true] },
    ],
  },
  {
    id: 'onboarding',
    rows: [
      { id: 'guided', cells: [true, true, true] },
      { id: 'standardSupport', cells: [true, true, true] },
      { id: 'migration', cells: [false, false, true] },
      { id: 'prioritySupport', cells: [false, false, true] },
      { id: 'namedContact', cells: [false, false, true] },
    ],
  },
];

/* ---- "which plan is right for you" ---- */
/** Solid brand-ramp fills for the plan-guide badges, one per tier tone. */
const GUIDE_BADGE: Record<string, string> = {
  iris: 'bg-[radial-gradient(ellipse_at_top_left,rgba(47,120,150,0.9),transparent_60%),linear-gradient(120deg,#1F4A72_15%,#102B43_100%)]',
  brand:
    'bg-[radial-gradient(ellipse_at_top_left,rgba(127,179,200,0.9),transparent_60%),linear-gradient(120deg,#2F7896_15%,#1F4A72_100%)]',
  accent:
    'bg-[radial-gradient(ellipse_at_top_left,rgba(190,217,227,0.9),transparent_60%),linear-gradient(120deg,#7FB3C8_0%,#2F7896_100%)]',
};

/** Comparison header cells stay pinned while the table scrolls past, on an opaque fill. */
const STICKY_TH = 'sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_rgb(var(--overlay)/0.1)]';

/* ---- implementation timeline ---- */
/** The onboarding steps, in order; copy at `timeline.steps.<id>.title` / `.body`. */
const STEP_IDS = ['meeting', 'demo', 'contract', 'migration', 'onboarding', 'live'] as const;

type Step = { title: string; body: string };

/**
 * Bare green checkmark that strokes itself in the moment it scrolls into view.
 * Each tick self-observes (one-shot) so rows draw as you reach them, not all at
 * once; `prefers-reduced-motion` shows it instantly.
 */
const AnimatedCheck = ({ delay = 0 }: { delay?: number }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDrawn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setDrawn(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -15% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animated-check mx-auto block h-5 w-5 text-success-500 dark:text-success-400 ${drawn ? 'is-drawn' : ''}`}
      style={{ '--check-delay': `${delay}ms` } as CSSProperties}
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
};

/**
 * The onboarding steps as a scroll-driven timeline: each numbered dot pops in,
 * with its step, as it rises past 60% of the viewport, and hides again on the
 * way back up. Transform and opacity only; with reduced motion every step
 * shows from the start.
 */
const Timeline = ({ steps }: { steps: Step[] }) => {
  const listRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [reached, setReached] = useState(0);
  const stepCount = steps.length;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReached(stepCount);
      return;
    }
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const rect = list.getBoundingClientRect();
      // A step shows once it rises past 60% of the way down the viewport.
      const tip = Math.min(rect.height, Math.max(0, window.innerHeight * 0.6 - rect.top));
      setReached(itemRefs.current.filter((li) => li && li.offsetTop + 14 <= tip).length);
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [stepCount]);

  return (
    <ol ref={listRef} className="relative ml-3 space-y-10">
      {steps.map((s, i) => {
        const on = i < reached;
        return (
          <li
            key={s.title}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="relative pl-10"
          >
            <span
              className={`absolute -left-[0.95rem] top-0 grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(135deg,#7FB3C8,#2F7896_45%,#1F4A72)] text-xs font-black text-white ring-4 ring-surface shadow-[0_0_0_6px_rgba(47,120,150,0.15),0_8px_20px_-6px_rgba(31,74,114,0.8)] transition duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${on ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
            >
              {i + 1}
            </span>
            <div
              className={`transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${on ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
            >
              <h3 className="font-display text-lg font-bold tracking-tight">{s.title}</h3>
              <p className="mt-2 max-w-2xl text-sm text-muted leading-relaxed">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default function PricingPage() {
  const t = useTranslations('pricing');
  const tCommon = useTranslations('common');
  const tiers = getTiers(t);
  const steps: Step[] = STEP_IDS.map((id) => ({
    title: t(`timeline.steps.${id}.title`),
    body: t(`timeline.steps.${id}.body`),
  }));
  const planGuide = TIER_META.map((meta) => ({
    id: meta.id,
    tone: meta.tone,
    name: t(`tiers.${meta.id}.name`),
    headline: t(`guide.${meta.id}.headline`),
    body: t(`guide.${meta.id}.body`),
  }));
  // Opens the shared "Book a demo" / "Request a call" forms.
  const openLead = useLeadCta();
  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-x-clip selection:bg-brand-500/30">
      <Aurora />
      <MarketingNav active="pricing" />

      {/* hero */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-12 lg:pt-16 pb-6 text-center">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-subtle">
          {t('hero.eyebrow')}
        </p>
        <h1 className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4.25rem] font-black tracking-tight leading-[0.94] max-w-3xl mx-auto">
          {t('hero.titleLead')}{' '}
          <span className="bg-gradient-to-r from-brand-600 via-iris-500 to-accent-600 dark:from-brand-400 dark:via-iris-400 dark:to-accent-300 bg-clip-text text-transparent">
            {t('hero.titleAccent')}
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
          {t('hero.body')}
        </p>
      </section>

      {/* tier cards */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-16">
        <PricingCards />
        <p className="mt-6 text-xs text-subtle flex items-center justify-center gap-2 text-center">
          <Icon d={I.shield} c="w-3.5 h-3.5" sw={2} />
          {t('cards.note')}
        </p>
      </section>

      {/* comparison table */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="max-w-2xl mb-10">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            {t('comparison.title')}
          </h2>
        </div>
        {/* `overflow-clip`, not `-hidden`, and no scroll box from md up: either would
            make the table its own scroll container and stop the header sticking. */}
        <div className="relative rounded-[1.5rem] ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl overflow-clip">
          <div className="sm:overflow-x-auto md:overflow-visible">
            <table className="w-full text-xs sm:min-w-[640px] sm:text-sm">
              <thead>
                <tr className="border-b border-overlay/10">
                  <th
                    className={`${STICKY_TH} text-left font-semibold text-faint p-3 sm:p-5 sm:w-2/5`}
                  >
                    {t('comparison.feature')}
                  </th>
                  {tiers.map((tier) => (
                    <th key={tier.id} className={`${STICKY_TH} px-1 py-3 text-center sm:p-5`}>
                      <span
                        className={`font-display text-xs font-extrabold sm:text-base ${tier.highlight ? 'text-brand-700 dark:text-brand-300' : 'text-fg'}`}
                      >
                        {tier.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((section) => (
                  <Fragment key={section.id}>
                    <tr className="bg-overlay/[0.04]">
                      <td
                        colSpan={4}
                        className="px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] sm:px-5 sm:text-[11px] text-brand-700 dark:text-brand-300"
                      >
                        {t(`comparison.groups.${section.id}.title`)}
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-overlay/[0.06] hover:bg-overlay/[0.02]"
                      >
                        <td className="p-3 text-strong font-medium sm:p-5">
                          {t(`comparison.groups.${section.id}.rows.${row.id}`)}
                        </td>
                        {row.cells.map((cell, i) => (
                          <td key={i} className="px-1 py-3 text-center sm:p-5">
                            {cell ? (
                              <AnimatedCheck delay={i * 90} />
                            ) : (
                              <Icon d={I.minus} c="w-4 h-4 text-dim mx-auto" sw={2} />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* which plan is right for you */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="max-w-2xl mb-10">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            {t('guide.title')}
          </h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {planGuide.map((p) => (
            <div
              key={p.id}
              className="relative h-full rounded-[1.5rem] p-7 ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl"
            >
              <span
                className={`relative inline-flex items-center gap-2 overflow-hidden rounded-pill py-1.5 pl-2 pr-3.5 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_8px_20px_-8px_rgba(31,74,114,0.8)] ring-1 ring-inset ring-white/25 ${GUIDE_BADGE[p.tone]}`}
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-white/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                {p.name}
              </span>
              <h3 className="mt-5 font-display text-xl font-black tracking-tight leading-[1.15]">
                {p.headline}
              </h3>
              <p className="mt-3 text-sm text-muted leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* implementation timeline */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="max-w-2xl mb-12">
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight leading-[0.96]">
            {t('timeline.title')}
          </h2>
          <p className="mt-4 text-lg text-muted leading-relaxed">{t('timeline.body')}</p>
        </div>
        <Timeline steps={steps} />
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24 pb-24">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(140deg,#050f2c_0%,#0a2a6b_45%,#1263c4_100%)] px-8 py-16 text-center ring-1 ring-inset ring-white/10 shadow-[0_40px_100px_-40px_rgba(10,42,107,0.9)] lg:px-16 lg:py-24">
          {/* living backdrop and the brand mark */}
          <FlowBackground />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          <CtaMark />

          <div className="relative">
            <h2 className="mx-auto max-w-3xl font-display text-4xl font-black leading-[0.95] tracking-tight text-white lg:text-[3.75rem]">
              {t('cta.titleLead')}{' '}
              <span className="bg-gradient-to-r from-accent-300 via-brand-300 to-white bg-clip-text text-transparent">
                {t('cta.titleAccent')}
              </span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/75">
              {t('cta.body')}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Btn v="onBlue" size="lg" icon={I.arrow} onClick={() => openLead('demo')}>
                {tCommon('cta.bookDemo')}
              </Btn>
              <Btn v="glassOnBlue" size="lg" icon={I.handset} onClick={() => openLead('call')}>
                {tCommon('cta.requestCall')}
              </Btn>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
