'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PricingCards, tiers } from './pricing-cards';
import { Reveal } from '@/components/ui/scroll-reveal';
import {
  Aurora,
  Btn,
  DEMO_HREF,
  Eyebrow,
  I,
  Icon,
  MarketingFooter,
  MarketingNav,
  SIGNUP_HREF,
} from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore - Pricing  ·  "Aurora Glass"
   The /pricing surface. Same dark aurora identity and shared chrome as the
   homepage. A platform-capability grid, three tiers priced in GEL (Starter /
   Growth / Pro), a grouped feature-comparison table, a "which plan is right for
   you" guide and the implementation timeline. Every trial CTA funnels into the
   owner-signup flow (`/register-gym`); the sales / demo CTA opens a mail draft.
   ──────────────────────────────────────────────────────────────────────── */

/* ---- grouped feature comparison ---- */
type Cells = [boolean, boolean, boolean];
const comparison: { group: string; rows: { label: string; cells: Cells }[] }[] = [
  {
    group: 'Operations',
    rows: [
      { label: 'Point of Sale', cells: [true, true, true] },
      { label: 'Member Management', cells: [true, true, true] },
      { label: 'Class Scheduling & PT Booking', cells: [true, true, true] },
      { label: 'Inventory Management', cells: [true, true, true] },
      { label: 'Staff Management', cells: [true, true, true] },
      { label: 'Manual Check-in', cells: [true, true, true] },
      { label: 'Offline Payment Processing', cells: [true, true, true] },
    ],
  },
  {
    group: 'Member Experience',
    rows: [
      { label: 'Branded Member Portal', cells: [false, true, true] },
      { label: 'White-label Mobile App (iOS & Android)', cells: [false, true, true] },
      { label: 'Self-service Check-in (QR code)', cells: [false, true, true] },
      { label: 'Online & Recurring Payments', cells: [false, true, true] },
      { label: 'Online Booking', cells: [false, true, true] },
      { label: 'Personal Account Management', cells: [false, true, true] },
    ],
  },
  {
    group: 'Automation',
    rows: [
      { label: 'Automation Center (pre-built templates)', cells: [true, true, true] },
      { label: 'Advanced Automation (custom flows)', cells: [false, false, true] },
    ],
  },
  {
    group: 'Reporting & Analytics',
    rows: [
      { label: 'Analytics Dashboard', cells: [true, true, true] },
      { label: 'Detailed Reports', cells: [false, true, true] },
      { label: 'AI-powered Reporting & Analytics', cells: [false, false, true] },
    ],
  },
  {
    group: 'Intelligence',
    rows: [{ label: 'AI Assistant', cells: [false, false, true] }],
  },
  {
    group: 'Integrations',
    rows: [{ label: 'API Access & Webhooks', cells: [false, false, true] }],
  },
  {
    group: 'Access & Permissions',
    rows: [{ label: 'Custom Roles & Permissions', cells: [false, false, true] }],
  },
  {
    group: 'Support',
    rows: [
      { label: 'Standard Support', cells: [true, true, true] },
      { label: 'Priority Support', cells: [false, true, true] },
      { label: 'Named Support Contact', cells: [false, false, true] },
    ],
  },
];

/* ---- "which plan is right for you" ---- */
const planGuide: { name: string; tone: string; headline: string; body: string }[] = [
  {
    name: 'Starter',
    tone: 'iris',
    headline: "You're running one location and need to replace the spreadsheets.",
    body: "Your operation is straightforward but your tools aren't keeping up. You need member management, class scheduling, billing, and a front desk application that actually works. Starter gives you everything to run your business properly from day one.",
  },
  {
    name: 'Growth',
    tone: 'brand',
    headline: 'You want your members to self-serve and your brand to follow them home.',
    body: "You're past the basics. You want members booking their own classes, managing their own memberships, and engaging with your club between visits. Growth adds the member portal and white-label mobile app so your business is always one tap away.",
  },
  {
    name: 'Pro',
    tone: 'accent',
    headline: 'You want to make decisions based on data, not gut feeling.',
    body: "You're running a serious operation and you need the intelligence to match. Pro adds the AI Assistant, advanced automation, API access, and detailed reporting so every decision is backed by real insight.",
  },
];

/* ---- implementation timeline ---- */
const steps: { title: string; body: string }[] = [
  {
    title: 'Demo',
    body: "See the platform in action with your specific business type in mind. Ask every question. Understand exactly what you're getting before committing to anything.",
  },
  {
    title: 'Contract and Setup',
    body: "Once you're ready, we handle the contract and begin configuring your account. Your membership plans, class structure, staff roles, and branding set up before your first training session.",
  },
  {
    title: 'Data Migration',
    body: 'Moving from another system? We map your existing member data and migrate it across. Your member history, payment records, and account details carried over cleanly so nothing gets lost in the transition.',
  },
  {
    title: 'Onboarding Call',
    body: 'A dedicated session with your team where we walk through the platform, align on your goals, and make sure every staff member knows exactly what they are doing before go live. Your knowledge base is available from this point so your team can always find answers independently.',
  },
  {
    title: 'Go Live',
    body: 'Your platform goes live with real members, real data, and support on standby. Email, chat, and phone support available from day one so nothing gets dropped at launch.',
  },
];

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

export default function PricingPage() {
  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-hidden selection:bg-brand-500/30">
      <Aurora />
      <MarketingNav active="Pricing" />

      {/* hero */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-12 lg:pt-16 pb-6 text-center">
        <div className="flex justify-center">
          <Eyebrow icon={I.ticket}>Pricing</Eyebrow>
        </div>
        <h1 className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4.25rem] font-black tracking-tight mt-6 leading-[0.94] max-w-3xl mx-auto">
          Scale Your Business{' '}
          <span className="bg-gradient-to-r from-brand-600 via-iris-500 to-accent-600 dark:from-brand-400 dark:via-iris-400 dark:to-accent-300 bg-clip-text text-transparent">
            with us
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
          One platform for everything your front desk runs on. Pick the plan that matches where your
          business is today - and grow into the next one when you&rsquo;re ready.
        </p>
      </section>

      {/* tier cards */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-16">
        <PricingCards />
        <p className="mt-6 text-xs text-subtle flex items-center justify-center gap-2 text-center">
          <Icon d={I.shield} c="w-3.5 h-3.5" sw={2} />
          Prices in Georgian lari (₾), excl. VAT. Each tier builds on the one before it.
        </p>
      </section>

      {/* comparison table */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="max-w-2xl mb-10">
          <Eyebrow icon={I.grid}>Compare plans</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            Every feature, side by side.
          </h2>
        </div>
        <div className="relative rounded-[1.5rem] ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-overlay/10">
                  <th className="text-left font-semibold text-faint p-5 w-2/5">Feature</th>
                  {tiers.map((tier) => (
                    <th key={tier.id} className="p-5 text-center">
                      <span
                        className={`font-display text-base font-extrabold ${tier.highlight ? 'text-brand-700 dark:text-brand-300' : 'text-fg'}`}
                      >
                        {tier.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((section) => (
                  <Fragment key={section.group}>
                    <tr className="bg-overlay/[0.04]">
                      <td
                        colSpan={4}
                        className="px-5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300"
                      >
                        {section.group}
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-overlay/[0.06] hover:bg-overlay/[0.02]"
                      >
                        <td className="p-5 text-strong font-medium">{row.label}</td>
                        {row.cells.map((cell, i) => (
                          <td key={i} className="p-5 text-center">
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
          <Eyebrow icon={I.spark}>Find your plan</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            Not sure which plan fits?
          </h2>
          <p className="mt-4 text-lg text-muted leading-relaxed">
            Three plans, three types of business. Here&rsquo;s how to know which one is yours.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3 items-start">
          {planGuide.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-[1.5rem] p-7 ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl`}
            >
              <span
                className={`inline-flex items-center rounded-pill px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] bg-${p.tone}-500/15 ring-1 ring-inset ring-${p.tone}-500/25 text-${p.tone}-700 dark:text-${p.tone}-300`}
              >
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
          <Eyebrow icon={I.bolt}>Getting started</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            From first conversation to fully live.
          </h2>
          <p className="mt-4 text-lg text-muted leading-relaxed">
            Every business is different. The timeline depends on your scope, your data, and your
            team - but the process is always the same.
          </p>
        </div>
        <ol className="relative border-l border-overlay/15 ml-3 space-y-8">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 70} from="translate-y-6" className="relative pl-8">
                <span className="absolute -left-[0.95rem] top-0 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-iris-600 text-xs font-black text-white ring-4 ring-surface">
                  {i + 1}
                </span>
                <h3 className="font-display text-lg font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 max-w-2xl text-sm text-muted leading-relaxed">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24 pb-24">
        <div className="relative rounded-[2rem] overflow-hidden ring-1 ring-inset ring-overlay/[0.12] bg-gradient-to-br from-brand-600 via-iris-600 to-accent-600 px-8 py-14 lg:px-16 lg:py-20 text-center">
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[420px] h-[260px] bg-white/20 blur-[100px]" />
          <div className="relative">
            <h2 className="font-display text-4xl lg:text-[3.25rem] font-black tracking-tight leading-[0.95] max-w-2xl mx-auto text-white">
              Start free. Pay when it pays off.
            </h2>
            <p className="mt-5 text-lg text-white/80 max-w-xl mx-auto">
              Spin up a free trial with your real timetable - no card required - or book a guided
              demo with our team.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
              <Btn v="white" size="lg" icon={I.arrow} href={SIGNUP_HREF}>
                Start free trial
              </Btn>
              <Btn v="glass" size="lg" href={DEMO_HREF}>
                Book a demo
              </Btn>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
