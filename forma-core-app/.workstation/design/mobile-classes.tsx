// @device: mobile
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore mobile — გაკვეთილები · app/(tabs)/classes/index.tsx
   "Lime Block" art direction. Data from prisma/seed.ts (CLASS_TYPES,
   DEMO_TODAY_CLASSES, DEMO_TRAINERS, DEMO_LOCATIONS), copy verbatim from
   @fit/i18n ka.json (member.classes.*, classes.filters.*).
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
  filter: 'M4 6h16M7 12h10M10 18h4',
  close: 'm6 6 12 12M18 6 6 18',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12.5 4.5 4.5L19 7',
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

/* -------------------------------- real data ------------------------------- */

type Instance = {
  id: string;
  title: string;
  category: string;
  color: string;
  time: string;
  /** 0 = Mon … 6 = Sun, matching `startOfWeek()` in lib/classes.ts. */
  dayIndex: number;
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
    id: 'w1',
    title: 'Morning Yoga',
    category: 'Yoga Flow',
    color: '#DCDCDA',
    time: '08:00',
    dayIndex: 3,
    minutes: 75,
    trainerName: 'Ana G.',
    locationName: 'Studio A',
    capacity: 20,
    bookedCount: 14,
    status: null,
  },
  {
    id: 'w2',
    title: 'CrossFit WOD',
    category: 'CrossFit',
    color: '#C4C4C1',
    time: '12:00',
    dayIndex: 3,
    minutes: 60,
    trainerName: 'Levan M.',
    locationName: 'Main Floor',
    capacity: 14,
    bookedCount: 14,
    status: 'WAITLIST',
    position: 2,
  },
  {
    id: 'w3',
    title: 'Spin Express',
    category: 'Spin',
    color: '#8F8F8B',
    time: '18:00',
    dayIndex: 3,
    minutes: 45,
    trainerName: 'Sandro K.',
    locationName: 'Main Floor',
    capacity: 24,
    bookedCount: 20,
    status: 'BOOKED',
  },
  {
    id: 'w4',
    title: 'Boxing Basics',
    category: 'Boxing',
    color: '#6C6C68',
    time: '19:00',
    dayIndex: 3,
    minutes: 60,
    trainerName: 'Nika B.',
    locationName: 'Main Floor',
    capacity: 12,
    bookedCount: 7,
    status: null,
  },
  {
    id: 'w5',
    title: 'Pilates',
    category: 'Pilates',
    color: '#B0B0AD',
    time: '10:00',
    dayIndex: 4,
    minutes: 50,
    trainerName: 'Ana G.',
    locationName: 'Studio A',
    capacity: 18,
    bookedCount: 6,
    status: null,
  },
  {
    id: 'w6',
    title: 'Boxing',
    category: 'Boxing',
    color: '#6C6C68',
    time: '20:00',
    dayIndex: 4,
    minutes: 60,
    trainerName: 'Nika B.',
    locationName: 'Main Floor',
    capacity: 16,
    bookedCount: 11,
    status: null,
  },
];

/** Mon-first week, matching `startOfWeek()`. */
const DAYS = [
  { i: 0, label: 'ორშ', date: 3 },
  { i: 1, label: 'სამ', date: 4 },
  { i: 2, label: 'ოთხ', date: 5 },
  { i: 3, label: 'ხუთ', date: 6 },
  { i: 4, label: 'პარ', date: 7 },
  { i: 5, label: 'შაბ', date: 8 },
  { i: 6, label: 'კვი', date: 9 },
];

const CATS = ['ყველა', 'Yoga Flow', 'CrossFit', 'Spin', 'Boxing', 'Pilates'];
const TRAINERS = ['ყველა მწვრთნელი', 'Ana G.', 'Levan M.', 'Sandro K.', 'Nika B.'];
const LOCATIONS = ['ყველა ლოკაცია', 'Main Floor', 'Studio A'];

/** `classes.filters.morning | afternoon | evening` — the app's own buckets. */
const PERIODS = [
  { key: 'morning', label: 'დილა', from: 0, to: 12 },
  { key: 'afternoon', label: 'დღე', from: 12, to: 17 },
  { key: 'evening', label: 'საღამო', from: 17, to: 24 },
];

const CARD = 'border border-ink-800 bg-ink-900 text-white';

export default function MobileClasses() {
  const [day, setDay] = useState(3);
  const [cat, setCat] = useState('ყველა');
  const [trainer, setTrainer] = useState(TRAINERS[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bookings, setBookings] = useState<Record<string, Instance['status']>>(
    Object.fromEntries(WEEK.map((c) => [c.id, c.status])),
  );

  const activeFilters =
    (cat !== 'ყველა' ? 1 : 0) +
    (trainer !== TRAINERS[0] ? 1 : 0) +
    (location !== LOCATIONS[0] ? 1 : 0);

  const forDay = WEEK.filter(
    (c) =>
      c.dayIndex === day &&
      (cat === 'ყველა' || c.category === cat) &&
      (trainer === TRAINERS[0] || c.trainerName === trainer) &&
      (location === LOCATIONS[0] || c.locationName === location),
  );

  const toggle = (c: Instance) =>
    setBookings((b) => ({
      ...b,
      [c.id]: b[c.id] ? null : c.bookedCount >= c.capacity ? 'WAITLIST' : 'BOOKED',
    }));

  const clearFilters = () => {
    setCat('ყველა');
    setTrainer(TRAINERS[0]);
    setLocation(LOCATIONS[0]);
  };

  return (
    <div className="relative min-h-[900px] w-full bg-ink-950 pb-32 font-sans text-white">
      {/* ------------------------------- app bar ---------------------------- */}
      <header className="flex items-end justify-between px-5 pb-5 pt-14">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            აგვისტო 2026
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-none tracking-tight">
            გაკვეთილები
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label="გაკვეთილების ფილტრი"
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
            activeFilters > 0
              ? 'bg-brand-300 text-ink-950'
              : 'bg-ink-900 text-ink-200 hover:bg-ink-800'
          }`}
        >
          <Icon d={P.filter} className="h-[19px] w-[19px]" />
          {activeFilters > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-300 font-mono text-[10px] font-bold text-ink-950 ring-2 ring-ink-950">
              {activeFilters}
            </span>
          ) : null}
        </button>
      </header>

      {/* ------------------------------ week strip -------------------------- */}
      <div className="flex gap-1.5 overflow-x-auto px-5 pb-1">
        {DAYS.map((d) => {
          const count = WEEK.filter((c) => c.dayIndex === d.i).length;
          const active = day === d.i;
          return (
            <button
              key={d.i}
              type="button"
              onClick={() => setDay(d.i)}
              aria-pressed={active}
              className={`flex h-[76px] w-[50px] shrink-0 flex-col items-center justify-center gap-1 rounded-[22px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                active ? 'bg-brand-300 text-ink-950' : 'bg-ink-900 text-ink-300 hover:bg-ink-800'
              }`}
            >
              <span className="text-[11px] font-semibold">{d.label}</span>
              <span className="font-mono text-[19px] font-bold leading-none tabular-nums">
                {d.date}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  count === 0 ? 'bg-transparent' : active ? 'bg-ink-950' : 'bg-ink-600'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* --------------------------- category capsule ----------------------- */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`h-11 shrink-0 ${CUT_SM} px-5 text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
              cat === c
                ? 'bg-white text-ink-950'
                : 'bg-ink-900 text-ink-300 hover:bg-ink-800 hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* ------------------------------ the day ----------------------------- */}
      <div className="mt-6 space-y-7 px-5">
        {forDay.length === 0 ? (
          <div className="rounded-[30px] bg-ink-900 px-6 py-12 text-center">
            <p className="text-[18px] font-bold text-white">
              {activeFilters > 0
                ? 'ფილტრებს გაკვეთილი არ შეესაბამება'
                : 'ამ დღეს გაკვეთილები არ არის'}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
              {activeFilters > 0
                ? 'მოხსენი ფილტრი ან აირჩიე სხვა კვირა.'
                : 'სცადეთ სხვა დღე ან ფილტრი.'}
            </p>
            {activeFilters > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className={`mt-5 h-11 ${CUT_SM} bg-brand-300 px-6 text-[14px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
              >
                ფილტრების გასუფთავება
              </button>
            ) : null}
          </div>
        ) : (
          PERIODS.map((p) => {
            const items = forDay.filter((c) => {
              const h = Number(c.time.slice(0, 2));
              return h >= p.from && h < p.to;
            });
            if (items.length === 0) return null;
            return (
              <section key={p.key}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                    {p.label}
                  </h2>
                  <span className="h-px flex-1 bg-ink-800" />
                  <span className="font-mono text-[12px] tabular-nums text-ink-600">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {items.map((c) => {
                    const status = bookings[c.id];
                    const spotsLeft = c.capacity - c.bookedCount;
                    const full = spotsLeft <= 0;
                    return (
                      <article
                        key={c.id}
                        className={`relative overflow-hidden rounded-[30px] ${CARD}`}
                      >
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
                            <span className="font-mono tabular-nums">{c.time}</span> ·{' '}
                            {c.trainerName} · {c.locationName}
                          </p>

                          <div className="mt-4 flex items-center gap-2">
                            <span className="rounded-pill bg-ink-800 px-3 py-1.5 text-[12px] font-semibold tabular-nums text-ink-200">
                              {full ? 'შევსებულია' : `${spotsLeft} ადგილი დარჩა`}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggle(c)}
                              className={`${CUT_SM} px-4 py-1.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                                status === 'BOOKED'
                                  ? 'bg-brand-950 text-brand-200 ring-1 ring-inset ring-brand-800 hover:bg-brand-900'
                                  : status === 'WAITLIST'
                                    ? 'bg-ink-800 text-ink-200 hover:bg-ink-700'
                                    : 'bg-brand-300 text-ink-950 hover:bg-brand-200'
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
            );
          })
        )}
      </div>

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
            const active = t.key === 'classes';
            return (
              <button
                key={t.key}
                type="button"
                aria-label={t.label}
                aria-current={active ? 'page' : undefined}
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

      {/* ----------------------------- filter sheet ------------------------- */}
      {filtersOpen ? (
        <div className="absolute inset-0 z-20">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setFiltersOpen(false)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-ink-900 px-5 pb-8 pt-3">
            <div className="mx-auto mb-5 h-1 w-10 rounded-pill bg-ink-700" />

            <div className="flex items-start justify-between gap-3">
              <p className="text-[22px] font-extrabold tracking-tight text-white">
                გაკვეთილების ფილტრი
              </p>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setFiltersOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                მწვრთნელი
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {TRAINERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrainer(t)}
                    className={`h-10 ${CUT_SM} px-4 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                      trainer === t
                        ? 'bg-brand-300 text-ink-950'
                        : 'bg-ink-800 text-ink-300 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                ლოკაცია
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {LOCATIONS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLocation(l)}
                    className={`h-10 ${CUT_SM} px-4 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                      location === l
                        ? 'bg-brand-300 text-ink-950'
                        : 'bg-ink-800 text-ink-300 hover:text-white'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-7 flex gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className={`h-[52px] flex-1 ${CUT_MD} bg-ink-800 text-[15px] font-semibold text-ink-200 transition-colors hover:bg-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
              >
                გასუფთავება
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className={`flex h-[52px] flex-1 items-center justify-center gap-2 ${CUT_MD} bg-brand-300 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
              >
                <Icon d={P.check} className="h-[18px] w-[18px]" />
                ჩვენება
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
