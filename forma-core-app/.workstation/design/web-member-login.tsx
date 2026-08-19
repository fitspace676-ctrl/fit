// @page: Member Portal
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore Member Portal — შესვლა
   apps/web/app/[locale]/(auth)/login/page.tsx
   ---------------------------------------------------------------------------
   The portal's front door. Two ways in, both real for a Georgian gym: email +
   password, or a phone number and a 6-digit SMS code. Content is the product's
   own: Downtown Strength, the seeded CLASS_TYPES / DEMO_TODAY_CLASSES schedule
   and DEMO_TRAINERS. Copy in the voice of @fit/i18n ka.json.
   Art direction "Lime Block" — cut corners, one lime, giant mono numerals.
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
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff:
    'M4 4l16 16M9.9 5.9A9.4 9.4 0 0 1 12 5.6c6 0 9.5 6.4 9.5 6.4a17 17 0 0 1-3.4 4.2M6.4 7.8A17 17 0 0 0 2.5 12S6 18.4 12 18.4c1.2 0 2.3-.2 3.3-.6M10 10a3 3 0 0 0 4 4',
  check: 'm5 12.5 4.5 4.5L19 7',
  alert: 'M12 8.5v4.5M12 16.6v.1M12 3.6 2.8 19.4h18.4L12 3.6Z',
  chevron: 'm9 5 7 7-7 7',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13A1.5 1.5 0 0 1 20 12v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-7a1.5 1.5 0 0 1 1.5-1.5Z',
  phone:
    'M8 3.5H6A2.5 2.5 0 0 0 3.5 6c0 8 6.5 14.5 14.5 14.5A2.5 2.5 0 0 0 20.5 18v-2l-4.2-1.6-2 2.4a15.6 15.6 0 0 1-6.1-6.1l2.4-2L8 3.5Z',
  mail: 'M3.5 7.5 12 13l8.5-5.5M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z',
  spinner: 'M12 3.5a8.5 8.5 0 0 1 8.5 8.5',
  back: 'm15 5-7 7 7 7',
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

/* -------------------------------- real data -------------------------------
   DEMO_TODAY_CLASSES at Downtown Strength — the same instances the schedule
   screen renders, used here as proof the gym is alive behind the door. */

const NEXT = {
  title: 'Spin Express',
  category: 'Spin',
  time: '18:00',
  minutes: 45,
  trainerName: 'Sandro K.',
  locationName: 'Main Floor',
  spotsLeft: 4,
};

const TODAY = [
  { time: '12:00', title: 'CrossFit WOD', trainer: 'Levan M.', state: 'სავსე' },
  { time: '18:00', title: 'Spin Express', trainer: 'Sandro K.', state: '4 ადგილი' },
  { time: '19:00', title: 'Boxing Basics', trainer: 'Nika B.', state: '5 ადგილი' },
];

export default function WebMemberLogin() {
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('nino.kapanadze@downtown.demo');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [phone, setPhone] = useState('599 12 48 21');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [touched, setTouched] = useState(false);
  const [locale, setLocale] = useState<'ka' | 'en'>('ka');

  const emailMissing = touched && email.trim() === '';
  const passwordMissing = touched && password === '';

  const submitEmail = () => {
    setTouched(true);
    if (email.trim() === '' || password === '') return;
    setState('loading');
    window.setTimeout(() => setState(password.length < 6 ? 'error' : 'done'), 900);
  };

  const sendCode = () => {
    setTouched(true);
    if (phone.trim() === '') return;
    setState('loading');
    window.setTimeout(() => {
      setState('idle');
      setStep('code');
    }, 800);
  };

  const confirmCode = (value: string) => {
    setCode(value);
    if (value.length === 6) {
      setState('loading');
      window.setTimeout(() => setState(value === '482100' ? 'error' : 'done'), 900);
    } else if (state === 'error') {
      setState('idle');
    }
  };

  const reset = () => {
    setState('idle');
    setStep('form');
    setPassword('');
    setCode('');
    setTouched(false);
  };

  const fieldBase =
    'h-[52px] w-full border bg-ink-950 px-4 text-[15px] font-medium text-white placeholder:text-ink-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-300/40';

  return (
    <div className="relative w-full bg-ink-950 font-sans text-white">
      <div className="grid min-h-[880px] lg:grid-cols-[0.92fr_1.08fr]">
        {/* ============================ the gym side =========================== */}
        <aside className="relative flex flex-col justify-between border-b border-ink-900 px-8 py-10 lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
          <div className="flex items-center gap-2.5">
            <span
              className={`grid h-10 w-10 place-items-center ${CUT_XS} bg-brand-300 text-ink-950`}
            >
              <Icon d={P.bolt} className="h-5 w-5" />
            </span>
            <span className="text-[19px] font-extrabold tracking-tight">FormaCore</span>
          </div>

          <div className="mt-14 max-w-[440px] lg:mt-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
              Downtown Strength · წევრის პორტალი
            </p>
            <h1 className="mt-5 text-[42px] font-extrabold leading-[0.98] tracking-tight sm:text-[54px]">
              დარბაზი
              <br />
              შენს
              <br />
              <span className="text-brand-300">ანგარიშშია.</span>
            </h1>
            <p className="mt-6 max-w-[380px] text-[15px] leading-relaxed text-ink-400">
              განრიგი, ჯავშნები, აბონემენტი და გამოცხადების QR — ერთ ადგილას. შედი და დაიწყე იქიდან,
              სადაც გაჩერდი.
            </p>
          </div>

          {/* next class — the signature block: giant mono numeral, cut at the edge */}
          <div
            className={`relative mt-14 overflow-hidden ${CUT_LG} bg-brand-300 p-6 text-ink-950 sm:p-7`}
          >
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-800">
                შემდეგი გაკვეთილი დღეს
              </p>
              <p className="mt-4 text-[30px] font-extrabold leading-none tracking-tight">
                {NEXT.title}
              </p>
              <p className="mt-3 text-[13px] font-medium text-ink-800">
                {NEXT.trainerName} · {NEXT.locationName} · {NEXT.minutes} წთ
              </p>
              <div className="mt-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <p className="-mb-1 font-mono text-[58px] font-bold leading-none tracking-tight tabular-nums">
                  {NEXT.time}
                </p>
                <span
                  className={`whitespace-nowrap ${CUT_XS} bg-ink-950 px-3 py-1.5 text-[11px] font-bold text-brand-300`}
                >
                  {NEXT.spotsLeft} ადგილი დარჩა
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 hidden divide-y divide-ink-900 border-t border-ink-900 lg:block">
            {TODAY.map((c) => (
              <div key={c.time} className="flex items-center gap-4 py-3">
                <p className="w-14 shrink-0 font-mono text-[14px] font-bold tabular-nums text-ink-300">
                  {c.time}
                </p>
                <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-200">
                  {c.title}
                  <span className="ml-2 font-normal text-ink-500">{c.trainer}</span>
                </p>
                <p className="shrink-0 text-[12px] font-semibold text-ink-500">{c.state}</p>
              </div>
            ))}
          </div>
        </aside>

        {/* ============================= the form side ========================== */}
        <section className="relative flex flex-col bg-ink-900 px-8 py-10 lg:px-14 lg:py-12">
          <div className="flex items-center justify-end gap-2">
            <div className={`flex h-9 items-center ${CUT_XS} bg-ink-950 p-1`}>
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
            <button
              type="button"
              className="h-9 px-3 text-[13px] font-semibold text-ink-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              დახმარება
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-12">
            {state === 'done' ? (
              /* ------------------------- signed in ------------------------- */
              <div>
                <span
                  className={`grid h-14 w-14 place-items-center ${CUT_MD} bg-brand-300 text-ink-950`}
                >
                  <Icon d={P.check} className="h-7 w-7" />
                </span>
                <h2 className="mt-7 text-[34px] font-extrabold leading-none tracking-tight">
                  შესვლა დადასტურდა
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-ink-400">
                  გიხსნით პორტალს, Nino. აბონემენტი{' '}
                  <span className="font-semibold text-white">Premium</span> აქტიურია, დარჩა{' '}
                  <span className="font-mono tabular-nums text-white">22</span> დღე.
                </p>
                <div className={`mt-7 ${CUT_TILE} bg-ink-950 p-5`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
                    დღეს გელოდება
                  </p>
                  <p className="mt-2.5 text-[16px] font-bold text-white">
                    {NEXT.title} · <span className="font-mono tabular-nums">{NEXT.time}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className={`mt-7 h-[52px] w-full ${CUT_MD} bg-ink-800 text-[14px] font-semibold text-ink-200 transition-colors hover:bg-ink-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
                >
                  სხვა ანგარიშით შესვლა
                </button>
              </div>
            ) : step === 'code' ? (
              /* ------------------------- SMS code step ---------------------- */
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('form');
                    setCode('');
                    setState('idle');
                  }}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  <Icon d={P.back} className="h-4 w-4" />
                  ნომრის შეცვლა
                </button>
                <h2 className="mt-6 text-[34px] font-extrabold leading-none tracking-tight">
                  შეიყვანე კოდი
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-ink-400">
                  ექვსნიშნა კოდი გავგზავნეთ ნომერზე{' '}
                  <span className="font-mono font-semibold tabular-nums text-white">
                    +995 {phone}
                  </span>
                </p>

                <div className="mt-8">
                  <label className="block">
                    <span className="sr-only">ერთჯერადი კოდი</span>
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => confirmCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="——————"
                      className={`${fieldBase} ${CUT_MD} h-[64px] text-center font-mono text-[28px] font-bold tracking-[0.5em] tabular-nums ${
                        state === 'error'
                          ? 'border-danger-500'
                          : 'border-ink-800 focus:border-brand-300'
                      }`}
                    />
                  </label>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-pill transition-colors ${
                          code.length > i ? 'bg-brand-300' : 'bg-ink-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {state === 'error' ? (
                  <p
                    role="alert"
                    className={`mt-5 flex items-start gap-2.5 ${CUT_SM} bg-danger-950 p-4 text-[13px] font-medium leading-relaxed text-danger-200`}
                  >
                    <Icon d={P.alert} className="mt-0.5 h-4 w-4 shrink-0 text-danger-400" />
                    კოდი არასწორია ან ვადა გაუვიდა. მოითხოვე ახალი.
                  </p>
                ) : null}

                <p className="mt-6 text-[13px] text-ink-500">
                  კოდი არ მოვიდა?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setCode('');
                      setState('idle');
                    }}
                    className="font-semibold text-brand-300 transition-colors hover:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                  >
                    ხელახლა გაგზავნა
                  </button>{' '}
                  <span className="font-mono tabular-nums text-ink-600">00:42</span>
                </p>
              </div>
            ) : (
              /* --------------------------- the form ------------------------- */
              <div>
                <h2 className="text-[34px] font-extrabold leading-none tracking-tight sm:text-[40px]">
                  შესვლა
                </h2>
                <p className="mt-4 text-[15px] text-ink-400">
                  გამოიყენე იგივე მონაცემები, რითაც დარბაზში დარეგისტრირდი.
                </p>

                {/* method switch */}
                <div className={`mt-8 flex h-12 items-center ${CUT_SM} bg-ink-950 p-1`}>
                  {(
                    [
                      { key: 'email', label: 'ელფოსტა', icon: P.mail },
                      { key: 'phone', label: 'ტელეფონი', icon: P.phone },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setMethod(m.key);
                        setState('idle');
                        setTouched(false);
                      }}
                      aria-pressed={method === m.key}
                      className={`flex h-10 flex-1 items-center justify-center gap-2 ${CUT_XS} text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                        method === m.key
                          ? 'bg-brand-300 text-ink-950'
                          : 'text-ink-500 hover:text-white'
                      }`}
                    >
                      <Icon d={m.icon} className="h-4 w-4" />
                      {m.label}
                    </button>
                  ))}
                </div>

                {state === 'error' ? (
                  <p
                    role="alert"
                    className={`mt-6 flex items-start gap-2.5 ${CUT_SM} bg-danger-950 p-4 text-[13px] font-medium leading-relaxed text-danger-200`}
                  >
                    <Icon d={P.alert} className="mt-0.5 h-4 w-4 shrink-0 text-danger-400" />
                    ელფოსტა ან პაროლი არასწორია. კიდევ 4 მცდელობა დარჩა.
                  </p>
                ) : null}

                {method === 'email' ? (
                  <div className="mt-6 space-y-4">
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
                        className={`${fieldBase} ${CUT_MD} ${
                          emailMissing
                            ? 'border-danger-500'
                            : 'border-ink-800 focus:border-brand-300'
                        }`}
                      />
                      {emailMissing ? (
                        <span className="mt-2 block text-[12px] font-medium text-danger-400">
                          შეავსე ელფოსტა
                        </span>
                      ) : null}
                    </label>

                    <label className="block">
                      <span className="mb-2 flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                        პაროლი
                        <button
                          type="button"
                          className="text-[11px] font-semibold normal-case tracking-normal text-brand-300 transition-colors hover:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          დაგავიწყდა?
                        </button>
                      </span>
                      <span className="relative block">
                        <input
                          type={reveal ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (state === 'error') setState('idle');
                          }}
                          placeholder="••••••••"
                          aria-invalid={passwordMissing}
                          className={`${fieldBase} ${CUT_MD} pr-14 ${
                            passwordMissing || state === 'error'
                              ? 'border-danger-500'
                              : 'border-ink-800 focus:border-brand-300'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setReveal(!reveal)}
                          aria-label={reveal ? 'პაროლის დამალვა' : 'პაროლის ჩვენება'}
                          className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          <Icon d={reveal ? P.eyeOff : P.eye} className="h-[18px] w-[18px]" />
                        </button>
                      </span>
                      {passwordMissing ? (
                        <span className="mt-2 block text-[12px] font-medium text-danger-400">
                          შეავსე პაროლი
                        </span>
                      ) : null}
                    </label>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={remember}
                      onClick={() => setRemember(!remember)}
                      className="flex items-center gap-3 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                      <span
                        className={`grid h-[22px] w-[22px] shrink-0 place-items-center ${CUT_XS} transition-colors ${
                          remember ? 'bg-brand-300 text-ink-950' : 'bg-ink-800 text-ink-800'
                        }`}
                      >
                        <Icon d={P.check} className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[13px] font-medium text-ink-300">
                        დამახსოვრება ამ მოწყობილობაზე
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="mt-6">
                    <label className="block">
                      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                        ტელეფონის ნომერი
                      </span>
                      <span
                        className={`flex h-[52px] items-stretch ${CUT_MD} border border-ink-800 bg-ink-950 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-300/40`}
                      >
                        <span className="grid w-[76px] shrink-0 place-items-center border-r border-ink-800 font-mono text-[15px] font-semibold tabular-nums text-ink-400">
                          +995
                        </span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="5XX XX XX XX"
                          className="h-full min-w-0 flex-1 bg-transparent px-4 font-mono text-[15px] font-medium tabular-nums text-white placeholder:text-ink-600 focus:outline-none"
                        />
                      </span>
                    </label>
                    <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                      ერთჯერად კოდს SMS-ით მიიღებ. ნომერი უნდა ემთხვეოდეს დარბაზში რეგისტრირებულს.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={method === 'email' ? submitEmail : sendCode}
                  disabled={state === 'loading'}
                  className={`mt-7 flex h-[56px] w-full items-center justify-center gap-2.5 ${CUT_MD} bg-brand-300 text-[16px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400`}
                >
                  {state === 'loading' ? (
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
                      მოწმდება…
                    </>
                  ) : method === 'email' ? (
                    'შესვლა'
                  ) : (
                    'კოდის გაგზავნა'
                  )}
                </button>

                <p className="mt-5 flex items-center justify-center gap-2 text-center text-[12px] leading-relaxed text-ink-500">
                  <Icon d={P.lock} className="h-3.5 w-3.5 shrink-0" />
                  კავშირი დაშიფრულია — პაროლს დარბაზი ვერ ხედავს
                </p>
              </div>
            )}
          </div>

          {/* --------------------------- join the gym --------------------------- */}
          <div className={`${CUT_TILE} border border-ink-800 bg-ink-950 p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-white">ჯერ არ ხარ Downtown Strength-ში?</p>
                <p className="mt-1.5 text-[13px] text-ink-400">
                  აირჩიე აბონემენტი ონლაინ — Standard{' '}
                  <span className="font-mono tabular-nums text-ink-200">75,00 ₾</span> / თვე-დან.
                </p>
              </div>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className={`flex h-11 shrink-0 items-center gap-1.5 ${CUT_SM} bg-ink-800 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
              >
                აბონემენტის ყიდვა
                <Icon d={P.chevron} className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-600">
            შესვლით ეთანხმები{' '}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-ink-400 underline underline-offset-2 transition-colors hover:text-white"
            >
              წესებსა და პირობებს
            </a>{' '}
            და{' '}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-ink-400 underline underline-offset-2 transition-colors hover:text-white"
            >
              კონფიდენციალურობის პოლიტიკას
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
