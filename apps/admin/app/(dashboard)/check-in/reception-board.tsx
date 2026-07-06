'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  CheckInMethod,
  CheckInRow,
  CheckInStatsResponse,
  EligibilityStatus,
  MemberEligibility,
} from '@fit/types';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Btn, CountUp, Icon, useToast, type Tone } from '@/components/ui';
import { LIVE_REFRESH_MS, useLiveRefresh } from '@/hooks/use-live-refresh';
import {
  fetchEligibilityAction,
  recordCheckInAction,
  searchCheckInMembersAction,
  type CheckInMemberRow,
} from './actions';

type T = ReturnType<typeof useTranslations>;

/** Debounce (ms) before a keystroke in the member search triggers a lookup. */
const SEARCH_DEBOUNCE_MS = 220;

/** The scan line's slow opacity pulse (mirrors Tailwind `animate-pulse`). */
const pulse = stylex.keyframes({
  '50%': { opacity: 0.5 },
});

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  metrics: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  mainGrid: {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(12, minmax(0, 1fr))',
    },
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 7',
    },
  },
  rightCol: {
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 5',
    },
  },

  // Shared card scaffolding.
  cardTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  cardSubtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  rowBetween: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCol: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  grow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  fullBtn: {
    width: '100%',
  },

  // StatCard.
  statCard: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  statIcon: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  icon5: {
    width: '1.25rem',
    height: '1.25rem',
  },
  statValue: {
    marginBlock: '1rem 0',
    marginInline: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    marginBlock: '0.25rem 0',
    marginInline: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },

  // ScannerCard.
  scannerCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1.5rem',
  },
  manualCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.5rem',
  },
  viewport: {
    position: 'relative',
    marginInline: 'auto',
    display: 'grid',
    aspectRatio: '1 / 1',
    width: '100%',
    maxWidth: '20rem',
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  corner: {
    pointerEvents: 'none',
    position: 'absolute',
    height: '2rem',
    width: '2rem',
    borderStyle: 'solid',
    borderWidth: 0,
    borderColor: 'var(--color-accent)',
  },
  cornerTL: {
    top: '1.5rem',
    left: '1.5rem',
    borderTopWidth: '2px',
    borderLeftWidth: '2px',
    borderTopLeftRadius: '0.5rem',
  },
  cornerTR: {
    top: '1.5rem',
    right: '1.5rem',
    borderTopWidth: '2px',
    borderRightWidth: '2px',
    borderTopRightRadius: '0.5rem',
  },
  cornerBL: {
    bottom: '1.5rem',
    left: '1.5rem',
    borderBottomWidth: '2px',
    borderLeftWidth: '2px',
    borderBottomLeftRadius: '0.5rem',
  },
  cornerBR: {
    bottom: '1.5rem',
    right: '1.5rem',
    borderBottomWidth: '2px',
    borderRightWidth: '2px',
    borderBottomRightRadius: '0.5rem',
  },
  scanLine: {
    pointerEvents: 'none',
    position: 'absolute',
    left: '2.5rem',
    right: '2.5rem',
    top: '50%',
    height: '1px',
    backgroundImage: 'linear-gradient(to right, transparent, var(--color-accent), transparent)',
    animationName: pulse,
    animationDuration: '2s',
    animationTimingFunction: 'cubic-bezier(0.4, 0, 0.6, 1)',
    animationIterationCount: 'infinite',
  },
  qrIcon: {
    width: '5rem',
    height: '5rem',
    color: 'var(--color-text-disabled)',
  },

  // Manual search.
  searchWrap: {
    position: 'relative',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  searchIcon: {
    pointerEvents: 'none',
    position: 'absolute',
    left: '0.875rem',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-secondary)',
  },
  searchInput: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingLeft: '2.5rem',
    paddingRight: '0.875rem',
    paddingBlock: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  alertText: {
    marginBlock: '0.5rem 0',
    marginInline: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  dropdown: {
    marginTop: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  dropdownMsg: {
    margin: 0,
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  resultList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  resultItem: {
    borderTopWidth: {
      default: '1px',
      ':first-child': '0',
    },
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  resultBtn: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: '0.75rem',
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    textAlign: 'left',
    borderWidth: 0,
    cursor: 'pointer',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  resultName: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  resultEmail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  arrowIcon: {
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-disabled)',
  },

  // EligibilityCard.
  eligPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '1rem',
  },
  eligHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  eligName: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  eligEmail: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  eligDl: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.75rem',
    margin: 0,
    fontSize: '0.875rem',
  },
  eligCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  eligDt: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    color: 'var(--color-text-secondary)',
  },
  eligDd: {
    margin: 0,
    color: 'var(--color-text-primary)',
  },
  eligWarning: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-warning-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-warning)',
  },
  eligActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  readOnly: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },

  // ArrivalsCard.
  arrivalsCard: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    padding: '1.5rem',
  },
  arrivalsHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  emptyWrap: {
    display: 'grid',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    placeItems: 'center',
    paddingBlock: '3rem',
    textAlign: 'center',
  },
  emptyInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  icon6: {
    width: '1.5rem',
    height: '1.5rem',
  },
  arrivalsList: {
    display: 'flex',
    flexDirection: 'column',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  arrivalRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '0.75rem',
    borderTopWidth: {
      default: '1px',
      ':first-child': '0',
    },
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  arrivalName: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  arrivalTime: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },

  // MemberAvatar.
  avatarImg: {
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  avatarFallback: {
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 20%, transparent)',
  },
  avatarSm: {
    height: '2.25rem',
    width: '2.25rem',
  },
  avatarMd: {
    height: '2.75rem',
    width: '2.75rem',
  },
});

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

  // Keep the reception board live: re-run the server component on a short
  // interval so a check-in recorded at another desk (or a QR arrival) shows up
  // here without a manual reload.
  useLiveRefresh(LIVE_REFRESH_MS.reception);

  // Reconcile each refreshed server snapshot into the arrivals list. `arrivals`
  // is client state (it's mutated optimistically on a local check-in), so a fresh
  // `initialArrivals` prop from a poll would otherwise be ignored. Merge by id —
  // the server set is authoritative, and any local-only optimistic row not yet
  // reflected server-side is retained — then keep the feed newest-first.
  useEffect(() => {
    setArrivals((prev) => {
      const serverIds = new Set(initialArrivals.map((row) => row.id));
      const localOnly = prev.filter((row) => !serverIds.has(row.id));
      if (localOnly.length === 0) {
        return initialArrivals;
      }
      return [...localOnly, ...initialArrivals].sort(
        (a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
      );
    });
  }, [initialArrivals]);

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
    <div {...stylex.props(styles.stack)}>
      <section aria-label={t('metrics.aria')} {...stylex.props(styles.metrics)}>
        <StatCard label={t('stats.checkedInToday')} value={stats.checkedInToday} icon="check" />
        <StatCard label={t('stats.inGymNow')} value={stats.inGymNow} icon="users" />
        <StatCard label={t('stats.peakToday')} value={stats.peakToday} icon="chart" />
        <StatCard label={t('stats.noShows')} value={stats.noShowsToday} icon="clock" />
      </section>

      <div {...stylex.props(styles.mainGrid)}>
        <div {...stylex.props(styles.leftCol)}>
          <ScannerCard onSimulate={focusSearch} t={t} />
          <ManualCheckInCard
            searchInputRef={searchInputRef}
            canCheckIn={canCheckIn}
            onCheckedIn={addArrival}
            t={t}
          />
        </div>

        <div {...stylex.props(styles.rightCol)}>
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
    <Card variant="default" padding={0} xstyle={styles.statCard}>
      <span {...stylex.props(styles.statIcon)}>
        <Icon name={icon} {...stylex.props(styles.icon5)} />
      </span>
      <p {...stylex.props(styles.statValue)}>
        <CountUp to={value} />
      </p>
      <p {...stylex.props(styles.statLabel)}>{label}</p>
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
    <Card variant="default" padding={0} xstyle={styles.scannerCard}>
      <div {...stylex.props(styles.rowBetween)}>
        <div {...stylex.props(styles.titleGroup)}>
          <h2 {...stylex.props(styles.cardTitle)}>{t('scanner.title')}</h2>
          <p {...stylex.props(styles.cardSubtitle)}>{t('scanner.subtitle')}</p>
        </div>
        <Badge tone="success" icon="spark">
          {t('scanner.ready')}
        </Badge>
      </div>

      <div {...stylex.props(styles.viewport)}>
        {/* Decorative corner frame + sweeping scan line. */}
        <span {...stylex.props(styles.corner, styles.cornerTL)} />
        <span {...stylex.props(styles.corner, styles.cornerTR)} />
        <span {...stylex.props(styles.corner, styles.cornerBL)} />
        <span {...stylex.props(styles.corner, styles.cornerBR)} />
        <span {...stylex.props(styles.scanLine)} />
        <Icon name="qr" {...stylex.props(styles.qrIcon)} sw={1.5} />
      </div>

      <Btn v="outline" icon="qr" onClick={onSimulate} {...stylex.props(styles.fullBtn)}>
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
    <Card variant="default" padding={0} xstyle={styles.manualCard}>
      <div {...stylex.props(styles.titleGroup)}>
        <h2 {...stylex.props(styles.cardTitle)}>{t('manual.title')}</h2>
        <p {...stylex.props(styles.cardSubtitle)}>{t('manual.subtitle')}</p>
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
        <div {...stylex.props(styles.searchWrap)}>
          <label htmlFor="checkin-search" {...stylex.props(styles.srOnly)}>
            {t('manual.searchLabel')}
          </label>
          <Icon name="search" {...stylex.props(styles.searchIcon)} />
          <input
            id="checkin-search"
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('manual.searchPlaceholder')}
            {...stylex.props(styles.searchInput)}
          />

          {searchError ? (
            <p role="alert" {...stylex.props(styles.alertText)}>
              {searchError}
            </p>
          ) : null}

          {query.trim() !== '' && !searchError ? (
            <div {...stylex.props(styles.dropdown)}>
              {searching && results.length === 0 ? (
                <p {...stylex.props(styles.dropdownMsg)}>{t('manual.searching')}</p>
              ) : results.length === 0 ? (
                <p {...stylex.props(styles.dropdownMsg)}>
                  {t('manual.noMatch', { query: query.trim() })}
                </p>
              ) : (
                <ul {...stylex.props(styles.resultList)}>
                  {results.map((member) => (
                    <li key={member.id} {...stylex.props(styles.resultItem)}>
                      <button
                        type="button"
                        onClick={() => void pick(member)}
                        {...stylex.props(styles.resultBtn)}
                      >
                        <MemberAvatar name={member.name} photoUrl={member.photoUrl} />
                        <span {...stylex.props(styles.infoCol)}>
                          <span {...stylex.props(styles.resultName)}>{member.name}</span>
                          <span {...stylex.props(styles.resultEmail)}>{member.email}</span>
                        </span>
                        <Icon name="arrow" {...stylex.props(styles.arrowIcon)} />
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
    <div {...stylex.props(styles.eligPanel)}>
      <div {...stylex.props(styles.eligHead)}>
        <MemberAvatar name={member.name} photoUrl={member.photoUrl} size="md" />
        <div {...stylex.props(styles.infoCol)}>
          <p {...stylex.props(styles.eligName)}>{member.name}</p>
          <p {...stylex.props(styles.eligEmail)}>{member.email}</p>
        </div>
        {loading ? (
          <Badge tone="ink">{t('eligibility.checking')}</Badge>
        ) : style ? (
          <Badge tone={style.tone}>{style.label}</Badge>
        ) : null}
      </div>

      {eligibility ? (
        <dl {...stylex.props(styles.eligDl)}>
          <div {...stylex.props(styles.eligCol)}>
            <dt {...stylex.props(styles.eligDt)}>{t('eligibility.plan')}</dt>
            <dd {...stylex.props(styles.eligDd)}>{eligibility.planName ?? '—'}</dd>
          </div>
          <div {...stylex.props(styles.eligCol)}>
            <dt {...stylex.props(styles.eligDt)}>{t('eligibility.access')}</dt>
            <dd {...stylex.props(styles.eligDd)}>
              {eligibility.status === 'ACTIVE' ? t('eligibility.granted') : t('eligibility.review')}
            </dd>
          </div>
        </dl>
      ) : null}

      {eligibility && eligibility.status !== 'ACTIVE' ? (
        <p {...stylex.props(styles.eligWarning)}>
          {eligibility.status === 'FROZEN'
            ? t('eligibility.frozenWarning')
            : t('eligibility.inactiveWarning')}
        </p>
      ) : null}

      <div {...stylex.props(styles.eligActions)}>
        <Btn
          v="primary"
          icon="check"
          onClick={onCheckIn}
          disabled={!canCheckIn || loading || checkingIn}
          {...stylex.props(styles.grow)}
        >
          {checkingIn ? t('eligibility.checkingIn') : t('eligibility.checkIn')}
        </Btn>
        <Btn v="ghost" icon="x" onClick={onReset} disabled={checkingIn}>
          {t('eligibility.cancel')}
        </Btn>
      </div>
      {!canCheckIn ? <p {...stylex.props(styles.readOnly)}>{t('eligibility.readOnly')}</p> : null}
    </div>
  );
}

/** The live arrivals feed — today's check-ins, most recent first. */
function ArrivalsCard({ arrivals, t }: { arrivals: CheckInRow[]; t: T }) {
  const locale = useLocale();
  return (
    <Card variant="default" padding={0} xstyle={styles.arrivalsCard}>
      <div {...stylex.props(styles.arrivalsHead)}>
        <h2 {...stylex.props(styles.cardTitle)}>{t('arrivals.title')}</h2>
        <Badge tone="ink">{t('arrivals.count', { count: arrivals.length })}</Badge>
      </div>

      {arrivals.length === 0 ? (
        <div {...stylex.props(styles.emptyWrap)}>
          <div {...stylex.props(styles.emptyInner)}>
            <span {...stylex.props(styles.emptyIcon)}>
              <Icon name="users" {...stylex.props(styles.icon6)} />
            </span>
            <p {...stylex.props(styles.cardSubtitle)}>{t('arrivals.empty')}</p>
          </div>
        </div>
      ) : (
        <ul {...stylex.props(styles.arrivalsList)}>
          {arrivals.map((arrival) => (
            <li key={arrival.id} {...stylex.props(styles.arrivalRow)}>
              <MemberAvatar name={arrival.name} photoUrl={arrival.photoUrl} />
              <div {...stylex.props(styles.infoCol)}>
                <p {...stylex.props(styles.arrivalName)}>{arrival.name}</p>
                <p {...stylex.props(styles.arrivalTime)}>
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
  size = 'sm',
}: {
  name: string;
  photoUrl: string | null;
  size?: 'sm' | 'md';
}) {
  const sizeStyle = size === 'md' ? styles.avatarMd : styles.avatarSm;
  if (photoUrl) {
    return <img src={photoUrl} alt="" {...stylex.props(styles.avatarImg, sizeStyle)} />;
  }
  return (
    <span aria-hidden {...stylex.props(styles.avatarFallback, sizeStyle)}>
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
