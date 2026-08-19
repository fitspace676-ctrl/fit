// @page: Member Portal
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore Member Portal — მთავარი
   apps/web/app/[locale]/member/(member)/home/page.tsx
   ---------------------------------------------------------------------------
   The signed-in member's dashboard. Shell from member-header.tsx + nav-items.ts
   (Home · Classes · Bookings · Trainer · Shop · Membership). Data shapes are the
   real ones the page fetches: MemberBookingHistoryEntry, ClassInstanceCard,
   ProductSummary, credit packs. Content from prisma/seed.ts (Downtown Strength,
   Nino Kapanadze on Premium, CLASS_TYPES + DEMO_TODAY_CLASSES, DEMO_TRAINERS,
   DEMO_PRODUCTS in GEL minor units). Copy verbatim from @fit/i18n ka.json.
   Art direction "Lime Block" — now in two themes, switched live in the header.
   ========================================================================== */

const P = {
  bolt: 'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3Z',
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h4v-6h3v6h4a1 1 0 0 0 1-1V9.5',
  calendar:
    'M7 3v3M17 3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.2 2',
  dumbbell: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  bag: 'M6 8h12l1 12.5H5L6 8ZM9 8V6a3 3 0 0 1 6 0v2',
  ticket:
    'M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2 2 0 0 0 0-4v-2ZM14 7v10',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  bell: 'M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10ZM10 19a2 2 0 0 0 4 0',
  qr: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2.5v2.5H14V14ZM20 14v6h-3.5M17 20h-.5',
  arrow: 'M7 17 17 7M9 7h8v8',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 5v6h-6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3',
  moon: 'M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z',
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

/* ------------------------------- the themes -------------------------------
   Same "Lime Block" direction in both: neutral canvas, lime used once. Class
   blocks are plain surfaces — only the neutral ramp inverts between themes. */

/* The signature shape: every corner cut on the diagonal. One silhouette, six
   sizes — the whole page speaks it, from the 7px badge to the 30px block. */
const CUT_XS =
  '[clip-path:polygon(7px_0,calc(100%_-_7px)_0,100%_7px,100%_calc(100%_-_7px),calc(100%_-_7px)_100%,7px_100%,0_calc(100%_-_7px),0_7px)]';
const CUT_SM =
  '[clip-path:polygon(9px_0,calc(100%_-_9px)_0,100%_9px,100%_calc(100%_-_9px),calc(100%_-_9px)_100%,9px_100%,0_calc(100%_-_9px),0_9px)]';
const CUT_MD =
  '[clip-path:polygon(11px_0,calc(100%_-_11px)_0,100%_11px,100%_calc(100%_-_11px),calc(100%_-_11px)_100%,11px_100%,0_calc(100%_-_11px),0_11px)]';
const CUT_TILE =
  '[clip-path:polygon(14px_0,calc(100%_-_14px)_0,100%_14px,100%_calc(100%_-_14px),calc(100%_-_14px)_100%,14px_100%,0_calc(100%_-_14px),0_14px)]';
const CUT_PANEL =
  '[clip-path:polygon(22px_0,calc(100%_-_22px)_0,100%_22px,100%_calc(100%_-_22px),calc(100%_-_22px)_100%,22px_100%,0_calc(100%_-_22px),0_22px)]';
const CUT_LG =
  '[clip-path:polygon(30px_0,calc(100%_-_30px)_0,100%_30px,100%_calc(100%_-_30px),calc(100%_-_30px)_100%,30px_100%,0_calc(100%_-_30px),0_30px)]';

const THEME = {
  dark: {
    page: 'bg-ink-950 text-white',
    header: 'border-ink-900 bg-ink-950/95',
    ring: 'focus-visible:ring-brand-300',
    navIdle: 'text-ink-400 hover:bg-ink-900 hover:text-white',
    field: 'border-transparent bg-ink-900 text-white placeholder:text-ink-500',
    iconBtn: 'border-transparent bg-ink-900 text-ink-300 hover:text-white',
    dotRing: 'ring-ink-950',
    seg: 'border-transparent bg-ink-900',
    segIdle: 'text-ink-500 hover:text-white',
    panel: 'border-transparent bg-ink-900',
    shadow: '',
    tile: 'bg-ink-950',
    tileHover: 'hover:bg-ink-800',
    menu: 'border-transparent bg-ink-900',
    rule: 'border-ink-800',
    menuItem: 'text-ink-300 hover:bg-ink-800 hover:text-white',
    danger: 'text-danger-400 hover:bg-danger-500/10',
    title: 'text-white',
    muted: 'text-ink-400',
    faint: 'text-ink-500',
    dim: 'text-ink-600',
    ghost: 'bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-white',
    quiet: 'text-ink-400 hover:text-white',
    wait: 'bg-ink-800 text-ink-200',
    brandText: 'text-brand-300',
    brandLink: 'text-brand-300 hover:text-brand-200',
    scrim: 'bg-ink-950/85',
    tabbar: 'border-ink-800 bg-ink-950',
    tabIdle: 'text-ink-500 hover:text-white',
    card: 'border-ink-800 bg-ink-900',
    cta: 'bg-brand-300 text-ink-950 hover:bg-brand-200',
    ctaOn: 'bg-brand-950 text-brand-200 ring-1 ring-inset ring-brand-800 hover:bg-brand-900',
    ctaOff: 'bg-ink-800 text-ink-200 hover:bg-ink-700',
    avatarRing: 'ring-ink-700',
  },
  light: {
    page: 'bg-ink-100 text-ink-950',
    header: 'border-ink-200 bg-ink-100/95',
    ring: 'focus-visible:ring-ink-950',
    navIdle: 'text-ink-500 hover:bg-ink-200 hover:text-ink-950',
    field: 'border-ink-200 bg-white text-ink-950 placeholder:text-ink-400',
    iconBtn: 'border-ink-200 bg-white text-ink-600 hover:text-ink-950',
    dotRing: 'ring-white',
    seg: 'border-ink-200 bg-white',
    segIdle: 'text-ink-500 hover:text-ink-950',
    panel: 'border-ink-200 bg-white',
    shadow: 'shadow-xs',
    tile: 'border border-ink-200 bg-ink-50',
    tileHover: 'hover:bg-ink-100',
    menu: 'border-ink-200 bg-white',
    rule: 'border-ink-200',
    menuItem: 'text-ink-600 hover:bg-ink-50 hover:text-ink-950',
    danger: 'text-danger-600 hover:bg-danger-50',
    title: 'text-ink-950',
    muted: 'text-ink-600',
    faint: 'text-ink-500',
    dim: 'text-ink-500',
    ghost: 'bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-950',
    quiet: 'text-ink-500 hover:text-ink-950',
    wait: 'bg-ink-200 text-ink-700',
    brandText: 'text-brand-700',
    brandLink: 'text-brand-700 hover:text-brand-800',
    scrim: 'bg-ink-950/50',
    tabbar: 'border-ink-200 bg-white',
    tabIdle: 'text-ink-500 hover:text-ink-950',
    card: 'border-ink-200 bg-white',
    cta: 'bg-brand-300 text-ink-950 hover:bg-brand-400',
    ctaOn: 'bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-300 hover:bg-brand-200',
    ctaOff: 'bg-ink-200 text-ink-700 hover:bg-ink-300',
    avatarRing: 'ring-ink-200',
  },
};

/* -------------------------------- real data ------------------------------- */

const money = (minor: number) => `${(minor / 100).toFixed(2).replace('.', ',')} ₾`;

type Instance = {
  id: string;
  title: string;
  category: string;
  color: string;
  time: string;
  day: string;
  minutes: number;
  trainerName: string;
  locationName: string;
  capacity: number;
  bookedCount: number;
  status: null | 'BOOKED' | 'WAITLIST';
  position?: number;
};

const WEEK: Instance[] = [
  {
    id: 'c1',
    title: 'Morning Yoga',
    category: 'Yoga Flow',
    color: '#DCDCDA',
    time: '08:00',
    day: 'ხუთ',
    minutes: 75,
    trainerName: 'Ana G.',
    locationName: 'Studio A',
    capacity: 20,
    bookedCount: 14,
    status: null,
  },
  {
    id: 'c2',
    title: 'CrossFit WOD',
    category: 'CrossFit',
    color: '#C4C4C1',
    time: '12:00',
    day: 'ხუთ',
    minutes: 60,
    trainerName: 'Levan M.',
    locationName: 'Main Floor',
    capacity: 14,
    bookedCount: 14,
    status: 'WAITLIST',
    position: 2,
  },
  {
    id: 'c3',
    title: 'Spin Express',
    category: 'Spin',
    color: '#8F8F8B',
    time: '18:00',
    day: 'ხუთ',
    minutes: 45,
    trainerName: 'Sandro K.',
    locationName: 'Main Floor',
    capacity: 24,
    bookedCount: 20,
    status: 'BOOKED',
  },
  {
    id: 'c4',
    title: 'Boxing Basics',
    category: 'Boxing',
    color: '#6C6C68',
    time: '19:00',
    day: 'ხუთ',
    minutes: 60,
    trainerName: 'Nika B.',
    locationName: 'Main Floor',
    capacity: 12,
    bookedCount: 7,
    status: null,
  },
  {
    id: 'c5',
    title: 'Pilates',
    category: 'Pilates',
    color: '#B0B0AD',
    time: '10:00',
    day: 'პარ',
    minutes: 50,
    trainerName: 'Ana G.',
    locationName: 'Studio A',
    capacity: 18,
    bookedCount: 6,
    status: null,
  },
];

const PRODUCTS = [
  { id: 'p1', name: 'Whey Protein 1kg', minor: 8900, variants: 2, initial: 'W' },
  { id: 'p2', name: 'Branded Training Tee', minor: 4500, variants: 4, initial: 'T' },
  { id: 'p3', name: 'Resistance Bands Set', minor: 3900, variants: 0, initial: 'R' },
  { id: 'p4', name: 'Insulated Shaker Bottle', minor: 2500, variants: 0, initial: 'S' },
];

const TRAINERS = [
  {
    id: 't1',
    name: 'Ana G.',
    teaches: 'Yoga Flow · Pilates',
    img: 'https://i.pravatar.cc/160?img=47',
  },
  { id: 't2', name: 'Levan M.', teaches: 'CrossFit', img: 'https://i.pravatar.cc/160?img=12' },
  { id: 't3', name: 'Sandro K.', teaches: 'Spin', img: 'https://i.pravatar.cc/160?img=13' },
  { id: 't4', name: 'Nika B.', teaches: 'Boxing', img: 'https://i.pravatar.cc/160?img=15' },
];

/** `NAV_ITEMS` from src/components/member/nav-items.ts. */
const NAV = [
  { key: 'home', label: 'მთავარი', icon: P.home },
  { key: 'classes', label: 'გაკვეთილები', icon: P.calendar },
  { key: 'bookings', label: 'ჯავშნები', icon: P.clock },
  { key: 'trainer', label: 'მწვრთნელი', icon: P.dumbbell },
  { key: 'shop', label: 'მაღაზია', icon: P.bag },
  { key: 'membership', label: 'აბონემენტი', icon: P.ticket },
];

export default function WebMemberHome() {
  const [mode, setMode] = useState<'dark' | 'light'>('light');
  const [nav, setNav] = useState('home');
  const [qrOpen, setQrOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [bookings, setBookings] = useState<Record<string, Instance['status']>>(
    Object.fromEntries(WEEK.map((c) => [c.id, c.status])),
  );

  const t = THEME[mode];

  const toggle = (c: Instance) =>
    setBookings((b) => ({
      ...b,
      [c.id]: b[c.id] ? null : c.bookedCount >= c.capacity ? 'WAITLIST' : 'BOOKED',
    }));

  const upcoming = WEEK.filter((c) => bookings[c.id]);

  return (
    <div
      className={`relative w-full pb-28 font-sans transition-colors duration-300 lg:pb-16 ${t.page}`}
    >
      {/* ================================ header =============================== */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur ${t.header}`}>
        <div className="mx-auto flex h-20 max-w-[1180px] items-center gap-6 px-6 lg:px-10">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className={`flex shrink-0 items-center gap-2.5 ${CUT_XS} focus:outline-none focus-visible:ring-2 ${t.ring}`}
          >
            <span
              className={`grid h-10 w-10 place-items-center ${CUT_XS} bg-brand-300 text-ink-950`}
            >
              <Icon d={P.bolt} className="h-5 w-5" />
            </span>
            <span className="text-[19px] font-extrabold tracking-tight">FormaCore</span>
          </a>

          {/* primary nav */}
          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {NAV.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => setNav(n.key)}
                aria-current={nav === n.key ? 'page' : undefined}
                className={`flex h-10 items-center gap-2 ${CUT_SM} px-4 text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 ${t.ring} ${
                  nav === n.key ? 'bg-brand-300 text-ink-950' : t.navIdle
                }`}
              >
                <Icon d={n.icon} className="h-[17px] w-[17px]" />
                {n.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <label className="relative hidden xl:block">
              <span className="sr-only">მოძებნე გაკვეთილი, მწვრთნელი…</span>
              <span
                className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${t.faint}`}
              >
                <Icon d={P.search} className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="მოძებნე გაკვეთილი, მწვრთნელი…"
                className={`h-10 w-56 ${CUT_SM} border pl-10 pr-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500 ${t.field}`}
              />
            </label>

            {/* theme switch — the light-mode test */}
            <div className={`flex h-10 items-center ${CUT_SM} border p-1 ${t.seg}`}>
              {(
                [
                  { key: 'dark', icon: P.moon, label: 'მუქი თემა' },
                  { key: 'light', icon: P.sun, label: 'ღია თემა' },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  aria-pressed={mode === m.key}
                  aria-label={m.label}
                  title={m.label}
                  className={`grid h-8 w-8 place-items-center ${CUT_XS} transition-colors focus:outline-none focus-visible:ring-2 ${t.ring} ${
                    mode === m.key ? 'bg-brand-300 text-ink-950' : t.segIdle
                  }`}
                >
                  <Icon d={m.icon} className="h-[17px] w-[17px]" />
                </button>
              ))}
            </div>

            <button
              type="button"
              aria-label="შეტყობინებები"
              className={`relative grid h-10 w-10 place-items-center ${CUT_XS} border transition-colors focus:outline-none focus-visible:ring-2 ${t.ring} ${t.iconBtn}`}
            >
              <Icon d={P.bell} className="h-[18px] w-[18px]" />
              <span
                className={`absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-500 ring-2 ${t.dotRing}`}
              />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
                aria-label="პროფილი"
                className={`block ${CUT_XS} ring-2 ring-brand-300 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 ${t.ring}`}
              >
                <img
                  src="https://i.pravatar.cc/160?img=45"
                  alt="Nino Kapanadze"
                  width={40}
                  height={40}
                  referrerPolicy="no-referrer"
                  className={`h-10 w-10 ${CUT_XS} object-cover`}
                />
              </button>

              {accountOpen ? (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setAccountOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div
                    className={`absolute right-0 z-50 mt-3 w-60 overflow-hidden ${CUT_TILE} border py-2 shadow-float ${t.menu}`}
                  >
                    <div className="px-4 pb-3 pt-2">
                      <p className={`text-[14px] font-bold ${t.title}`}>Nino Kapanadze</p>
                      <p className={`mt-0.5 text-[12px] ${t.muted}`}>Premium · Downtown Strength</p>
                    </div>
                    <div className={`border-t ${t.rule}`} />
                    {['პროფილის ნახვა', 'ჯავშნები', 'ბილინგი'].map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setAccountOpen(false)}
                        className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-semibold transition-colors ${t.menuItem}`}
                      >
                        {label}
                      </button>
                    ))}
                    <div className={`my-1 border-t ${t.rule}`} />
                    <button
                      type="button"
                      onClick={() => setAccountOpen(false)}
                      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-semibold transition-colors ${t.danger}`}
                    >
                      გასვლა
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 pt-10 lg:px-10">
        {/* ------------------------------ greeting ------------------------------ */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${t.faint}`}>
              ხუთშაბათი, 6 აგვისტო · Downtown Strength
            </p>
            <h1 className="mt-3 text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[38px] sm:leading-none">
              კეთილი დაბრუნება, Nino
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className={`flex h-12 items-center gap-2.5 ${CUT_MD} bg-brand-300 px-6 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-400 focus:outline-none focus-visible:ring-2 ${t.ring}`}
          >
            <Icon d={P.qr} className="h-[18px] w-[18px]" />
            გამოცხადების QR
          </button>
        </div>

        {/* -------------------------------- hero -------------------------------- */}
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_1.4fr]">
          {/* membership — GET /me/subscription */}
          <section
            className={`relative overflow-hidden ${CUT_LG} bg-brand-300 p-6 text-ink-950 sm:p-7`}
          >
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-800">
                  აბონემენტი
                </span>
                <span
                  className={`${CUT_XS} bg-ink-950 px-3 py-1 text-[11px] font-bold text-brand-300`}
                >
                  აქტიური
                </span>
              </div>

              <p className="mt-6 text-[44px] font-extrabold uppercase leading-none tracking-tight">
                Premium
              </p>
              <p className="mt-3 text-[14px] font-medium text-ink-800">
                Nino Kapanadze · <span className="font-mono tabular-nums">FC-4821</span>
              </p>
              <p className="mt-5 max-w-sm text-[14px] font-medium leading-relaxed text-ink-800">
                შეუზღუდავი გაკვეთილები · 1 სტუმარი / თვე · −10% მაღაზია
              </p>

              <div className="mt-auto pt-8">
                <div className="flex items-end justify-between gap-4">
                  <p className="whitespace-nowrap font-mono text-[13px] font-semibold tabular-nums text-ink-800">
                    22 / 30 დღე დარჩა
                  </p>
                  <p className="font-mono text-[13px] font-semibold tabular-nums text-ink-800">
                    73%
                  </p>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-pill bg-ink-950/15">
                  <div className="h-full rounded-pill bg-ink-950" style={{ width: '73%' }} />
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`h-11 ${CUT_MD} bg-ink-950 px-6 text-[14px] font-bold text-brand-300 transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950`}
                  >
                    გეგმის მართვა
                  </button>
                  <button
                    type="button"
                    className={`h-11 ${CUT_MD} bg-ink-950/10 px-6 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-ink-950/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950`}
                  >
                    ჩემი ჯავშნები
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* upcoming bookings — the member's BOOKED / WAITLIST entries */}
          <section className={`${CUT_PANEL} border p-6 sm:p-7 ${t.panel} ${t.shadow}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[22px] font-extrabold tracking-tight">მომავალი ჯავშნები</h2>
              <button
                type="button"
                className={`text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors ${t.quiet}`}
              >
                ყველა
              </button>
            </div>

            {upcoming.length === 0 ? (
              <div className="py-14 text-center">
                <p className={`text-[16px] font-bold ${t.title}`}>
                  გაკვეთილი ჯერ არ გაქვს დაჯავშნილი
                </p>
                <p className={`mt-2 text-[13px] ${t.muted}`}>
                  აირჩიე გაკვეთილი ამ კვირის განრიგიდან და დაიწყე.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-2.5">
                {upcoming.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 ${CUT_TILE} p-4 sm:gap-5 ${t.tile}`}
                  >
                    <div className="w-12 shrink-0 text-center sm:w-14">
                      <p
                        className={`font-mono text-[19px] font-bold leading-none tabular-nums ${t.title}`}
                      >
                        {c.time}
                      </p>
                      <p
                        className={`mt-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.dim}`}
                      >
                        {c.day}
                      </p>
                    </div>
                    <div
                      className="min-w-0 flex-1 border-l-2 pl-4 sm:pl-5"
                      style={{ borderColor: c.color }}
                    >
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <p className={`truncate text-[17px] font-bold ${t.title}`}>{c.title}</p>
                        <span
                          className={`shrink-0 whitespace-nowrap ${CUT_XS} px-2.5 py-0.5 text-[11px] font-bold ${
                            bookings[c.id] === 'BOOKED' ? 'bg-brand-300 text-ink-950' : t.wait
                          }`}
                        >
                          {bookings[c.id] === 'BOOKED'
                            ? 'დადასტურებული'
                            : `მოლოდინი · #${c.position ?? 1}`}
                        </span>
                      </div>
                      <p className={`mt-1.5 truncate text-[13px] ${t.muted}`}>
                        {c.trainerName} · {c.locationName} · {c.minutes} წთ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      className={`hidden shrink-0 ${CUT_SM} px-4 py-2 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 sm:block ${t.ring} ${t.ghost}`}
                    >
                      გაუქმება
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* counters — computed from the bookings query, as the page does */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { v: '18', s: '', l: 'დღის სერია' },
                { v: '24', s: '', l: 'გამოცხადება' },
                { v: '2', s: '/3', l: 'PT კრედიტი' },
              ].map((s) => (
                <div key={s.l} className={`min-w-0 ${CUT_TILE} p-4 sm:p-5 ${t.tile}`}>
                  <p
                    className={`font-mono text-[28px] font-bold leading-none tabular-nums sm:text-[32px] ${t.title}`}
                  >
                    {s.v}
                    {s.s ? <span className={`text-[16px] ${t.faint}`}>{s.s}</span> : null}
                  </p>
                  <p
                    className={`mt-3 truncate text-[10px] font-semibold uppercase tracking-normal sm:tracking-[0.14em] ${t.faint}`}
                  >
                    {s.l}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ---------------------------- this week ------------------------------- */}
        <section className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[26px] font-extrabold tracking-tight">დაჯავშნე გაკვეთილი</h2>
            <button
              type="button"
              className={`flex items-center gap-1.5 text-[13px] font-semibold transition-colors ${t.brandLink}`}
            >
              მთელი განრიგი
              <Icon d={P.chevron} className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WEEK.map((c) => {
              const status = bookings[c.id];
              const spotsLeft = c.capacity - c.bookedCount;
              const full = spotsLeft <= 0;
              return (
                <article
                  key={c.id}
                  className={`relative overflow-hidden ${CUT_PANEL} border ${t.card} ${t.title} ${t.shadow}`}
                >
                  <div className="relative p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span
                            className={`whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] ${t.muted}`}
                          >
                            {c.category}
                          </span>
                        </div>
                        <h3 className="mt-3 text-[24px] font-extrabold leading-[1.05] tracking-tight">
                          {c.title}
                        </h3>
                      </div>
                      <div
                        className={`grid h-16 w-16 shrink-0 place-items-center ${CUT_SM} border ${t.tile} ${t.title}`}
                      >
                        <div className="text-center">
                          <p className="font-mono text-[17px] font-bold leading-none tabular-nums">
                            {c.minutes}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold">წთ</p>
                        </div>
                      </div>
                    </div>

                    <p className={`mt-3 text-[13px] font-medium ${t.muted}`}>
                      <span className="font-mono tabular-nums">
                        {c.day} {c.time}
                      </span>{' '}
                      · {c.trainerName} · {c.locationName}
                    </p>

                    <div className="mt-5 flex items-center gap-2">
                      <span
                        className={`whitespace-nowrap ${CUT_SM} px-3 py-1.5 text-[12px] font-semibold tabular-nums ${t.wait}`}
                      >
                        {full ? 'შევსებულია' : `${spotsLeft} ადგილი დარჩა`}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={`${CUT_SM} px-4 py-1.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 ${t.ring} ${
                          status === 'BOOKED' ? t.ctaOn : status === 'WAITLIST' ? t.ctaOff : t.cta
                        }`}
                      >
                        {status === 'BOOKED'
                          ? 'დაჯავშნილია'
                          : status === 'WAITLIST'
                            ? `მოლოდინი · #${c.position ?? 1}`
                            : full
                              ? 'მოლოდინის სიაში ჩაწერა'
                              : 'დაჯავშნა'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ------------------------- trainers + shop ---------------------------- */}
        <div className="mt-12 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <section className={`${CUT_PANEL} border p-6 sm:p-7 ${t.panel} ${t.shadow}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[22px] font-extrabold tracking-tight">მწვრთნელები</h2>
              <button
                type="button"
                className={`shrink-0 whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors ${t.quiet}`}
              >
                ყველა
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {TRAINERS.map((tr) => (
                <div key={tr.id} className={`flex items-center gap-3.5 ${CUT_TILE} p-4 ${t.tile}`}>
                  <img
                    src={tr.img}
                    alt={tr.name}
                    width={52}
                    height={52}
                    referrerPolicy="no-referrer"
                    className={`h-[52px] w-[52px] shrink-0 ${CUT_SM} object-cover ring-2 ${t.avatarRing}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[15px] font-bold ${t.title}`}>{tr.name}</p>
                    <p className={`mt-0.5 truncate text-[12px] ${t.muted}`}>{tr.teaches}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${tr.name} · სესიის დაჯავშნა`}
                    className={`grid h-10 w-10 shrink-0 place-items-center ${CUT_XS} transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 ${t.ring} ${t.cta}`}
                  >
                    <Icon d={P.arrow} className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={`${CUT_PANEL} border p-6 sm:p-7 ${t.panel} ${t.shadow}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-[22px] font-extrabold tracking-tight">მაღაზია</h2>
              <span
                className={`${CUT_XS} bg-brand-300 px-3 py-1 text-[11px] font-bold text-ink-950`}
              >
                −10%
              </span>
            </div>
            <div className="mt-5 space-y-2.5">
              {PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`flex w-full items-center gap-3.5 ${CUT_TILE} p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 ${t.ring} ${t.tile} ${t.tileHover}`}
                >
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center ${CUT_XS} ${t.wait}`}
                  >
                    <span className="font-mono text-[20px] font-bold opacity-80">{p.initial}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] font-semibold ${t.title}`}>
                      {p.name}
                    </span>
                    <span className={`mt-0.5 block text-[12px] ${t.faint}`}>
                      {p.variants > 0 ? `${p.variants} ვარიანტი` : 'ერთი ვარიანტი'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 whitespace-nowrap font-mono text-[13px] font-bold tabular-nums ${t.brandText}`}
                  >
                    {p.variants > 1 ? `${money(p.minor)}-დან` : money(p.minor)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* ================================ QR modal ============================== */}
      {qrOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setQrOpen(false)}
            className={`absolute inset-0 ${t.scrim}`}
          />
          <div
            className={`relative w-full max-w-[420px] ${CUT_PANEL} border p-7 shadow-float ${t.menu}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[24px] font-extrabold tracking-tight ${t.title}`}>ჩექ-ინი</p>
                <p className={`mt-1.5 text-[13px] ${t.muted}`}>აჩვენე ეს კოდი მიმღების სკანერს.</p>
              </div>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setQrOpen(false)}
                className={`grid h-10 w-10 shrink-0 place-items-center ${CUT_XS} transition-colors focus:outline-none focus-visible:ring-2 ${t.ring} ${t.ghost}`}
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            <div className={`mx-auto mt-6 w-56 ${CUT_TILE} bg-brand-300 p-5`}>
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

            <div className={`mt-5 flex items-center justify-center gap-2 ${t.muted}`}>
              <Icon d={P.refresh} className="h-3.5 w-3.5" />
              <span className="text-[12px] tabular-nums">განახლდება 0:47-ში</span>
            </div>

            <div
              className={`mt-5 flex items-center justify-between ${CUT_TILE} px-5 py-4 ${t.tile}`}
            >
              <div className="min-w-0">
                <p className={`truncate text-[15px] font-bold ${t.title}`}>Nino Kapanadze</p>
                <p className={`mt-1 text-[12px] ${t.muted}`}>
                  Premium · წევრის ID <span className="font-mono tabular-nums">FC-4821</span>
                </p>
              </div>
              <span
                className={`shrink-0 ${CUT_XS} bg-brand-300 px-3 py-1 text-[11px] font-bold text-ink-950`}
              >
                აქტიური
              </span>
            </div>

            <button
              type="button"
              onClick={() => setQrOpen(false)}
              className={`mt-5 flex h-[52px] w-full items-center justify-center gap-2 ${CUT_MD} bg-brand-300 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-400 focus:outline-none focus-visible:ring-2 ${t.ring}`}
            >
              <Icon d={P.check} className="h-[18px] w-[18px]" />
              მზადაა
            </button>
          </div>
        </div>
      ) : null}
      {/* ------------------- mobile tab bar — MobileTabBar.tsx ------------------ */}
      <nav className={`absolute inset-x-0 bottom-0 z-30 border-t lg:hidden ${t.tabbar}`}>
        <ul className="mx-auto flex max-w-md items-stretch justify-around gap-0.5 px-2 pb-2 pt-1.5">
          {NAV.map((n) => {
            const tabActive = n.key === 'home';
            return (
              <li key={n.key} className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-current={tabActive ? 'page' : undefined}
                  className={`flex w-full flex-col items-center gap-1 ${CUT_XS} px-0.5 py-2 text-[9px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 ${t.ring} ${
                    tabActive ? 'bg-brand-300 text-ink-950' : t.tabIdle
                  }`}
                >
                  <Icon d={n.icon} className="h-[19px] w-[19px] shrink-0" />
                  <span className="w-full truncate text-center">{n.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
