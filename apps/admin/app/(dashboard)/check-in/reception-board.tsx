'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CheckInMethod,
  CheckInRow,
  CheckInStatsResponse,
  EligibilityStatus,
  MemberEligibility,
} from '@fit/types';
import { Badge, Btn, Card, CountUp, Icon, useToast, type Tone } from '@/components/ui';
import {
  fetchEligibilityAction,
  recordCheckInAction,
  searchCheckInMembersAction,
  type CheckInMemberRow,
} from './actions';

type T = ReturnType<typeof useTranslations>;

/** Debounce (ms) before a keystroke in the member search triggers a lookup. */
const SEARCH_DEBOUNCE_MS = 220;

/** Visual treatment per eligibility status — green active, amber frozen, red expired. */
const ELIGIBILITY_TONES: Record<EligibilityStatus, Tone> = {
  ACTIVE: 'success',
  FROZEN: 'warning',
  EXPIRED: 'danger',
};

/** Per-method tone for the arrivals feed tag. */
const METHOD_TONES: Record<CheckInMethod, Tone> = {
  QR: 'brand',
  MANUAL: 'ink',
};

/**
 * The reception board (T4.12). Server-rendered initial data, client-side
 * interaction: the manual lookup debounces a member search, the eligibility card
 * shows a picked member's real access standing, and "Check in" POSTs the arrival —
 * prepending it to the live feed and re-deriving the KPI cards optimistically from
 * the growing arrivals set. Everything comes from the real endpoints; there is no
 * fabricated data.
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
  const t = useTranslations('admin.checkin');
  const [arrivals, setArrivals] = useState<CheckInRow[]>(initialArrivals);
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

  /** Prepend a freshly recorded arrival to the live feed. */
  function addArrival(row: CheckInRow): void {
    setArrivals((prev) => [row, ...prev]);
  }

  /** Focus the manual search box — the "Simulate scan" demo shortcut. */
  function focusSearch(): void {
    searchInputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label={t('metrics.aria')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard label={t('stats.checkedInToday')} value={stats.checkedInToday} icon="check" />
        <StatCard label={t('stats.inGymNow')} value={stats.inGymNow} icon="users" />
        <StatCard label={t('stats.peakToday')} value={stats.peakToday} icon="chart" />
        <StatCard label={t('stats.noShows')} value={stats.noShowsToday} icon="clock" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <ScannerCard onSimulate={focusSearch} t={t} />
          <ManualCheckInCard
            searchInputRef={searchInputRef}
            canCheckIn={canCheckIn}
            onCheckedIn={addArrival}
            t={t}
          />
        </div>

        <div className="lg:col-span-5">
          <ArrivalsCard arrivals={arrivals} t={t} />
        </div>
      </div>
    </div>
  );
}

/** One reception KPI card with an animated headline count. */
function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: Parameters<typeof Icon>[0]['name'];
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        <CountUp to={value} />
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
    </Card>
  );
}

/**
 * The QR scan viewport card — a decorative scan frame + "Scanner ready" status.
 * The camera scanner integration is future work; for the demo the "Simulate scan"
 * button just focuses the manual lookup so a receptionist can still complete a
 * check-in by hand.
 */
function ScannerCard({ onSimulate, t }: { onSimulate: () => void; t: T }) {
  return (
    <Card glow className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">
            {t('scanner.title')}
          </h2>
          <p className="text-sm text-ink-500 dark:text-ink-400">{t('scanner.subtitle')}</p>
        </div>
        <Badge tone="success" icon="spark">
          {t('scanner.ready')}
        </Badge>
      </div>

      <div className="relative mx-auto grid aspect-square w-full max-w-xs place-items-center overflow-hidden rounded-card border border-ink-200 bg-ink-50 dark:border-white/10 dark:bg-white/[0.03]">
        {/* Decorative corner frame + sweeping scan line. */}
        <span className="pointer-events-none absolute left-6 top-6 h-8 w-8 rounded-tl-lg border-l-2 border-t-2 border-brand-500" />
        <span className="pointer-events-none absolute right-6 top-6 h-8 w-8 rounded-tr-lg border-r-2 border-t-2 border-brand-500" />
        <span className="pointer-events-none absolute bottom-6 left-6 h-8 w-8 rounded-bl-lg border-b-2 border-l-2 border-brand-500" />
        <span className="pointer-events-none absolute bottom-6 right-6 h-8 w-8 rounded-br-lg border-b-2 border-r-2 border-brand-500" />
        <span className="pointer-events-none absolute inset-x-10 top-1/2 h-px animate-pulse bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
        <Icon name="qr" className="h-20 w-20 text-ink-300 dark:text-white/20" sw={1.5} />
      </div>

      <Btn v="outline" icon="qr" onClick={onSimulate} className="w-full">
        {t('scanner.simulate')}
      </Btn>
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
  t,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  canCheckIn: boolean;
  onCheckedIn: (row: CheckInRow) => void;
  t: T;
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
      toast(t('toast.checkedIn', { name: result.data.checkIn.name }), {
        tone: 'success',
        icon: 'check',
      });
      reset();
    } else {
      toast(result.error, { tone: 'danger', icon: 'info' });
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">
          {t('manual.title')}
        </h2>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t('manual.subtitle')}</p>
      </div>

      {picked ? (
        <EligibilityCard
          member={picked}
          eligibility={eligibility}
          loading={loadingEligibility}
          canCheckIn={canCheckIn}
          checkingIn={checkingIn}
          onCheckIn={() => void checkIn()}
          onReset={reset}
          t={t}
        />
      ) : (
        <div className="relative">
          <label htmlFor="checkin-search" className="sr-only">
            {t('manual.searchLabel')}
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <input
            id="checkin-search"
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('manual.searchPlaceholder')}
            className="h-11 w-full rounded-field border border-ink-200 bg-white pl-10 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />

          {searchError ? (
            <p role="alert" className="mt-2 text-sm text-danger-600 dark:text-danger-300">
              {searchError}
            </p>
          ) : null}

          {query.trim() !== '' && !searchError ? (
            <div className="mt-2 overflow-hidden rounded-card border border-ink-200 dark:border-white/10">
              {searching && results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-500 dark:text-ink-400">
                  {t('manual.searching')}
                </p>
              ) : results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-500 dark:text-ink-400">
                  {t('manual.noMatch', { query: query.trim() })}
                </p>
              ) : (
                <ul className="divide-y divide-ink-100 dark:divide-white/5">
                  {results.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => void pick(member)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-50 dark:hover:bg-white/5"
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
                        <Icon name="arrow" className="h-4 w-4 text-ink-300 dark:text-ink-600" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
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
  t,
}: {
  member: CheckInMemberRow;
  eligibility: MemberEligibility | null;
  loading: boolean;
  canCheckIn: boolean;
  checkingIn: boolean;
  onCheckIn: () => void;
  onReset: () => void;
  t: T;
}) {
  const style = eligibility
    ? { tone: ELIGIBILITY_TONES[eligibility.status], label: t(`eligibility.${eligibility.status}`) }
    : null;
  return (
    <div className="flex flex-col gap-4 rounded-card border border-ink-200 bg-ink-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <MemberAvatar name={member.name} photoUrl={member.photoUrl} size="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900 dark:text-white">{member.name}</p>
          <p className="truncate text-xs text-ink-500 dark:text-ink-400">{member.email}</p>
        </div>
        {loading ? (
          <Badge tone="ink">{t('eligibility.checking')}</Badge>
        ) : style ? (
          <Badge tone={style.tone}>{style.label}</Badge>
        ) : null}
      </div>

      {eligibility ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {t('eligibility.plan')}
            </dt>
            <dd className="text-ink-900 dark:text-white">{eligibility.planName ?? '—'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {t('eligibility.access')}
            </dt>
            <dd className="text-ink-900 dark:text-white">
              {eligibility.status === 'ACTIVE' ? t('eligibility.granted') : t('eligibility.review')}
            </dd>
          </div>
        </dl>
      ) : null}

      {eligibility && eligibility.status !== 'ACTIVE' ? (
        <p className="rounded-btn bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:bg-warning-500/10 dark:text-warning-200">
          {eligibility.status === 'FROZEN'
            ? t('eligibility.frozenWarning')
            : t('eligibility.inactiveWarning')}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Btn
          v="primary"
          icon="check"
          onClick={onCheckIn}
          disabled={!canCheckIn || loading || checkingIn}
          className="flex-1"
        >
          {checkingIn ? t('eligibility.checkingIn') : t('eligibility.checkIn')}
        </Btn>
        <Btn v="ghost" icon="x" onClick={onReset} disabled={checkingIn}>
          {t('eligibility.cancel')}
        </Btn>
      </div>
      {!canCheckIn ? <p className="text-xs text-ink-400">{t('eligibility.readOnly')}</p> : null}
    </div>
  );
}

/** The live arrivals feed — today's check-ins, most recent first. */
function ArrivalsCard({ arrivals, t }: { arrivals: CheckInRow[]; t: T }) {
  const locale = useLocale();
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">
          {t('arrivals.title')}
        </h2>
        <Badge tone="ink">{t('arrivals.count', { count: arrivals.length })}</Badge>
      </div>

      {arrivals.length === 0 ? (
        <div className="grid flex-1 place-items-center py-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-400 dark:bg-white/5">
              <Icon name="users" className="h-6 w-6" />
            </span>
            <p className="text-sm text-ink-500 dark:text-ink-400">{t('arrivals.empty')}</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-ink-100 dark:divide-white/5">
          {arrivals.map((arrival) => (
            <li key={arrival.id} className="flex items-center gap-3 py-3">
              <MemberAvatar name={arrival.name} photoUrl={arrival.photoUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                  {arrival.name}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {timeAgo(arrival.checkedInAt, t, locale)}
                </p>
              </div>
              <Badge tone={METHOD_TONES[arrival.method]}>{t(`method.${arrival.method}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * A circular avatar for a member — their photo when one exists, else their initials
 * on a brand-tinted disc. The member profile carries no avatar yet, so the initials
 * fallback is what renders today.
 */
function MemberAvatar({
  name,
  photoUrl,
  size = 'h-9 w-9',
}: {
  name: string;
  photoUrl: string | null;
  size?: string;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`${size} shrink-0 rounded-full object-cover ring-1 ring-ink-200 dark:ring-white/10`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${size} grid shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/15 dark:text-brand-200`}
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
function timeAgo(iso: string, t: T, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) {
    return t('timeAgo.justNow');
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return t('timeAgo.minutes', { minutes });
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return t('timeAgo.hours', { hours });
  }
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
