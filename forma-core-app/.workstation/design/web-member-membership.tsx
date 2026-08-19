// @page: Member Portal
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore Member Portal — აბონემენტი
   apps/web/app/[locale]/member/(member)/account/membership/page.tsx
   (+ freeze-card.tsx, buy-credits-card.tsx)
   ---------------------------------------------------------------------------
   Plan + status + billing period from GET /me/subscription, PT / class-pass
   credits from the credit-pack endpoint, and the invoice history. Statuses are
   the real `MeSubscriptionStatus` set (TRIAL · ACTIVE · FROZEN · CANCELED ·
   PAST_DUE · EXPIRED). Plans and prices from DEMO_PLANS / DEMO_PACKAGES in
   prisma/seed.ts. Copy verbatim from @fit/i18n ka.json (member.membership.*).
   Art direction "Lime Block".
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
  bell: 'M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10ZM10 19a2 2 0 0 0 4 0',
  pause: 'M9.5 5v14M14.5 5v14',
  qr: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2.5v2.5H14V14ZM20 14v6h-3.5M17 20h-.5',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7',
  card: 'M3 8.5h18M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z',
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

const money = (minor: number) => `${(minor / 100).toFixed(2).replace('.', ',')} ₾`;

/* -------------------------------- real data ------------------------------- */

/** DEMO_PLANS — the gym's subscription catalogue, GEL minor units, monthly. */
const PLANS = [
  { name: 'Student', minor: 4500, perks: 'შეზღუდული საათები · 1 ლოკაცია' },
  { name: 'Standard', minor: 7500, perks: 'შეუზღუდავი გაკვეთილები' },
  {
    name: 'Premium',
    minor: 12000,
    perks: 'შეუზღუდავი გაკვეთილები · 1 სტუმარი / თვე · −10% მაღაზია',
    current: true,
  },
  { name: 'PT Pack', minor: 20000, perks: 'Premium + 4 PT სესია' },
];

/** DEMO_PACKAGES — the PT / class-pass catalogue. */
const PACKS = [
  { name: 'Intro PT — 3 Sessions', minor: 15000, sessions: 3, validity: 60 },
  { name: 'PT 10 — Sessions', minor: 45000, sessions: 10, validity: 180 },
];

const INVOICES = [
  { id: 'INV-2026-0806', date: '6 აგვისტო 2026', minor: 12000, status: 'გადახდილი' },
  { id: 'INV-2026-0706', date: '6 ივლისი 2026', minor: 12000, status: 'გადახდილი' },
  { id: 'INV-2026-0606', date: '6 ივნისი 2026', minor: 12000, status: 'გადახდილი' },
  { id: 'INV-2026-0506', date: '6 მაისი 2026', minor: 15000, status: 'გადახდილი' },
];

const NAV = [
  { key: 'home', label: 'მთავარი', icon: P.home },
  { key: 'classes', label: 'გაკვეთილები', icon: P.calendar },
  { key: 'bookings', label: 'ჯავშნები', icon: P.clock },
  { key: 'trainer', label: 'მწვრთნელი', icon: P.dumbbell },
  { key: 'shop', label: 'მაღაზია', icon: P.bag },
  { key: 'membership', label: 'აბონემენტი', icon: P.ticket },
];

const FREEZE_OPTIONS = ['2 კვირა', '1 თვე', '2 თვე'];

export default function WebMemberMembership() {
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeChoice, setFreezeChoice] = useState(FREEZE_OPTIONS[1]);
  const [plansOpen, setPlansOpen] = useState(false);

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
                aria-current={n.key === 'membership' ? 'page' : undefined}
                className={`flex h-10 items-center gap-2 ${CUT_SM} px-4 text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                  n.key === 'membership'
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          ანგარიში
        </p>
        <h1 className="mt-3 text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[38px] sm:leading-none">
          აბონემენტი
        </h1>

        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.15fr_1fr]">
          {/* ------------------------------ the plan ---------------------------- */}
          <section
            className={`relative overflow-hidden ${CUT_LG} bg-brand-300 p-6 text-ink-950 sm:p-7`}
          >
            <div className="relative">
              <div className="flex items-start justify-between">
                <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-800">
                  მიმდინარე გეგმა
                </span>
                <span className="rounded-pill bg-ink-950 px-3 py-1 text-[11px] font-bold text-brand-300">
                  აქტიური
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2">
                <p className="text-[38px] font-extrabold uppercase leading-none tracking-tight sm:text-[46px]">
                  Premium
                </p>
                <p className="whitespace-nowrap pb-1.5 font-mono text-[16px] font-bold tabular-nums text-ink-800">
                  {money(12000)} / თვე
                </p>
              </div>

              <p className="mt-4 max-w-md text-[14px] font-medium leading-relaxed text-ink-800">
                შეუზღუდავი გაკვეთილები · 1 სტუმარი / თვე · −10% მაღაზია
              </p>

              <div className="mt-7">
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
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] bg-ink-950/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-800">
                    შემდეგი გადახდა
                  </p>
                  <p className="mt-2 text-[16px] font-bold">14 აგვისტო 2026</p>
                </div>
                <div className="rounded-[22px] bg-ink-950/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-800">
                    გადახდის მეთოდი
                  </p>
                  <p className="mt-2 flex items-center gap-2 whitespace-nowrap text-[16px] font-bold">
                    <Icon d={P.card} className="h-4 w-4 shrink-0" />
                    <span className="font-mono tabular-nums">•• 4821</span>
                  </p>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPlansOpen(true)}
                  className={`h-12 ${CUT_MD} bg-ink-950 px-6 text-[15px] font-bold text-brand-300 transition-colors hover:bg-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
                >
                  გეგმის შეცვლა
                </button>
                <button
                  type="button"
                  onClick={() => setFreezeOpen(true)}
                  className={`flex h-12 items-center gap-2 ${CUT_MD} bg-ink-950/10 px-6 text-[15px] font-semibold text-ink-950 transition-colors hover:bg-ink-950/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950`}
                >
                  <Icon d={P.pause} className="h-4 w-4" />
                  გაყინვა
                </button>
              </div>
            </div>
          </section>

          <div className="space-y-5">
            {/* ------------------------- period usage --------------------------- */}
            <section className="rounded-[34px] bg-ink-900 p-6 sm:p-7">
              <h2 className="whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                ამ პერიოდში
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[24px] bg-ink-950 p-5">
                  <p className="font-mono text-[36px] font-bold leading-none tabular-nums text-white">
                    19
                  </p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    გაკვეთილი
                  </p>
                </div>
                <div className="rounded-[24px] bg-ink-950 p-5">
                  <p className="font-mono text-[36px] font-bold leading-none tabular-nums text-white">
                    24
                  </p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    გამოცხადება
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`mt-4 flex h-12 w-full items-center justify-center gap-2 ${CUT_MD} bg-ink-800 text-[14px] font-semibold text-white transition-colors hover:bg-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
              >
                <Icon d={P.qr} className="h-[17px] w-[17px]" />
                გამოცხადების QR
              </button>
            </section>

            {/* --------------------------- PT credits --------------------------- */}
            <section className="rounded-[34px] border border-ink-800 bg-ink-900 p-6 text-white sm:p-7">
              <div className="flex items-start justify-between">
                <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  PT კრედიტი
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-pill bg-ink-800 px-3 py-1 text-[11px] font-bold text-ink-200">
                  60 დღე
                </span>
              </div>

              <p className="mt-5 font-mono text-[46px] font-bold leading-none tabular-nums">
                2<span className="text-[22px] text-ink-500">/3</span>
              </p>
              <p className="mt-3 text-[13px] font-medium text-ink-400">
                Intro PT — 3 Sessions · განახლდება წევრობასთან ერთად
              </p>

              <div className="mt-5 flex gap-1.5">
                <span className="h-2 flex-1 rounded-pill bg-white" />
                <span className="h-2 flex-1 rounded-pill bg-white" />
                <span className="h-2 flex-1 rounded-pill bg-ink-700" />
              </div>

              <div className="mt-6 space-y-2">
                {PACKS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[20px] bg-ink-950 p-4 text-left transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-white">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-ink-400">
                        {p.sessions} სესია · {p.validity} დღე
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[14px] font-bold tabular-nums text-white">
                      {money(p.minor)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ----------------------------- invoices ------------------------------- */}
        <section className="mt-12 rounded-[34px] bg-ink-900 p-6 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[22px] font-extrabold tracking-tight">გადახდების ისტორია</h2>
            <span className="font-mono text-[13px] tabular-nums text-ink-500">
              {INVOICES.length} ინვოისი
            </span>
          </div>

          <div className="mt-5 overflow-x-auto rounded-[24px] bg-ink-950">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    ინვოისი
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    თარიღი
                  </th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    თანხა
                  </th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    სტატუსი
                  </th>
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody>
                {INVOICES.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-ink-900 transition-colors last:border-0 hover:bg-ink-900"
                  >
                    <td className="px-5 py-4 font-mono text-[13px] font-semibold tabular-nums text-white">
                      {inv.id}
                    </td>
                    <td className="px-5 py-4 text-[13px] text-ink-400">{inv.date}</td>
                    <td className="px-5 py-4 text-right font-mono text-[14px] font-bold tabular-nums text-white">
                      {money(inv.minor)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="whitespace-nowrap rounded-pill bg-brand-300 px-3 py-1 text-[11px] font-bold text-ink-950">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <button
                        type="button"
                        aria-label={`${inv.id} · ჩამოტვირთვა`}
                        className="grid h-9 w-9 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                      >
                        <Icon d={P.download} className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* ============================= freeze modal ============================= */}
      {freezeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setFreezeOpen(false)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="relative w-full max-w-[460px] rounded-[34px] bg-ink-900 p-7 shadow-float">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[24px] font-extrabold tracking-tight text-white">
                  წევრობის გაყინვა
                </p>
                <p className="mt-1.5 text-[13px] text-ink-400">შეაჩერე გადახდები, სანამ არ ხარ.</p>
              </div>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setFreezeOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex gap-2">
              {FREEZE_OPTIONS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setFreezeChoice(o)}
                  className={`h-[54px] flex-1 rounded-[20px] text-[14px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    freezeChoice === o
                      ? 'bg-brand-300 text-ink-950'
                      : 'bg-ink-800 text-ink-300 hover:text-white'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>

            <p className="mt-5 text-[13px] leading-relaxed text-ink-400">
              დარჩენილი დღეები შენარჩუნდება — არაფერი იკარგება. ამ პერიოდში კიდევ 30 დღის გაყინვა
              შეგიძლია.
            </p>

            <button
              type="button"
              onClick={() => setFreezeOpen(false)}
              className={`mt-6 flex h-[54px] w-full items-center justify-center gap-2 ${CUT_MD} bg-brand-300 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
            >
              <Icon d={P.check} className="h-[18px] w-[18px]" />
              გაყინვა {freezeChoice}
            </button>
          </div>
        </div>
      ) : null}

      {/* ============================== plans modal ============================= */}
      {plansOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setPlansOpen(false)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="relative w-full max-w-[720px] rounded-[34px] bg-ink-900 p-7 shadow-float">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[24px] font-extrabold tracking-tight text-white">აირჩიე გეგმა</p>
                <p className="mt-1.5 text-[13px] text-ink-400">
                  ცვლილება მომდევნო გადახდის ციკლიდან ამოქმედდება.
                </p>
              </div>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setPlansOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {PLANS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setPlansOpen(false)}
                  className={`rounded-[26px] p-5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    p.current
                      ? 'bg-brand-300 text-ink-950'
                      : 'bg-ink-950 text-white hover:bg-ink-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[20px] font-extrabold tracking-tight">{p.name}</p>
                    {p.current ? (
                      <span className="shrink-0 rounded-pill bg-ink-950 px-2.5 py-1 text-[10px] font-bold text-brand-300">
                        მიმდინარე
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`mt-2.5 font-mono text-[18px] font-bold tabular-nums ${
                      p.current ? 'text-ink-800' : 'text-brand-300'
                    }`}
                  >
                    {money(p.minor)} <span className="text-[12px]">/ თვე</span>
                  </p>
                  <p
                    className={`mt-3 text-[12px] leading-relaxed ${
                      p.current ? 'text-ink-800' : 'text-ink-400'
                    }`}
                  >
                    {p.perks}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {/* ------------------- mobile tab bar — MobileTabBar.tsx ------------------ */}
      <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-950 lg:hidden">
        <ul className="mx-auto flex max-w-md items-stretch justify-around gap-0.5 px-2 pb-2 pt-1.5">
          {NAV.map((n) => {
            const tabActive = n.key === 'membership';
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
