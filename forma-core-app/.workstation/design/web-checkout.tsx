// @page: Member Portal
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore — გარე checkout (აბონემენტის ყიდვა ონლაინ)
   apps/web/app/[locale]/join/checkout/page.tsx
   ---------------------------------------------------------------------------
   The public door: a person who is not a member yet buys a plan without an
   account, then gets one at the end. Catalogue is the seeded DEMO_PLANS
   (Student 45,00 / Standard 75,00 / Premium 120,00 / PT Pack 200,00 ₾ per
   month) plus DEMO_PACKAGES (Intro PT — 3 Sessions). Prices in GEL minor
   units through formatMoney. Copy in the voice of @fit/i18n ka.json.
   Art direction "Lime Block" — cut corners, one lime field, mono numerals.
   ========================================================================== */

const CUT_XS =
  '[clip-path:polygon(7px_0,calc(100%_-_7px)_0,100%_7px,100%_calc(100%_-_7px),calc(100%_-_7px)_100%,7px_100%,0_calc(100%_-_7px),0_7px)]';
const CUT_SM =
  '[clip-path:polygon(9px_0,calc(100%_-_9px)_0,100%_9px,100%_calc(100%_-_9px),calc(100%_-_9px)_100%,9px_100%,0_calc(100%_-_9px),0_9px)]';
const CUT_MD =
  '[clip-path:polygon(11px_0,calc(100%_-_11px)_0,100%_11px,100%_calc(100%_-_11px),calc(100%_-_11px)_100%,11px_100%,0_calc(100%_-_11px),0_11px)]';
const CUT_TILE =
  '[clip-path:polygon(14px_0,calc(100%_-_14px)_0,100%_14px,100%_calc(100%_-_14px),calc(100%_-_14px)_100%,14px_100%,0_calc(100%_-_14px),0_14px)]';
const CUT_LG =
  '[clip-path:polygon(30px_0,calc(100%_-_30px)_0,100%_30px,100%_calc(100%_-_30px),calc(100%_-_30px)_100%,30px_100%,0_calc(100%_-_30px),0_30px)]';

const P = {
  bolt: 'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3Z',
  check: 'm5 12.5 4.5 4.5L19 7',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13A1.5 1.5 0 0 1 20 12v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-7a1.5 1.5 0 0 1 1.5-1.5Z',
  card: 'M3 8.5h18M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z',
  bank: 'M4 9.5h16M12 3.5 21 8H3l9-4.5M6 10v7M10 10v7M14 10v7M18 10v7M3.5 20.5h17',
  wallet:
    'M4 7.5h13.5A1.5 1.5 0 0 1 19 9v1.5M4 7.5A1.5 1.5 0 0 1 5.5 6H16M4 7.5V17a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 17v-2.5M20 10.5h-3.5a2 2 0 0 0 0 4H20',
  alert: 'M12 8.5v4.5M12 16.6v.1M12 3.6 2.8 19.4h18.4L12 3.6Z',
  qr: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2.5v2.5H14V14ZM20 14v6h-3.5M17 20h-.5',
  spinner: 'M12 3.5a8.5 8.5 0 0 1 8.5 8.5',
  chevron: 'm9 5 7 7-7 7',
  ticket:
    'M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2 2 0 0 0 0-4v-2ZM14 7v10',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
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

/** DEMO_PLANS — the gym's subscription catalogue, monthly price in GEL minor. */
const PLANS = [
  {
    id: 'student',
    name: 'Student',
    minor: 4500,
    perks: 'შეზღუდული საათები · 1 ლოკაცია',
    note: 'სტუდენტის ბარათის ატვირთვა საჭიროა',
  },
  {
    id: 'standard',
    name: 'Standard',
    minor: 7500,
    perks: 'შეუზღუდავი გაკვეთილები',
    note: 'ყველაზე ხშირად არჩეული',
  },
  {
    id: 'premium',
    name: 'Premium',
    minor: 12000,
    perks: 'შეუზღუდავი გაკვეთილები · 1 სტუმარი / თვე · −10% მაღაზია',
    note: '',
  },
  { id: 'pt', name: 'PT Pack', minor: 20000, perks: 'Premium + 4 PT სესია თვეში', note: '' },
];

/** DEMO_PACKAGES — one-time add-on offered at checkout. */
const ADDON = {
  name: 'Intro PT — 3 Sessions',
  minor: 15000,
  hint: '3 სესია პირად მწვრთნელთან · 60 დღე',
};

const PERIODS = [
  { id: 'monthly', label: 'თვიური', months: 1, off: 0 },
  { id: 'annual', label: '12 თვე', months: 12, off: 0.15 },
];

const METHODS = [
  { id: 'card', label: 'ბარათი', hint: 'Visa · Mastercard', icon: P.card },
  { id: 'wallet', label: 'Google Pay', hint: 'ერთი შეხებით', icon: P.wallet },
  { id: 'bank', label: 'ბანკის გადარიცხვა', hint: 'ინვოისი ელფოსტაზე', icon: P.bank },
];

const STARTS = [
  { id: 'today', label: 'დღეიდან', date: '6 აგვისტო' },
  { id: 'sept', label: '1 სექტემბრიდან', date: 'შეჩერებული' },
];

const STEPS = ['გეგმა', 'მონაცემები', 'გადახდა'];

export default function WebCheckout() {
  const [planId, setPlanId] = useState('premium');
  const [periodId, setPeriodId] = useState('monthly');
  const [addon, setAddon] = useState(false);
  const [startId, setStartId] = useState('today');
  const [method, setMethod] = useState('card');
  const [saveCard, setSaveCard] = useState(true);
  const [terms, setTerms] = useState(false);
  const [promo, setPromo] = useState('');
  const [promoState, setPromoState] = useState<'idle' | 'ok' | 'bad'>('idle');
  const [touched, setTouched] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'paying' | 'paid'>('idle');
  const [locale, setLocale] = useState<'ka' | 'en'>('ka');

  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[2];
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[0];

  const base = plan.minor * period.months;
  const periodOff = Math.round(base * period.off);
  const promoOff = promoState === 'ok' ? Math.round((base - periodOff) * 0.1) : 0;
  const addonMinor = addon ? ADDON.minor : 0;
  const total = base - periodOff - promoOff + addonMinor;

  const nameMissing = touched && name.trim() === '';
  const emailMissing = touched && email.trim() === '';
  const phoneMissing = touched && phone.trim() === '';
  const termsMissing = touched && !terms;

  const applyPromo = () => setPromoState(promo.trim().toUpperCase() === 'FORMA10' ? 'ok' : 'bad');

  const pay = () => {
    setTouched(true);
    if (name.trim() === '' || email.trim() === '' || phone.trim() === '' || !terms) return;
    setState('paying');
    window.setTimeout(() => setState('paid'), 1100);
  };

  const fieldBase =
    'h-[52px] w-full border bg-ink-950 px-4 text-[15px] font-medium text-white placeholder:text-ink-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-300/40';
  const fieldOk = 'border-ink-800 focus:border-brand-300';

  const Check = ({ on }: { on: boolean }) => (
    <span
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center ${CUT_XS} transition-colors ${
        on ? 'bg-brand-300 text-ink-950' : 'bg-ink-800 text-ink-800'
      }`}
    >
      <Icon d={P.check} className="h-3.5 w-3.5" />
    </span>
  );

  return (
    <div className="relative w-full bg-ink-950 pb-16 font-sans text-white">
      {/* =============================== header ================================ */}
      <header className="border-b border-ink-900">
        <div className="mx-auto flex h-20 max-w-[1180px] items-center gap-4 px-6 sm:gap-6 lg:px-10">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className={`flex shrink-0 items-center gap-2.5 ${CUT_XS} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
          >
            <span
              className={`grid h-10 w-10 place-items-center ${CUT_XS} bg-brand-300 text-ink-950`}
            >
              <Icon d={P.bolt} className="h-5 w-5" />
            </span>
            <span className="text-[19px] font-extrabold tracking-tight">FormaCore</span>
          </a>

          <p className="hidden items-center gap-2 text-[13px] font-medium text-ink-500 md:flex">
            <Icon d={P.pin} className="h-4 w-4" />
            Downtown Strength · ჭავჭავაძის 42
          </p>

          <div className="ml-auto flex items-center gap-2">
            <p className="hidden items-center gap-2 text-[12px] font-medium text-ink-500 sm:flex">
              <Icon d={P.lock} className="h-3.5 w-3.5" />
              დაცული გადახდა
            </p>
            <div className={`flex h-9 items-center ${CUT_XS} bg-ink-900 p-1`}>
              {(['ka', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  aria-pressed={locale === l}
                  className={`h-7 px-3 text-[12px] font-bold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    locale === l ? 'bg-brand-300 text-ink-950' : 'text-ink-500 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="h-9 whitespace-nowrap px-3 text-[13px] font-semibold leading-9 text-ink-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <span className="hidden lg:inline">უკვე წევრი ხარ? </span>შესვლა
            </a>
          </div>
        </div>
      </header>

      {state === 'paid' ? (
        /* ============================ paid receipt =========================== */
        <main className="mx-auto max-w-[820px] px-6 pt-16 lg:px-10">
          <span className={`grid h-14 w-14 place-items-center ${CUT_MD} bg-brand-300 text-ink-950`}>
            <Icon d={P.check} className="h-7 w-7" />
          </span>
          <h1 className="mt-7 text-[38px] font-extrabold leading-none tracking-tight sm:text-[46px]">
            გადახდა შესრულდა
          </h1>
          <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink-400">
            {plan.name} აქტიურია {STARTS.find((s) => s.id === startId)?.date}-დან. ინვოისი და
            გამოცხადების QR ელფოსტაზე გამოგზავნილია.
          </p>

          <div className="mt-9 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <section className={`min-w-0 ${CUT_LG} bg-brand-300 p-7 text-ink-950`}>
              <div className="flex items-start justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-800">
                  ინვოისი
                </span>
                <span
                  className={`${CUT_XS} bg-ink-950 px-3 py-1 text-[11px] font-bold text-brand-300`}
                >
                  გადახდილი
                </span>
              </div>
              <p className="mt-6 text-[40px] font-extrabold uppercase leading-none tracking-tight">
                {plan.name}
              </p>
              <p className="mt-3 font-mono text-[13px] font-semibold tabular-nums text-ink-800">
                INV-2026-0806 · {period.label}
              </p>
              <div className="mt-7 space-y-2.5 border-t border-ink-950/15 pt-5 text-[14px] font-medium text-ink-800">
                <div className="flex items-baseline justify-between gap-4">
                  <span>აბონემენტი</span>
                  <span className="font-mono tabular-nums">{money(base)}</span>
                </div>
                {addon ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <span>{ADDON.name}</span>
                    <span className="font-mono tabular-nums">{money(ADDON.minor)}</span>
                  </div>
                ) : null}
                {periodOff + promoOff > 0 ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <span>ფასდაკლება</span>
                    <span className="font-mono tabular-nums">−{money(periodOff + promoOff)}</span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-4 border-t border-ink-950/15 pt-3.5 text-ink-950">
                  <span className="text-[15px] font-bold">ჩამოიჭრა</span>
                  <span className="font-mono text-[24px] font-bold tabular-nums">
                    {money(total)}
                  </span>
                </div>
              </div>
            </section>

            <section className={`${CUT_LG} border border-ink-800 bg-ink-900 p-7`}>
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                შემდეგი ნაბიჯი
              </h2>
              <p className="mt-4 text-[17px] font-bold leading-snug text-white">
                შექმენი პაროლი და შედი წევრის პორტალში
              </p>
              <label className="mt-5 block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  პაროლი
                </span>
                <input
                  type="password"
                  placeholder="მინიმუმ 8 სიმბოლო"
                  className={`${fieldBase} ${fieldOk} ${CUT_MD}`}
                />
              </label>
              <button
                type="button"
                className={`mt-4 h-[52px] w-full ${CUT_MD} bg-brand-300 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
              >
                პორტალში შესვლა
              </button>
              <p className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-500">
                <Icon d={P.qr} className="mt-0.5 h-4 w-4 shrink-0" />
                პირველ ვიზიტზე QR-ს რეცეფციაზე აჩვენებ — ბარათი არ გჭირდება.
              </p>
            </section>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-[1180px] px-6 pt-12 lg:px-10">
          {/* ------------------------------ title ------------------------------ */}
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                გაწევრიანება ონლაინ · 2 წუთი
              </p>
              <h1 className="mt-4 text-[36px] font-extrabold leading-[1.02] tracking-tight sm:text-[46px]">
                აირჩიე აბონემენტი
                <br className="hidden sm:block" /> და დაიწყე{' '}
                <span className="text-brand-300">დღესვე.</span>
              </h1>
            </div>
            <ol className="hidden items-center gap-3 sm:flex">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="flex items-center gap-2">
                    <span
                      className={`grid h-7 w-7 place-items-center ${CUT_XS} font-mono text-[12px] font-bold tabular-nums ${
                        i === 0 ? 'bg-brand-300 text-ink-950' : 'bg-ink-900 text-ink-500'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`text-[13px] font-semibold ${i === 0 ? 'text-white' : 'text-ink-500'}`}
                    >
                      {s}
                    </span>
                  </span>
                  {i < STEPS.length - 1 ? <span className="h-px w-6 bg-ink-800" /> : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:gap-10">
            {/* =========================== the form ============================ */}
            <div className="min-w-0">
              {/* ---------------------------- 1 · plan ------------------------- */}
              <section>
                <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink-800 pb-4">
                  <h2 className="text-[22px] font-extrabold tracking-tight">
                    <span className="mr-2.5 font-mono text-[14px] font-bold tabular-nums text-ink-600">
                      01
                    </span>
                    გეგმა
                  </h2>
                  <div className={`flex h-10 items-center ${CUT_SM} bg-ink-900 p-1`}>
                    {PERIODS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPeriodId(p.id)}
                        aria-pressed={periodId === p.id}
                        className={`flex h-8 items-center gap-1.5 ${CUT_XS} px-3.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                          periodId === p.id
                            ? 'bg-brand-300 text-ink-950'
                            : 'text-ink-500 hover:text-white'
                        }`}
                      >
                        {p.label}
                        {p.off > 0 ? (
                          <span
                            className={`font-mono text-[11px] tabular-nums ${
                              periodId === p.id ? 'text-ink-800' : 'text-brand-300'
                            }`}
                          >
                            −15%
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {PLANS.map((p) => {
                    const on = p.id === planId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlanId(p.id)}
                        aria-pressed={on}
                        className={`${CUT_TILE} border p-5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                          on
                            ? 'border-brand-300 bg-ink-900'
                            : 'border-ink-800 bg-ink-950 hover:border-ink-700 hover:bg-ink-900'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[19px] font-extrabold tracking-tight text-white">
                              {p.name}
                            </p>
                            <p className="mt-2 font-mono text-[15px] font-bold tabular-nums text-brand-300">
                              {money(p.minor)}
                              <span className="ml-1 text-[12px] font-medium text-ink-500">
                                / თვე
                              </span>
                            </p>
                          </div>
                          <Check on={on} />
                        </div>
                        <p className="mt-3.5 text-[12.5px] leading-relaxed text-ink-400">
                          {p.perks}
                        </p>
                        {p.note ? (
                          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-600">
                            {p.note}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* start date + add-on */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className={`${CUT_TILE} border border-ink-800 bg-ink-950 p-5`}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                      დაწყება
                    </p>
                    <div className="mt-3.5 flex gap-2">
                      {STARTS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStartId(s.id)}
                          aria-pressed={startId === s.id}
                          className={`h-10 flex-1 ${CUT_XS} px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                            startId === s.id
                              ? 'bg-ink-800 text-white ring-1 ring-inset ring-brand-300'
                              : 'bg-ink-900 text-ink-400 hover:text-white'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAddon(!addon)}
                    aria-pressed={addon}
                    className={`${CUT_TILE} border p-5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                      addon
                        ? 'border-brand-300 bg-ink-900'
                        : 'border-ink-800 bg-ink-950 hover:border-ink-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                          დამატება · ერთჯერადი
                        </p>
                        <p className="mt-2.5 text-[15px] font-bold text-white">{ADDON.name}</p>
                        <p className="mt-1.5 text-[12.5px] text-ink-400">{ADDON.hint}</p>
                      </div>
                      <Check on={addon} />
                    </div>
                    <p className="mt-3 font-mono text-[14px] font-bold tabular-nums text-white">
                      + {money(ADDON.minor)}
                    </p>
                  </button>
                </div>
              </section>

              {/* --------------------------- 2 · details ----------------------- */}
              <section className="mt-12">
                <div className="border-b border-ink-800 pb-4">
                  <h2 className="text-[22px] font-extrabold tracking-tight">
                    <span className="mr-2.5 font-mono text-[14px] font-bold tabular-nums text-ink-600">
                      02
                    </span>
                    შენი მონაცემები
                  </h2>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                      სახელი და გვარი
                    </span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ნინო კაპანაძე"
                      aria-invalid={nameMissing}
                      className={`${fieldBase} ${CUT_MD} ${nameMissing ? 'border-danger-500' : fieldOk}`}
                    />
                    {nameMissing ? (
                      <span className="mt-2 block text-[12px] font-medium text-danger-400">
                        შეავსე სახელი და გვარი
                      </span>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                      ელფოსტა
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="member@downtown.demo"
                      aria-invalid={emailMissing}
                      className={`${fieldBase} ${CUT_MD} ${emailMissing ? 'border-danger-500' : fieldOk}`}
                    />
                    {emailMissing ? (
                      <span className="mt-2 block text-[12px] font-medium text-danger-400">
                        შეავსე ელფოსტა
                      </span>
                    ) : (
                      <span className="mt-2 block text-[12px] text-ink-600">
                        აქ მიიღებ ინვოისს და გამოცხადების QR-ს
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                      ტელეფონი
                    </span>
                    <span
                      className={`flex h-[52px] items-stretch ${CUT_MD} border bg-ink-950 focus-within:ring-2 focus-within:ring-brand-300/40 ${
                        phoneMissing
                          ? 'border-danger-500'
                          : 'border-ink-800 focus-within:border-brand-300'
                      }`}
                    >
                      <span className="grid w-[76px] shrink-0 place-items-center border-r border-ink-800 font-mono text-[15px] font-semibold tabular-nums text-ink-400">
                        +995
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="5XX XX XX XX"
                        aria-invalid={phoneMissing}
                        className="h-full min-w-0 flex-1 bg-transparent px-4 font-mono text-[15px] font-medium tabular-nums text-white placeholder:text-ink-600 focus:outline-none"
                      />
                    </span>
                    {phoneMissing ? (
                      <span className="mt-2 block text-[12px] font-medium text-danger-400">
                        შეავსე ნომერი
                      </span>
                    ) : null}
                  </label>
                </div>
              </section>

              {/* --------------------------- 3 · payment ----------------------- */}
              <section className="mt-12">
                <div className="border-b border-ink-800 pb-4">
                  <h2 className="text-[22px] font-extrabold tracking-tight">
                    <span className="mr-2.5 font-mono text-[14px] font-bold tabular-nums text-ink-600">
                      03
                    </span>
                    გადახდა
                  </h2>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {METHODS.map((m) => {
                    const on = m.id === method;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        aria-pressed={on}
                        className={`${CUT_TILE} border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                          on
                            ? 'border-brand-300 bg-ink-900'
                            : 'border-ink-800 bg-ink-950 hover:border-ink-700 hover:bg-ink-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Icon
                            d={m.icon}
                            className={`h-5 w-5 ${on ? 'text-brand-300' : 'text-ink-500'}`}
                          />
                          <Check on={on} />
                        </div>
                        <p className="mt-3.5 text-[14px] font-bold text-white">{m.label}</p>
                        <p className="mt-1 text-[12px] text-ink-500">{m.hint}</p>
                      </button>
                    );
                  })}
                </div>

                {method === 'card' ? (
                  <div className={`mt-4 ${CUT_TILE} border border-ink-800 bg-ink-900 p-5 sm:p-6`}>
                    <div className="grid gap-4 sm:grid-cols-[1.6fr_0.7fr_0.7fr]">
                      <label className="block sm:col-span-3">
                        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                          ბარათის ნომერი
                        </span>
                        <span className="relative block">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="4444 4444 4444 4444"
                            className={`${fieldBase} ${fieldOk} ${CUT_MD} pr-14 font-mono tabular-nums`}
                          />
                          <Icon
                            d={P.card}
                            className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-600"
                          />
                        </span>
                      </label>
                      <label className="block sm:col-start-1">
                        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                          ბარათზე მითითებული სახელი
                        </span>
                        <input
                          type="text"
                          placeholder="NINO KAPANADZE"
                          className={`${fieldBase} ${fieldOk} ${CUT_MD} uppercase`}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                          ვადა
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="12 / 28"
                          className={`${fieldBase} ${fieldOk} ${CUT_MD} font-mono tabular-nums`}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                          CVC
                        </span>
                        <input
                          type="password"
                          inputMode="numeric"
                          placeholder="•••"
                          className={`${fieldBase} ${fieldOk} ${CUT_MD} font-mono tabular-nums`}
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={saveCard}
                      onClick={() => setSaveCard(!saveCard)}
                      className="mt-5 flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                      <Check on={saveCard} />
                      <span className="text-[13px] font-medium text-ink-300">
                        ბარათის დამახსოვრება ავტომატური განახლებისთვის
                      </span>
                    </button>
                  </div>
                ) : (
                  <p
                    className={`mt-4 flex items-start gap-2.5 ${CUT_TILE} border border-ink-800 bg-ink-900 p-5 text-[13px] leading-relaxed text-ink-400`}
                  >
                    <Icon d={P.alert} className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
                    {method === 'wallet'
                      ? 'გადახდის დადასტურებას Google Pay-ის ფანჯარაში მოგთხოვ — ბარათის მონაცემები ჩვენთან არ ინახება.'
                      : 'ინვოისს ელფოსტაზე გამოგიგზავნით. აბონემენტი თანხის ჩარიცხვისთანავე გააქტიურდება (1 სამუშაო დღე).'}
                  </p>
                )}
              </section>
            </div>

            {/* ========================= order summary ========================= */}
            <aside className="min-w-0 lg:sticky lg:top-8">
              <section
                className={`relative overflow-hidden ${CUT_LG} bg-brand-300 p-6 text-ink-950 sm:p-7`}
              >
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-800">
                      შენი შეკვეთა
                    </span>
                    <span
                      className={`${CUT_XS} bg-ink-950 px-3 py-1 text-[11px] font-bold text-brand-300`}
                    >
                      {period.label}
                    </span>
                  </div>

                  <p className="mt-6 text-[36px] font-extrabold uppercase leading-none tracking-tight">
                    {plan.name}
                  </p>
                  <p className="mt-3 text-[13px] font-medium leading-relaxed text-ink-800">
                    {plan.perks}
                  </p>

                  <div className="mt-6 space-y-2.5 border-t border-ink-950/15 pt-5 text-[13.5px] font-medium text-ink-800">
                    <div className="flex items-baseline justify-between gap-4">
                      <span>
                        {money(plan.minor)} × {period.months} თვე
                      </span>
                      <span className="font-mono tabular-nums">{money(base)}</span>
                    </div>
                    {periodOff > 0 ? (
                      <div className="flex items-baseline justify-between gap-4">
                        <span>წლიური ფასდაკლება</span>
                        <span className="font-mono tabular-nums">−{money(periodOff)}</span>
                      </div>
                    ) : null}
                    {addon ? (
                      <div className="flex items-baseline justify-between gap-4">
                        <span>{ADDON.name}</span>
                        <span className="font-mono tabular-nums">{money(ADDON.minor)}</span>
                      </div>
                    ) : null}
                    {promoOff > 0 ? (
                      <div className="flex items-baseline justify-between gap-4">
                        <span>პრომოკოდი FORMA10</span>
                        <span className="font-mono tabular-nums">−{money(promoOff)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-t border-ink-950/15 pt-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-800">
                        დღეს გადასახდელი
                      </p>
                      <p className="mt-2 font-mono text-[38px] font-bold leading-none tabular-nums">
                        {money(total)}
                      </p>
                    </div>
                    <p className="pb-1.5 text-[11px] font-medium leading-relaxed text-ink-800 sm:text-right">
                      შემდეგი გადახდა
                      <br />
                      <span className="font-mono font-semibold tabular-nums">
                        {periodId === 'annual' ? '6 აგვისტო 2027' : '6 სექტემბერი 2026'}
                      </span>
                    </p>
                  </div>

                  {/* promo */}
                  <div className="mt-6">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promo}
                        onChange={(e) => {
                          setPromo(e.target.value);
                          setPromoState('idle');
                        }}
                        placeholder="პრომოკოდი"
                        className={`h-11 min-w-0 flex-1 ${CUT_SM} border border-ink-950/20 bg-ink-950/10 px-4 text-[14px] font-semibold uppercase text-ink-950 placeholder:font-medium placeholder:normal-case placeholder:text-ink-800/60 focus:border-ink-950 focus:outline-none`}
                      />
                      <button
                        type="button"
                        onClick={applyPromo}
                        className={`h-11 shrink-0 ${CUT_SM} bg-ink-950/10 px-5 text-[13px] font-bold text-ink-950 transition-colors hover:bg-ink-950/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950`}
                      >
                        გამოყენება
                      </button>
                    </div>
                    {promoState === 'ok' ? (
                      <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-950">
                        <Icon d={P.check} className="h-3.5 w-3.5" />
                        კოდი გააქტიურდა — −10%
                      </p>
                    ) : null}
                    {promoState === 'bad' ? (
                      <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-danger-700">
                        <Icon d={P.alert} className="h-3.5 w-3.5" />
                        ასეთი კოდი არ არსებობს
                      </p>
                    ) : null}
                  </div>

                  {/* terms + pay */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={terms}
                    onClick={() => setTerms(!terms)}
                    className="mt-6 flex items-start gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950"
                  >
                    <span
                      className={`mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center ${CUT_XS} transition-colors ${
                        terms
                          ? 'bg-ink-950 text-brand-300'
                          : termsMissing
                            ? 'bg-danger-700 text-danger-700'
                            : 'bg-ink-950/20 text-transparent'
                      }`}
                    >
                      <Icon d={P.check} className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[12.5px] font-medium leading-relaxed text-ink-800">
                      ვეთანხმები წევრობის წესებს და ავტომატურ განახლებას — გაუქმება ნებისმიერ დროს
                      შეიძლება.
                    </span>
                  </button>
                  {termsMissing ? (
                    <p className="mt-2 text-[12px] font-semibold text-danger-700">
                      დაადასტურე წესები, რომ გააგრძელო
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={pay}
                    disabled={state === 'paying'}
                    className={`mt-5 flex h-[56px] w-full items-center justify-center gap-2.5 ${CUT_MD} bg-ink-950 text-[16px] font-bold text-brand-300 transition-colors hover:bg-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950 disabled:cursor-not-allowed disabled:bg-ink-800 disabled:text-ink-400`}
                  >
                    {state === 'paying' ? (
                      <>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          className="h-5 w-5 animate-spin"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="8.5" className="opacity-30" />
                          <path d={P.spinner} />
                        </svg>
                        მუშავდება…
                      </>
                    ) : (
                      <>
                        <Icon d={P.lock} className="h-[18px] w-[18px]" />
                        გადახდა {money(total)}
                      </>
                    )}
                  </button>

                  <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-800">
                    ფასი დღგ-ს შეიცავს. 14 დღის განმავლობაში სრული დაბრუნება, თუ არ მოგეწონება.
                  </p>
                </div>
              </section>

              <div className={`mt-4 ${CUT_TILE} border border-ink-800 bg-ink-900 p-5`}>
                <div className="flex items-start gap-3">
                  <Icon d={P.ticket} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ink-500" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-white">გაქვს სასაჩუქრე ვაუჩერი?</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
                      შეიყვანე ვაუჩერის კოდი პრომოკოდის ველში — თანხა ავტომატურად ჩამოგეჭრება.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 border-t border-ink-800 pt-4">
                  <img
                    src="https://i.pravatar.cc/120?img=45"
                    alt="Nino Kapanadze"
                    width={36}
                    height={36}
                    referrerPolicy="no-referrer"
                    className={`h-9 w-9 shrink-0 ${CUT_XS} object-cover`}
                  />
                  <p className="text-[12.5px] leading-relaxed text-ink-400">
                    „ორ წუთში გავფორმდი და იმავე საღამოს Spin-ზე ვიყავი." — Nino K., Premium
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* =============================== footer ================================ */}
      <footer className="mt-16 border-t border-ink-900">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-7 lg:px-10">
          <p className="text-[12.5px] text-ink-600">
            © 2026 FormaCore · Downtown Strength · ს/კ 405 123 456
          </p>
          <div className="flex flex-wrap items-center gap-5">
            {['წესები და პირობები', 'კონფიდენციალურობა', 'დაბრუნების პოლიტიკა', 'დახმარება'].map(
              (l) => (
                <a
                  key={l}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-[12.5px] font-medium text-ink-500 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  {l}
                </a>
              ),
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
