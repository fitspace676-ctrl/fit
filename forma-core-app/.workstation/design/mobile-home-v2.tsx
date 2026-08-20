// @device: mobile
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore mobile — მთავარი · art direction v2 "Lime Block"
   ---------------------------------------------------------------------------
   Charcoal canvas, oversized soft-cornered blocks — one lime membership card,
   every other card a plain ink-900 surface — and a floating capsule nav of
   circular buttons. Lime marks the membership and every primary action.
   Content is unchanged and still comes from the codebase:
     · gym Downtown Strength · member Nino Kapanadze, Premium
     · CLASS_TYPES + DEMO_TODAY_CLASSES (capacity, duration, category colour)
     · DEMO_TRAINERS · DEMO_LOCATIONS · DEMO_PRODUCTS (GEL minor units)
     · copy verbatim from @fit/i18n ka.json
   ========================================================================== */

/* The signature shape: two corners rounded, two cut on the diagonal — the same
   move as the membership block, scaled down for controls. */
const CUT_SM =
  '[clip-path:polygon(9px_0,calc(100%_-_9px)_0,100%_9px,100%_calc(100%_-_9px),calc(100%_-_9px)_100%,9px_100%,0_calc(100%_-_9px),0_9px)]';
const CUT_MD =
  '[clip-path:polygon(11px_0,calc(100%_-_11px)_0,100%_11px,100%_calc(100%_-_11px),calc(100%_-_11px)_100%,11px_100%,0_calc(100%_-_11px),0_11px)]';
const CUT_LG =
  '[clip-path:polygon(30px_0,calc(100%_-_30px)_0,100%_30px,100%_calc(100%_-_30px),calc(100%_-_30px)_100%,30px_100%,0_calc(100%_-_30px),0_30px)]';

const P = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h4v-6h3v6h4a1 1 0 0 0 1-1V9.5',
  calendar:
    'M7 3v3M17 3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6Z',
  bag: 'M6 8h12l1 12.5H5L6 8ZM9 8V6a3 3 0 0 1 6 0v2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
  qr: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2.5v2.5H14V14ZM20 14v6h-3.5M17 20h-.5',
  bell: 'M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10ZM10 19a2 2 0 0 0 4 0',
  bolt: 'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3Z',
  arrow: 'M7 17 17 7M9 7h8v8',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M18 6 6 18',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 5v6h-6',
};

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** Billing-period ring — `periodProgress(sub)` painted as a donut. */
function Ring({ pct, className = 'h-14 w-14' }: { pct: number; className?: string }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={`${pct}%`}>
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        opacity="0.2"
      />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform="rotate(-90 24 24)"
      />
      <text
        x="24"
        y="27.5"
        textAnchor="middle"
        className="fill-current font-mono text-[11px] font-bold"
      >
        {pct}%
      </text>
    </svg>
  );
}

/* -------------------------------- real data ------------------------------- */

/** GEL minor units → what `formatMoney(amount, 'GEL', 'ka')` renders. */
const money = (minor: number) => `${(minor / 100).toFixed(2).replace('.', ',')} ₾`;

type Instance = {
  id: string;
  title: string;
  category: string;
  /** ClassInstanceCard.color — the category hex the API ships. */
  color: string;
  time: string;
  minutes: number;
  trainerName: string;
  locationName: string;
  capacity: number;
  bookedCount: number;
  status: null | 'BOOKED' | 'WAITLIST';
  position?: number;
};

const TODAY: Instance[] = [
  {
    id: 'ci-yoga-08',
    title: 'Morning Yoga',
    category: 'Yoga Flow',
    color: '#DCDCDA',
    time: '08:00',
    minutes: 75,
    trainerName: 'Ana G.',
    locationName: 'Studio A',
    capacity: 20,
    bookedCount: 14,
    status: null,
  },
  {
    id: 'ci-crossfit-12',
    title: 'CrossFit WOD',
    category: 'CrossFit',
    color: '#C4C4C1',
    time: '12:00',
    minutes: 60,
    trainerName: 'Levan M.',
    locationName: 'Main Floor',
    capacity: 14,
    bookedCount: 14,
    status: 'WAITLIST',
    position: 2,
  },
  {
    id: 'ci-spin-18',
    title: 'Spin Express',
    category: 'Spin',
    color: '#8F8F8B',
    time: '18:00',
    minutes: 45,
    trainerName: 'Sandro K.',
    locationName: 'Main Floor',
    capacity: 24,
    bookedCount: 20,
    status: 'BOOKED',
  },
  {
    id: 'ci-boxing-19',
    title: 'Boxing Basics',
    category: 'Boxing',
    color: '#6C6C68',
    time: '19:00',
    minutes: 60,
    trainerName: 'Nika B.',
    locationName: 'Main Floor',
    capacity: 12,
    bookedCount: 7,
    status: null,
  },
];

const CATS = ['ყველა', 'Yoga Flow', 'CrossFit', 'Spin', 'Boxing'];

/** Lime is reserved for the membership block; class blocks are plain surfaces. */
const CARD = 'border border-ink-800 bg-ink-900 text-white';

export default function MobileHomeV2() {
  const [filter, setFilter] = useState('ყველა');
  const [tab, setTab] = useState('home');
  const [qrOpen, setQrOpen] = useState(false);
  const [bookings, setBookings] = useState<Record<string, Instance['status']>>(
    Object.fromEntries(TODAY.map((c) => [c.id, c.status])),
  );

  const list = TODAY.filter((c) => filter === 'ყველა' || c.category === filter);

  const toggle = (c: Instance) =>
    setBookings((b) => ({
      ...b,
      [c.id]: b[c.id] ? null : c.bookedCount >= c.capacity ? 'WAITLIST' : 'BOOKED',
    }));

  return (
    <div className="relative min-h-[900px] w-full bg-ink-950 pb-32 font-sans text-white">
      {/* ------------------------------- header ----------------------------- */}
      <header className="flex items-center gap-3 px-5 pb-6 pt-14">
        <img
          src="https://i.pravatar.cc/160?img=45"
          alt="Nino Kapanadze"
          width={52}
          height={52}
          referrerPolicy="no-referrer"
          className="h-[52px] w-[52px] shrink-0 rounded-full object-cover ring-2 ring-brand-300"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[20px] font-extrabold uppercase leading-none tracking-tight">
            გამარჯობა, Nino
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 truncate text-[13px] text-ink-400">
            <Icon d={P.bolt} className="h-3.5 w-3.5 text-brand-300" />
            Premium · Downtown Strength
          </p>
        </div>
        <button
          type="button"
          aria-label="შეტყობინებები"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-900 text-ink-200 transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <Icon d={P.bell} className="h-[19px] w-[19px]" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-300 ring-2 ring-ink-900" />
        </button>
      </header>

      {/* --------------------------- membership block -----------------------
          GET /me/subscription — plan, period progress, days left. The arrow
          opens the check-in code (the member never writes a check-in). */}
      <section className="px-5">
        <div className={`relative overflow-hidden ${CUT_LG} bg-brand-300 text-ink-950`}>
          <div className="relative p-5">
            <div className="flex items-start justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-800">
                აბონემენტი
              </span>
              <span className="text-ink-950">
                <Ring pct={73} />
              </span>
            </div>

            <p className="mt-3 text-[34px] font-extrabold uppercase leading-none tracking-tight">
              Premium
            </p>
            <p className="mt-2 text-[13px] font-medium text-ink-800">
              აქტიური · <span className="font-mono tabular-nums">22 / 30</span> დღე დარჩა
            </p>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center gap-4 rounded-pill bg-ink-950 py-2.5 pl-5 pr-2.5">
                <div className="whitespace-nowrap">
                  <p className="font-mono text-[26px] font-bold leading-none tabular-nums text-brand-300">
                    8
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                    დღე დარჩა
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  aria-label="გამოცხადების QR"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-300 text-ink-950 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Icon d={P.arrow} className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------- counters ---------------------------
          Derived from the member's bookings, as home.tsx computes them. */}
      <section className="mt-4 px-5">
        <div className="flex gap-3">
          <div className="flex-1 rounded-[26px] bg-ink-900 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              დღის სერია
            </p>
            <p className="mt-3 font-mono text-[30px] font-bold leading-none tabular-nums text-white">
              18
            </p>
          </div>
          <div className="flex-1 rounded-[26px] bg-ink-900 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              PT კრედიტი
            </p>
            <div className="mt-3 flex items-end justify-between">
              <p className="font-mono text-[30px] font-bold leading-none tabular-nums text-white">
                2<span className="text-[15px] text-ink-500">/3</span>
              </p>
              <span className="mb-1 flex gap-1">
                <span className="h-1.5 w-4 rounded-pill bg-white" />
                <span className="h-1.5 w-4 rounded-pill bg-white" />
                <span className="h-1.5 w-4 rounded-pill bg-ink-700" />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ today's plan ------------------------ */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="text-[24px] font-extrabold leading-none tracking-tight">
            დღევანდელი განრიგი
          </h2>
          <button
            type="button"
            className="shrink-0 text-[12px] font-semibold text-ink-400 transition-colors hover:text-white"
          >
            ყველა
          </button>
        </div>

        {/* Capsule filter — the seeded CLASS_TYPES. */}
        <div className="mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`h-11 shrink-0 ${CUT_SM} px-5 text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                filter === c
                  ? 'bg-white text-ink-950'
                  : 'bg-ink-900 text-ink-300 hover:bg-ink-800 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4 px-5">
          {list.map((c) => {
            const status = bookings[c.id];
            const spotsLeft = c.capacity - c.bookedCount;
            const full = spotsLeft <= 0;
            return (
              <article key={c.id} className={`relative overflow-hidden rounded-[30px] ${CARD}`}>
                <div className="relative p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                          {c.category}
                        </span>
                      </div>
                      <h3 className="mt-2.5 max-w-[190px] text-[24px] font-extrabold leading-[1.05] tracking-tight">
                        {c.title}
                      </h3>
                    </div>
                    <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full bg-white text-ink-950">
                      <span className="font-mono text-[17px] font-bold leading-none tabular-nums">
                        {c.minutes}
                      </span>
                      <span className="mt-0.5 text-[10px] font-semibold">წთ</span>
                    </div>
                  </div>

                  <p className="mt-3 text-[13px] font-medium text-ink-400">
                    <span className="font-mono tabular-nums">{c.time}</span> · {c.trainerName} ·{' '}
                    {c.locationName}
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <span className="rounded-pill bg-ink-800 px-3 py-1.5 text-[12px] font-semibold tabular-nums text-ink-200">
                      {full ? 'სავსეა' : `${spotsLeft} დარჩა`}
                    </span>

                    {status === 'BOOKED' ? (
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={`${CUT_SM} bg-brand-950 text-brand-200 ring-1 ring-inset ring-brand-800 hover:bg-brand-900 px-4 py-1.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
                      >
                        დაჯავშნილია
                      </button>
                    ) : status === 'WAITLIST' ? (
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={`${CUT_SM} bg-ink-800 text-ink-200 hover:bg-ink-700 px-4 py-1.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
                      >
                        მოლოდინი · #{c.position ?? 1}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={`${CUT_SM} bg-brand-300 px-4 py-1.5 text-[12px] font-semibold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
                      >
                        {full ? 'მოლოდინის სია' : 'დაჯავშნა'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* -------------------------------- trainer ---------------------------
          DEMO_TRAINERS — the coach the member books most; a session spends a
          PT credit (member.membership.ptCredits). */}
      <section className="mt-7 px-5">
        <div className="flex items-center gap-3 rounded-[26px] bg-ink-900 p-4">
          <img
            src="https://i.pravatar.cc/160?img=47"
            alt="Ana G."
            width={52}
            height={52}
            referrerPolicy="no-referrer"
            className="h-[52px] w-[52px] shrink-0 rounded-full object-cover ring-2 ring-ink-700"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              შენი მწვრთნელი
            </p>
            <p className="mt-1 truncate text-[16px] font-bold text-white">Ana G.</p>
            <p className="mt-0.5 truncate text-[12px] text-ink-400">
              Yoga Flow · Pilates · Studio A
            </p>
          </div>
          <button
            type="button"
            aria-label="სესიის დაჯავშნა"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-300 text-ink-950 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Icon d={P.arrow} className="h-[18px] w-[18px]" />
          </button>
        </div>
      </section>

      {/* ------------------------------- shop rail -------------------------- */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="text-[24px] font-extrabold leading-none tracking-tight">
            შენი ვარჯიშისთვის
          </h2>
          <span className="shrink-0 rounded-pill bg-brand-300 px-3 py-1 text-[11px] font-bold text-ink-950">
            −10%
          </span>
        </div>

        <div className="mt-4 space-y-2 px-5">
          {[
            { id: 'p-whey', name: 'Whey Protein 1kg', minor: 8900, variants: 2 },
            { id: 'p-bands', name: 'Resistance Bands Set', minor: 3900, variants: 0 },
            { id: 'p-tee', name: 'Branded Training Tee', minor: 4500, variants: 4 },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-[22px] bg-ink-900 px-4 py-3.5 text-left transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">
                  {p.name}
                </span>
                <span className="mt-1 block text-[12px] text-ink-400">
                  {p.variants > 0 ? `${p.variants} ვარიანტი` : 'ერთი ვარიანტი'}
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono text-[13px] font-bold tabular-nums text-brand-300">
                {p.variants > 1 ? `${money(p.minor)}-დან` : money(p.minor)}
              </span>
              <Icon d={P.chevron} className="h-4 w-4 shrink-0 text-ink-600" />
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------- floating capsule nav --------------------- */}
      <nav className="absolute inset-x-0 bottom-6 z-10 flex justify-center px-5">
        <div className="flex w-full items-center justify-between rounded-pill bg-ink-900 p-2">
          {[
            { key: 'home', label: 'მთავარი', icon: P.home },
            { key: 'classes', label: 'გაკვეთილები', icon: P.calendar },
            { key: 'qr', label: 'გამოცხადება', icon: P.qr },
            { key: 'shop', label: 'მაღაზია', icon: P.bag },
            { key: 'profile', label: 'პროფილი', icon: P.user },
          ].map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-label={t.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => (t.key === 'qr' ? setQrOpen(true) : setTab(t.key))}
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 ${
                  active ? 'bg-brand-300 text-ink-950' : 'text-ink-500 hover:text-white'
                }`}
              >
                <Icon d={t.icon} className={active ? 'h-[23px] w-[23px]' : 'h-[21px] w-[21px]'} />
              </button>
            );
          })}
        </div>
      </nav>

      {/* -------------------------------- QR sheet -------------------------- */}
      {qrOpen ? (
        <div className="absolute inset-0 z-20">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setQrOpen(false)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-ink-900 px-5 pb-8 pt-3">
            <div className="mx-auto mb-5 h-1 w-10 rounded-pill bg-ink-700" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[22px] font-extrabold tracking-tight text-white">ჩექ-ინი</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
                  აჩვენე ეს კოდი მიმღების სკანერს.
                </p>
              </div>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setQrOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            <div className="mx-auto mt-6 w-60 rounded-[28px] bg-brand-300 p-5">
              <svg
                viewBox="0 0 29 29"
                className="h-full w-full"
                role="img"
                aria-label="ჩექ-ინის QR კოდი"
              >
                <g fill="#131312">
                  {[
                    [0, 0],
                    [22, 0],
                    [0, 22],
                  ].map(([x, y]) => (
                    <g key={`f${x}-${y}`}>
                      <rect x={x} y={y} width="7" height="7" rx="1.6" />
                      <rect
                        x={x + 1.4}
                        y={y + 1.4}
                        width="4.2"
                        height="4.2"
                        rx="1"
                        fill="#E4F26A"
                      />
                      <rect x={x + 2.4} y={y + 2.4} width="2.2" height="2.2" rx="0.6" />
                    </g>
                  ))}
                  {[
                    [9, 1],
                    [11, 1],
                    [13, 2],
                    [15, 1],
                    [17, 3],
                    [9, 3],
                    [12, 4],
                    [16, 5],
                    [10, 5],
                    [14, 6],
                    [18, 6],
                    [9, 7],
                    [13, 8],
                    [17, 8],
                    [1, 9],
                    [3, 9],
                    [5, 10],
                    [7, 9],
                    [9, 10],
                    [11, 11],
                    [13, 10],
                    [15, 12],
                    [17, 10],
                    [19, 11],
                    [21, 9],
                    [23, 10],
                    [25, 12],
                    [27, 9],
                    [2, 12],
                    [4, 13],
                    [6, 12],
                    [8, 14],
                    [10, 13],
                    [12, 14],
                    [14, 15],
                    [16, 13],
                    [18, 15],
                    [20, 14],
                    [22, 13],
                    [24, 15],
                    [26, 14],
                    [1, 15],
                    [3, 16],
                    [5, 15],
                    [7, 17],
                    [9, 16],
                    [11, 18],
                    [13, 17],
                    [15, 18],
                    [17, 17],
                    [19, 19],
                    [21, 17],
                    [23, 18],
                    [25, 17],
                    [27, 19],
                    [2, 18],
                    [4, 19],
                    [6, 20],
                    [9, 20],
                    [11, 21],
                    [13, 20],
                    [15, 22],
                    [17, 21],
                    [19, 22],
                    [22, 20],
                    [24, 21],
                    [26, 22],
                    [9, 23],
                    [12, 24],
                    [14, 23],
                    [16, 25],
                    [18, 24],
                    [20, 26],
                    [23, 24],
                    [25, 26],
                    [27, 24],
                    [10, 26],
                    [13, 27],
                    [15, 26],
                    [17, 27],
                    [21, 26],
                    [24, 27],
                  ].map(([x, y]) => (
                    <rect key={`d${x}-${y}`} x={x} y={y} width="1.7" height="1.7" rx="0.5" />
                  ))}
                </g>
              </svg>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-ink-400">
              <Icon d={P.refresh} className="h-3.5 w-3.5" />
              <span className="text-[12px] tabular-nums">განახლდება 0:47-ში</span>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-[22px] bg-ink-950 px-4 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-white">Nino Kapanadze</p>
                <p className="mt-1 text-[12px] text-ink-400">
                  Premium · წევრის ID <span className="font-mono tabular-nums">FC-4821</span>
                </p>
              </div>
              <span className="shrink-0 rounded-pill bg-brand-300 px-3 py-1 text-[11px] font-bold text-ink-950">
                აქტიური
              </span>
            </div>

            <button
              type="button"
              onClick={() => setQrOpen(false)}
              className={`mt-5 h-[52px] w-full ${CUT_MD} bg-brand-300 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
            >
              მზადაა
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
