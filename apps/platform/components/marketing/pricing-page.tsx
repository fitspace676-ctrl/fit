'use client';

import { useState } from 'react';
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
   FormaCore — Pricing  ·  "Aurora Glass"
   The /pricing surface. Same dark aurora identity and shared chrome as the
   homepage. Three tiers priced in GEL with a monthly / annual toggle, an
   "every plan includes" strip, a full feature comparison and an FAQ.
   Every trial CTA funnels into the owner-signup flow (`/register-gym`); the
   sales / demo CTA opens a mail draft, exactly like the homepage.
   ──────────────────────────────────────────────────────────────────────── */

/** Annual billing bills 10 months for 12 — two months free. */
const ANNUAL_MONTHS = 10;

interface Tier {
  id: string;
  name: string;
  tone: string;
  tagline: string;
  /** Headline monthly price in GEL (₾). */
  monthly: number;
  limits: string[];
  features: string[];
  cta: string;
  /** When set, the CTA links here (e.g. sales) instead of the signup flow. */
  ctaHref?: string;
  ctaVariant: 'primary' | 'glass';
  highlight?: boolean;
  badge?: string;
}

const tiers: Tier[] = [
  {
    id: 'studio',
    name: 'Studio',
    tone: 'iris',
    tagline: 'For a single studio finding its feet.',
    monthly: 149,
    limits: ['1 location', 'Up to 300 active members', '5 staff seats'],
    features: [
      'Member CRM, plans & freezes',
      'Class scheduling & waitlists',
      'Rotating QR check-in',
      'Card & cash billing',
      'Branded member web portal',
      'Email support',
    ],
    cta: 'Start 14-day trial',
    ctaVariant: 'glass',
  },
  {
    id: 'growth',
    name: 'Growth',
    tone: 'brand',
    tagline: 'For a busy gym scaling its membership.',
    monthly: 349,
    limits: ['1 location', 'Up to 1,500 active members', '20 staff seats'],
    features: [
      'Everything in Studio, plus',
      'POS & retail shop',
      'Trainers, commissions & payroll',
      'Analytics & retention cohorts',
      'White-label app — iOS & Android',
      'Automations & win-backs',
      'Priority support',
    ],
    cta: 'Start 14-day trial',
    ctaVariant: 'primary',
    highlight: true,
    badge: 'Most popular',
  },
  {
    id: 'chain',
    name: 'Chain',
    tone: 'accent',
    tagline: 'For multi-location brands and franchises.',
    monthly: 749,
    limits: ['Unlimited locations', 'Unlimited members', 'Unlimited staff seats'],
    features: [
      'Everything in Growth, plus',
      'Multi-location rollups & roles',
      'Custom domain per brand',
      'API & webhooks access',
      'SSO & advanced permissions',
      'Dedicated success manager',
      'Onboarding & SLA',
    ],
    cta: 'Talk to sales',
    ctaHref: DEMO_HREF,
    ctaVariant: 'glass',
  },
];

const included: { ic: string; t: string }[] = [
  { ic: I.globe, t: 'Branded member web portal' },
  { ic: I.qr, t: 'Unlimited QR check-ins' },
  { ic: I.calendar, t: 'Unlimited classes & bookings' },
  { ic: I.card, t: 'Card & cash payments in GEL' },
  { ic: I.bolt, t: 'Free product updates' },
  { ic: I.lock, t: 'Encryption & daily backups' },
  { ic: I.layers, t: 'Data export, any time' },
  { ic: I.shield, t: 'GDPR-ready, in-region hosting' },
];

/** A comparison cell: a boolean check / dash, or a literal value string. */
type Cell = boolean | string;

const comparison: { label: string; cells: [Cell, Cell, Cell] }[] = [
  { label: 'Active members', cells: ['300', '1,500', 'Unlimited'] },
  { label: 'Locations', cells: ['1', '1', 'Unlimited'] },
  { label: 'Staff seats', cells: ['5', '20', 'Unlimited'] },
  { label: 'Member CRM & plans', cells: [true, true, true] },
  { label: 'Class scheduling & waitlists', cells: [true, true, true] },
  { label: 'QR check-in', cells: [true, true, true] },
  { label: 'Billing, auto-renew & dunning', cells: [true, true, true] },
  { label: 'POS & retail shop', cells: [false, true, true] },
  { label: 'Trainers, commissions & payroll', cells: [false, true, true] },
  { label: 'Analytics & retention cohorts', cells: [false, true, true] },
  { label: 'White-label app (iOS & Android)', cells: [false, true, true] },
  { label: 'Automations & win-backs', cells: [false, true, true] },
  { label: 'Multi-location rollups', cells: [false, false, true] },
  { label: 'API & webhooks', cells: [false, false, true] },
  { label: 'SSO & advanced permissions', cells: [false, false, true] },
  { label: 'Support', cells: ['Email', 'Priority', 'Dedicated'] },
];

const faqs: { q: string; a: string }[] = [
  {
    q: 'Is there a free trial?',
    a: 'Yes — every plan starts with a 14-day free trial. No credit card required, and you can import your real timetable and members to try it on your own floor.',
  },
  {
    q: 'What counts as an "active member"?',
    a: 'A member with a live or frozen plan in the billing month. Expired, archived and lapsed members never count toward your tier, so you only pay for the base you actually serve.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Any time, in both directions. Upgrades apply immediately and are prorated; downgrades take effect at the start of your next billing cycle. Nothing is locked in.',
  },
  {
    q: 'How does annual billing work?',
    a: `Switch to annual and you pay for ${ANNUAL_MONTHS} months instead of 12 — two months free — billed once a year. Monthly billing stays month-to-month with no commitment.`,
  },
  {
    q: 'Are payment processing fees included?',
    a: 'The subscription covers the platform. Card processing is billed at your payment provider’s standard GEL rate; cash and bank transfers carry no FormaCore fee.',
  },
  {
    q: 'Do you offer a discount for new or non-profit studios?',
    a: 'We do. Reach out to our team and we’ll tailor a plan for early-stage studios, schools and community gyms.',
  },
];

/** GEL price formatted to the design's `₾ 1,234` convention. */
const gel = (n: number): string => `₾ ${n.toLocaleString('en-US')}`;

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  /** Per-month price shown for a tier given the active billing cadence. */
  const priceFor = (tier: Tier): number =>
    annual ? Math.round((tier.monthly * ANNUAL_MONTHS) / 12) : tier.monthly;

  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-hidden selection:bg-brand-500/30">
      <Aurora />
      <MarketingNav active="Pricing" />

      {/* hero + billing toggle */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-12 lg:pt-16 pb-6 text-center">
        <div className="flex justify-center">
          <Eyebrow icon={I.ticket}>Pricing</Eyebrow>
        </div>
        <h1 className="font-display text-[2.75rem] sm:text-[3.5rem] lg:text-[4.25rem] font-black tracking-tight mt-6 leading-[0.94] max-w-3xl mx-auto">
          One platform.{' '}
          <span className="bg-gradient-to-r from-brand-600 via-iris-500 to-accent-600 dark:from-brand-400 dark:via-iris-400 dark:to-accent-300 bg-clip-text text-transparent">
            One simple price.
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
          Replace the eight tools behind your front desk with one. Every plan is the full platform —
          tiers just track how big your gym is. No setup fees, cancel any time.
        </p>

        {/* monthly / annual toggle */}
        <div className="mt-9 inline-flex items-center gap-3">
          <span className={`text-sm font-semibold transition ${annual ? 'text-faint' : 'text-fg'}`}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
            onClick={() => setAnnual((value) => !value)}
            className={`relative w-14 h-8 rounded-pill ring-1 ring-inset transition ${annual ? 'bg-brand-500/30 ring-brand-500/40' : 'bg-overlay/[0.08] ring-overlay/15'}`}
          >
            <span
              className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)] shadow-[0_4px_14px_-2px_rgba(124,58,237,0.7)] transition-transform ${annual ? 'translate-x-6' : 'translate-x-0'}`}
            />
          </button>
          <span className={`text-sm font-semibold transition ${annual ? 'text-fg' : 'text-faint'}`}>
            Annual
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-success-500/15 ring-1 ring-inset ring-success-500/25 text-[11px] font-semibold text-success-700 dark:text-success-300">
            <Icon d={I.spark} c="w-3 h-3" sw={2.4} />2 months free
          </span>
        </div>
      </section>

      {/* tier cards */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-8">
        <div className="grid lg:grid-cols-3 gap-5 items-start">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-[1.5rem] overflow-hidden p-7 backdrop-blur-xl transition ${tier.highlight ? 'ring-2 ring-brand-500/40 bg-overlay/[0.05] lg:-mt-3 shadow-[0_40px_100px_-40px_rgba(124,58,237,0.6)]' : 'ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] hover:ring-overlay/20'}`}
            >
              {tier.highlight && (
                <div className="pointer-events-none absolute -top-24 right-0 w-72 h-72 bg-brand-500/15 blur-[110px] rounded-full" />
              )}
              <div className="relative flex items-center justify-between">
                <span
                  className={`w-11 h-11 rounded-btn grid place-items-center bg-gradient-to-br from-${tier.tone}-400/30 to-${tier.tone}-600/15 ring-1 ring-inset ring-overlay/10`}
                >
                  <Icon
                    d={I.bolt}
                    c={`w-[22px] h-[22px] text-${tier.tone}-700 dark:text-${tier.tone}-300`}
                    sw={2.2}
                  />
                </span>
                {tier.badge && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-brand-500/15 ring-1 ring-inset ring-brand-500/25 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                    <Icon d={I.star} c="w-3 h-3" sw={2.2} />
                    {tier.badge}
                  </span>
                )}
              </div>

              <h2 className="relative font-display text-2xl font-extrabold tracking-tight mt-5">
                {tier.name}
              </h2>
              <p className="relative text-sm text-faint mt-1.5 leading-relaxed">{tier.tagline}</p>

              <div className="relative flex items-baseline gap-1.5 mt-6">
                <span className="font-display text-[2.75rem] font-black tracking-tight tabular-nums leading-none">
                  {gel(priceFor(tier))}
                </span>
                <span className="text-sm font-semibold text-subtle">/mo</span>
              </div>
              <p className="relative font-mono text-[11px] text-subtle mt-2 h-4">
                {annual
                  ? `${gel(priceFor(tier) * 12)} billed yearly`
                  : 'billed monthly · cancel any time'}
              </p>

              <div className="relative mt-6">
                <Btn
                  v={tier.ctaVariant}
                  size="md"
                  full
                  icon={I.arrow}
                  href={tier.ctaHref ?? SIGNUP_HREF}
                >
                  {tier.cta}
                </Btn>
              </div>

              <div className="relative flex flex-wrap gap-1.5 mt-6">
                {tier.limits.map((l) => (
                  <span
                    key={l}
                    className="px-2.5 py-1 rounded-pill bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10 text-[11px] font-semibold text-muted"
                  >
                    {l}
                  </span>
                ))}
              </div>

              <ul className="relative mt-6 space-y-3 border-t border-overlay/10 pt-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span
                      className={`shrink-0 mt-0.5 w-5 h-5 rounded-full grid place-items-center bg-${tier.tone}-500/15 ring-1 ring-inset ring-${tier.tone}-500/25`}
                    >
                      <Icon
                        d={I.check}
                        c={`w-3 h-3 text-${tier.tone}-700 dark:text-${tier.tone}-300`}
                        sw={3}
                      />
                    </span>
                    <span className="text-strong">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-subtle flex items-center justify-center gap-2 text-center">
          <Icon d={I.shield} c="w-3.5 h-3.5" sw={2} />
          Prices in Georgian lari (₾), excl. VAT. 14-day free trial on every plan — no card
          required.
        </p>
      </section>

      {/* every plan includes */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="max-w-2xl">
          <Eyebrow icon={I.layers}>In every plan</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            The essentials are never an add-on.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px mt-12 rounded-[1.5rem] overflow-hidden ring-1 ring-inset ring-overlay/10 bg-overlay/[0.06]">
          {included.map((m) => (
            <div key={m.t} className="group bg-panel/40 p-5 hover:bg-overlay/[0.04] transition">
              <div className="w-9 h-9 rounded-btn grid place-items-center bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10 group-hover:ring-brand-500/30 transition">
                <Icon d={m.ic} c="w-[18px] h-[18px] text-brand-700 dark:text-brand-300" sw={2} />
              </div>
              <h3 className="font-display text-[15px] font-bold mt-4">{m.t}</h3>
            </div>
          ))}
        </div>
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
                {comparison.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-overlay/[0.06] last:border-0 hover:bg-overlay/[0.02]"
                  >
                    <td className="p-5 text-strong font-medium">{row.label}</td>
                    {row.cells.map((cell, i) => (
                      <td key={i} className="p-5 text-center">
                        {typeof cell === 'string' ? (
                          <span className="font-mono text-strong tabular-nums">{cell}</span>
                        ) : cell ? (
                          <span className="inline-grid place-items-center w-6 h-6 rounded-full bg-success-500/15 ring-1 ring-inset ring-success-500/25">
                            <Icon
                              d={I.check}
                              c="w-3.5 h-3.5 text-success-600 dark:text-success-400"
                              sw={3}
                            />
                          </span>
                        ) : (
                          <Icon d={I.minus} c="w-4 h-4 text-dim mx-auto" sw={2} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-10 lg:gap-16">
          <div>
            <Eyebrow icon={I.spark}>FAQ</Eyebrow>
            <h2 className="font-display text-4xl font-black tracking-tight mt-5 leading-[0.96]">
              Questions, answered.
            </h2>
            <p className="mt-4 text-[15px] text-muted leading-relaxed">
              Still unsure which plan fits? Book a demo and we&rsquo;ll map it to your floor.
            </p>
            <div className="mt-6">
              <Btn v="glass" size="md" href={DEMO_HREF}>
                Book a demo
              </Btn>
            </div>
          </div>
          <div className="divide-y divide-overlay/10 rounded-[1.5rem] ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] overflow-hidden">
            {faqs.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-4 text-left p-5 hover:bg-overlay/[0.03] transition"
                  >
                    <span className="flex-1 font-display text-[15px] font-bold">{item.q}</span>
                    <Icon
                      d={I.chevron}
                      c={`w-4 h-4 text-faint shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                      sw={2.4}
                    />
                  </button>
                  {open && (
                    <p className="px-5 pb-5 -mt-1 text-sm text-muted leading-relaxed">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24 pb-24">
        <div className="relative rounded-[2rem] overflow-hidden ring-1 ring-inset ring-overlay/[0.12] bg-gradient-to-br from-brand-600 via-iris-600 to-accent-600 px-8 py-14 lg:px-16 lg:py-20 text-center">
          <img
            src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=80"
            alt=""
            width={1600}
            height={900}
            className="pointer-events-none absolute inset-0 w-full h-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-600/85 via-iris-600/80 to-accent-600/85" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[420px] h-[260px] bg-white/20 blur-[100px]" />
          <div className="relative">
            <h2 className="font-display text-4xl lg:text-[3.25rem] font-black tracking-tight leading-[0.95] max-w-2xl mx-auto">
              Start free. Pay when it pays off.
            </h2>
            <p className="mt-5 text-lg text-white/80 max-w-xl mx-auto">
              Spin up a 14-day trial with your real timetable — no card required — or book a guided
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
