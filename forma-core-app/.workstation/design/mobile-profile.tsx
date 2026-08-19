// @device: mobile
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore mobile — პროფილი · app/(tabs)/profile/index.tsx
   Every row exists in the app: membership + freeze sheet, PT credits, the
   three stats, achievements, the two push toggles, the settings menu, and
   the version line. Copy verbatim from @fit/i18n ka.json
   (member.profile.mobile.*). Art direction "Lime Block".
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
  chevron: 'm9 5 7 7-7 7',
  card: 'M3 8.5h18M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z',
  dumbbell: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9.5h17M3.5 14.5h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  pause: 'M9.5 5v14M14.5 5v14',
  logout:
    'M15 8V6a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 18v-2M10 12h10m0 0-3-3m3 3-3 3',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7',
  flame: 'M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5.8-2.8.8-2.8S8.5 10 9.5 10c1.2 0 .8-4.5 2.5-7Z',
  medal: 'M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM8.5 14 7 21l5-2.5L17 21l-1.5-7',
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

/** A settings row — `member.profile.mobile.menu.*`. */
function MenuRow({
  icon,
  title,
  hint,
  value,
  danger = false,
}: {
  icon: string;
  title: string;
  hint?: string;
  value?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          danger ? 'bg-danger-500/15 text-danger-400' : 'bg-ink-800 text-ink-200'
        }`}
      >
        <Icon d={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[15px] font-semibold ${danger ? 'text-danger-400' : 'text-white'}`}
        >
          {title}
        </span>
        {hint ? (
          <span className="mt-0.5 block truncate text-[12px] text-ink-400">{hint}</span>
        ) : null}
      </span>
      {value ? (
        <span className="shrink-0 text-[13px] font-medium text-ink-400">{value}</span>
      ) : null}
      <Icon d={P.chevron} className="h-4 w-4 shrink-0 text-ink-600" />
    </button>
  );
}

/** A push preference — `member.profile.mobile.toggles.*`. */
function Toggle({ label, hint, on: initial }: { label: string; hint: string; on: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-white">{label}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-400">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 ${
          on ? 'bg-brand-300' : 'bg-ink-700'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full transition-all ${
            on ? 'left-6 bg-ink-950' : 'left-1 bg-ink-400'
          }`}
        />
      </button>
    </div>
  );
}

/** `member.profile.mobile.achievements.*` — earned from the visit count. */
const ACHIEVEMENTS = [
  { key: 'firstClass', label: 'პირველი გაკვეთილი', earned: true },
  { key: 'tenVisits', label: '10 ვიზიტი', earned: true },
  { key: 'streak', label: '7-დღიანი სერია', earned: true },
  { key: 'fiftyVisits', label: '50 ვიზიტი', earned: false },
  { key: 'hundredVisits', label: '100 ვიზიტი', earned: false },
];

const FREEZE_OPTIONS = ['2 კვირა', '1 თვე', '2 თვე'];

export default function MobileProfile() {
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeChoice, setFreezeChoice] = useState(FREEZE_OPTIONS[1]);

  return (
    <div className="relative min-h-[900px] w-full bg-ink-950 pb-32 font-sans text-white">
      {/* ------------------------------- app bar ---------------------------- */}
      <header className="flex items-center justify-between px-5 pb-6 pt-14">
        <h1 className="text-[28px] font-extrabold leading-none tracking-tight">პროფილი</h1>
        <button
          type="button"
          aria-label="შეტყობინებები"
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-ink-200 transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <Icon d={P.bell} className="h-[19px] w-[19px]" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-300 ring-2 ring-ink-900" />
        </button>
      </header>

      {/* ------------------------------ identity ---------------------------- */}
      <section className="flex items-center gap-4 px-5">
        <img
          src="https://i.pravatar.cc/200?img=45"
          alt="Nino Kapanadze"
          width={72}
          height={72}
          referrerPolicy="no-referrer"
          className="h-[72px] w-[72px] shrink-0 rounded-full object-cover ring-2 ring-brand-300"
        />
        <div className="min-w-0">
          <p className="truncate text-[24px] font-extrabold leading-none tracking-tight">
            Nino Kapanadze
          </p>
          <p className="mt-2 truncate text-[13px] text-ink-400">Premium · 2024 წლიდან</p>
        </div>
      </section>

      {/* ----------------------------- membership --------------------------- */}
      <section className="mt-6 px-5">
        <div className={`relative overflow-hidden ${CUT_LG} bg-brand-300 p-5 text-ink-950`}>
          <div className="relative">
            <div className="flex items-start justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-800">
                წევრობა
              </span>
              <span className="rounded-pill bg-ink-950 px-3 py-1 text-[11px] font-bold text-brand-300">
                აქტიური
              </span>
            </div>

            <p className="mt-4 text-[34px] font-extrabold uppercase leading-none tracking-tight">
              Premium
            </p>
            <p className="mt-2.5 text-[13px] font-medium text-ink-800">
              განახლდება 14 აგვისტოს · დარჩა <span className="font-mono tabular-nums">22/30</span>{' '}
              დღე
            </p>

            <div className="mt-4 h-2 overflow-hidden rounded-pill bg-ink-950/15">
              <div className="h-full rounded-pill bg-ink-950" style={{ width: '73%' }} />
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className={`h-11 flex-1 ${CUT_SM} bg-ink-950 text-[14px] font-bold text-brand-300 transition-colors hover:bg-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
              >
                გამოცხადების QR
              </button>
              <button
                type="button"
                onClick={() => setFreezeOpen(true)}
                className={`flex h-11 shrink-0 items-center gap-2 ${CUT_SM} bg-ink-950/10 px-5 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-ink-950/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950`}
              >
                <Icon d={P.pause} className="h-4 w-4" />
                გაყინვა
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- PT credits --------------------------- */}
      <section className="mt-4 px-5">
        <div className="flex items-center gap-4 rounded-[26px] border border-ink-800 bg-ink-900 p-5 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              პერსონალური ვარჯიში
            </p>
            <p className="mt-2 text-[20px] font-extrabold leading-none tracking-tight">
              2 PT სესია დარჩა
            </p>
            <p className="mt-2 text-[12px] font-medium text-ink-400">
              განახლდება წევრობასთან ერთად
            </p>
          </div>
          <button
            type="button"
            className={`h-11 shrink-0 ${CUT_SM} bg-brand-300 px-5 text-[14px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
          >
            ყიდვა
          </button>
        </div>
      </section>

      {/* -------------------------------- stats ----------------------------- */}
      <section className="mt-4 px-5">
        <div className="flex gap-3">
          {[
            { v: '18', l: 'დღიური სერია' },
            { v: '24', l: 'სულ ვიზიტი' },
            { v: '19', l: 'გაკვეთილი' },
          ].map((s) => (
            <div key={s.l} className="flex-1 rounded-[22px] bg-ink-900 p-4">
              <p className="font-mono text-[28px] font-bold leading-none tabular-nums text-white">
                {s.v}
              </p>
              <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
                {s.l}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------- achievements -------------------------- */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="text-[20px] font-extrabold tracking-tight">მიღწევები</h2>
          <button
            type="button"
            className="shrink-0 text-[12px] font-semibold text-ink-400 transition-colors hover:text-white"
          >
            ყველა
          </button>
        </div>
        <div className="mt-3.5 flex gap-2.5 overflow-x-auto px-5 pb-1">
          {ACHIEVEMENTS.map((a) => (
            <div
              key={a.key}
              className={`flex w-[112px] shrink-0 flex-col items-center rounded-[22px] p-4 text-center ${
                a.earned ? 'bg-white text-ink-950' : 'bg-ink-900 text-ink-500'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  a.earned ? 'bg-ink-950 text-brand-300' : 'bg-ink-800 text-ink-600'
                }`}
              >
                <Icon d={a.key === 'streak' ? P.flame : P.medal} className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[12px] font-semibold leading-tight">{a.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------ preferences -------------------------- */}
      <section className="mt-7 px-5">
        <h2 className="text-[20px] font-extrabold tracking-tight">პარამეტრები</h2>

        <div className="mt-3.5 divide-y divide-ink-800 overflow-hidden rounded-[26px] bg-ink-900">
          <Toggle label="Push შეტყობინებები" hint="შეხსენებები და შეთავაზებები" on />
          <Toggle label="გაკვეთილის შეხსენება" hint="დაჯავშნილ გაკვეთილებამდე" on />
        </div>

        <div className="mt-3 divide-y divide-ink-800 overflow-hidden rounded-[26px] bg-ink-900">
          <MenuRow icon={P.card} title="ბილინგი" hint="PT კრედიტები და ინვოისები" />
          <MenuRow icon={P.dumbbell} title="პერსონალური ვარჯიში" hint="პაკეტები და PT სესიები" />
          <MenuRow icon={P.user} title="მწვრთნელები" hint="დათვალიერება და დაჯავშნა" />
          <MenuRow icon={P.bell} title="შეტყობინებები" hint="შეხსენებები და განახლებები" />
          <MenuRow icon={P.moon} title="იერსახე" hint="სისტემის მიხედვით" />
          <MenuRow icon={P.globe} title="ენა" value="ქართული" />
        </div>

        <div className="mt-3 overflow-hidden rounded-[26px] bg-ink-900">
          <MenuRow icon={P.logout} title="გასვლა" danger />
        </div>

        <p className="mt-5 text-center text-[12px] text-ink-600">FormaCore · v1.4.0</p>
      </section>

      {/* ------------------------- floating capsule nav ---------------------- */}
      <nav className="absolute inset-x-0 bottom-6 z-10 flex justify-center px-5">
        <div className="flex w-full items-center justify-between rounded-pill bg-ink-900 p-2">
          {[
            { key: 'home', label: 'მთავარი', icon: P.home },
            { key: 'classes', label: 'გაკვეთილები', icon: P.calendar },
            { key: 'qr', label: 'გამოცხადება', icon: P.qr },
            { key: 'shop', label: 'მაღაზია', icon: P.bag },
            { key: 'profile', label: 'პროფილი', icon: P.user },
          ].map((t) => {
            const active = t.key === 'profile';
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

      {/* ----------------------------- freeze sheet -------------------------- */}
      {freezeOpen ? (
        <div className="absolute inset-0 z-20">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setFreezeOpen(false)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-ink-900 px-5 pb-8 pt-3">
            <div className="mx-auto mb-5 h-1 w-10 rounded-pill bg-ink-700" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[22px] font-extrabold tracking-tight text-white">
                  წევრობის გაყინვა
                </p>
                <p className="mt-1.5 text-[13px] text-ink-400">შეაჩერე გადახდები, სანამ არ ხარ.</p>
              </div>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setFreezeOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
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
                  className={`h-[52px] flex-1 rounded-[20px] text-[14px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    freezeChoice === o
                      ? 'bg-brand-300 text-ink-950'
                      : 'bg-ink-800 text-ink-300 hover:text-white'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-ink-400">
              დარჩენილი დღეები შენარჩუნდება — არაფერი იკარგება. ამ პერიოდში კიდევ 30 დღის გაყინვა
              შეგიძლია.
            </p>

            <button
              type="button"
              onClick={() => setFreezeOpen(false)}
              className={`mt-6 flex h-[52px] w-full items-center justify-center gap-2 ${CUT_MD} bg-brand-300 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
            >
              <Icon d={P.check} className="h-[18px] w-[18px]" />
              გაყინვა {freezeChoice}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
