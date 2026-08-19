// @page: Foundations
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore — Moodboard  ·  "Lime Block"
   An art-direction board, not a component catalogue: direction, palette with
   roles, a live type specimen, the surface/texture rule, the radius +
   elevation steps, the signature move and the spot-art language.
   ========================================================================== */

/* --------------------------------- labels -------------------------------- */

/* The signature shape: two corners rounded, two cut on the diagonal — controls
   repeat the membership block's silhouette, scaled down. */
const CUT_SM =
  '[clip-path:polygon(9px_0,calc(100%_-_9px)_0,100%_9px,100%_calc(100%_-_9px),calc(100%_-_9px)_100%,9px_100%,0_calc(100%_-_9px),0_9px)]';
const CUT_MD =
  '[clip-path:polygon(11px_0,calc(100%_-_11px)_0,100%_11px,100%_calc(100%_-_11px),calc(100%_-_11px)_100%,11px_100%,0_calc(100%_-_11px),0_11px)]';
const CUT_LG =
  '[clip-path:polygon(30px_0,calc(100%_-_30px)_0,100%_30px,100%_calc(100%_-_30px),calc(100%_-_30px)_100%,30px_100%,0_calc(100%_-_30px),0_30px)]';

function Label({
  children,
  tone = 'brand',
}: {
  children: React.ReactNode;
  tone?: 'brand' | 'muted';
}) {
  return (
    <span
      className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.24em] ${
        tone === 'brand' ? 'text-brand-300' : 'text-ink-500'
      }`}
    >
      {children}
    </span>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-5 border-t border-ink-800 pt-6">
      <Label>{children}</Label>
    </div>
  );
}

/* -------------------------------- palette -------------------------------- */

type Tone = {
  token: string;
  hex: string;
  cls: string;
  role: string;
  note: string;
  dark?: boolean;
};

const HERO: Tone[] = [
  {
    token: 'brand-300',
    hex: '#E4F26A',
    cls: 'bg-brand-300',
    role: 'ერთადერთი აქცენტი',
    note: 'ლაიმი პროდუქტის ერთადერთი ფერია — აბონემენტი, მთავარი ქმედება, დადასტურებული ჯავშანი. სხვა ფერი არ არსებობს.',
    dark: true,
  },
  {
    token: 'ink-900',
    hex: '#1E1E1C',
    cls: 'bg-ink-900',
    role: 'გაკვეთილის ბლოკი',
    note: 'ყველა ბარათი ერთი და იგივე ზედაპირია — ink-900 თმის სისქის ink-800 ჩარჩოთი. ტექსტი თეთრია.',
  },
  {
    token: 'white',
    hex: '#FFFFFF',
    cls: 'bg-white',
    role: 'მეორეული ქმედება',
    note: 'თეთრი ატარებს იმას, რაც ყურადღებას ითხოვს, მაგრამ ლაიმს არ იმსახურებს — დაჯავშნის ღილაკი, ხანგრძლივობის წრე.',
    dark: true,
  },
];

const SURFACES: Tone[] = [
  {
    token: 'ink-950',
    hex: '#131312',
    cls: 'bg-ink-950',
    role: 'ტილო',
    note: 'აპლიკაციის ფონი — ყოველთვის.',
  },
  {
    token: 'ink-900',
    hex: '#1E1E1C',
    cls: 'bg-ink-900',
    role: 'ბარათი',
    note: 'ჩაწეული ბლოკები, მრიცხველები.',
  },
  {
    token: 'ink-800',
    hex: '#2B2B29',
    cls: 'bg-ink-800',
    role: 'hover / ღილაკი',
    note: 'მეორეული ზედაპირი.',
  },
  {
    token: 'ink-700',
    hex: '#3E3E3B',
    cls: 'bg-ink-700',
    role: 'ხაზი',
    note: 'გამყოფი, უმოქმედო ინდიკატორი.',
  },
  {
    token: 'ink-400',
    hex: '#8F8F8B',
    cls: 'bg-ink-400',
    role: 'მეორეული ტექსტი',
    note: 'იარლიყი, დამხმარე სტრიქონი.',
  },
  {
    token: 'white',
    hex: '#FFFFFF',
    cls: 'bg-white',
    role: 'ტექსტი / ნავიგაცია',
    note: 'მცურავი კაფსულა და სათაური.',
    dark: true,
  },
];

const STATUS = [
  { token: 'brand-300', cls: 'bg-brand-300', label: 'ATTENDED' },
  { token: 'ink-300', cls: 'bg-ink-300', label: 'WAITLIST' },
  { token: 'danger-400', cls: 'bg-danger-400', label: 'PAST_DUE' },
  { token: 'ink-600', cls: 'bg-ink-600', label: 'FROZEN' },
];

const BANDS = [
  {
    token: 'brand-300',
    hex: '#E4F26A',
    cls: 'bg-brand-300',
    role: 'აბონემენტი და ერთადერთი მთავარი ღილაკი — ეკრანზე ერთხელ.',
  },
  {
    token: 'white',
    hex: '#FFFFFF',
    cls: 'bg-white',
    role: 'მეორეული ქმედება და ციფრის წრე — თეთრი, არასდროს ლაიმი.',
  },
  {
    token: 'ink-900',
    hex: '#1E1E1C',
    cls: 'bg-ink-900 border-y border-ink-800',
    role: 'გაკვეთილის ბლოკი — ერთი ზედაპირი ყველასთვის, ტექსტი თეთრი.',
    dark: true,
  },
  {
    token: 'ink-950',
    hex: '#131312',
    cls: 'bg-ink-950 border-y border-ink-800',
    role: 'ტილო, რომელზეც ეს ოთხივე ბლოკი დევს — ფართობით ყველაზე დიდი ტონი.',
    dark: true,
  },
];

const PAIRS = [
  {
    cls: 'bg-brand-300',
    text: 'text-ink-950',
    token: 'ink-950 / brand-300',
    ratio: '14.9:1',
    sample: '18:00',
  },
  {
    cls: 'bg-white',
    text: 'text-ink-950',
    token: 'ink-950 / white',
    ratio: '18.2:1',
    sample: '19:30',
  },
  {
    cls: 'bg-ink-900 ring-1 ring-inset ring-ink-800',
    text: 'text-white',
    token: 'white / ink-900',
    ratio: '15.6:1',
    sample: '20:15',
  },
  {
    cls: 'bg-ink-900 ring-1 ring-inset ring-ink-800',
    text: 'text-ink-400',
    token: 'ink-400 / ink-900',
    ratio: '4.9:1',
    sample: '20/24',
  },
];

/* ------------------------------ spot artwork ----------------------------- */

function ArtDumbbell({ className = 'h-24 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 120" fill="none" className={className} aria-hidden="true">
      <rect x="6" y="12" width="54" height="96" rx="22" fill="#E4F26A" />
      <rect x="140" y="12" width="54" height="96" rx="22" fill="#CFCFCC" />
      <rect x="52" y="44" width="96" height="32" rx="16" fill="#F7F7F6" />
    </svg>
  );
}

function ArtCheck({ className = 'h-24 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" fill="none" className={className} aria-hidden="true">
      <rect x="30" y="30" width="118" height="118" rx="34" fill="#CFCFCC" />
      <rect x="12" y="12" width="118" height="118" rx="34" fill="#E4F26A" />
      <path
        d="M38 72l24 24 46-52"
        stroke="#131312"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArtStreak({ className = 'h-24 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" className={className} aria-hidden="true">
      <rect x="8" y="86" width="40" height="46" rx="16" fill="#3E3E3B" />
      <rect x="60" y="58" width="40" height="74" rx="18" fill="#A8A8A4" />
      <rect x="112" y="30" width="40" height="102" rx="19" fill="#CFCFCC" />
      <rect x="164" y="4" width="28" height="128" rx="14" fill="#E4F26A" />
    </svg>
  );
}

/* ================================= board ================================== */

export default function Moodboard() {
  const [tone, setTone] = useState<Tone>(HERO[0]);

  const TONE_WORDS = [
    'ბლოკური',
    'მონოქრომული',
    'ლაიმისფერი',
    'პირდაპირი',
    'სპორტული',
    'უდეკორაციო',
  ];

  return (
    <div className="w-full bg-ink-950 font-sans text-white antialiased">
      {/* ============================== masthead ============================= */}
      <header className="px-8 pb-16 pt-12 md:px-12 lg:px-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Label>FormaCore · Downtown Strength</Label>
          <Label tone="muted">მიმართულება 01 · დამტკიცებული</Label>
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h1 className="text-[76px] font-extrabold uppercase leading-[0.82] tracking-tighter sm:text-[104px] lg:text-[124px]">
              Lime
              <br />
              <span className="text-brand-300">Block</span>
            </h1>

            <p className="mt-8 max-w-xl text-[19px] font-medium leading-[1.45] text-ink-200">
              ნახშირისფერ ტილოზე დაწყობილი დიდი, რბილკუთხოვანი ბლოკები — ერთმანეთს ტონით ასხვავებენ,
              არა ფერით. ერთადერთი ფერი ლაიმია: აბონემენტი და ყოველი მთავარი ქმედება. ფონი სუფთაა,
              ციფრი კი წინ დგას — მონოში, თავის კაფსულაში.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {TONE_WORDS.map((w) => (
                <span
                  key={w}
                  className="rounded-pill border border-ink-700 px-4 py-1.5 text-[13px] font-semibold text-ink-300"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>

          {/* the signature move, stated once, large */}
          <div>
            <Label>Signature — ციფრი კაფსულაში</Label>
            <div className={`mt-4 overflow-hidden ${CUT_LG} bg-brand-300 text-ink-950`}>
              <div className="p-7">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-800">
                  Spin Express
                </span>
                <p className="mt-4 text-[40px] font-extrabold uppercase leading-none tracking-tight">
                  18:00
                </p>
                <p className="mt-3 text-[13px] font-medium text-ink-800">
                  Sandro K. · Main Floor · <span className="font-mono tabular-nums">45</span> წთ
                </p>
                <div className="mt-8 flex items-center gap-3">
                  <span className="rounded-pill bg-ink-950 px-4 py-2 font-mono text-[13px] font-bold tabular-nums text-brand-300">
                    20/24
                  </span>
                  <span className="text-[12px] font-semibold text-ink-800">4 ადგილი დარჩა</span>
                </div>
              </div>
            </div>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed text-ink-400">
              ყოველი რიცხვი მონოში დგას და თავის კაფსულაში ზის — დატვირთვა, ხანგრძლივობა, დარჩენილი
              დღე. ფონზე დეკორაცია არასდროსაა: ბლოკი ცარიელია, ციფრი კი წინ დგას.
            </p>
          </div>
        </div>
      </header>

      {/* =============================== palette ============================= */}
      <section className="border-t border-ink-800 px-8 py-14 md:px-12 lg:px-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Label>Palette · ბლოკის ფერები</Label>
          <p className="text-[13px] text-ink-400">დააჭირე ველს — როლი ქვემოთ იშლება</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {HERO.map((t) => {
            const on = tone.token === t.token;
            return (
              <button
                key={t.token}
                type="button"
                onClick={() => setTone(t)}
                className={`group relative overflow-hidden rounded-[28px] text-left transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  on ? '-translate-y-1' : 'hover:-translate-y-1'
                }`}
              >
                <div
                  className={`h-56 w-full ${t.cls} ${t.dark ? '' : 'ring-1 ring-inset ring-ink-800'}`}
                >
                  <div
                    className={`flex h-full flex-col justify-between p-6 ${t.dark ? 'text-ink-950' : 'text-white'}`}
                  >
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
                      {t.token}
                    </span>
                    <div>
                      <span
                        className={`font-mono text-[12px] tabular-nums ${t.dark ? 'text-ink-800' : 'text-ink-400'}`}
                      >
                        {t.hex}
                      </span>
                      <p className="mt-1 text-[15px] font-bold leading-tight">{t.role}</p>
                    </div>
                  </div>
                </div>
                <span
                  className={`absolute right-5 top-5 h-2.5 w-2.5 rounded-full transition-opacity ${
                    t.dark ? 'bg-ink-950' : 'bg-white'
                  } ${on ? 'opacity-100' : 'opacity-0'}`}
                />
              </button>
            );
          })}
        </div>

        {/* live readout for the selected field */}
        <div className="mt-4 flex flex-col gap-5 rounded-[24px] bg-ink-900 p-6 sm:flex-row sm:items-center">
          <div className={`h-16 w-16 shrink-0 rounded-[20px] ${tone.cls}`} />
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-white">
              {tone.token} <span className="text-ink-500">·</span>{' '}
              <span className="tabular-nums text-ink-400">{tone.hex}</span>
            </p>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-300">{tone.note}</p>
          </div>
        </div>

        {/* the neutral ramp as one continuous field */}
        <div className="mt-12">
          <Label tone="muted">Ink — ტილო და ზედაპირები</Label>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-ink-800 bg-ink-800 sm:grid-cols-3 lg:grid-cols-6">
            {SURFACES.map((s) => (
              <button
                key={s.token}
                type="button"
                onClick={() => setTone(s)}
                className="group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
              >
                <div className={`h-24 w-full ${s.cls} transition-opacity group-hover:opacity-90`} />
                <div className="bg-ink-950 px-4 py-3.5">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-white">
                    {s.token}
                  </p>
                  <p className="mt-1 font-mono text-[10px] tabular-nums text-ink-500">{s.hex}</p>
                  <p className="mt-1.5 text-[12px] leading-snug text-ink-400">{s.role}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* status — never decoration */}
        <div className="mt-10 flex flex-col gap-6 border-t border-ink-800 pt-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2.5">
            {STATUS.map((s) => (
              <span
                key={s.token}
                className="flex items-center gap-3 rounded-pill bg-ink-900 py-2 pl-2.5 pr-5"
              >
                <span className={`h-7 w-7 shrink-0 rounded-full ${s.cls}`} />
                <span className="whitespace-nowrap">
                  <span className="block font-mono text-[11px] font-bold leading-none tracking-[0.08em] text-white">
                    {s.label}
                  </span>
                  <span className="mt-1 block font-mono text-[10px] leading-none text-ink-500">
                    {s.token}
                  </span>
                </span>
              </span>
            ))}
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-ink-400">
            სტატუსის ფერი მხოლოდ სტატუსს ეკუთვნის — არასდროს ღილაკს, ბლოკს ან განწყობას.
          </p>
        </div>
      </section>

      {/* ============================= colour bands ========================= */}
      <section>
        {BANDS.map((b) => (
          <div key={b.token} className={`relative overflow-hidden ${b.cls}`}>
            <div className="relative flex min-h-[168px] flex-col justify-end gap-5 px-8 py-10 md:flex-row md:items-end md:justify-between md:px-12 lg:px-16">
              <div>
                <p
                  className={`font-mono text-[10px] uppercase tracking-[0.24em] ${b.dark ? 'text-ink-500' : 'text-ink-800'}`}
                >
                  {b.hex}
                </p>
                <p
                  className={`mt-3 whitespace-nowrap text-[34px] font-extrabold uppercase leading-none tracking-[-0.035em] sm:text-[46px] ${
                    b.dark ? 'text-white' : 'text-ink-950'
                  }`}
                >
                  {b.token}
                </p>
              </div>
              <p
                className={`max-w-sm text-[14px] font-semibold leading-snug md:text-right ${
                  b.dark ? 'text-ink-400' : 'text-ink-800'
                }`}
              >
                {b.role}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* ============================ colour in use ========================= */}
      <section className="border-t border-ink-800 px-8 py-14 md:px-12 lg:px-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Label>Look · ფერი კონტექსტში</Label>
          <p className="text-[13px] text-ink-500">
            ერთი ლაიმი, ორი ბლოკი, დანარჩენი წყნარი — ასე ჯდება ერთ ეკრანზე
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {/* the membership — the only lime on the screen */}
          <div className={`relative overflow-hidden ${CUT_LG} bg-brand-300 text-ink-950`}>
            <div className="relative p-6">
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-800">
                აბონემენტი
              </span>
              <p className="mt-3 text-[36px] font-extrabold uppercase leading-none tracking-tight">
                Premium
              </p>
              <p className="mt-2 text-[13px] font-medium text-ink-800">
                აქტიური · <span className="font-mono tabular-nums">22 / 30</span> დღე
              </p>
              <div className="mt-14 inline-flex items-center gap-4 rounded-pill bg-ink-950 py-2.5 pl-5 pr-2.5">
                <span className="whitespace-nowrap">
                  <span className="block font-mono text-[26px] font-bold leading-none tabular-nums text-brand-300">
                    8
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                    დღე დარჩა
                  </span>
                </span>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-300 text-ink-950">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[18px] w-[18px]"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 12h13m0 0-5-5m5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* the schedule — alternating blocks */}
          <div className="space-y-4">
            {[
              { title: 'Spin Express', time: '18:00', who: 'Sandro K. · Main Floor', cap: '20/24' },
              { title: 'Yoga Flow', time: '19:30', who: 'Ana G. · Studio A', cap: '12/18' },
            ].map((c) => (
              <article
                key={c.title}
                className="relative overflow-hidden rounded-[30px] border border-ink-800 bg-ink-900 text-white"
              >
                <div className="relative p-5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                    {c.time}
                  </p>
                  <p className="mt-2 text-[24px] font-extrabold leading-none tracking-tight">
                    {c.title}
                  </p>
                  <p className="mt-2 text-[13px] font-medium text-ink-400">{c.who}</p>
                  <div className="mt-5 flex items-center gap-2.5">
                    <span className="rounded-pill bg-ink-950 px-3.5 py-1.5 font-mono text-[12px] font-bold tabular-nums text-white">
                      {c.cap}
                    </span>
                    <span className="rounded-pill bg-white px-3.5 py-1.5 font-mono text-[12px] font-bold tabular-nums text-ink-950">
                      45 წთ
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* the quiet side — ink surfaces carry everything else */}
          <div className="space-y-4">
            <div className="flex gap-4">
              {[
                { l: 'დღის სერია', v: '18', u: '' },
                { l: 'PT კრედიტი', v: '2', u: '/3' },
              ].map((k) => (
                <div key={k.l} className="flex-1 rounded-[26px] bg-ink-900 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                    {k.l}
                  </p>
                  <p className="mt-3 font-mono text-[30px] font-bold leading-none tabular-nums text-white">
                    {k.v}
                    {k.u && <span className="text-[15px] text-ink-500">{k.u}</span>}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['ყველა', 'Spin', 'Yoga', 'Strength'].map((c, i) => (
                <span
                  key={c}
                  className={`${CUT_SM} px-4 py-2 text-[13px] font-semibold ${
                    i === 0 ? 'bg-white text-ink-950' : 'bg-ink-900 text-ink-300'
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>

            <div className="rounded-[26px] bg-ink-900 p-5">
              <div className="flex items-center gap-3">
                <img
                  src="https://i.pravatar.cc/120?img=47"
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-white">
                    Nino Kapanadze
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.1em] text-ink-500">
                    Premium · Downtown Strength
                  </span>
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-ink-800 pt-4">
                <span className="h-2 w-2 rounded-full bg-brand-300" />
                <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-ink-300">
                  ACTIVE
                </span>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-500">
                  89,00 ₾ / თვე
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== contrast ============================ */}
      <section className="border-t border-ink-800 px-8 py-14 md:px-12 lg:px-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Label>Contrast · ტექსტი ფერზე</Label>
          <p className="text-[13px] text-ink-500">
            ოთხივე წყვილი AA-ს ზემოთაა — სხვა კომბინაცია არ გამოიყენება
          </p>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PAIRS.map((p) => (
            <div
              key={p.token}
              className={`flex min-h-[176px] flex-col justify-between rounded-[26px] p-6 ${p.cls} ${p.text}`}
            >
              <p className="font-mono text-[40px] font-bold leading-none tabular-nums">
                {p.sample}
              </p>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
                  {p.token}
                </p>
                <p className="mt-1.5 font-mono text-[11px] tabular-nums opacity-70">
                  {p.ratio} · AAA
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================ type specimen ========================== */}
      <section className="border-t border-ink-800 px-8 py-14 md:px-12 lg:px-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <Label>Type · Noto Sans Georgian + JetBrains Mono</Label>
            <p className="mt-6 text-[52px] font-extrabold leading-[0.94] tracking-tight sm:text-[68px]">
              დღევანდელი
              <br />
              განრიგი
            </p>
            <p className="mt-8 max-w-xl text-[15px] leading-[1.65] text-ink-300">
              ქართული ტექსტი სისტემის ცენტრშია — ერთი ოჯახი ატარებს ყველაფერს სათაურიდან იარლიყამდე,
              მონო კი მხოლოდ რიცხვებს ეკუთვნის: დროს, ტევადობას, ფასს. ხმა მოკლეა და მოქმედებაზეა
              მიმართული, სარეკლამო შესავლების გარეშე.
            </p>
          </div>

          <div>
            <Label tone="muted">Scale</Label>
            <div className="mt-4">
              {[
                {
                  spec: '34 / 800 / -0.02em',
                  node: (
                    <span className="text-[34px] font-extrabold leading-none tracking-tight">
                      Premium
                    </span>
                  ),
                },
                {
                  spec: '24 / 800',
                  node: (
                    <span className="text-[24px] font-extrabold leading-none tracking-tight">
                      დღევანდელი განრიგი
                    </span>
                  ),
                },
                {
                  spec: '17 / 500',
                  node: <span className="text-[17px] font-medium">გამოცხადება QR-ით</span>,
                },
                {
                  spec: '14 / 600',
                  node: (
                    <span className="text-[14px] font-semibold text-ink-200">
                      Sandro K. · Main Floor
                    </span>
                  ),
                },
                {
                  spec: '11 / 600 / 0.14em',
                  node: (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                      აბონემენტი
                    </span>
                  ),
                },
                {
                  spec: 'mono 30 / 700',
                  node: (
                    <span className="font-mono text-[30px] font-bold leading-none tabular-nums">
                      20/24
                    </span>
                  ),
                },
              ].map((r) => (
                <div
                  key={r.spec}
                  className="flex items-baseline justify-between gap-6 border-b border-ink-800 py-4 last:border-b-0"
                >
                  <div className="min-w-0 flex-1 truncate">{r.node}</div>
                  <span className="shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-ink-500">
                    {r.spec}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {['18:00', '89,00 ₾', '22 / 30', '45 წთ'].map((n) => (
                <span
                  key={n}
                  className="whitespace-nowrap rounded-[14px] bg-ink-900 px-4 py-2.5 font-mono text-[15px] font-bold tabular-nums text-brand-300"
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========================== surface & texture ======================== */}
      <section className="border-t border-ink-800 px-8 py-14 md:px-12 lg:px-16">
        <Rule>Surface · ბრტყელი, ყოველთვის</Rule>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="rounded-[28px] bg-ink-900 p-7">
            <p className="text-[15px] font-bold text-white">
              ასე — ტონი ატარებს ბლოკს, ლაიმი ერთხელ
            </p>
            <div className="mt-5 flex gap-3">
              <div className="h-32 flex-1 rounded-[26px] border border-ink-800 bg-ink-950" />
              <div className="h-32 flex-1 rounded-[26px] bg-white" />
              <div className="h-32 flex-1 rounded-[26px] bg-brand-300" />
            </div>
            <p className="mt-5 max-w-lg text-[13px] leading-relaxed text-ink-400">
              ზედაპირი ერთი მყარი ველია. სიღრმეს ზომა და მანძილი ქმნის, არა შუქი — ამიტომ ჩრდილი
              იშვიათია და მხოლოდ მცურავ ელემენტს ეკუთვნის.
            </p>
          </div>

          <div className="rounded-[28px] border border-ink-800 p-7">
            <p className="text-[15px] font-bold text-ink-300">არასდროს</p>
            <div className="mt-5 space-y-3">
              {[
                'გრადიენტი და ბრწყინვა',
                'შუშისებრი ბუნდოვანი ფენა',
                'ფოტო ბლოკის ფონად',
                'ემოჯი იკონის ნაცვლად',
              ].map((x) => (
                <div key={x} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-800">
                    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-ink-400">
                      <path
                        d="m6 6 12 12M18 6 6 18"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span className="text-[13px] font-medium text-ink-400">{x}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[12px] leading-relaxed text-ink-500">
              კანვასზე ფოტოები არ იტვირთება — ადამიანს მხოლოდ რეალური ავატარი წარმოადგენს.
            </p>
          </div>
        </div>
      </section>

      {/* ========================= radius & elevation ======================== */}
      <section className="border-t border-ink-800 px-8 py-14 md:px-12 lg:px-16">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Label>Radius — რბილი, თანმიმდევრული</Label>
            <div className="mt-6 flex flex-wrap items-end gap-4">
              {[
                { cls: 'rounded-field h-16 w-24', name: 'field' },
                { cls: 'rounded-btn h-16 w-24', name: 'btn' },
                { cls: 'rounded-card h-20 w-28', name: 'card' },
                { cls: 'rounded-[26px] h-24 w-32', name: '26 · ბარათი' },
                { cls: 'rounded-[32px] h-28 w-36', name: '32 · ბლოკი' },
                { cls: `${CUT_MD} h-12 w-28`, name: 'ღილაკი · მოჭრილი' },
                { cls: 'rounded-pill h-12 w-28', name: 'pill · ჩიპი' },
              ].map((r) => (
                <div key={r.name}>
                  <div className={`${r.cls} border border-ink-700 bg-ink-900`} />
                  <p className="mt-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500">
                    {r.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Elevation — მხოლოდ მცურავს</Label>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { cls: 'shadow-xs', name: 'xs' },
                { cls: 'shadow-card', name: 'card' },
                { cls: 'shadow-pop', name: 'pop' },
                { cls: 'shadow-float', name: 'float' },
              ].map((e) => (
                <div key={e.name}>
                  <div className={`h-24 rounded-[20px] bg-white ${e.cls}`} />
                  <p className="mt-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500">
                    {e.name}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-md text-[13px] leading-relaxed text-ink-400">
              ერთადერთი მუდმივად ამაღლებული ელემენტი მცურავი ნავიგაციაა — თეთრი კაფსულა ხუთი წრიული
              ღილაკით, აქტიური ink-950 + ლაიმი.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-pill bg-white p-2 shadow-float">
              {['home', 'cal', 'qr', 'bag', 'me'].map((k, i) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                    i === 0 ? 'bg-ink-950 text-brand-300' : 'text-ink-500 hover:bg-ink-100'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                    <path
                      d={
                        i === 0
                          ? 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h4v-6h3v6h4a1 1 0 0 0 1-1V9.5'
                          : i === 1
                            ? 'M7 3v3M17 3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6Z'
                            : i === 2
                              ? 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h6v6h-6v-6Z'
                              : i === 3
                                ? 'M6 8h12l1 12.5H5L6 8ZM9 8V6a3 3 0 0 1 6 0v2'
                                : 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0'
                      }
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== spot art ============================= */}
      <section className="border-t border-ink-800 px-8 py-14 md:px-12 lg:px-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Label>Imagery · ილუსტრაცია ტოკენებიდან</Label>
          <p className="max-w-md text-[13px] text-ink-400">
            ბრტყელი, ორ-სამფეროვანი, დიდი ფორმებით — იმავე მრგვალი კუთხით, რაც ბლოკებს აქვთ.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              art: <ArtDumbbell className="h-28 w-auto" />,
              name: 'ვარჯიში',
              use: 'ცარიელი განრიგი',
            },
            {
              art: <ArtCheck className="h-28 w-auto" />,
              name: 'დადასტურება',
              use: 'გამოცხადება · ჯავშანი',
            },
            {
              art: <ArtStreak className="h-28 w-auto" />,
              name: 'სერია',
              use: 'პროგრესი · მიღწევა',
            },
          ].map((s) => (
            <figure key={s.name} className="rounded-[28px] bg-ink-900 p-7">
              <div className="flex h-40 items-center justify-center">{s.art}</div>
              <figcaption className="mt-4 border-t border-ink-800 pt-4">
                <p className="text-[14px] font-bold text-white">{s.name}</p>
                <p className="mt-1 text-[12px] text-ink-400">{s.use}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* =============================== colophon =========================== */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-800 px-8 py-8 md:px-12 lg:px-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-500">
          FormaCore · Lime Block · tokens.json
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-500">
          mobile · member portal
        </p>
      </footer>
    </div>
  );
}
