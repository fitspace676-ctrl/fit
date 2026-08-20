// @device: mobile
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore mobile — ჩექ-ინი · app/(tabs)/qr.tsx
   The pass a member holds up at the desk. Status + plan + days-left come from
   GET /me/subscription, the name from GET /me/profile, and "recent check-ins"
   from the member's ATTENDED bookings — the member never writes a check-in,
   the desk scanner resolves the code. The token rotates every 60s.
   Copy verbatim from @fit/i18n ka.json (qr.*). Art direction "Lime Block".
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
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 5v6h-6',
  copy: 'M9 9V6.5A1.5 1.5 0 0 1 10.5 5h7A1.5 1.5 0 0 1 19 6.5v7a1.5 1.5 0 0 1-1.5 1.5H15M6.5 9h7A1.5 1.5 0 0 1 15 10.5v7A1.5 1.5 0 0 1 13.5 19h-7A1.5 1.5 0 0 1 5 17.5v-7A1.5 1.5 0 0 1 6.5 9Z',
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

/** The painted code. The scanner resolves member + gym; the token only rotates. */
function QrArt({ dark, light }: { dark: string; light: string }) {
  return (
    <svg viewBox="0 0 29 29" className="h-full w-full" role="img" aria-label="ჩექ-ინის QR კოდი">
      <g fill={dark}>
        {[
          [0, 0],
          [22, 0],
          [0, 22],
        ].map(([x, y]) => (
          <g key={`f${x}-${y}`}>
            <rect x={x} y={y} width="7" height="7" rx="1.6" />
            <rect x={x + 1.4} y={y + 1.4} width="4.2" height="4.2" rx="1" fill={light} />
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
  );
}

/** Attended bookings, newest first — the member's visit history. */
const RECENT = [
  { id: 'v1', title: 'Spin Express', when: 'გუშინ', time: '18:00', trainer: 'Sandro K.' },
  { id: 'v2', title: 'CrossFit WOD', when: 'ორშ', time: '12:00', trainer: 'Levan M.' },
  { id: 'v3', title: 'Morning Yoga', when: 'კვი', time: '08:00', trainer: 'Ana G.' },
];

export default function MobileQr() {
  const [boosted, setBoosted] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={`relative min-h-[900px] w-full pb-32 font-sans transition-colors ${
        boosted ? 'bg-brand-300 text-ink-950' : 'bg-ink-950 text-white'
      }`}
    >
      {/* ------------------------------- app bar ---------------------------- */}
      <header className="flex items-start justify-between px-5 pb-6 pt-14">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-none tracking-tight">ჩექ-ინი</h1>
          <p className={`mt-2.5 text-[13px] ${boosted ? 'text-ink-800' : 'text-ink-400'}`}>
            აჩვენე ეს კოდი მიმღების სკანერს.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBoosted(!boosted)}
          aria-pressed={boosted}
          aria-label="სიკაშკაშის გაზრდა"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
            boosted ? 'bg-ink-950 text-brand-300' : 'bg-ink-900 text-ink-200 hover:bg-ink-800'
          }`}
        >
          <Icon d={P.sun} className="h-[19px] w-[19px]" />
        </button>
      </header>

      {/* -------------------------------- pass ------------------------------ */}
      <section className="px-5">
        <div
          className={`overflow-hidden rounded-[32px] p-5 ${
            boosted ? 'bg-white text-ink-950' : 'bg-brand-300 text-ink-950'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-800">
              Downtown Strength
            </span>
            <span className="rounded-pill bg-ink-950 px-3 py-1 text-[11px] font-bold text-brand-300">
              აქტიური
            </span>
          </div>

          <div
            className={`mx-auto mt-5 w-full max-w-[264px] rounded-[26px] p-4 ${boosted ? 'bg-white' : 'bg-brand-50'}`}
          >
            <QrArt dark="#131312" light={boosted ? '#FFFFFF' : '#FBFEE9'} />
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-ink-800">
            <Icon d={P.refresh} className="h-3.5 w-3.5" />
            <span className="text-[12px] font-medium tabular-nums">განახლდება 0:47-ში</span>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-[22px] bg-ink-950 p-3.5">
            <img
              src="https://i.pravatar.cc/160?img=45"
              alt="Nino Kapanadze"
              width={44}
              height={44}
              referrerPolicy="no-referrer"
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-brand-300"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-white">Nino Kapanadze</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-400">
                Premium · წევრის ID <span className="font-mono tabular-nums">FC-4821</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-[22px] font-bold leading-none tabular-nums text-brand-300">
                8
              </p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                დარჩენილი დღე
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------- manual fallback code --------------------- */}
      <section className="mt-4 px-5">
        <button
          type="button"
          onClick={() => setCopied(true)}
          className={`flex w-full items-center gap-3 ${CUT_MD} p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
            boosted ? 'bg-ink-950/10 hover:bg-ink-950/15' : 'bg-ink-900 hover:bg-ink-800'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block text-[11px] font-semibold uppercase tracking-[0.12em] ${
                boosted ? 'text-ink-700' : 'text-ink-400'
              }`}
            >
              წევრის ID
            </span>
            <span className="mt-1.5 block font-mono text-[20px] font-bold tracking-[0.1em] tabular-nums">
              FC-4821
            </span>
          </span>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              copied
                ? 'bg-brand-300 text-ink-950'
                : boosted
                  ? 'bg-ink-950 text-brand-300'
                  : 'bg-ink-800 text-ink-300'
            }`}
          >
            <Icon d={copied ? P.check : P.copy} className="h-[18px] w-[18px]" />
          </span>
        </button>
        <p className={`mt-2.5 px-1 text-[12px] ${boosted ? 'text-ink-700' : 'text-ink-500'}`}>
          სწრაფი სკანირებისთვის გაზარდე ეკრანის სიკაშკაშე.
        </p>
      </section>

      {/* --------------------------- recent check-ins ----------------------- */}
      <section className="mt-7 px-5">
        <h2 className="text-[20px] font-extrabold tracking-tight">ბოლო ჩექ-ინები</h2>
        <div className="mt-3.5 space-y-2">
          {RECENT.map((v) => (
            <div
              key={v.id}
              className={`flex items-center gap-3 rounded-[22px] p-4 ${
                boosted ? 'bg-ink-950/10' : 'bg-ink-900'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  boosted ? 'bg-ink-950 text-brand-300' : 'bg-ink-800 text-brand-300'
                }`}
              >
                <Icon d={P.check} className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[15px] font-semibold ${boosted ? 'text-ink-950' : 'text-white'}`}
                >
                  {v.title}
                </p>
                <p
                  className={`mt-0.5 truncate text-[12px] ${boosted ? 'text-ink-700' : 'text-ink-400'}`}
                >
                  {v.trainer}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-mono text-[13px] font-semibold tabular-nums ${boosted ? 'text-ink-950' : 'text-white'}`}
                >
                  {v.time}
                </p>
                <p className={`mt-0.5 text-[11px] ${boosted ? 'text-ink-700' : 'text-ink-500'}`}>
                  {v.when}
                </p>
              </div>
            </div>
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
            const active = t.key === 'qr';
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
    </div>
  );
}
