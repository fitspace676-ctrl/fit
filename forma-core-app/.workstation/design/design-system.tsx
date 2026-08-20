import React, { useState } from 'react';

/* ==========================================================================
   FormaCore — Mobile Design System  ·  "Lime Block"
   Charcoal ink canvas · large soft-cornered colour blocks · lime reserved for
   the membership · giant cropped mono numerals · stroke icons (no emoji).
   ========================================================================== */

/* ----------------------------------- icons ------------------------------- */

/* The signature shape: two corners rounded, two cut on the diagonal — controls
   repeat the membership block's silhouette, scaled down. */
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
  bolt: 'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3Z',
  flame: 'M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5.8-2.8.8-2.8S8.5 10 9.5 10c1.2 0 .8-4.5 2.5-7Z',
  check: 'm5 12.5 4.5 4.5L19 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.2 2',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  card: 'M3 8.5h18M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z',
  filter: 'M4 6h16M7 12h10M10 18h4',
  star: 'm12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z',
  dumbbell: 'M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.5 12c0-.6-.07-1.1-.2-1.7l1.8-1.3-1.9-3.3-2.1.8a7.6 7.6 0 0 0-2.9-1.7L13.9 2.5h-3.8L9.8 4.8a7.6 7.6 0 0 0-2.9 1.7l-2.1-.8L2.9 9l1.8 1.3a7 7 0 0 0 0 3.4L2.9 15l1.9 3.3 2.1-.8a7.6 7.6 0 0 0 2.9 1.7l.3 2.3h3.8l.3-2.3a7.6 7.6 0 0 0 2.9-1.7l2.1.8 1.9-3.3-1.8-1.3c.13-.6.2-1.1.2-1.7Z',
  logout:
    'M15 8V6a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 18v-2M10 12h10m0 0-3-3m3 3-3 3',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10',
};

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/* --------------------------------- board chrome -------------------------- */

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink-800 pt-8">
      <div className="mb-6 flex items-baseline gap-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-300">
          {title}
        </h2>
        <p className="text-sm text-ink-400">{note}</p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Panel({
  label,
  span = 1,
  children,
}: {
  label: string;
  span?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const cols = span === 3 ? 'lg:col-span-3 md:col-span-2' : span === 2 ? 'md:col-span-2' : '';
  return (
    <div className={`rounded-card border border-ink-800 bg-ink-900 ${cols}`}>
      <div className="border-b border-ink-800 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">
          {label}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* =============================== components ============================== */

/** Primary / secondary / ghost / danger button — 48px min tap target. */
function Btn({
  children,
  variant = 'primary',
  full = false,
  icon,
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  full?: boolean;
  icon?: string;
  disabled?: boolean;
}) {
  const base =
    'inline-flex h-12 items-center justify-center gap-2 rounded-btn px-5 text-[15px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:opacity-40';
  const v = {
    primary: 'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600',
    secondary:
      'border border-ink-700 bg-ink-800 text-ink-100 hover:border-ink-600 hover:bg-ink-700',
    ghost: 'text-ink-300 hover:bg-ink-800 hover:text-white',
    danger: 'border border-danger-800 bg-danger-950 text-danger-300 hover:bg-danger-900',
  }[variant];
  return (
    <button type="button" disabled={disabled} className={`${base} ${v} ${full ? 'w-full' : ''}`}>
      {icon ? <Icon d={icon} className="h-[18px] w-[18px]" /> : null}
      {children}
    </button>
  );
}

/** Small-caps section label — the system's connective tissue (Georgian-safe). */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
      {children}
    </span>
  );
}

/** Status pill — dot + text, tone-coded. */
function Pill({
  children,
  tone = 'brand',
}: {
  children: React.ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const t = {
    brand: 'border-brand-700 bg-brand-950 text-brand-200',
    success: 'border-brand-800 bg-brand-950 text-brand-200',
    warning: 'border-ink-700 bg-ink-900 text-ink-200',
    danger: 'border-danger-800 bg-danger-950 text-danger-300',
    muted: 'border-ink-700 bg-ink-800 text-ink-300',
  }[tone];
  const dot = {
    brand: 'bg-brand-400',
    success: 'bg-brand-300',
    warning: 'bg-ink-300',
    danger: 'bg-danger-400',
    muted: 'bg-ink-400',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-semibold ${t}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/** Occupancy meter — tone shifts as the class fills. */
function Occupancy({ booked, cap }: { booked: number; cap: number }) {
  const pct = Math.min(Math.round((booked / cap) * 100), 100);
  const tone = pct >= 100 ? 'bg-danger-500' : pct > 85 ? 'bg-ink-400' : 'bg-brand-300';
  return (
    <div className="h-1 overflow-hidden rounded-pill bg-ink-800">
      <div className={`h-full rounded-pill ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * The signature element: a class occurrence hung off a time rail whose colour is
 * `ClassInstanceCard.color` — the category hex the API ships (seeded CLASS_TYPES),
 * so the client never hard-codes a category→colour map.
 */
function ClassRow({
  time,
  day,
  title,
  meta,
  color,
  booked,
  cap,
  state = 'open',
  position,
}: {
  time: string;
  day: string;
  title: string;
  meta: string;
  color: string;
  booked: number;
  cap: number;
  state?: 'open' | 'BOOKED' | 'WAITLIST';
  position?: number;
}) {
  const spotsLeft = cap - booked;
  const full = spotsLeft <= 0;
  return (
    <div className="flex gap-4 py-4">
      <div className="w-12 shrink-0 pt-0.5 text-right">
        <div className="font-mono text-[15px] font-semibold tabular-nums text-white">{time}</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
          {day}
        </div>
      </div>
      <div className="min-w-0 flex-1 border-l-2 pl-4" style={{ borderColor: color }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-white">{title}</p>
            <p className="mt-1 truncate text-[12px] text-ink-400">{meta}</p>
          </div>
          {state === 'BOOKED' ? (
            <button
              type="button"
              className={`shrink-0 ${CUT_SM} border border-brand-700 bg-brand-950 px-3 py-1.5 text-[12px] font-semibold text-brand-200 hover:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}
            >
              დაჯავშნილი
            </button>
          ) : state === 'WAITLIST' ? (
            <button
              type="button"
              className={`shrink-0 ${CUT_SM} border border-ink-700 bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-ink-200 hover:border-ink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}
            >
              მოლოდინი · #{position ?? 1}
            </button>
          ) : (
            <button
              type="button"
              className={`shrink-0 ${CUT_SM} border border-ink-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:border-brand-500 hover:bg-brand-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}
            >
              {full ? 'მოლოდინის სია' : 'დაჯავშნა'}
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="w-20">
            <Occupancy booked={booked} cap={cap} />
          </div>
          <span className="text-[11px] tabular-nums text-ink-500">
            {full ? 'სავსეა' : `${spotsLeft} დარჩა`}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The membership pass — the credential a member holds up at the desk. Plan name
 * (`MeSubscription.planName`) is the whole graphic: flat brand field, one
 * hairline, no decoration. Days-left comes from `currentPeriodEnd`.
 */
function MembershipCard() {
  return (
    <div className="overflow-hidden rounded-card bg-brand-600">
      <div className="h-px bg-white/40" />
      <div className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            აბონემენტი
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
            აქტიური
          </span>
        </div>

        <div className="mt-7 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[32px] font-extrabold leading-none tracking-tight text-white">
              Premium
            </p>
            <p className="mt-2.5 truncate text-[12px] text-white/75">
              Nino Kapanadze · <span className="font-mono tabular-nums">FC-4821</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[26px] font-bold leading-none tabular-nums text-white">
              8
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
              დარჩენილი დღე
            </p>
          </div>
        </div>

        <div className="mt-5 h-1 overflow-hidden rounded-pill bg-white/25">
          <div className="h-full rounded-pill bg-white" style={{ width: '73%' }} />
        </div>
        <p className="mt-2 text-[11px] tabular-nums text-white/70">22 / 30 დღე დარჩა</p>
      </div>
    </div>
  );
}

/** A headline metric — big mono number over a small-caps label. */
function Stat({
  value,
  unit,
  label,
  icon,
}: {
  value: string;
  unit?: string;
  label: string;
  icon: string;
}) {
  return (
    <div className="flex-1 border-l border-ink-800 pl-3">
      <Icon d={icon} className="h-4 w-4 text-ink-500" />
      <p className="mt-2 font-mono text-[26px] font-bold leading-none tabular-nums text-white">
        {value}
        {unit ? <span className="ml-0.5 text-[13px] font-medium text-ink-500">{unit}</span> : null}
      </p>
      <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-500">
        {label}
      </p>
    </div>
  );
}

/** Settings/list row with chevron or external glyph. */
function ListRow({
  icon,
  title,
  hint,
  ext = false,
  danger = false,
}: {
  icon: string;
  title: string;
  hint?: string;
  ext?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-ink-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border ${
          danger
            ? 'border-danger-900 bg-danger-950 text-danger-400'
            : 'border-ink-800 bg-ink-800 text-ink-300'
        }`}
      >
        <Icon d={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[15px] font-medium ${danger ? 'text-danger-300' : 'text-white'}`}
        >
          {title}
        </span>
        {hint ? (
          <span className="mt-0.5 block truncate text-[12px] text-ink-500">{hint}</span>
        ) : null}
      </span>
      <Icon d={ext ? P.ext : P.chevron} className="h-4 w-4 shrink-0 text-ink-600" />
    </button>
  );
}

/** Category chips — the seeded CLASS_TYPES, each carrying its own colour dot. */
function Chips() {
  const items = [
    { key: '__all', label: 'ყველა', color: '' },
    { key: 'Boxing', label: 'Boxing', color: '#6C6C68' },
    { key: 'Yoga Flow', label: 'Yoga Flow', color: '#DCDCDA' },
    { key: 'CrossFit', label: 'CrossFit', color: '#C4C4C1' },
    { key: 'Spin', label: 'Spin', color: '#8F8F8B' },
    { key: 'Pilates', label: 'Pilates', color: '#B0B0AD' },
  ];
  const [active, setActive] = useState('__all');
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => setActive(c.key)}
          className={`flex h-9 items-center gap-2 ${CUT_SM} px-4 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
            active === c.key
              ? 'bg-white text-ink-950'
              : 'border border-ink-700 text-ink-300 hover:border-ink-600 hover:text-white'
          }`}
        >
          {c.color ? (
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
          ) : null}
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** iOS-style segmented control. */
function Segmented() {
  const items = ['დღეს', 'კვირა', 'თვე'];
  const [active, setActive] = useState('კვირა');
  return (
    <div className="flex rounded-btn border border-ink-800 bg-ink-950 p-1">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setActive(s)}
          className={`h-9 flex-1 rounded-[8px] text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
            active === s ? 'bg-ink-800 text-white' : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** Text field with label + focus ring. */
function Field({
  label,
  placeholder,
  hint,
}: {
  label: string;
  placeholder: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
        {label}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        className="h-12 w-full rounded-field border border-ink-700 bg-ink-950 px-3.5 text-[15px] text-white placeholder:text-ink-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      {hint ? <span className="mt-1.5 block text-[12px] text-ink-500">{hint}</span> : null}
    </label>
  );
}

/** Toggle switch. */
function Toggle({ label, hint, on: initial }: { label: string; hint: string; on: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-white">{label}</p>
        <p className="mt-0.5 text-[12px] text-ink-500">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 ${
          on ? 'bg-brand-500' : 'bg-ink-700'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

/** Mobile top app bar. */
function AppBar() {
  return (
    <div className="flex items-center justify-between rounded-card border border-ink-800 bg-ink-950 px-4 py-3">
      <button type="button" className="text-ink-400 hover:text-white">
        <Icon d={P.chevron} className="h-5 w-5 rotate-180" />
      </button>
      <p className="text-[15px] font-semibold text-white">გაკვეთილები</p>
      <button type="button" className="text-ink-400 hover:text-white">
        <Icon d={P.filter} className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Bottom tab bar with the raised QR check-in FAB. */
function TabBar() {
  const [tab, setTab] = useState('home');
  const tabs = [
    { key: 'home', label: 'მთავარი', icon: P.home },
    { key: 'classes', label: 'გაკვეთილები', icon: P.calendar },
    { key: 'qr', label: '', icon: P.qr },
    { key: 'shop', label: 'მაღაზია', icon: P.bag },
    { key: 'profile', label: 'პროფილი', icon: P.user },
  ];
  return (
    <div className="relative rounded-card border border-ink-800 bg-ink-900 px-2 pb-3 pt-2">
      <div className="flex items-end">
        {tabs.map((t) =>
          t.key === 'qr' ? (
            <div key={t.key} className="flex flex-1 justify-center">
              <button
                type="button"
                onClick={() => setTab('qr')}
                aria-label="გამოცხადების QR"
                className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-float ring-4 ring-ink-900 transition-colors hover:bg-brand-400 focus:outline-none focus-visible:ring-brand-300"
              >
                <Icon d={P.qr} className="h-6 w-6" />
              </button>
            </div>
          ) : (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-1 py-1 transition-colors focus:outline-none ${
                tab === t.key ? 'text-white' : 'text-ink-500 hover:text-ink-300'
              }`}
            >
              <Icon d={t.icon} className="h-[22px] w-[22px]" />
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Product row for the shop rail. `ProductSummary` carries a base price and
 * variants that may price above it, so a multi-variant product reads
 * "{price}-დან" (shop.browse.fromPrice). GEL minor units, `formatMoney`.
 */
function ProductRow({ name, minor, variants }: { name: string; minor: number; variants: number }) {
  const price = `${(minor / 100).toFixed(2).replace('.', ',')} ₾`;
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-ink-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-white">{name}</span>
        <span className="mt-1 block text-[12px] text-ink-500">
          {variants > 0 ? `${variants} ვარიანტი` : 'ერთი ვარიანტი'}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[14px] font-semibold tabular-nums text-white">
        {variants > 1 ? `${price}-დან` : price}
      </span>
      <Icon d={P.chevron} className="h-4 w-4 shrink-0 text-ink-600" />
    </button>
  );
}

/** Trainer row — the seeded DEMO_TRAINERS, each with the types they coach. */
function PersonRow({ name, teaches, img }: { name: string; teaches: string; img: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <img
        src={img}
        alt={name}
        width={44}
        height={44}
        className="h-11 w-11 rounded-full object-cover ring-1 ring-ink-700"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-white">{name}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-500">{teaches}</p>
      </div>
      <button
        type="button"
        className={`shrink-0 ${CUT_SM} border border-ink-700 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:border-brand-500 hover:bg-brand-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}
      >
        სესიის დაჯავშნა
      </button>
    </div>
  );
}

/** Empty state — `member.classes.empty.*`, the strings the app actually ships. */
function EmptyState() {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-ink-800 bg-ink-950 text-ink-600">
        <Icon d={P.calendar} className="h-6 w-6" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-white">დღეს გაკვეთილები არ არის</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-500">სცადეთ სხვა დღე ან ფილტრი.</p>
      <div className="mt-4">
        <Btn variant="secondary">გაკვეთილების ნახვა</Btn>
      </div>
    </div>
  );
}

/** Bottom sheet — wired, opens on the trigger. */
function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative h-72 overflow-hidden rounded-card border border-ink-800 bg-ink-950">
      <div className="p-4">
        <p className="text-[13px] leading-relaxed text-ink-400">
          ჯავშნის გაუქმება, გადახდის მეთოდის არჩევა, ფილტრები — ყველაფერი ქვედა ფურცელში ჩნდება.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 h-12 w-full rounded-btn bg-brand-500 text-[15px] font-semibold text-white transition-colors hover:bg-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          ფურცლის გახსნა
        </button>
      </div>
      {open ? (
        <>
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-950/70"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-card border-t border-ink-800 bg-ink-900 p-4 shadow-float">
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-700" />
            <p className="text-[15px] font-semibold text-white">ჯავშნის გაუქმება?</p>
            <p className="mt-1 text-[13px] text-ink-400">
              Spin Express · 18:00 · Sandro K. — გაუქმების ვადა 2 საათია.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 flex-1 rounded-btn border border-ink-700 text-[14px] font-semibold text-ink-200 hover:bg-ink-800"
              >
                დატოვე
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-11 flex-1 rounded-btn bg-danger-600 text-[14px] font-semibold text-white hover:bg-danger-500"
              >
                გაუქმება
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Inline alert / advisory banner. */
function Alert({ tone, title, body }: { tone: 'warning' | 'info'; title: string; body: string }) {
  const s =
    tone === 'warning'
      ? 'border-ink-700 bg-ink-900 text-ink-100'
      : 'border-ink-800 bg-ink-900 text-ink-300';
  return (
    <div className={`flex gap-3 rounded-card border p-3.5 ${s}`}>
      <Icon d={P.bolt} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[12px] opacity-80">{body}</p>
      </div>
    </div>
  );
}

/* ================================ style tile =============================
   The art direction the whole product is signed off on. It opens the
   library: direction → palette → type → surface → ramps → signature.
   ======================================================================== */

/** Small brand-tinted caption that structures the tile. */
function TileLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand-300">
      {children}
    </span>
  );
}

/** One palette swatch — the colour itself, then its token, hex and real role. */
function Swatch({
  cls,
  token,
  hex,
  role,
  h = 'h-24',
}: {
  cls: string;
  token: string;
  hex: string;
  role: string;
  h?: string;
}) {
  return (
    <div>
      <div className={`w-full rounded-[20px] ${cls} ${h}`} />
      <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white">
        {token}
      </p>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-500">{hex}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-400">{role}</p>
    </div>
  );
}

/** A step in the type ladder — the specimen left, its spec right. */
function TypeStep({ spec, children }: { spec: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-ink-800 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 truncate">{children}</div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-500">{spec}</span>
    </div>
  );
}

function StyleTile() {
  const tone = ['ბლოკური', 'ლაიმისფერი', 'პირდაპირი', 'სპორტული', 'ციფრული', 'უდეკორაციო'];

  return (
    <header className="border-b border-ink-800 px-8 pb-14 pt-12 md:px-12">
      {/* ------------------------------ direction ----------------------------- */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
        <div>
          <div className="flex items-center gap-2 text-brand-300">
            <Icon d={P.bolt} className="h-4 w-4" />
            <TileLabel>FormaCore · Art direction</TileLabel>
          </div>
          <h1 className="mt-5 text-[64px] font-extrabold uppercase leading-[0.86] tracking-tighter md:text-[84px]">
            Lime
            <br />
            Block
          </h1>
          <p className="mt-6 max-w-lg text-[17px] font-medium leading-[1.5] text-ink-200">
            ნახშირისფერ ტილოზე დაწყობილი დიდი, რბილკუთხოვანი ფერადი ბლოკები — თითოეული ერთ პასუხს
            იძლევა, აქცენტს კი დეკორაცია არ ქმნის, არამედ ბლოკის კიდეზე მოჭრილი გიგანტური ციფრი.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {tone.map((t) => (
              <span
                key={t}
                className="rounded-pill border border-ink-700 px-3.5 py-1.5 text-[12px] font-semibold text-ink-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* --------------------------- signature detail ----------------------- */}
        <div>
          <TileLabel>Signature — ციფრი კაფსულაში</TileLabel>
          <div className={`mt-4 overflow-hidden ${CUT_LG} bg-brand-300 text-ink-950`}>
            <div className="p-6">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-800">
                Spin Express
              </span>
              <p className="mt-3 text-[36px] font-extrabold uppercase leading-none tracking-tight">
                18:00
              </p>
              <p className="mt-2.5 text-[13px] font-medium text-ink-800">
                Sandro K. · Main Floor · <span className="font-mono tabular-nums">45</span> წთ
              </p>
              <div className="mt-6 flex items-center gap-3">
                <span className="rounded-pill bg-ink-950 px-4 py-2 font-mono text-[13px] font-bold tabular-nums text-brand-300">
                  20/24
                </span>
                <span className="text-[12px] font-semibold text-ink-800">4 ადგილი დარჩა</span>
              </div>
            </div>
          </div>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-ink-400">
            ყოველი რიცხვი მონოში დგას და თავის კაფსულაში ზის — დატვირთვა, ხანგრძლივობა, დარჩენილი
            დღე. ბლოკის ფონი ცარიელია: არც ჩრდილ-ციფრი, არც ფოტო, არც ბრწყინვა.
          </p>
        </div>
      </div>

      {/* -------------------------------- palette ---------------------------- */}
      <div className="mt-14 border-t border-ink-800 pt-8">
        <div className="flex items-baseline gap-4">
          <TileLabel>Palette</TileLabel>
          <p className="text-[13px] text-ink-400">ტოკენი · hex · როლი — ანონიმური ramp-ის გარეშე</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Swatch
            cls="bg-brand-300"
            token="brand-300"
            hex="#E4F26A"
            role="აბონემენტის ბლოკი და მთავარი მოქმედება — ეკრანზე მხოლოდ ერთხელ"
            h="h-40"
          />
          <Swatch
            cls="bg-ink-900"
            token="ink-900"
            hex="#1E1E1C"
            role="გაკვეთილის ბლოკი — ერთი ზედაპირი ყველასთვის"
            h="h-40"
          />
          <Swatch
            cls="bg-white"
            token="white"
            hex="#FFFFFF"
            role="მეორეული ქმედება — დაჯავშნა, ხანგრძლივობის წრე"
            h="h-40"
          />
          <Swatch
            cls="bg-ink-800"
            token="ink-800"
            hex="#2B2B29"
            role="ჩიპი და უმოქმედო ღილაკი ბლოკის შიგნით"
            h="h-40"
          />
          <Swatch
            cls="bg-ink-950 border border-ink-800"
            token="ink-950"
            hex="#131312"
            role="ტილო — ყველა ეკრანის ფონი"
          />
          <Swatch
            cls="bg-ink-900"
            token="ink-900"
            hex="#1E1E1C"
            role="აწეული ზედაპირი, მრიცხველები"
          />
          <Swatch
            cls="bg-ink-800"
            token="ink-800"
            hex="#2B2B29"
            role="თმის სისქის ხაზი, მეორეული ღილაკი"
          />
          <Swatch
            cls="bg-ink-400"
            token="ink-400"
            hex="#8F8F8B"
            role="მეორეული ტექსტი მუქზე — AA"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Swatch cls="bg-brand-300" token="brand-300" hex="#E4F26A" role="ACTIVE · ATTENDED" />
          <Swatch cls="bg-ink-300" token="ink-300" hex="#BABAB7" role="WAITLIST · FROZEN" />
          <Swatch cls="bg-danger-500" token="danger-500" hex="#EF4444" role="PAST_DUE · გაუქმება" />
          <Swatch cls="bg-ink-600" token="ink-600" hex="#53534F" role="TRIAL · ინფო შეტყობინება" />
        </div>
      </div>

      {/* ------------------------------ type specimen ------------------------ */}
      <div className="mt-14 grid gap-10 border-t border-ink-800 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-14">
        <div>
          <div className="flex items-baseline gap-4">
            <TileLabel>Type — Noto Sans Georgian / JetBrains Mono</TileLabel>
          </div>
          <p className="mt-5 text-[52px] font-extrabold uppercase leading-[0.9] tracking-tighter md:text-[68px]">
            დაჯავშნე
            <br />
            გაკვეთილი
          </p>
          <p className="mt-6 max-w-md text-[15px] leading-[1.65] text-ink-300">
            ქართული ტექსტი ერთადერთ ოჯახში იწერება — Noto Sans Georgian, 400-დან 900-მდე. სათაური
            ყოველთვის მაღალი რეგისტრით და მჭიდრო ტრეკინგით, ინტერფეისის ტექსტი medium წონით, bold კი
            მხოლოდ ერთი მომენტისთვის ეკრანზე. ყველა ციფრი — დრო, ტევადობა, ფასი — JetBrains Mono-ში,
            tabular-nums-ით, რომ სვეტში ერთმანეთს დაემთხვეს.
          </p>
        </div>
        <div>
          <TileLabel>Scale</TileLabel>
          <div className="mt-4">
            <TypeStep spec="34 / 800 / -0.03em">
              <span className="text-[34px] font-extrabold uppercase leading-none tracking-tight">
                Premium
              </span>
            </TypeStep>
            <TypeStep spec="20 / 800 / -0.02em">
              <span className="text-[20px] font-extrabold tracking-tight">კეთილი დაბრუნება</span>
            </TypeStep>
            <TypeStep spec="15 / 500">
              <span className="text-[15px] font-medium">Spin Express · Sandro K.</span>
            </TypeStep>
            <TypeStep spec="13 / 400 / ink-400">
              <span className="text-[13px] text-ink-400">Main Floor · 4 ადგილი დარჩა</span>
            </TypeStep>
            <TypeStep spec="26 mono / 700 / tabular">
              <span className="font-mono text-[26px] font-bold tabular-nums text-brand-300">
                18:00 · 20/24
              </span>
            </TypeStep>
            <TypeStep spec="10 / 600 / 0.16em">
              <Label>შენი მომდევნო გაკვეთილი</Label>
            </TypeStep>
          </div>
        </div>
      </div>

      {/* --------------------------- surface & texture ----------------------- */}
      <div className="mt-14 border-t border-ink-800 pt-8">
        <div className="flex items-baseline gap-4">
          <TileLabel>Surface &amp; texture</TileLabel>
          <p className="text-[13px] text-ink-400">
            ბრტყელი მასალა — გრადიენტი, შუშა და ბრწყინვა აკრძალულია
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[22px] border border-ink-800 bg-ink-950 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">canvas</p>
            <p className="mt-8 text-[15px] font-semibold">მკვრივი ნახშირი</p>
            <p className="mt-1.5 text-[12px] leading-snug text-ink-400">
              ink-950 კიდიდან კიდემდე, ყოველ ეკრანზე
            </p>
          </div>
          <div className="rounded-[22px] bg-ink-900 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">
              surface
            </p>
            <p className="mt-8 text-[15px] font-semibold">ერთი საფეხურით მაღლა</p>
            <p className="mt-1.5 text-[12px] leading-snug text-ink-400">
              ink-900 მრიცხველებზე — ჩარჩოს გარეშე
            </p>
          </div>
          <div className="rounded-[22px] bg-brand-300 p-5 text-ink-950">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
              accent block
            </p>
            <p className="mt-8 text-[15px] font-semibold">ლაიმი მხოლოდ აბონემენტს</p>
            <p className="mt-1.5 text-[12px] font-medium leading-snug opacity-80">
              ტექსტი ყოველთვის ink-950
            </p>
          </div>
          <div className="rounded-[22px] border border-ink-800 bg-ink-950 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">
              floating nav
            </p>
            <div className="mt-6 flex items-center gap-2 rounded-pill bg-white px-2.5 py-2 shadow-float">
              {[P.home, P.calendar, P.qr, P.bag, P.user].map((d, i) => (
                <span
                  key={d}
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    i === 0 ? 'bg-ink-950 text-brand-300' : 'text-ink-500'
                  }`}
                >
                  <Icon d={d} className="h-[17px] w-[17px]" />
                </span>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-snug text-ink-400">
              თეთრი კაფსულა — ერთადერთი თეთრი ზედაპირი
            </p>
          </div>
        </div>
      </div>

      {/* ----------------------------- ramps: radius + elevation -------------- */}
      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="flex items-baseline gap-4">
            <TileLabel>Radius</TileLabel>
            <p className="text-[13px] text-ink-400">რაც უფრო დიდია ზედაპირი, მით რბილია კუთხე</p>
          </div>
          <div className="mt-5 flex items-end gap-3">
            {[
              ['rounded-field', 'h-16', 'field', '8'],
              ['rounded-btn', 'h-20', 'btn', '12'],
              ['rounded-card', 'h-24', 'card', '16'],
              ['rounded-[30px]', 'h-32', 'block', '30'],
              ['rounded-pill', 'h-12', 'pill', '∞'],
            ].map(([r, h, name, px]) => (
              <div key={name} className="flex-1">
                <div className={`${r} ${h} w-full border border-ink-700 bg-ink-800`} />
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
                  {name}
                </p>
                <p className="font-mono text-[11px] font-bold tabular-nums text-ink-300">{px}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-4">
            <TileLabel>Elevation</TileLabel>
            <p className="text-[13px] text-ink-400">
              მუქზე სიმაღლეს ჯერ ზედაპირი იჭერს, მერე ჩრდილი
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['shadow-xs', 'ჩიპი'],
              ['shadow-card', 'ბარათი'],
              ['shadow-pop', 'მენიუ'],
              ['shadow-float', 'ნავი · sheet'],
            ].map(([s, use]) => (
              <div key={s} className={`rounded-card bg-ink-800 p-4 ${s}`}>
                <p className="font-mono text-[10px] tracking-tight text-ink-300">{s}</p>
                <p className="mt-6 text-[12px] font-medium text-ink-400">{use}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ================================= board ================================= */

export default function DesignSystem() {
  const swatches: [string, string[]][] = [
    ['brand', ['bg-brand-300', 'bg-brand-400', 'bg-brand-500', 'bg-brand-600', 'bg-brand-700']],
    ['ink', ['bg-ink-200', 'bg-ink-400', 'bg-ink-600', 'bg-ink-800', 'bg-ink-950']],
    ['status', ['bg-brand-300', 'bg-ink-300', 'bg-danger-500', 'bg-ink-600', 'bg-ink-800']],
  ];

  return (
    <div className="w-full bg-ink-950 font-sans text-white">
      <StyleTile />

      <div className="space-y-10 px-8 py-10 md:px-12">
        {/* -------------------------- foundations -------------------------- */}
        <Group title="Foundations" note="ფერი · ტიპოგრაფია · რადიუსი · ხატულები">
          <Panel label="Color tokens">
            <div className="space-y-3">
              {swatches.map(([name, list]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-14 font-mono text-[10px] uppercase tracking-wider text-ink-500">
                    {name}
                  </span>
                  <div className="flex flex-1 gap-1.5">
                    {list.map((c) => (
                      <div key={c} className={`h-8 flex-1 rounded-[6px] ${c}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel label="Type scale">
            <div className="space-y-3">
              <p className="text-[32px] font-extrabold leading-none tracking-tight">
                კეთილი დაბრუნება
              </p>
              <p className="text-[20px] font-bold tracking-tight">დაჯავშნე გაკვეთილი</p>
              <p className="text-[15px] font-medium">Spin Express · Sandro K. · 45 წთ</p>
              <p className="text-[13px] text-ink-400">Main Floor · 4 დარჩა</p>
              <p className="font-mono text-[26px] font-bold tabular-nums">18:00 · 20/24</p>
              <Label>შენი მომდევნო გაკვეთილი</Label>
            </div>
          </Panel>

          <Panel label="Radius & elevation">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['rounded-field', 'ველი 8'],
                ['rounded-btn', 'ღილაკი 12'],
                ['rounded-card', 'ბარათი 16'],
                ['rounded-pill', 'აბი ∞'],
              ].map(([r, l]) => (
                <div
                  key={r}
                  className={`border border-ink-700 bg-ink-800 px-3 py-4 text-center ${r}`}
                >
                  <span className="text-[10px] font-semibold text-ink-400">{l}</span>
                </div>
              ))}
              <div className="rounded-card bg-ink-800 p-3 text-center shadow-xs">
                <span className="font-mono text-[10px] text-ink-400">shadow-xs</span>
              </div>
              <div className="rounded-card bg-ink-800 p-3 text-center shadow-float">
                <span className="font-mono text-[10px] text-ink-400">shadow-float</span>
              </div>
            </div>
          </Panel>

          <Panel label="Icon set — stroke 1.7, no emoji" span={3}>
            <div className="flex flex-wrap gap-2">
              {Object.entries(P).map(([k, d]) => (
                <div
                  key={k}
                  className="flex h-12 w-12 items-center justify-center rounded-btn border border-ink-800 bg-ink-950 text-ink-300"
                  title={k}
                >
                  <Icon d={d} />
                </div>
              ))}
            </div>
          </Panel>
        </Group>

        {/* -------------------------- components --------------------------- */}
        <Group title="Components" note="ღილაკები · ველები · ჩიპები · სტატუსები">
          <Panel label="Buttons">
            <div className="space-y-3">
              <Btn variant="primary" full icon={P.qr}>
                გამოცხადება
              </Btn>
              <Btn variant="secondary" full>
                გაკვეთილების ნახვა
              </Btn>
              <div className="flex gap-2">
                <Btn variant="ghost">გაუქმება</Btn>
                <Btn variant="danger">წაშლა</Btn>
              </div>
              <Btn variant="primary" full disabled>
                სავსეა
              </Btn>
            </div>
          </Panel>

          <Panel label="Fields & toggle">
            <div className="space-y-4">
              <Field label="ელფოსტა" placeholder="member@downtown.demo" />
              <Field
                label="სახელი და გვარი"
                placeholder="Nino Kapanadze"
                hint="ეს სახელი ჩანს მიმღების სკანერზე"
              />
              <div className="border-t border-ink-800">
                <Toggle label="ჯავშნის შეხსენება" hint="გაკვეთილამდე 1 საათით ადრე" on />
              </div>
            </div>
          </Panel>

          <Panel label="Chips, segmented, pills">
            <div className="space-y-4">
              <Chips />
              <Segmented />
              <div className="flex flex-wrap gap-2">
                <Pill tone="success">აქტიური</Pill>
                <Pill tone="brand">საცდელი</Pill>
                <Pill tone="warning">გაყინული</Pill>
                <Pill tone="danger">ვადაგადაცილებული</Pill>
                <Pill tone="muted">არააქტიური</Pill>
                <Pill tone="warning">მოლოდინი · #2</Pill>
              </div>
            </div>
          </Panel>

          <Panel label="Stat strip">
            <div className="flex gap-3">
              <Stat value="18" label="დღის სერია" icon={P.flame} />
              <Stat value="24" label="გამოცხადება" icon={P.check} />
              <Stat value="2" unit="/3" label="PT კრედიტი" icon={P.dumbbell} />
            </div>
          </Panel>

          <Panel label="Occupancy — occupancyTone() thresholds">
            <div className="space-y-4">
              <div className="space-y-2.5">
                {[
                  ['Boxing Basics', 7, 12],
                  ['Morning Yoga', 14, 20],
                  ['Spin Express', 20, 24],
                  ['CrossFit WOD', 14, 14],
                ].map(([label, b, c]) => (
                  <div key={label as string} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-[12px] text-ink-400">{label}</span>
                    <div className="flex-1">
                      <Occupancy booked={b as number} cap={c as number} />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-500">
                      {b as number}/{c as number}
                    </span>
                  </div>
                ))}
              </div>
              <Alert
                tone="warning"
                title="Premium 8 დღეში სრულდება"
                body="შემდეგი გადახდა 14 აგვისტოს — ჯავშნები არ შეწყდება."
              />
            </div>
          </Panel>

          <Panel label="Trainers & shop rail">
            <div>
              <div className="divide-y divide-ink-800">
                <PersonRow
                  name="Ana G."
                  teaches="Yoga Flow · Pilates"
                  img="https://i.pravatar.cc/120?img=47"
                />
                <PersonRow
                  name="Levan M."
                  teaches="CrossFit"
                  img="https://i.pravatar.cc/120?img=12"
                />
              </div>
              <div className="mt-4 divide-y divide-ink-800 border-t border-ink-800">
                <ProductRow name="Whey Protein 1kg" minor={8900} variants={2} />
                <ProductRow name="Resistance Bands Set" minor={3900} variants={0} />
                <ProductRow name="Branded Training Tee" minor={4500} variants={4} />
              </div>
            </div>
          </Panel>
        </Group>

        {/* --------------------------- patterns ---------------------------- */}
        <Group
          title="Patterns"
          note="აბონემენტის პასი · დროის ლიანდაგი · სიები · ცარიელი მდგომარეობა"
        >
          <Panel label="Membership pass — GET /me/subscription">
            <MembershipCard />
          </Panel>

          <Panel label="This week — GET /class-instances">
            <div className="divide-y divide-ink-800">
              <ClassRow
                time="08:00"
                day="ხუთ"
                title="Morning Yoga"
                meta="Ana G. · Studio A · 75 წთ"
                color="#DCDCDA"
                booked={14}
                cap={20}
              />
              <ClassRow
                time="12:00"
                day="ხუთ"
                title="CrossFit WOD"
                meta="Levan M. · Main Floor · 60 წთ"
                color="#C4C4C1"
                booked={14}
                cap={14}
                state="WAITLIST"
                position={2}
              />
              <ClassRow
                time="18:00"
                day="ხუთ"
                title="Spin Express"
                meta="Sandro K. · Main Floor · 45 წთ"
                color="#8F8F8B"
                booked={20}
                cap={24}
                state="BOOKED"
              />
              <ClassRow
                time="19:00"
                day="ხუთ"
                title="Boxing Basics"
                meta="Nika B. · Main Floor · 60 წთ"
                color="#6C6C68"
                booked={7}
                cap={12}
              />
            </div>
          </Panel>

          <Panel label="Empty state — member.classes.empty">
            <EmptyState />
          </Panel>

          <Panel label="Profile rows — app/(tabs)/profile">
            <div className="divide-y divide-ink-800">
              <ListRow icon={P.user} title="პირადი მონაცემები" hint="Nino Kapanadze" />
              <ListRow icon={P.card} title="აბონემენტი" hint="Premium · 120,00 ₾ / თვე" />
              <ListRow
                icon={P.dumbbell}
                title="მწვრთნელები"
                hint="Ana G., Levan M., Sandro K., Nika B."
              />
              <ListRow icon={P.bell} title="შეტყობინებები" hint="ჯავშანი, გადახდა, სისტემა" />
              <ListRow icon={P.ext} title="კონფიდენციალურობა" ext />
              <ListRow icon={P.logout} title="გასვლა" danger />
            </div>
          </Panel>

          <Panel label="Bottom sheet (live — click to open)">
            <SheetDemo />
          </Panel>

          <Panel label="Cart total — shop.cart.subtotal">
            <div className="rounded-card border border-ink-800 bg-ink-950 p-4">
              <div className="flex items-center justify-between border-b border-ink-800 pb-3">
                <div>
                  <Label>ჯამი</Label>
                  <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-white">
                    114,00 ₾
                  </p>
                </div>
                <span className="text-[11px] font-medium tabular-nums text-ink-500">2 ნივთი</span>
              </div>
              <div className="pt-3">
                <Btn variant="primary" full icon={P.card}>
                  შეკვეთის განთავსება
                </Btn>
              </div>
            </div>
          </Panel>
        </Group>

        {/* ------------------------- mobile chrome ------------------------- */}
        <Group title="Mobile" note="აპლიკაციის ჩარჩო — app/(tabs)/_layout.tsx, 390 px">
          <Panel label="Top app bar">
            <AppBar />
          </Panel>
          <Panel label="Bottom tab bar + QR FAB (live)" span={2}>
            <div className="pt-8">
              <TabBar />
            </div>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
