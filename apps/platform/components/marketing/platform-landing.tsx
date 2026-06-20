'use client';

import { useEffect, useState } from 'react';
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
const Mock = ({ id }: { id: string }) => {
  if (id === 'members')
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold">1,284 members</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-overlay/[0.06] ring-1 ring-inset ring-overlay/10 text-xs font-semibold text-muted">
            All plans
          </span>
        </div>
        {[
          {
            n: 'Nino Chkheidze',
            p: 'Premium · annual',
            img: 47,
            st: 'success',
            s: 'Active',
            b: '₾ 0',
          },
          {
            n: 'Luka Beridze',
            p: 'Standard · monthly',
            img: 12,
            st: 'warning',
            s: 'Frozen',
            b: '₾ 0',
          },
          { n: 'Giorgi Tabatadze', p: 'Trial', img: 33, st: 'danger', s: 'Expired', b: '-₾ 45' },
        ].map((r) => (
          <div
            key={r.n}
            className="flex items-center gap-3 p-2.5 rounded-card bg-overlay/[0.03] border border-overlay/10"
          >
            <img
              src={`https://i.pravatar.cc/64?img=${r.img}`}
              alt=""
              width={36}
              height={36}
              className="w-9 h-9 rounded-full object-cover ring-1 ring-overlay/10"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{r.n}</p>
              <p className="text-xs text-faint truncate">{r.p}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-semibold bg-${r.st}-500/15 ring-1 ring-inset ring-${r.st}-500/25 text-${r.st}-700 dark:text-${r.st}-300`}
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-${r.st}-400`} />
              {r.s}
            </span>
            <span className="font-mono text-xs text-muted tabular-nums w-12 text-right">{r.b}</span>
          </div>
        ))}
      </div>
    );
  if (id === 'schedule')
    return (
      <div className="space-y-2.5">
        {[
          { t: '07:30', n: 'Morning Yoga', tr: 'Ana G.', o: 8, cap: 16, c: 'iris' },
          { t: '12:00', n: 'CrossFit WOD', tr: 'Levan M.', o: 14, cap: 14, c: 'brand' },
          { t: '19:00', n: 'Spin Express', tr: 'Sandro K.', o: 22, cap: 24, c: 'accent' },
        ].map((cl) => (
          <div
            key={cl.t}
            className="flex items-center gap-4 p-3 rounded-card border border-overlay/10 bg-overlay/[0.03]"
          >
            <div className="text-center w-12 shrink-0">
              <div className="font-mono text-sm font-bold">{cl.t}</div>
              <div className="font-mono text-[10px] text-subtle">50m</div>
            </div>
            <div className={`w-1 self-stretch rounded-full bg-${cl.c}-500`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{cl.n}</p>
              <p className="text-xs text-faint">{cl.tr}</p>
            </div>
            {cl.o === cl.cap ? (
              <span className="px-2.5 py-1 rounded-pill text-xs font-semibold bg-danger-500/15 ring-1 ring-inset ring-danger-500/25 text-danger-300">
                Full
              </span>
            ) : (
              <span className="font-mono text-sm text-strong tabular-nums">
                {cl.o}
                <span className="text-subtle">/{cl.cap}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    );
  if (id === 'checkin')
    return (
      <div className="space-y-4">
        <div className="relative h-32 rounded-card bg-panel ring-1 ring-inset ring-overlay/10 overflow-hidden grid place-items-center">
          <div className="relative w-20 h-20">
            {[
              ['top-0 left-0', 'border-t-2 border-l-2 rounded-tl-lg'],
              ['top-0 right-0', 'border-t-2 border-r-2 rounded-tr-lg'],
              ['bottom-0 left-0', 'border-b-2 border-l-2 rounded-bl-lg'],
              ['bottom-0 right-0', 'border-b-2 border-r-2 rounded-br-lg'],
            ].map(([p, b]) => (
              <span key={p} className={`absolute ${p} w-5 h-5 ${b} border-brand-400`} />
            ))}
            <Icon d={I.qr} c="w-9 h-9 text-overlay/25 absolute inset-0 m-auto" sw={1.6} />
          </div>
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-pill bg-overlay/10 ring-1 ring-inset ring-overlay/15">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
            <span className="text-[10px] font-semibold">Scanner ready</span>
          </span>
        </div>
        {[
          { n: 'Tamar Jorbenadze', img: 44, k: 'Pilates Core · 13:00', ago: 'now' },
          { n: 'Giorgi Abuladze', img: 60, k: 'CrossFit WOD · 12:00', ago: '6m' },
        ].map((a) => (
          <div
            key={a.n}
            className="flex items-center gap-3 p-2.5 rounded-card bg-overlay/[0.03] border border-overlay/10"
          >
            <div className="relative shrink-0">
              <img
                src={`https://i.pravatar.cc/64?img=${a.img}`}
                alt=""
                width={36}
                height={36}
                className="w-9 h-9 rounded-full object-cover ring-1 ring-overlay/10"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full grid place-items-center ring-2 ring-panel bg-success-500">
                <Icon d={I.check} c="w-2.5 h-2.5 text-white" sw={3} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{a.n}</p>
              <p className="text-xs text-faint truncate">{a.k}</p>
            </div>
            <span className="font-mono text-[11px] text-subtle">{a.ago}</span>
          </div>
        ))}
      </div>
    );
  if (id === 'pos')
    return (
      <div className="space-y-2.5">
        {[
          { n: 'Whey protein 2kg', q: 1, p: 145 },
          { n: 'BCAA punch', q: 2, p: 38 },
          { n: 'Day pass', q: 1, p: 25 },
        ].map((it) => (
          <div key={it.n} className="flex items-center gap-3 py-2.5 border-b border-overlay/10">
            <Icon d={I.pos} c="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" sw={2} />
            <div className="flex-1">
              <p className="text-sm font-semibold">{it.n}</p>
              <p className="font-mono text-xs text-subtle">× {it.q}</p>
            </div>
            <span className="font-mono text-sm text-strong tabular-nums">₾ {it.p * it.q}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-faint">Total</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">₾ 246</span>
        </div>
        <button
          type="button"
          className="w-full h-12 rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white font-semibold shadow-[0_8px_30px_-8px_rgba(124,58,237,0.7)]"
        >
          Charge ₾ 246
        </button>
      </div>
    );
  if (id === 'analytics')
    return (
      <div>
        <div className="flex items-baseline justify-between">
          <span className="font-display text-2xl font-extrabold tabular-nums">₾ 20,770</span>
          <span className="font-mono text-xs text-success-700 dark:text-success-300">
            +12% · 7d
          </span>
        </div>
        <svg
          viewBox="0 0 320 90"
          className="w-full mt-3"
          preserveAspectRatio="none"
          style={{ height: 90 }}
        >
          <defs>
            <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M4,70 L56,52 L108,58 L160,34 L212,40 L264,18 L316,8 L316,90 L4,90 Z"
            fill="url(#pf)"
          />
          <path
            d="M4,70 L56,52 L108,58 L160,34 L212,40 L264,18 L316,8"
            fill="none"
            stroke="#A78BFA"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          {[
            { l: 'Churn 30d', v: '2.1%' },
            { l: 'Retention M3', v: '74%' },
            { l: 'LTV', v: '₾ 1,180' },
          ].map((k) => (
            <div key={k.l} className="rounded-card bg-overlay/[0.03] border border-overlay/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                {k.l}
              </p>
              <p className="font-display text-base font-extrabold tabular-nums mt-1">{k.v}</p>
            </div>
          ))}
        </div>
      </div>
    );
  if (id === 'billing')
    return (
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
            Recurring revenue
          </span>
          <span className="font-display text-xl font-extrabold tabular-nums">
            ₾ 86,400<span className="text-sm font-semibold text-subtle">/mo</span>
          </span>
        </div>
        {[
          { n: 'Premium', p: 145, m: 412, c: 'brand', tag: 'Most popular' },
          { n: 'Standard', p: 89, m: 638, c: 'iris', tag: '' },
          { n: 'Off-peak', p: 55, m: 234, c: 'accent', tag: '' },
        ].map((pl) => (
          <div
            key={pl.n}
            className="flex items-center gap-3 p-3 rounded-card border border-overlay/10 bg-overlay/[0.03]"
          >
            <div className={`w-1 self-stretch rounded-full bg-${pl.c}-500`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold flex items-center gap-2">
                {pl.n}
                {pl.tag && (
                  <span className="px-1.5 py-0.5 rounded-pill text-[9px] font-semibold bg-brand-500/15 ring-1 ring-inset ring-brand-500/25 text-brand-700 dark:text-brand-300">
                    {pl.tag}
                  </span>
                )}
              </p>
              <p className="font-mono text-[11px] text-subtle">{pl.m} active · auto-renew</p>
            </div>
            <span className="font-mono text-sm text-strong tabular-nums">
              ₾ {pl.p}
              <span className="text-subtle text-xs">/mo</span>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="inline-flex items-center gap-1.5 text-faint">
            <span className="w-1.5 h-1.5 rounded-full bg-success-400" />
            47 renewals due this week
          </span>
          <span className="text-success-700 dark:text-success-300 font-mono">96% collected</span>
        </div>
      </div>
    );
  if (id === 'staff')
    return (
      <div className="space-y-2.5">
        {[
          { n: 'Levan Maisuradze', r: 'Head coach · CrossFit', img: 14, load: 86, c: 'brand' },
          { n: 'Ana Gelashvili', r: 'Yoga & mobility', img: 5, load: 64, c: 'iris' },
          { n: 'Sandro Kapanadze', r: 'Spin · HIIT', img: 51, load: 72, c: 'accent' },
        ].map((t) => (
          <div
            key={t.n}
            className="flex items-center gap-3 p-2.5 rounded-card bg-overlay/[0.03] border border-overlay/10"
          >
            <img
              src={`https://i.pravatar.cc/64?img=${t.img}`}
              alt=""
              width={36}
              height={36}
              className="w-9 h-9 rounded-full object-cover ring-1 ring-overlay/10"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{t.n}</p>
              <p className="text-xs text-faint truncate">{t.r}</p>
            </div>
            <div className="w-16 shrink-0">
              <div className="flex items-center justify-end gap-1.5">
                <span className="font-mono text-[11px] text-muted tabular-nums">{t.load}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-overlay/10 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-${t.c}-500`}
                  style={{ width: `${t.load}%` }}
                />
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1 text-xs text-faint">
          <span>Payroll · this cycle</span>
          <span className="font-mono text-strong tabular-nums">₾ 9,840</span>
        </div>
      </div>
    );
  /* member app */
  return (
    <div className="flex justify-center">
      <div className="w-[200px] rounded-[1.5rem] overflow-hidden bg-panel ring-1 ring-inset ring-overlay/10">
        <div className="px-4 pt-4 pb-3">
          <p className="font-mono text-[9px] text-subtle uppercase tracking-[0.2em]">Wednesday</p>
          <p className="font-display text-base font-extrabold">Hey, Nino 👋</p>
          <div className="mt-3 rounded-card bg-[linear-gradient(135deg,#7C3AED,#EC4899)] p-3 shadow-[0_10px_30px_-8px_rgba(124,58,237,0.7)]">
            <p className="text-[9px] font-semibold text-white/80 uppercase tracking-[0.2em]">
              Next class
            </p>
            <p className="font-display text-base font-extrabold mt-0.5">Spin Express</p>
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-white/90">
              <span className="inline-flex items-center gap-1">
                <Icon d={I.clock} c="w-3 h-3" />
                19:00
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            {[
              { l: 'Streak', v: '12' },
              { l: 'PT', v: '8' },
              { l: 'Visits', v: '46' },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-card bg-overlay/5 border border-overlay/10 p-2 text-center"
              >
                <p className="font-mono text-sm font-bold tabular-nums">{s.v}</p>
                <p className="text-[8px] uppercase tracking-[0.15em] text-subtle">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="h-10 bg-panel border-t border-overlay/10 flex items-center justify-around px-3">
          {[I.members, I.calendar, I.qr].map((d, i) => (
            <span key={i} className={i === 0 ? 'text-brand-600 dark:text-brand-400' : 'text-dim'}>
              <Icon d={d} c="w-4 h-4" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

interface Pillar {
  id: string;
  ic: string;
  t: string;
  tone: string;
  headline: string;
  desc: string;
  caps: string[];
}

interface Kpi {
  l: string;
  v: string;
  d: string;
  up: boolean;
  tone: string;
  spark?: string;
  area?: boolean;
  bar?: number;
}

export default function PlatformLanding() {
  const [pillar, setPillar] = useState('members');
  // Hero product showcase eases in once mounted (slide + fade), matching the
  // member app's animated hero element without pulling in a motion dependency.
  const [showcaseIn, setShowcaseIn] = useState(false);
  useEffect(() => setShowcaseIn(true), []);

  const pillars: Pillar[] = [
    {
      id: 'members',
      ic: I.members,
      t: 'Member CRM',
      tone: 'brand',
      headline: 'Every member, on one timeline.',
      desc: 'Plans, freezes, balances, visits and messages live together. Segment your base and launch win-backs without exporting a thing.',
      caps: [
        'Plans, freezes & auto-renew',
        'Balances & outstanding dues',
        'Segments & saved filters',
        'Bulk message & win-back',
      ],
    },
    {
      id: 'schedule',
      ic: I.calendar,
      t: 'Class scheduling',
      tone: 'iris',
      headline: 'A timetable that runs itself.',
      desc: 'Build the week once, set caps and waitlists, and let auto-promotion fill the gaps the moment someone cancels.',
      caps: [
        'Drag-to-build weekly grid',
        'Caps, waitlists & auto-promote',
        'Trainer & room assignment',
        'Recurring series & holidays',
      ],
    },
    {
      id: 'checkin',
      ic: I.qr,
      t: 'QR check-in',
      tone: 'accent',
      headline: 'A queue-free front door.',
      desc: 'Members scan a 60-second token. Eligibility, frozen plans and guest passes resolve before they reach the desk.',
      caps: [
        '60-second rotating QR token',
        'Instant eligibility checks',
        'Guest passes & day entries',
        'Live arrivals stream',
      ],
    },
    {
      id: 'billing',
      ic: I.ticket,
      t: 'Billing & plans',
      tone: 'brand',
      headline: 'Recurring revenue on autopilot.',
      desc: 'Design plans, take card and cash, and let auto-renew, dunning and proration run themselves — every lari accounted for.',
      caps: [
        'Flexible plans & pricing tiers',
        'Auto-renew, dunning & proration',
        'Freezes, refunds & credits',
        'Invoices & GEL/card payouts',
      ],
    },
    {
      id: 'pos',
      ic: I.pos,
      t: 'POS & retail',
      tone: 'success',
      headline: 'Sell anything at the counter.',
      desc: 'Day passes, supplements, gear and PT packs through one till — backed by a full shop, orders and live inventory.',
      caps: [
        'Product tiles & quick sale',
        'Split cash + card payments',
        'Shop, orders & inventory',
        'Receipts by print or SMS',
      ],
    },
    {
      id: 'staff',
      ic: I.members,
      t: 'Trainers & staff',
      tone: 'iris',
      headline: 'Run the team behind the floor.',
      desc: 'Roster, roles and permissions, class loads and commissions — see who is on, who is booked, and what payroll owes.',
      caps: [
        'Trainer & staff profiles',
        'Roles, permissions & shifts',
        'Class load & utilization',
        'Commissions & payroll cycle',
      ],
    },
    {
      id: 'analytics',
      ic: I.chart,
      t: 'Analytics & reports',
      tone: 'flame',
      headline: 'Numbers reception actually trusts.',
      desc: 'Revenue, churn and retention cohorts that drill straight into the member behind every figure — exportable for the board.',
      caps: [
        'Revenue & net by source',
        'Churn & retention cohorts',
        'Class fill & no-show rates',
        'Scheduled board reports',
      ],
    },
    {
      id: 'app',
      ic: I.phone,
      t: 'Member app',
      tone: 'accent',
      headline: 'Your brand, in their pocket.',
      desc: 'Booking, QR pass and streaks in a white-labelled app — on web and on iOS & Android — that carries your logo, not ours.',
      caps: [
        'White-label web, iOS & Android',
        'One-thumb class booking',
        'QR pass, shop & streaks',
        'Push reminders & offers',
      ],
    },
  ];

  const active = pillars.find((p) => p.id === pillar) ?? pillars[0]!;

  const surfaces = [
    {
      ic: I.grid,
      t: 'Admin OS',
      tone: 'brand',
      d: 'The back office your team lives in — members, schedule, billing, POS, staff and reports in one console.',
      tags: ['15+ modules', 'Role-based access', 'Multi-location'],
    },
    {
      ic: I.globe,
      t: 'Member web portal',
      tone: 'iris',
      d: 'A branded site where members book classes, manage their plan, shop and check their streak from any browser.',
      tags: ['Self-serve booking', 'Plan & billing', 'Online shop'],
    },
    {
      ic: I.phone,
      t: 'Member app',
      tone: 'accent',
      d: 'Your logo on the App Store and Google Play. QR entry, one-thumb booking and push offers in their pocket.',
      tags: ['White-label iOS & Android', 'QR pass', 'Push'],
    },
  ];

  const modules = [
    {
      ic: I.chart,
      t: 'Dashboard',
      d: 'Today at a glance — revenue, arrivals, classes and alerts on one home screen.',
    },
    {
      ic: I.members,
      t: 'Members CRM',
      d: 'Profiles, plans, balances, visit history and messages on a single timeline.',
    },
    {
      ic: I.calendar,
      t: 'Scheduling',
      d: 'Drag-to-build weekly grid with caps, waitlists and recurring series.',
    },
    {
      ic: I.qr,
      t: 'Check-in',
      d: 'Rotating QR entry with live eligibility and a real-time arrivals stream.',
    },
    {
      ic: I.ticket,
      t: 'Billing & plans',
      d: 'Pricing tiers, auto-renew, freezes, refunds, proration and invoices.',
    },
    {
      ic: I.pos,
      t: 'Point of sale',
      d: 'Counter sales for passes, supplements and PT — split cash and card.',
    },
    {
      ic: I.store,
      t: 'Shop',
      d: 'Online and in-club storefront with categories, images and pricing.',
    },
    {
      ic: I.box,
      t: 'Orders & inventory',
      d: 'Stock levels, low-stock alerts and fulfilment across every location.',
    },
    {
      ic: I.members,
      t: 'Trainers & staff',
      d: 'Profiles, roles, shifts, class loads, commissions and payroll cycle.',
    },
    {
      ic: I.globe,
      t: 'Locations',
      d: 'One login across every branch with per-site roles and rollups.',
    },
    {
      ic: I.chart,
      t: 'Reports',
      d: 'Scheduled, exportable board reports on revenue, fill and retention.',
    },
    {
      ic: I.pulse,
      t: 'Activity log',
      d: 'Every change tracked — who did what, when, across the whole team.',
    },
  ];

  const kpis: Kpi[] = [
    {
      l: 'Monthly revenue',
      v: '₾ 86,400',
      d: '+12.4%',
      up: true,
      tone: 'brand',
      spark: 'M2,26 L14,22 L26,24 L38,16 L50,18 L62,9 L74,4',
      area: true,
    },
    {
      l: 'Active members',
      v: '1,284',
      d: '+48 this mo',
      up: true,
      tone: 'iris',
      spark: 'M2,24 L14,23 L26,20 L38,19 L50,15 L62,12 L74,7',
    },
    { l: 'Class fill rate', v: '78%', d: '+5 pts', up: true, tone: 'accent', bar: 78 },
    {
      l: '30-day churn',
      v: '2.1%',
      d: '−0.4 pts',
      up: true,
      tone: 'success',
      spark: 'M2,8 L14,12 L26,10 L38,15 L50,14 L62,20 L74,22',
    },
  ];

  const cohorts = [
    { c: 'Jan', v: [100, 88, 81, 76, 72, 70] },
    { c: 'Feb', v: [100, 90, 84, 79, 75, 0] },
    { c: 'Mar', v: [100, 86, 80, 74, 0, 0] },
    { c: 'Apr', v: [100, 91, 85, 0, 0, 0] },
    { c: 'May', v: [100, 89, 0, 0, 0, 0] },
  ];

  const sources = [
    { l: 'Memberships', v: '₾ 61.4k', pct: 71, c: 'brand' },
    { l: 'PT & packs', v: '₾ 14.2k', pct: 16, c: 'iris' },
    { l: 'Retail & shop', v: '₾ 7.8k', pct: 9, c: 'accent' },
    { l: 'Day passes', v: '₾ 3.0k', pct: 4, c: 'flame' },
  ];

  const memberFeatures = [
    {
      ic: I.calendar,
      t: 'Book in two taps',
      d: 'Live availability, waitlists and instant confirmations.',
    },
    { ic: I.qr, t: 'QR pass entry', d: 'Walk in and scan — no card, no front-desk queue.' },
    {
      ic: I.ticket,
      t: 'Self-serve plan',
      d: 'Upgrade, freeze or pay a balance without calling reception.',
    },
    {
      ic: I.store,
      t: 'Shop & PT packs',
      d: 'Buy supplements, gear and sessions right in the app.',
    },
    {
      ic: I.flame,
      t: 'Streaks & goals',
      d: 'Visit streaks and milestones that keep members coming back.',
    },
    {
      ic: I.bell,
      t: 'Push & offers',
      d: 'Class reminders and targeted offers that fill quiet hours.',
    },
  ];

  const floorFeatures = [
    {
      ic: I.globe,
      t: 'Multi-location',
      d: 'One login spans every branch, with consolidated revenue and per-site roles.',
    },
    {
      ic: I.bell,
      t: 'Smart automations',
      d: 'Win-backs, renewal nudges and waitlist promotions fire on their own.',
    },
    {
      ic: I.plug,
      t: 'Integrations',
      d: 'Payments, accounting and door access connect through a clean API and webhooks.',
    },
  ];

  const stats: [string, string][] = [
    ['1,200+', 'gyms & studios'],
    ['₾ 4.2M', 'processed monthly'],
    ['2.1%', 'avg monthly churn'],
    ['99.9%', 'uptime · 12 mo'],
  ];

  return (
    <div className="font-sans bg-surface text-fg antialiased relative overflow-hidden selection:bg-brand-500/30">
      <Aurora />

      <MarketingNav active="Core" />

      {/* hero */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-12 lg:pt-16 pb-10 text-center">
        {/* atmospheric backdrop — the herolight photo, dimmed and faded into the
            dark surface so the centred copy stays readable. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 -z-10 overflow-hidden"
        >
          <img
            src="/herolight.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-right opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-surface/70 via-surface/50 to-surface" />
        </div>

        <div className="flex justify-center">
          <Eyebrow icon={I.layers}>The complete platform</Eyebrow>
        </div>
        <h1 className="font-display text-[3rem] sm:text-[4rem] lg:text-[4.75rem] font-black tracking-tight mt-6 leading-[0.92] max-w-4xl mx-auto">
          The operating system{' '}
          <span className="bg-gradient-to-r from-brand-600 via-iris-500 to-accent-600 dark:from-brand-400 dark:via-iris-400 dark:to-accent-300 bg-clip-text text-transparent">
            your gym runs on.
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
          FormaCore replaces the eight tools behind your front desk with one. The back-office OS,
          your members&rsquo; web portal and a white-label app — all on a single core, from the
          first booking to the last receipt.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
          <Btn v="primary" size="lg" icon={I.arrow} href={SIGNUP_HREF}>
            Start 14-day trial
          </Btn>
          <Btn v="glass" size="lg" href={DEMO_HREF}>
            Book a demo
          </Btn>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-faint">
          {stats.map(([v, l], i) => (
            <div key={l} className="flex items-center gap-8">
              {i > 0 && <span className="hidden sm:block w-px h-8 bg-overlay/10" />}
              <div className="text-left">
                <div className="font-display text-xl font-extrabold text-fg tabular-nums">{v}</div>
                <div className="text-xs">{l}</div>
              </div>
            </div>
          ))}
        </div>

        {/* product showcase — the FormaCore desk + member app, easing in on load. */}
        <div
          className={`relative mt-16 transition-all duration-700 ease-out ${
            showcaseIn ? 'opacity-100 translate-y-0' : 'translate-y-8 opacity-0'
          }`}
        >
          <img
            src="/elementlight.webp"
            alt="The FormaCore back-office and member app, side by side"
            draggable={false}
            className="mx-auto w-full max-w-4xl select-none drop-shadow-2xl"
          />
        </div>
      </section>

      {/* one core, three surfaces */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="max-w-2xl">
          <Eyebrow icon={I.layers}>One core, three surfaces</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            One source of truth — for the desk, the member and the phone.
          </h2>
          <p className="mt-4 text-[15px] text-muted leading-relaxed">
            A booking, a payment or a freeze updates everywhere at once. No exports, no syncing, no
            two systems disagreeing about who owes what.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {surfaces.map((s) => (
            <div
              key={s.t}
              className="relative rounded-card ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] p-6 hover:bg-overlay/[0.05] hover:ring-overlay/20 transition overflow-hidden"
            >
              <div
                className={`pointer-events-none absolute -top-16 -right-10 w-44 h-44 bg-${s.tone}-500/[0.12] blur-[80px] rounded-full`}
              />
              <div
                className={`relative w-11 h-11 rounded-btn grid place-items-center bg-gradient-to-br from-${s.tone}-400/25 to-${s.tone}-600/10 ring-1 ring-inset ring-overlay/10`}
              >
                <Icon
                  d={s.ic}
                  c={`w-[22px] h-[22px] text-${s.tone}-700 dark:text-${s.tone}-300`}
                  sw={2}
                />
              </div>
              <h3 className="font-display text-xl font-bold mt-5">{s.t}</h3>
              <p className="text-sm text-faint mt-2 leading-relaxed">{s.d}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {s.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-pill bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10 text-[11px] font-semibold text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* module explorer */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="max-w-2xl mb-10">
          <Eyebrow icon={I.grid}>Inside the Admin OS</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            Eight modules. Pick one and look inside.
          </h2>
          <p className="mt-4 text-[15px] text-muted leading-relaxed">
            Each runs the same data, so the front desk never juggles tabs. Choose a module to see
            the real screen your team would use.
          </p>
        </div>
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6">
          {/* selector */}
          <div className="lg:sticky lg:top-6 self-start space-y-2">
            {pillars.map((p) => {
              const on = p.id === pillar;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPillar(p.id)}
                  className={`w-full flex items-center gap-3.5 p-3.5 rounded-card text-left transition ring-1 ring-inset ${on ? 'bg-overlay/[0.06] ring-overlay/20' : 'bg-overlay/[0.02] ring-overlay/[0.08] hover:bg-overlay/[0.04] hover:ring-overlay/15'}`}
                >
                  <span
                    className={`relative w-10 h-10 rounded-btn grid place-items-center shrink-0 ${on ? `bg-gradient-to-br from-${p.tone}-400/30 to-${p.tone}-600/15 ring-1 ring-inset ring-overlay/10` : 'bg-overlay/[0.04]'}`}
                  >
                    <Icon
                      d={p.ic}
                      c={`w-5 h-5 ${on ? `text-${p.tone}-700 dark:text-${p.tone}-300` : 'text-faint'}`}
                      sw={2}
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${on ? 'text-fg' : 'text-muted'}`}>
                      {p.t}
                    </p>
                  </div>
                  {on && <Icon d={I.arrow} c="w-4 h-4 text-brand-700 dark:text-brand-300" sw={2} />}
                </button>
              );
            })}
          </div>

          {/* detail */}
          <div className="relative rounded-[2rem] ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl overflow-hidden p-7 lg:p-10">
            <div
              className={`pointer-events-none absolute -top-28 right-10 w-80 h-80 bg-${active.tone}-500/15 blur-[120px] rounded-full`}
            />
            <div className="relative grid md:grid-cols-2 gap-8 lg:gap-10 items-center">
              <div>
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-${active.tone}-500/15 ring-1 ring-inset ring-${active.tone}-500/25 text-[11px] font-mono uppercase tracking-[0.2em] text-${active.tone}-700 dark:text-${active.tone}-300`}
                >
                  <Icon d={active.ic} c="w-3.5 h-3.5" sw={2} />
                  {active.t}
                </span>
                <h2 className="font-display text-3xl lg:text-[2.5rem] font-black tracking-tight mt-5 leading-[0.98]">
                  {active.headline}
                </h2>
                <p className="mt-4 text-[15px] text-muted leading-relaxed">{active.desc}</p>
                <ul className="mt-6 space-y-3">
                  {active.caps.map((c) => (
                    <li key={c} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={`shrink-0 mt-0.5 w-5 h-5 rounded-full grid place-items-center bg-${active.tone}-500/15 ring-1 ring-inset ring-${active.tone}-500/25`}
                      >
                        <Icon
                          d={I.check}
                          c={`w-3 h-3 text-${active.tone}-700 dark:text-${active.tone}-300`}
                          sw={3}
                        />
                      </span>
                      <span className="text-strong">{c}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex items-center gap-1.5 mt-7 text-sm font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-brand-200 transition"
                >
                  Explore {active.t} <Icon d={I.arrow} c="w-4 h-4" sw={2} />
                </a>
              </div>

              {/* mock */}
              <div className="relative rounded-card ring-1 ring-inset ring-overlay/[0.12] bg-panel/60 backdrop-blur-xl overflow-hidden shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-overlay/25 to-transparent" />
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-overlay/10">
                  <div className="w-6 h-6 rounded-md bg-[linear-gradient(135deg,#7C3AED,#EC4899)] grid place-items-center">
                    <Icon d={I.bolt} c="w-3.5 h-3.5 text-white" sw={2.2} />
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                    {active.t}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill bg-success-500/15 ring-1 ring-inset ring-success-500/25 text-[10px] font-semibold text-success-700 dark:text-success-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-400" />
                    Live
                  </span>
                </div>
                <div className="p-5">
                  <Mock id={active.id} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* complete back office — module map */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-28">
        <div className="flex flex-wrap items-end justify-between gap-4 max-w-3xl">
          <div>
            <Eyebrow icon={I.layers}>Nothing left in a spreadsheet</Eyebrow>
            <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
              Every corner of the business, covered.
            </h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px mt-12 rounded-[1.5rem] overflow-hidden ring-1 ring-inset ring-overlay/10 bg-overlay/[0.06]">
          {modules.map((m) => (
            <div key={m.t} className="group bg-panel/40 p-5 hover:bg-overlay/[0.04] transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-btn grid place-items-center bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10 group-hover:ring-brand-500/30 transition">
                  <Icon d={m.ic} c="w-[18px] h-[18px] text-brand-700 dark:text-brand-300" sw={2} />
                </div>
                <h3 className="font-display text-[15px] font-bold">{m.t}</h3>
              </div>
              <p className="text-[13px] text-faint mt-3 leading-relaxed">{m.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-subtle flex items-center gap-2">
          <Icon d={I.gear} c="w-3.5 h-3.5" sw={2} />
          Plus org-wide settings, roles &amp; permissions, audit trail and a full API — all in the
          same console.
        </p>
      </section>

      {/* live dashboard — data band */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-28">
        <div className="max-w-2xl mb-10">
          <Eyebrow icon={I.chart}>The numbers, live</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            Open the app to a gym that explains itself.
          </h2>
          <p className="mt-4 text-[15px] text-muted leading-relaxed">
            Revenue, retention and class fill update the second a payment clears or a member walks
            in. Every figure drills straight to the person behind it.
          </p>
        </div>

        <div className="relative rounded-[2rem] ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl overflow-hidden p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -top-28 left-1/3 w-96 h-96 bg-brand-500/[0.12] blur-[130px] rounded-full" />
          {/* panel header */}
          <div className="relative flex items-center gap-3 pb-5 border-b border-overlay/10">
            <div className="w-7 h-7 rounded-md bg-[linear-gradient(135deg,#7C3AED,#EC4899)] grid place-items-center">
              <Icon d={I.bolt} c="w-4 h-4 text-white" sw={2.2} />
            </div>
            <span className="font-display text-sm font-bold">Iron Gym · Overview</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill bg-success-500/15 ring-1 ring-inset ring-success-500/25 text-[10px] font-semibold text-success-700 dark:text-success-300">
              <span className="w-1.5 h-1.5 rounded-full bg-success-400" />
              Live
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {['7d', '30d', 'QTR'].map((t, i) => (
                <span
                  key={t}
                  className={`px-2.5 py-1 rounded-pill text-[11px] font-semibold ${i === 1 ? 'bg-overlay/10 text-fg ring-1 ring-inset ring-overlay/15' : 'text-faint'}`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* KPI row */}
          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5">
            {kpis.map((k) => (
              <div
                key={k.l}
                className="rounded-card bg-overlay/[0.03] ring-1 ring-inset ring-overlay/10 p-4 hover:ring-overlay/20 transition"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                  {k.l}
                </p>
                <p className="font-display text-2xl font-extrabold tabular-nums mt-1.5">{k.v}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold text-${k.tone}-700 dark:text-${k.tone}-300`}
                  >
                    <Icon d="M5 12h14M13 6l6 6-6 6" c="w-3 h-3 -rotate-45" sw={2.5} />
                    {k.d}
                  </span>
                </div>
                {k.bar != null ? (
                  <div className="mt-3 h-1.5 rounded-full bg-overlay/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-${k.tone}-500`}
                      style={{ width: `${k.bar}%` }}
                    />
                  </div>
                ) : (
                  <svg
                    viewBox="0 0 76 30"
                    className="w-full mt-2.5"
                    preserveAspectRatio="none"
                    style={{ height: 30 }}
                  >
                    {k.area && (
                      <path d={`${k.spark ?? ''} L74,30 L2,30 Z`} fill={`url(#sg-${k.tone})`} />
                    )}
                    <defs>
                      <linearGradient id={`sg-${k.tone}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={k.spark}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`text-${k.tone}-500 dark:text-${k.tone}-400`}
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>

          {/* cohort + top list */}
          <div className="relative grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 mt-4">
            {/* retention cohort */}
            <div className="rounded-card bg-overlay/[0.03] ring-1 ring-inset ring-overlay/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-display text-sm font-bold">Retention cohorts</p>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
                  by join month · % active
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="grid grid-cols-[52px_repeat(6,1fr)] gap-1.5 text-center">
                  <span />
                  {['M0', 'M1', 'M2', 'M3', 'M4', 'M5'].map((m) => (
                    <span key={m} className="font-mono text-[10px] text-subtle">
                      {m}
                    </span>
                  ))}
                </div>
                {cohorts.map((row) => (
                  <div
                    key={row.c}
                    className="grid grid-cols-[52px_repeat(6,1fr)] gap-1.5 items-center"
                  >
                    <span className="font-mono text-[11px] text-faint">{row.c}</span>
                    {row.v.map((val, i) => {
                      const bucket =
                        val === 0
                          ? 'bg-overlay/[0.03] text-dim'
                          : val >= 90
                            ? 'bg-brand-500/80 text-white'
                            : val >= 80
                              ? 'bg-brand-500/55 text-white'
                              : val >= 70
                                ? 'bg-brand-500/35 text-brand-800 dark:text-brand-100'
                                : 'bg-brand-500/20 text-brand-800 dark:text-brand-200';
                      return (
                        <span
                          key={i}
                          className={`h-8 rounded-md grid place-items-center font-mono text-[10px] font-semibold tabular-nums ${bucket}`}
                        >
                          {val === 0 ? '·' : val}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* revenue by source */}
            <div className="rounded-card bg-overlay/[0.03] ring-1 ring-inset ring-overlay/10 p-5">
              <p className="font-display text-sm font-bold mb-4">Revenue by source</p>
              <div className="space-y-3.5">
                {sources.map((s) => (
                  <div key={s.l}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted font-medium">{s.l}</span>
                      <span className="font-mono text-strong tabular-nums">{s.v}</span>
                    </div>
                    <div className="h-2 rounded-full bg-overlay/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-${s.c}-500`}
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-overlay/10">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
                  Net · 30d
                </span>
                <span className="font-display text-lg font-extrabold tabular-nums">₾ 86,400</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* member experience */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-28">
        <div className="relative rounded-[2rem] ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl overflow-hidden p-8 lg:p-12">
          <div className="pointer-events-none absolute -top-24 right-1/4 w-80 h-80 bg-iris-500/[0.14] blur-[120px] rounded-full" />
          <div className="relative grid lg:grid-cols-[minmax(0,1fr)_300px] gap-10 lg:gap-14 items-center">
            <div>
              <Eyebrow icon={I.star}>The member side</Eyebrow>
              <h2 className="font-display text-3xl lg:text-[2.75rem] font-black tracking-tight mt-5 leading-[0.98]">
                Members get a product they actually open.
              </h2>
              <p className="mt-4 text-[15px] text-muted leading-relaxed max-w-xl">
                The same core that runs your desk powers a polished web portal and a white-label
                app. Booking, payments, shop and streaks — your brand, never ours.
              </p>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 mt-8">
                {memberFeatures.map((f) => (
                  <div key={f.t} className="flex gap-3">
                    <span className="shrink-0 w-9 h-9 rounded-btn grid place-items-center bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10">
                      <Icon
                        d={f.ic}
                        c="w-[18px] h-[18px] text-iris-700 dark:text-iris-300"
                        sw={2}
                      />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{f.t}</p>
                      <p className="text-[13px] text-faint mt-0.5 leading-relaxed">{f.d}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-8">
                {['Web portal', 'iOS', 'Android'].map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10 text-xs font-semibold text-strong"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative">
              <Mock id="app" />
            </div>
          </div>

          {/* feature cards with mini mocks */}
          <div className="relative grid sm:grid-cols-3 gap-4 mt-8 pt-8 border-t border-overlay/10">
            {/* book */}
            <div className="rounded-card bg-panel/50 ring-1 ring-inset ring-overlay/10 overflow-hidden">
              <div className="p-4 space-y-2">
                {[
                  { t: '07:30', n: 'Morning Yoga', s: 'Booked', on: true },
                  { t: '19:00', n: 'Spin Express', s: '2 left', on: false },
                ].map((c) => (
                  <div
                    key={c.t}
                    className={`flex items-center gap-2.5 p-2 rounded-md ring-1 ring-inset ${c.on ? 'bg-iris-500/15 ring-iris-500/30' : 'bg-overlay/[0.03] ring-overlay/10'}`}
                  >
                    <span className="font-mono text-[11px] font-bold w-9">{c.t}</span>
                    <span className="text-xs font-semibold flex-1 truncate">{c.n}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-pill text-[9px] font-semibold ${c.on ? 'bg-iris-500 text-white' : 'bg-overlay/10 text-muted'}`}
                    >
                      {c.s}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <p className="font-display text-sm font-bold">Book in seconds</p>
                <p className="text-[12px] text-faint mt-0.5 leading-relaxed">
                  Live timetable, waitlists and instant confirmations.
                </p>
              </div>
            </div>
            {/* QR pass */}
            <div className="rounded-card bg-panel/50 ring-1 ring-inset ring-overlay/10 overflow-hidden">
              <div className="p-4 grid place-items-center">
                <div className="relative w-[68px] h-[68px] rounded-lg bg-white grid place-items-center">
                  <Icon d={I.qr} c="w-10 h-10 text-ink-950" sw={1.6} />
                  <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full grid place-items-center ring-2 ring-panel bg-success-500">
                    <Icon d={I.check} c="w-3.5 h-3.5 text-white" sw={3} />
                  </span>
                </div>
                <span className="mt-3 font-mono text-[10px] text-faint">expires in 0:57</span>
              </div>
              <div className="px-4 pb-4">
                <p className="font-display text-sm font-bold">Tap to enter</p>
                <p className="text-[12px] text-faint mt-0.5 leading-relaxed">
                  A rotating QR pass — scan and walk straight in.
                </p>
              </div>
            </div>
            {/* shop */}
            <div className="rounded-card bg-panel/50 ring-1 ring-inset ring-overlay/10 overflow-hidden">
              <div className="p-4 space-y-2">
                {[
                  { n: 'Whey protein 2kg', p: '₾ 145' },
                  { n: 'Shaker bottle', p: '₾ 28' },
                ].map((it) => (
                  <div
                    key={it.n}
                    className="flex items-center gap-2.5 p-1.5 rounded-md bg-overlay/[0.03] ring-1 ring-inset ring-overlay/10"
                  >
                    <div className="w-8 h-8 rounded-md bg-accent-500/15 ring-1 ring-inset ring-accent-500/25 grid place-items-center">
                      <Icon d={I.store} c="w-4 h-4 text-accent-700 dark:text-accent-300" sw={2} />
                    </div>
                    <span className="text-xs font-semibold flex-1 truncate">{it.n}</span>
                    <span className="font-mono text-[11px] text-strong tabular-nums">{it.p}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <p className="font-display text-sm font-bold">Shop the store</p>
                <p className="text-[12px] text-faint mt-0.5 leading-relaxed">
                  Supplements, gear and PT packs — charged to the account.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* built for the floor — capability strip */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-28">
        <div className="max-w-2xl">
          <Eyebrow icon={I.bolt}>Built for the floor</Eyebrow>
          <h2 className="font-display text-4xl lg:text-[3rem] font-black tracking-tight mt-5 leading-[0.96]">
            The details that keep a busy gym moving.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
          {floorFeatures.map((c) => (
            <div
              key={c.t}
              className="rounded-card ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] p-5 hover:bg-overlay/[0.06] hover:ring-overlay/20 transition"
            >
              <div className="w-10 h-10 rounded-btn grid place-items-center bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10">
                <Icon d={c.ic} c="w-5 h-5 text-brand-700 dark:text-brand-300" sw={2} />
              </div>
              <h3 className="font-display text-lg font-bold mt-4">{c.t}</h3>
              <p className="text-sm text-faint mt-1.5 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* security band */}
      <section className="relative z-10 max-w-[1180px] mx-auto px-6 lg:px-10 pt-24">
        <div className="relative rounded-[2rem] ring-1 ring-inset ring-overlay/10 bg-overlay/[0.03] backdrop-blur-xl overflow-hidden p-8 lg:p-12">
          <div className="pointer-events-none absolute -top-24 left-1/4 w-72 h-72 bg-accent-500/[0.12] blur-[110px] rounded-full" />
          <div className="relative grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-10 items-center">
            <div>
              <Eyebrow icon={I.lock}>Trust & data</Eyebrow>
              <h2 className="font-display text-3xl lg:text-4xl font-black tracking-tight mt-5 leading-[0.98]">
                Your members&rsquo; data, handled with care.
              </h2>
              <p className="mt-4 text-[15px] text-muted leading-relaxed max-w-lg">
                Encrypted in transit and at rest, hosted in-region, and backed up daily. You own
                your data — export it any time.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-7">
                {[
                  'Encrypted',
                  'Daily backups',
                  'In-region hosting',
                  'GDPR-ready',
                  '99.9% uptime',
                ].map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-overlay/[0.05] ring-1 ring-inset ring-overlay/10 text-xs font-semibold text-strong"
                  >
                    <Icon
                      d={I.check}
                      c="w-3.5 h-3.5 text-success-600 dark:text-success-400"
                      sw={2.6}
                    />
                    {b}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { v: '99.9%', l: 'Uptime · 12 mo' },
                { v: '<200ms', l: 'Median response' },
                { v: 'AES-256', l: 'Encryption' },
                { v: 'Daily', l: 'Backups' },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-card bg-overlay/[0.03] ring-1 ring-inset ring-overlay/10 p-5"
                >
                  <p className="font-display text-2xl font-extrabold tracking-tight">{s.v}</p>
                  <p className="text-xs text-faint mt-1">{s.l}</p>
                </div>
              ))}
            </div>
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
              See the whole platform on your floor.
            </h2>
            <p className="mt-5 text-lg text-white/80 max-w-xl mx-auto">
              Spin up a trial with your real timetable, or book a guided demo with our team.
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
