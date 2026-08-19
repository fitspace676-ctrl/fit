// @page: Member Portal
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore Member Portal — გაკვეთილები
   apps/web/app/[locale]/member/(member)/classes/page.tsx
   ---------------------------------------------------------------------------
   The discovery surface: week / list toggle, the filter rail (type, trainer,
   location, time-of-day) the page persists in the URL, and the booking drawer.
   Data from prisma/seed.ts, copy verbatim from @fit/i18n ka.json
   (classes.*, member.classes.*). Art direction "Lime Block".
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
  prev: 'M15 5 8 12l7 7',
  next: 'm9 5 7 7-7 7',
  grid: 'M4 4h7v7H4V4ZM13 4h7v7h-7V4ZM4 13h7v7H4v-7ZM13 13h7v7h-7v-7Z',
  list: 'M4 7h16M4 12h16M4 17h16',
  close: 'm6 6 12 12M18 6 6 18',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
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
  endTime: string;
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
    id: 'c1',
    title: 'Morning Yoga',
    category: 'Yoga Flow',
    color: '#DCDCDA',
    time: '08:00',
    endTime: '09:15',
    dayIndex: 3,
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
    endTime: '13:00',
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
    id: 'c3',
    title: 'Spin Express',
    category: 'Spin',
    color: '#8F8F8B',
    time: '18:00',
    endTime: '18:45',
    dayIndex: 3,
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
    endTime: '20:00',
    dayIndex: 3,
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
    endTime: '10:50',
    dayIndex: 4,
    minutes: 50,
    trainerName: 'Ana G.',
    locationName: 'Studio A',
    capacity: 18,
    bookedCount: 6,
    status: null,
  },
  {
    id: 'c6',
    title: 'Boxing',
    category: 'Boxing',
    color: '#6C6C68',
    time: '20:00',
    endTime: '21:00',
    dayIndex: 4,
    minutes: 60,
    trainerName: 'Nika B.',
    locationName: 'Main Floor',
    capacity: 16,
    bookedCount: 11,
    status: null,
  },
];

const DAYS = [
  { i: 0, label: 'ორშაბათი', short: 'ორშ', date: '3' },
  { i: 1, label: 'სამშაბათი', short: 'სამ', date: '4' },
  { i: 2, label: 'ოთხშაბათი', short: 'ოთხ', date: '5' },
  { i: 3, label: 'ხუთშაბათი', short: 'ხუთ', date: '6' },
  { i: 4, label: 'პარასკევი', short: 'პარ', date: '7' },
  { i: 5, label: 'შაბათი', short: 'შაბ', date: '8' },
  { i: 6, label: 'კვირა', short: 'კვი', date: '9' },
];

/** The seeded CLASS_TYPES with their real colours. */
const TYPES = [
  { name: 'Boxing', color: '#6C6C68' },
  { name: 'Yoga Flow', color: '#DCDCDA' },
  { name: 'CrossFit', color: '#C4C4C1' },
  { name: 'Spin', color: '#8F8F8B' },
  { name: 'Pilates', color: '#B0B0AD' },
];
const TRAINERS = ['ყველა მწვრთნელი', 'Ana G.', 'Levan M.', 'Sandro K.', 'Nika B.'];
const LOCATIONS = ['ყველა ლოკაცია', 'Main Floor', 'Studio A'];
const TIMES = [
  { key: 'any', label: 'ნებისმიერი დრო', from: 0, to: 24 },
  { key: 'morning', label: 'დილა', from: 0, to: 12 },
  { key: 'afternoon', label: 'დღე', from: 12, to: 17 },
  { key: 'evening', label: 'საღამო', from: 17, to: 24 },
];

const NAV = [
  { key: 'home', label: 'მთავარი', icon: P.home },
  { key: 'classes', label: 'გაკვეთილები', icon: P.calendar },
  { key: 'bookings', label: 'ჯავშნები', icon: P.clock },
  { key: 'trainer', label: 'მწვრთნელი', icon: P.dumbbell },
  { key: 'shop', label: 'მაღაზია', icon: P.bag },
  { key: 'membership', label: 'აბონემენტი', icon: P.ticket },
];

export default function WebMemberClasses() {
  const [type, setType] = useState<string | null>(null);
  const [trainer, setTrainer] = useState(TRAINERS[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [time, setTime] = useState('any');
  const [view, setView] = useState<'week' | 'list'>('week');
  const [drawer, setDrawer] = useState<Instance | null>(null);
  const [bookings, setBookings] = useState<Record<string, Instance['status']>>(
    Object.fromEntries(WEEK.map((c) => [c.id, c.status])),
  );

  const band = TIMES.find((t) => t.key === time) ?? TIMES[0];
  const filtered = WEEK.filter((c) => {
    const h = Number(c.time.slice(0, 2));
    return (
      (!type || c.category === type) &&
      (trainer === TRAINERS[0] || c.trainerName === trainer) &&
      (location === LOCATIONS[0] || c.locationName === location) &&
      h >= band.from &&
      h < band.to
    );
  });

  const activeFilters =
    (type ? 1 : 0) +
    (trainer !== TRAINERS[0] ? 1 : 0) +
    (location !== LOCATIONS[0] ? 1 : 0) +
    (time !== 'any' ? 1 : 0);

  const clear = () => {
    setType(null);
    setTrainer(TRAINERS[0]);
    setLocation(LOCATIONS[0]);
    setTime('any');
  };

  const toggle = (c: Instance) =>
    setBookings((b) => ({
      ...b,
      [c.id]: b[c.id] ? null : c.bookedCount >= c.capacity ? 'WAITLIST' : 'BOOKED',
    }));

  return (
    <div className="relative w-full bg-ink-950 pb-28 font-sans text-white lg:pb-16">
      {/* ================================ header =============================== */}
      <header className="sticky top-0 z-30 border-b border-ink-900 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[1180px] items-center gap-6 px-6 lg:px-10">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex shrink-0 items-center gap-2.5 rounded-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-brand-300 text-ink-950">
              <Icon d={P.bolt} className="h-5 w-5" />
            </span>
            <span className="text-[19px] font-extrabold tracking-tight">FormaCore</span>
          </a>

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {NAV.map((n) => (
              <button
                key={n.key}
                type="button"
                aria-current={n.key === 'classes' ? 'page' : undefined}
                className={`flex h-10 items-center gap-2 ${CUT_SM} px-4 text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                  n.key === 'classes'
                    ? 'bg-brand-300 text-ink-950'
                    : 'text-ink-400 hover:bg-ink-900 hover:text-white'
                }`}
              >
                <Icon d={n.icon} className="h-[17px] w-[17px]" />
                {n.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <button
              type="button"
              aria-label="შეტყობინებები"
              className="relative grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <Icon d={P.bell} className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-300 ring-2 ring-ink-950" />
            </button>
            <img
              src="https://i.pravatar.cc/160?img=45"
              alt="Nino Kapanadze"
              width={40}
              height={40}
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-brand-300"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 pt-10 lg:px-10">
        {/* ------------------------------- title -------------------------------- */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-lg">
            <h1 className="text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[38px] sm:leading-none">
              გაკვეთილები
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-400">
              ნახე განრიგი და დაჯავშნე შემდეგი ვარჯიში.
            </p>
          </div>

          {/* week nav + view toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-pill bg-ink-900 p-1">
              <button
                type="button"
                aria-label="წინა კვირა"
                className="grid h-9 w-9 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.prev} className="h-4 w-4" />
              </button>
              <span className="px-3 font-mono text-[13px] font-semibold tabular-nums text-white">
                3–9 აგვ
              </span>
              <button
                type="button"
                aria-label="შემდეგი კვირა"
                className="grid h-9 w-9 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.next} className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 rounded-pill bg-ink-900 p-1">
              {[
                { key: 'week' as const, label: 'კვირა', icon: P.grid },
                { key: 'list' as const, label: 'სია', icon: P.list },
              ].map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  aria-pressed={view === v.key}
                  className={`flex h-9 items-center gap-2 ${CUT_SM} px-4 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    view === v.key ? 'bg-brand-300 text-ink-950' : 'text-ink-400 hover:text-white'
                  }`}
                >
                  <Icon d={v.icon} className="h-4 w-4" />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------- filters + results -------------------------- */}
        <div className="mt-9 grid gap-6 lg:grid-cols-[248px_1fr]">
          {/* filter rail */}
          <aside className="h-fit rounded-[30px] bg-ink-900 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                ფილტრი
              </h2>
              {activeFilters > 0 ? (
                <button
                  type="button"
                  onClick={clear}
                  className="text-[12px] font-semibold text-brand-300 transition-colors hover:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  გასუფთავება
                </button>
              ) : null}
            </div>

            <div className="mt-5">
              <p className="text-[12px] font-semibold text-ink-500">ტიპი</p>
              <div className="mt-3 space-y-1.5">
                {TYPES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setType(type === t.name ? null : t.name)}
                    className={`flex w-full items-center gap-2.5 ${CUT_SM} px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                      type === t.name
                        ? 'bg-brand-300 text-ink-950'
                        : 'text-ink-300 hover:bg-ink-800 hover:text-white'
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-ink-800 pt-5">
              <p className="text-[12px] font-semibold text-ink-500">დრო</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {TIMES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTime(t.key)}
                    className={`${CUT_SM} px-3 py-1.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                      time === t.key
                        ? 'bg-white text-ink-950'
                        : 'bg-ink-800 text-ink-300 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-ink-800 pt-5">
              <label className="block">
                <span className="text-[12px] font-semibold text-ink-500">მწვრთნელი</span>
                <select
                  value={trainer}
                  onChange={(e) => setTrainer(e.target.value)}
                  className="mt-2.5 h-11 w-full rounded-[16px] bg-ink-800 px-3.5 text-[13px] font-semibold text-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                >
                  {TRAINERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block">
                <span className="text-[12px] font-semibold text-ink-500">ლოკაცია</span>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-2.5 h-11 w-full rounded-[16px] bg-ink-800 px-3.5 text-[13px] font-semibold text-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                >
                  {LOCATIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </aside>

          {/* results */}
          <div>
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-[13px] tabular-nums text-ink-500">
                {filtered.length} გაკვეთილი
              </p>
              {activeFilters > 0 ? (
                <span className="rounded-pill bg-ink-900 px-3 py-1 text-[12px] font-semibold text-ink-300">
                  {activeFilters} ფილტრი აქტიურია
                </span>
              ) : null}
            </div>

            {filtered.length === 0 ? (
              <div className="mt-5 rounded-[30px] bg-ink-900 px-8 py-20 text-center">
                <p className="text-[20px] font-bold text-white">
                  ფილტრებს გაკვეთილი არ შეესაბამება
                </p>
                <p className="mt-2.5 text-[14px] text-ink-400">
                  მოხსენი ფილტრი ან აირჩიე სხვა კვირა.
                </p>
                <button
                  type="button"
                  onClick={clear}
                  className={`mt-6 h-12 ${CUT_MD} bg-brand-300 px-7 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
                >
                  ფილტრების გასუფთავება
                </button>
              </div>
            ) : (
              DAYS.map((d) => {
                const items = filtered.filter((c) => c.dayIndex === d.i);
                if (items.length === 0) return null;
                return (
                  <section key={d.i} className="mt-7">
                    <div className="flex items-center gap-4">
                      <h2 className="text-[15px] font-bold text-white">
                        {d.label}{' '}
                        <span className="font-mono text-ink-500 tabular-nums">{d.date} აგვ</span>
                      </h2>
                      <span className="h-px flex-1 bg-ink-800" />
                      <span className="font-mono text-[12px] tabular-nums text-ink-600">
                        {items.length}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {items.map((c) => {
                        const status = bookings[c.id];
                        const spotsLeft = c.capacity - c.bookedCount;
                        const full = spotsLeft <= 0;
                        return (
                          <article
                            key={c.id}
                            className="relative overflow-hidden rounded-[30px] border border-ink-800 bg-ink-900 text-white"
                          >
                            <div className="relative p-5 sm:p-6">
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
                                  <h3 className="mt-3 text-[24px] font-extrabold leading-[1.05] tracking-tight">
                                    {c.title}
                                  </h3>
                                  <p className="mt-2.5 font-mono text-[13px] font-semibold tabular-nums text-ink-400">
                                    {c.time}–{c.endTime}
                                  </p>
                                </div>
                                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white text-ink-950">
                                  <div className="text-center">
                                    <p className="font-mono text-[17px] font-bold leading-none tabular-nums">
                                      {c.minutes}
                                    </p>
                                    <p className="mt-0.5 text-[10px] font-semibold">წთ</p>
                                  </div>
                                </div>
                              </div>

                              <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-ink-400">
                                <Icon d={P.pin} className="h-3.5 w-3.5" />
                                {c.trainerName} · {c.locationName}
                              </p>

                              <div className="mt-5 flex items-center gap-2">
                                <span className="whitespace-nowrap rounded-pill bg-ink-800 px-3 py-1.5 text-[12px] font-semibold tabular-nums text-ink-200">
                                  {full ? 'შევსებულია' : `${spotsLeft} ადგილი დარჩა`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setDrawer(c)}
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
                                      : 'დეტალები'}
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
        </div>
      </main>

      {/* =============================== drawer ================================ */}
      {drawer ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setDrawer(null)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-ink-900 p-7 shadow-float">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-pill bg-ink-800 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
                {drawer.category}
              </span>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setDrawer(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-[30px] border border-ink-800 bg-ink-950 p-6 text-white">
              <h2 className="text-[30px] font-extrabold leading-none tracking-tight">
                {drawer.title}
              </h2>
              <p className="mt-3.5 font-mono text-[15px] font-bold tabular-nums">
                {drawer.time}–{drawer.endTime}
              </p>
              <p className="mt-1.5 text-[13px] font-medium text-ink-400">
                {DAYS[drawer.dayIndex].label}, {DAYS[drawer.dayIndex].date} აგვისტო
              </p>
            </div>

            <dl className="mt-6 space-y-4">
              {[
                { k: 'მწვრთნელი', v: drawer.trainerName },
                { k: 'ლოკაცია', v: drawer.locationName },
                { k: 'ხანგრძლივობა', v: `${drawer.minutes} წუთი` },
                {
                  k: 'ადგილები',
                  v: `${drawer.bookedCount}/${drawer.capacity}`,
                },
              ].map((row) => (
                <div
                  key={row.k}
                  className="flex items-center justify-between border-b border-ink-800 pb-4"
                >
                  <dt className="text-[13px] font-semibold text-ink-400">{row.k}</dt>
                  <dd className="text-[15px] font-bold tabular-nums text-white">{row.v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => {
                  toggle(drawer);
                  setDrawer(null);
                }}
                className={`h-[54px] w-full ${CUT_MD} text-[15px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  bookings[drawer.id]
                    ? 'bg-ink-800 text-white hover:bg-ink-700'
                    : 'bg-brand-300 text-ink-950 hover:bg-brand-200'
                }`}
              >
                {bookings[drawer.id]
                  ? 'ჯავშნის გაუქმება'
                  : drawer.capacity - drawer.bookedCount <= 0
                    ? 'მოლოდინის სიაში ჩაწერა'
                    : 'დაჯავშნა'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* ------------------- mobile tab bar — MobileTabBar.tsx ------------------ */}
      <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-950 lg:hidden">
        <ul className="mx-auto flex max-w-md items-stretch justify-around gap-0.5 px-2 pb-2 pt-1.5">
          {NAV.map((n) => {
            const tabActive = n.key === 'classes';
            return (
              <li key={n.key} className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-current={tabActive ? 'page' : undefined}
                  className={`flex w-full flex-col items-center gap-1 rounded-[16px] px-0.5 py-2 text-[9px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    tabActive ? 'bg-brand-300 text-ink-950' : 'text-ink-500 hover:text-white'
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
