'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type {
  CheckInMethod,
  CheckInRow,
  CheckInStatsResponse,
  EligibilityStatus,
  MemberEligibility,
} from '@fit/types';
import { Badge, Btn, Card, CountUp, I, Icon, Switch, useToast, type Tone } from '@/components/ui';
import {
  fetchEligibilityAction,
  recordCheckInAction,
  searchCheckInMembersAction,
  type CheckInMemberRow,
} from './actions';

/** Debounce (ms) before a keystroke in the member search triggers a lookup. */
const SEARCH_DEBOUNCE_MS = 220;

/** How long (ms) a freshly recorded arrival stays highlighted in the feed. */
const FLASH_MS = 1400;

/**
 * Stroke paths (24×24, Lucide-style, drawn to the shared `Icon` grid) that this
 * screen needs but the shared set doesn't carry: the reception scan frame,
 * refresh, add-member, snowflake/dollar eligibility glyphs, warning triangle and
 * the chime volume states.
 */
const GLYPHS = {
  warn: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  userPlus:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
  snow: 'M12 2v20M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4M2 12h20',
  dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  volOn: 'M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14',
  volOff: 'M11 5 6 9H2v6h4l5 4V5ZM22 9l-6 6M16 9l6 6',
} as const;

/** Render one of this screen's local {@link GLYPHS} in the shared icon style. */
function Glyph({
  d,
  className = 'h-5 w-5',
  sw = 2.1,
}: {
  d: string;
  className?: string;
  sw?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Visual treatment per eligibility status — the design's descriptive badge label,
 * tone and glyph, plus the footer hint colour for the non-eligible states.
 */
const ELIGIBILITY_STYLES: Record<
  EligibilityStatus,
  { label: string; tone: Tone; glyph: string; hint: string | null; hintClass: string }
> = {
  ACTIVE: {
    label: 'Active membership',
    tone: 'success',
    glyph: I.check,
    hint: null,
    hintClass: 'text-ink-500 dark:text-ink-400',
  },
  FROZEN: {
    label: 'Membership frozen',
    tone: 'accent',
    glyph: GLYPHS.snow,
    hint: 'Membership frozen — confirm before granting access.',
    hintClass: 'text-accent-700 dark:text-accent-300',
  },
  EXPIRED: {
    label: 'No active plan',
    tone: 'danger',
    glyph: GLYPHS.dollar,
    hint: 'No active plan — confirm before granting access.',
    hintClass: 'text-danger-700 dark:text-danger-300',
  },
};

/** Per-method glyph + text colour for the arrivals feed tag. */
const METHOD_STYLES: Record<CheckInMethod, { label: string; className: string; glyph: string }> = {
  QR: { label: 'QR', className: 'text-accent-700 dark:text-accent-300', glyph: I.qr },
  MANUAL: {
    label: 'Manual',
    className: 'text-iris-700 dark:text-iris-300',
    glyph: GLYPHS.userPlus,
  },
};

/** Play a short reception chime via WebAudio (no asset; degrades silently). */
function playChime(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio unavailable (autoplay policy, no device) — the check-in still lands.
  }
}

/**
 * The reception board (T4.12). Server-rendered initial data, client-side
 * interaction: the manual lookup debounces a member search, the eligibility card
 * shows a picked member's real access standing, and "Check in" POSTs the arrival —
 * prepending it to the live feed (with a brief highlight + optional chime) and
 * re-deriving the KPI cards optimistically from the growing arrivals set.
 * Everything comes from the real endpoints; there is no fabricated data.
 */
export function ReceptionBoard({
  initialStats,
  initialArrivals,
  canCheckIn,
}: {
  initialStats: CheckInStatsResponse;
  initialArrivals: CheckInRow[];
  canCheckIn: boolean;
}) {
  const [arrivals, setArrivals] = useState<CheckInRow[]>(initialArrivals);
  const [chime, setChime] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The four KPI figures start from the server snapshot and are re-derived from the
  // live arrivals set as new check-ins land, so the cards stay honest without a
  // refetch. `noShowsToday` has no client-derivable source, so it stays server-set.
  const stats = useMemo<CheckInStatsResponse>(() => {
    const distinct = new Set(arrivals.map((a) => a.gymMemberId));
    const perHour = new Map<number, number>();
    for (const a of arrivals) {
      const hour = new Date(a.checkedInAt).getHours();
      perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
    }
    const peak = perHour.size === 0 ? 0 : Math.max(...perHour.values());
    return {
      checkedInToday: arrivals.length,
      inGymNow: distinct.size,
      peakToday: Math.max(peak, initialStats.peakToday),
      noShowsToday: initialStats.noShowsToday,
    };
  }, [arrivals, initialStats.peakToday, initialStats.noShowsToday]);

  /** Prepend a freshly recorded arrival to the live feed, flash it, chime. */
  function addArrival(row: CheckInRow): void {
    setArrivals((prev) => [row, ...prev]);
    setFlashId(row.id);
    setTimeout(() => setFlashId((current) => (current === row.id ? null : current)), FLASH_MS);
    if (chime) {
      playChime();
    }
  }

  /** Focus the manual search box — the "Simulate scan" demo shortcut. */
  function focusSearch(): void {
    searchInputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="Reception metrics"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        <StatCard
          label="Checked in today"
          value={stats.checkedInToday}
          glyph={I.check}
          tone="text-success-600 dark:text-success-400"
        />
        <StatCard
          label="In the gym now"
          value={stats.inGymNow}
          glyph={I.users}
          tone="text-brand-600 dark:text-brand-400"
        />
        <StatCard
          label="Peak today"
          value={stats.peakToday}
          glyph={I.chart}
          tone="text-iris-600 dark:text-iris-400"
        />
        <StatCard
          label="No-shows"
          value={stats.noShowsToday}
          glyph={GLYPHS.warn}
          tone="text-warning-600 dark:text-warning-400"
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <ScannerCard onSimulate={focusSearch} />
          <ManualCheckInCard
            searchInputRef={searchInputRef}
            canCheckIn={canCheckIn}
            onCheckedIn={addArrival}
          />
        </div>

        <div className="lg:col-span-5">
          <ArrivalsCard
            arrivals={arrivals}
            flashId={flashId}
            chime={chime}
            onChimeChange={setChime}
          />
        </div>
      </div>
    </div>
  );
}

/** One reception KPI tile: a toned icon beside an animated count + label. */
function StatCard({
  label,
  value,
  glyph,
  tone,
}: {
  label: string;
  value: number;
  glyph: string;
  tone: string;
}) {
  return (
    <Card glow className="flex items-center gap-3.5 p-4">
      <span className={`grid shrink-0 place-items-center ${tone}`}>
        <Glyph d={glyph} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-extrabold leading-none tabular-nums text-ink-900 dark:text-white">
          <CountUp to={value} />
        </p>
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
          {label}
        </p>
      </div>
    </Card>
  );
}

/**
 * The QR terminal card: a dark camera-style scan viewport (corner frame, sweeping
 * scan line, "Scanner ready" status) over a footer bar with the "Simulate scan"
 * action. The camera scanner integration is future work; for the demo the button
 * just focuses the manual lookup so a receptionist can still complete a check-in
 * by hand.
 */
function ScannerCard({ onSimulate }: { onSimulate: () => void }) {
  // The scan line sweeps between the top and bottom of the frame; toggling the
  // target every 1.7s with a 1.5s transition reproduces the design's animation.
  const [sweep, setSweep] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setSweep((s) => !s), 1700);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card glow className="p-0">
      {/* Scan viewport — deliberately dark in both themes; it reads as a camera feed. */}
      <div className="relative h-[300px] overflow-hidden bg-ink-950 sm:h-[340px]">
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative h-52 w-52 sm:h-56 sm:w-56">
            <span className="pointer-events-none absolute left-0 top-0 h-9 w-9 rounded-tl-2xl border-l-2 border-t-2 border-brand-400" />
            <span className="pointer-events-none absolute right-0 top-0 h-9 w-9 rounded-tr-2xl border-r-2 border-t-2 border-brand-400" />
            <span className="pointer-events-none absolute bottom-0 left-0 h-9 w-9 rounded-bl-2xl border-b-2 border-l-2 border-brand-400" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-9 w-9 rounded-br-2xl border-b-2 border-r-2 border-brand-400" />
            <span
              className="pointer-events-none absolute inset-x-3 h-0.5 bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_18px_2px_rgba(98,87,227,0.8)] transition-all duration-[1500ms] ease-in-out"
              style={{ top: sweep ? '88%' : '8%' }}
            />
            <Icon name="qr" className="absolute inset-0 m-auto h-16 w-16 text-white/25" sw={1.6} />
          </div>
        </div>
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-pill bg-white/10 px-2.5 py-1.5 ring-1 ring-inset ring-white/15 backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-white">Scanner ready</span>
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
          <p className="text-sm font-semibold text-white">Point member QR at the camera</p>
          <p className="mt-0.5 font-mono text-[11px] text-white/55">Auto check-in · 60s token</p>
        </div>
      </div>

      {/* Terminal footer. */}
      <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-4 py-4 dark:border-white/10 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Glyph d={GLYPHS.scan} className="h-5 w-5 text-brand-400" sw={2} />
          <span className="text-sm font-semibold text-ink-900 dark:text-white">QR terminal</span>
        </div>
        <Btn v="primary" size="sm" onClick={onSimulate}>
          <Glyph d={GLYPHS.refresh} className="h-4 w-4" sw={2.1} />
          Simulate scan
        </Btn>
      </div>
    </Card>
  );
}

/**
 * The manual check-in card: a debounced member search, a results dropdown, and —
 * once a member is picked — a live eligibility card with a "Check in" button that
 * records the arrival and toasts success.
 */
function ManualCheckInCard({
  searchInputRef,
  canCheckIn,
  onCheckedIn,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  canCheckIn: boolean;
  onCheckedIn: (row: CheckInRow) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CheckInMemberRow[]>([]);
  const [searching, startSearch] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);

  const [picked, setPicked] = useState<CheckInMemberRow | null>(null);
  const [eligibility, setEligibility] = useState<MemberEligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  // Debounce the search so typing doesn't fire a request per keystroke; a stale
  // response (a slower earlier request) is discarded via the monotonic sequence.
  function onQueryChange(value: string): void {
    setQuery(value);
    setPicked(null);
    setEligibility(null);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      setResults([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const seq = ++requestSeq.current;
      startSearch(async () => {
        const result = await searchCheckInMembersAction(trimmed);
        if (seq !== requestSeq.current) {
          return;
        }
        if (result.ok) {
          setResults(result.data);
          setSearchError(null);
        } else {
          setResults([]);
          setSearchError(result.error);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  // Load the picked member's eligibility for the card.
  async function pick(member: CheckInMemberRow): Promise<void> {
    setPicked(member);
    setResults([]);
    setQuery('');
    setEligibility(null);
    setLoadingEligibility(true);
    const result = await fetchEligibilityAction(member.id);
    setLoadingEligibility(false);
    if (result.ok) {
      setEligibility(result.data);
    } else {
      toast(result.error, { tone: 'danger', icon: 'info' });
    }
  }

  /** Clear the picked member and return to the search. */
  function reset(): void {
    setPicked(null);
    setEligibility(null);
    setQuery('');
    setResults([]);
  }

  async function checkIn(): Promise<void> {
    if (!picked) {
      return;
    }
    setCheckingIn(true);
    const result = await recordCheckInAction({ gymMemberId: picked.id, method: 'MANUAL' });
    setCheckingIn(false);
    if (result.ok) {
      onCheckedIn(result.data.checkIn);
      toast(`${result.data.checkIn.name} checked in`, { tone: 'success', icon: 'check' });
      reset();
    } else {
      toast(result.error, { tone: 'danger', icon: 'info' });
    }
  }

  return (
    <Card glow className="p-4 sm:p-5">
      <div className="mb-3.5 flex items-center gap-2.5">
        <Glyph d={GLYPHS.userPlus} className="h-5 w-5 text-ink-900 dark:text-white" sw={2} />
        <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
          Manual check-in
        </h2>
        <span className="ml-auto text-xs text-ink-400 dark:text-ink-500">
          Search by name or email
        </span>
      </div>

      <div className="relative">
        <label htmlFor="checkin-search" className="sr-only">
          Search members by name or email
        </label>
        <Icon
          name="search"
          className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 dark:text-ink-500"
          sw={2}
        />
        <input
          id="checkin-search"
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by name or email…"
          className="h-12 w-full rounded-field bg-ink-50 pl-11 pr-4 text-sm text-ink-900 outline-none ring-1 ring-inset ring-ink-200 transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500"
        />
      </div>

      {searchError ? (
        <p role="alert" className="mt-2 text-sm text-danger-600 dark:text-danger-300">
          {searchError}
        </p>
      ) : null}

      {/* Results dropdown. */}
      {query.trim() !== '' && !picked && !searchError ? (
        <div className="mt-2.5 overflow-hidden rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
          {searching && results.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-ink-500 dark:text-ink-400">Searching…</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-ink-500 dark:text-ink-400">
                No members match “{query.trim()}”.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-200 dark:divide-white/10">
              {results.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => void pick(member)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white dark:hover:bg-white/5"
                  >
                    <MemberAvatar name={member.name} photoUrl={member.photoUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">
                        {member.name}
                      </span>
                      <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
                        {member.email}
                      </span>
                    </span>
                    <Icon name="arrow" className="h-4 w-4 text-ink-400 dark:text-ink-500" sw={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Picked member — eligibility card. */}
      {picked ? (
        <EligibilityCard
          member={picked}
          eligibility={eligibility}
          loading={loadingEligibility}
          canCheckIn={canCheckIn}
          checkingIn={checkingIn}
          onCheckIn={() => void checkIn()}
          onReset={reset}
        />
      ) : null}
    </Card>
  );
}

/** The picked member's eligibility panel with the "Check in" action. */
function EligibilityCard({
  member,
  eligibility,
  loading,
  canCheckIn,
  checkingIn,
  onCheckIn,
  onReset,
}: {
  member: CheckInMemberRow;
  eligibility: MemberEligibility | null;
  loading: boolean;
  canCheckIn: boolean;
  checkingIn: boolean;
  onCheckIn: () => void;
  onReset: () => void;
}) {
  const style = eligibility ? ELIGIBILITY_STYLES[eligibility.status] : null;

  // Footer hint: the role limitation wins, then the status caveat, then the plan.
  let hint: string;
  let hintClass = 'text-ink-500 dark:text-ink-400';
  if (!canCheckIn) {
    hint = 'Your role can look members up but not record check-ins.';
  } else if (loading || !eligibility || !style) {
    hint = 'Checking eligibility…';
  } else if (style.hint) {
    hint = style.hint;
    hintClass = style.hintClass;
  } else {
    hint = eligibility.planName ?? 'Ready to check in.';
  }

  return (
    <div className="mt-3 overflow-hidden rounded-card bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10">
      <div className="flex items-center gap-3.5 p-4">
        <MemberAvatar
          name={member.name}
          photoUrl={member.photoUrl}
          size="h-14 w-14"
          ring={eligibility?.status === 'ACTIVE'}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
            {member.name}
          </p>
          <p className="truncate text-xs text-ink-500 dark:text-ink-400">
            {eligibility?.planName ? `${eligibility.planName} · ${member.email}` : member.email}
          </p>
        </div>
        {loading ? (
          <Badge tone="ink">Checking…</Badge>
        ) : style ? (
          <Badge tone={style.tone}>
            <span className="inline-flex items-center gap-1.5">
              <Glyph d={style.glyph} className="h-3.5 w-3.5" sw={2.4} />
              {style.label}
            </span>
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5 border-t border-ink-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
        <span className={`min-w-0 flex-1 truncate text-xs ${hintClass}`}>{hint}</span>
        <Btn v="ghost" size="sm" onClick={onReset} disabled={checkingIn}>
          Clear
        </Btn>
        <Btn
          v="primary"
          size="sm"
          icon="check"
          onClick={onCheckIn}
          disabled={!canCheckIn || loading || checkingIn}
        >
          {checkingIn ? 'Checking in…' : 'Check in'}
        </Btn>
      </div>
    </div>
  );
}

/** The live arrivals feed — today's check-ins, most recent first. */
function ArrivalsCard({
  arrivals,
  flashId,
  chime,
  onChimeChange,
}: {
  arrivals: CheckInRow[];
  flashId: string | null;
  chime: boolean;
  onChimeChange: (next: boolean) => void;
}) {
  return (
    <Card glow className="flex h-full flex-col p-0">
      <div className="flex items-center gap-3 border-b border-ink-200 px-4 py-4 dark:border-white/10 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
          </span>
          <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
            Live arrivals
          </h2>
          <span className="font-mono text-xs text-ink-400 dark:text-ink-500">
            {arrivals.length}
          </span>
        </div>
        <div className="ml-auto inline-flex h-8 items-center gap-2 rounded-pill bg-ink-50 pl-2.5 pr-1 text-xs font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:text-ink-300 dark:ring-white/10">
          <Glyph
            d={chime ? GLYPHS.volOn : GLYPHS.volOff}
            className={`h-4 w-4 ${chime ? 'text-brand-400' : 'text-ink-400 dark:text-ink-500'}`}
            sw={2}
          />
          <span className="hidden sm:inline">Chime</span>
          <Switch checked={chime} onChange={onChimeChange} label="Arrival chime" />
        </div>
      </div>

      {arrivals.length === 0 ? (
        <div className="grid flex-1 place-items-center py-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-400 dark:bg-white/5">
              <Icon name="users" className="h-6 w-6" />
            </span>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              No arrivals yet today. Checked-in members appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="max-h-[560px] flex-1 overflow-y-auto p-2 sm:p-2.5">
          <ul className="space-y-1">
            {arrivals.map((arrival) => {
              const method = METHOD_STYLES[arrival.method];
              return (
                <li
                  key={arrival.id}
                  className={`flex items-center gap-3 rounded-card px-2.5 py-2.5 transition-colors ${
                    flashId === arrival.id
                      ? 'bg-brand-500/10 ring-1 ring-inset ring-brand-500/25 dark:bg-brand-500/15 dark:ring-brand-400/30'
                      : 'hover:bg-ink-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <MemberAvatar
                      name={arrival.name}
                      photoUrl={arrival.photoUrl}
                      size="h-10 w-10"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-success-500 ring-2 ring-white dark:ring-ink-900">
                      <Icon name="check" className="h-2.5 w-2.5 text-white" sw={3} />
                    </span>
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900 dark:text-white">
                    {arrival.name}
                  </p>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${method.className}`}
                    >
                      <Glyph d={method.glyph} className="h-3 w-3" sw={2.2} />
                      {method.label}
                    </span>
                    <span className="font-mono text-[11px] text-ink-400 dark:text-ink-500">
                      {timeAgo(arrival.checkedInAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-ink-200 px-4 py-3 dark:border-white/10 sm:px-5">
        <span className="text-xs text-ink-400 dark:text-ink-500">Showing today</span>
      </div>
    </Card>
  );
}

/**
 * A circular avatar for a member — their photo when one exists, else their initials
 * on a brand-tinted disc. The member profile carries no avatar yet, so the initials
 * fallback is what renders today. `ring` adds the brand selection ring the design
 * puts on an eligible picked member.
 */
function MemberAvatar({
  name,
  photoUrl,
  size = 'h-9 w-9',
  ring = false,
}: {
  name: string;
  photoUrl: string | null;
  size?: string;
  ring?: boolean;
}) {
  const ringClass = ring
    ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950'
    : '';
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`${size} shrink-0 rounded-full object-cover ${
          ringClass || 'ring-1 ring-ink-200 dark:ring-white/10'
        }`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${size} grid shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200 ${
        ringClass || 'ring-1 ring-brand-500/20'
      }`}
    >
      {initials(name)}
    </span>
  );
}

/** Up-to-two-letter initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Render an ISO instant as a compact "time ago" string ("just now", "3m ago", …). */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
