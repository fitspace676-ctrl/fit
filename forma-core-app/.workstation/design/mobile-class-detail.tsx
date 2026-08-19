// @device: mobile
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore mobile — გაკვეთილის დეტალი · app/(tabs)/classes/[instanceId].tsx
   Renders `classInstanceDetailSchema`: title, description, startsAt/endsAt,
   durationMinutes, trainerName, locationName, room, capacity, bookedCount,
   status. Copy verbatim from @fit/i18n ka.json (classes.detail.*,
   member.actions.*). Art direction "Lime Block".
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
  back: 'M15 5 8 12l7 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.2 2',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
  users:
    'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 20.5a7 7 0 0 1 14 0M16.5 5.2a3.6 3.6 0 0 1 0 6.6M18 14.6a6 6 0 0 1 4 5.9',
  share: 'M12 15V4m0 0L8 8m4-4 4 4M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7',
  bolt: 'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3Z',
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

/** One `classes.detail.*` fact — icon, label, value. */
function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-ink-900 p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-ink-200">
        <Icon d={icon} className="h-[18px] w-[18px]" />
      </span>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        {label}
      </p>
      <p className="mt-1.5 text-[15px] font-bold text-white">{value}</p>
    </div>
  );
}

/* -------------------------------- real data ------------------------------- */

/** The seeded `Spin` class type: 45 min, capacity 24, colour #8F8F8B. */
const CLASS = {
  title: 'Spin Express',
  category: 'Spin',
  color: '#8F8F8B',
  description:
    'ინტერვალური ველო-სესია მუსიკის რიტმში. სამი აღმართი, ორი სპრინტი და დასასრულს გაწელვა. დამწყებსაც შეუძლია — წინაღობას თავად არეგულირებ.',
  time: '18:00',
  endTime: '18:45',
  day: 'ხუთშაბათი, 6 აგვისტო',
  minutes: 45,
  trainerName: 'Sandro K.',
  locationName: 'Main Floor',
  room: 'ველო-ზონა',
  capacity: 24,
  bookedCount: 20,
};

export default function MobileClassDetail() {
  const [booked, setBooked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const spotsLeft = CLASS.capacity - CLASS.bookedCount - (booked ? 1 : 0);
  const full = spotsLeft <= 0;
  const pct = Math.min(
    Math.round(((CLASS.bookedCount + (booked ? 1 : 0)) / CLASS.capacity) * 100),
    100,
  );

  const confirmBooking = () => {
    setBooked(true);
    setConfirmOpen(false);
    setToast('დაჯავშნილია! შევხვდებით');
  };

  const cancelBooking = () => {
    setBooked(false);
    setConfirmOpen(false);
    setToast('ჯავშანი გაუქმდა');
  };

  return (
    <div className="relative min-h-[900px] w-full bg-ink-950 pb-32 font-sans text-white">
      {/* ------------------------------- app bar ---------------------------- */}
      <header className="flex items-center justify-between px-5 pb-5 pt-14">
        <button
          type="button"
          aria-label="ყველა გაკვეთილი"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-ink-200 transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <Icon d={P.back} className="h-[19px] w-[19px]" />
        </button>
        <button
          type="button"
          aria-label="გაზიარება"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-ink-200 transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <Icon d={P.share} className="h-[19px] w-[19px]" />
        </button>
      </header>

      {/* -------------------------------- hero ------------------------------ */}
      <section className="px-5">
        <div className="relative overflow-hidden rounded-[32px] border border-ink-800 bg-ink-900 text-white">
          <div className="relative p-6">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: CLASS.color }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                {CLASS.category}
              </span>
            </div>

            <h1 className="mt-3 max-w-[240px] text-[34px] font-extrabold leading-[1] tracking-tight">
              {CLASS.title}
            </h1>
            <p className="mt-3 text-[14px] font-medium text-ink-400">{CLASS.day}</p>

            <div className="mt-6 flex items-center gap-3">
              <span className="rounded-pill bg-ink-950 px-4 py-2 font-mono text-[15px] font-bold tabular-nums text-brand-300">
                {CLASS.time}–{CLASS.endTime}
              </span>
              <span className="rounded-pill bg-ink-800 px-4 py-2 text-[13px] font-semibold tabular-nums text-ink-200">
                {CLASS.minutes} წუთი
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ occupancy --------------------------- */}
      <section className="mt-4 px-5">
        <div className="rounded-[26px] bg-ink-900 p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                ადგილები
              </p>
              <p className="mt-2 font-mono text-[30px] font-bold leading-none tabular-nums text-white">
                {CLASS.bookedCount + (booked ? 1 : 0)}
                <span className="text-[16px] text-ink-500">/{CLASS.capacity}</span>
              </p>
            </div>
            <p className={`text-[13px] font-semibold ${full ? 'text-ink-400' : 'text-brand-300'}`}>
              {full ? 'შევსებულია' : `${spotsLeft} ადგილი დარჩა`}
            </p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-pill bg-ink-800">
            <div
              className={`h-full rounded-pill ${pct >= 100 ? 'bg-danger-500' : pct > 85 ? 'bg-ink-400' : 'bg-brand-300'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      {/* -------------------------------- facts ----------------------------- */}
      <section className="mt-4 px-5">
        <div className="grid grid-cols-2 gap-3">
          <Fact icon={P.user} label="მწვრთნელი" value={CLASS.trainerName} />
          <Fact icon={P.pin} label="ლოკაცია" value={CLASS.locationName} />
          <Fact icon={P.clock} label="ხანგრძლივობა" value={`${CLASS.minutes} წუთი`} />
          <Fact icon={P.users} label="ოთახი" value={CLASS.room} />
        </div>
      </section>

      {/* -------------------------------- about ----------------------------- */}
      <section className="mt-6 px-5">
        <h2 className="text-[20px] font-extrabold tracking-tight">რას უნდა ელოდოთ</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-300">{CLASS.description}</p>
      </section>

      {/* ------------------------------- trainer ---------------------------- */}
      <section className="mt-6 px-5">
        <div className="flex items-center gap-3 rounded-[26px] bg-ink-900 p-4">
          <img
            src="https://i.pravatar.cc/160?img=13"
            alt={CLASS.trainerName}
            width={52}
            height={52}
            referrerPolicy="no-referrer"
            className="h-[52px] w-[52px] shrink-0 rounded-full object-cover ring-2 ring-ink-700"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              მწვრთნელი
            </p>
            <p className="mt-1 truncate text-[16px] font-bold text-white">{CLASS.trainerName}</p>
            <p className="mt-0.5 truncate text-[12px] text-ink-400">Spin · CrossFit · Main Floor</p>
          </div>
          <button
            type="button"
            className={`shrink-0 ${CUT_SM} bg-ink-800 px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
          >
            პროფილი
          </button>
        </div>
      </section>

      {/* ------------------------- sticky booking bar ----------------------- */}
      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-ink-900 bg-ink-950/95 px-5 pb-6 pt-4">
        {toast ? (
          <div className="mb-3 flex items-center gap-2 rounded-pill bg-brand-300 px-4 py-2.5 text-[13px] font-bold text-ink-950">
            <Icon d={P.check} className="h-4 w-4" />
            {toast}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
              {booked ? 'შენი ჯავშანი' : 'ადგილი'}
            </p>
            <p className="mt-1 truncate text-[15px] font-bold text-white">
              {booked ? 'დადასტურებული' : full ? 'შევსებულია' : `${spotsLeft} ადგილი დარჩა`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className={`h-[52px] shrink-0 ${CUT_MD} px-8 text-[15px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              booked
                ? 'bg-ink-800 text-white hover:bg-ink-700'
                : 'bg-brand-300 text-ink-950 hover:bg-brand-200'
            }`}
          >
            {booked ? 'გაუქმება' : full ? 'მოლოდინის სიაში' : 'დაჯავშნა'}
          </button>
        </div>
      </div>

      {/* ---------------------------- confirm sheet ------------------------- */}
      {confirmOpen ? (
        <div className="absolute inset-0 z-20">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-ink-900 px-5 pb-8 pt-3">
            <div className="mx-auto mb-5 h-1 w-10 rounded-pill bg-ink-700" />

            <div className="flex items-start justify-between gap-3">
              <p className="text-[22px] font-extrabold tracking-tight text-white">
                {booked ? 'ჯავშნის გაუქმება?' : 'დაჯავშნა?'}
              </p>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setConfirmOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-[26px] border border-ink-800 bg-ink-950 p-5 text-white">
              <p className="text-[22px] font-extrabold leading-none tracking-tight">
                {CLASS.title}
              </p>
              <p className="mt-2.5 text-[13px] font-medium text-ink-400">
                {CLASS.day} · <span className="font-mono tabular-nums">{CLASS.time}</span>
              </p>
              <p className="mt-1 text-[13px] font-medium text-ink-400">
                {CLASS.trainerName} · {CLASS.locationName}
              </p>
            </div>

            <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-ink-400">
              <Icon d={P.bolt} className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
              {booked
                ? 'გაუქმების ვადა გაკვეთილამდე 2 საათია — ამის შემდეგ ჯავშანი აღარ უქმდება.'
                : 'გაკვეთილამდე 1 საათით ადრე შეხსენებას მიიღებ. გაუქმება უფასოა 2 საათამდე.'}
            </p>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={`h-[52px] flex-1 ${CUT_MD} bg-ink-800 text-[15px] font-semibold text-ink-200 transition-colors hover:bg-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300`}
              >
                დახურვა
              </button>
              <button
                type="button"
                onClick={booked ? cancelBooking : confirmBooking}
                className={`h-[52px] flex-1 ${CUT_MD} text-[15px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  booked
                    ? 'bg-danger-500 text-white hover:bg-danger-400'
                    : 'bg-brand-300 text-ink-950 hover:bg-brand-200'
                }`}
              >
                {booked ? 'გაუქმება' : 'დადასტურება'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
