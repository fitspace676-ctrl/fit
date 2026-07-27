'use client';

import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminPtSession, ClassInstanceStatus } from '@fit/types';
import { Badge, Btn, Icon, type Tone } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import { addWeeks, toIsoDate, weekDays } from '../schedule/week';
import { AddPtSessionDrawer, type ClassTypeOption } from './add-pt-session-drawer';
import type { TrainerOption } from './trainer-select';
import { cancelPtSessionAction, completePtSessionAction } from './pt-session-actions';

// The time-grid runs 06:00–22:00 (matching the class schedule), each hour 3.5rem
// tall, and session blocks are absolutely positioned by their UTC clock time.
const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = END_HOUR - START_HOUR;
const HOUR_REM = 3.5;
const TOTAL_MIN = HOURS * 60;
const MIN_EVENT_REM = 1.5;

const STATUS_TONES: Record<ClassInstanceStatus, { label: string; tone: Tone }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'ink' },
  CANCELED: { label: 'Canceled', tone: 'danger' },
};

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  navGroup: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  navBox: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.125rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  navBtn: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  navBtnIcon: { width: '1rem', height: '1rem' },
  todayBtn: {
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    color: 'var(--color-text-primary)',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  rangeLabel: {
    margin: 0,
    marginLeft: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  calScroll: {
    overflowX: 'auto',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
  },
  calGrid: {
    minWidth: '52rem',
    display: 'grid',
    gridTemplateColumns: '4rem repeat(7, minmax(0, 1fr))',
  },
  corner: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: '0.75rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-background-body)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  dayHead: {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.125rem',
    paddingBlock: '0.625rem',
    backgroundColor: 'var(--color-background-body)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
  },
  dayHeadToday: { backgroundColor: 'var(--color-accent-muted)' },
  weekdayLabel: { fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' },
  dayNum: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    color: 'var(--color-text-primary)',
  },
  dayNumToday: { color: 'var(--color-text-accent)' },
  timeCol: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-background-body)',
  },
  timeCell: { position: 'relative', height: '3.5rem', paddingRight: '0.5rem' },
  timeLabel: {
    position: 'absolute',
    top: '-0.5rem',
    right: '0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  dayCol: {
    position: 'relative',
    height: '56rem',
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-border)',
    backgroundImage:
      'repeating-linear-gradient(to bottom, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent 3.5rem), repeating-linear-gradient(to bottom, var(--color-border-subtle, rgba(120,120,120,0.12)) 0, var(--color-border-subtle, rgba(120,120,120,0.12)) 1px, transparent 1px, transparent 1.75rem)',
  },
  dayColToday: { backgroundColor: 'var(--color-accent-muted)' },
  event: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.0625rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-accent)',
    paddingBlock: '0.25rem',
    paddingInline: '0.375rem',
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: { default: 'var(--shadow-low)', ':hover': 'var(--shadow-high)' },
    textAlign: 'left',
    cursor: 'pointer',
    outlineStyle: 'none',
    transitionProperty: 'box-shadow',
    transitionDuration: '150ms',
  },
  eventDimmed: { opacity: 0.6 },
  eventTime: {
    fontSize: '0.625rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  eventTitle: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 700,
    lineHeight: 1.15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
  eventTrainer: {
    display: 'block',
    fontSize: '0.6875rem',
    fontWeight: 500,
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
  },
  // Detail drawer
  drawer: {
    height: 'calc(100dvh - 1.5rem)',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-high)',
  },
  drawerHead: { paddingBlock: '0.5rem' },
  drawerContent: { padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  detailRow: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  detailLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
  },
  detailValue: { fontSize: '0.9375rem', color: 'var(--color-text-primary)' },
  detailActions: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
});

/** Minutes past midnight (UTC) for an ISO instant. */
function utcMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
function weekdayShort(day: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(day);
}
function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

interface PlacedSession {
  session: AdminPtSession;
  topRem: number;
  heightRem: number;
  leftPct: number;
  widthPct: number;
}

/** Position one day's sessions in the grid, splitting overlaps into side-by-side lanes. */
function placeSessions(sessions: AdminPtSession[]): PlacedSession[] {
  const items = sessions
    .map((session) => {
      const start = utcMinutes(session.startsAt) - START_HOUR * 60;
      const rawEnd = utcMinutes(session.endsAt) - START_HOUR * 60;
      const end = rawEnd > start ? rawEnd : start + 30;
      return { session, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const placed: PlacedSession[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const laneOf = new Map<number, number>();
    cluster.forEach((item, idx) => {
      let lane = laneEnds.findIndex((e) => e <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      laneOf.set(idx, lane);
    });
    const lanes = laneEnds.length;
    cluster.forEach((item, idx) => {
      const clampedStart = Math.max(0, Math.min(item.start, TOTAL_MIN));
      const clampedEnd = Math.max(clampedStart, Math.min(item.end, TOTAL_MIN));
      const lane = laneOf.get(idx) ?? 0;
      placed.push({
        session: item.session,
        topRem: (clampedStart / 60) * HOUR_REM,
        heightRem: Math.max(MIN_EVENT_REM, ((clampedEnd - clampedStart) / 60) * HOUR_REM),
        leftPct: (lane / lanes) * 100,
        widthPct: 100 / lanes,
      });
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of items) {
    if (item.start >= clusterEnd && cluster.length > 0) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return placed;
}

/**
 * The PT calendar's week board — PT sessions on the same 06:00–22:00 time-grid the
 * class schedule uses, with prev/next week navigation and an "Add PT session" drawer.
 * Clicking a session opens a detail drawer with cancel / complete.
 *
 * Shows every trainer's sessions unless `trainerId` narrows it; when unfiltered, each
 * block names its trainer, since otherwise two trainers' 9am sessions are
 * indistinguishable.
 */
export function PtCalendarBoard({
  weekStart,
  sessions,
  classTypes,
  trainers,
  trainerId,
  canWrite,
}: {
  weekStart: string;
  sessions: AdminPtSession[];
  classTypes: ClassTypeOption[];
  /** Every active trainer — the add drawer's picker. */
  trainers: TrainerOption[];
  /** The trainer the calendar is narrowed to, or `null` for all of them. */
  trainerId: string | null;
  canWrite: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00.000Z`), [weekStart]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const todayKey = toIsoDate(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, AdminPtSession[]>();
    for (const session of sessions) {
      const key = session.startsAt.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(session);
      else map.set(key, [session]);
    }
    return map;
  }, [sessions]);

  const [selected, setSelected] = useState<AdminPtSession | null>(null);
  const detail = useSlideDrawer();

  function goToWeek(nextMonday: Date): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('week', toIsoDate(nextMonday));
    router.replace(`${pathname}?${params.toString()}`);
  }

  function openSession(session: AdminPtSession): void {
    setSelected(session);
    detail.open();
  }

  const rangeLabel = useMemo(() => {
    const last = days[days.length - 1] ?? monday;
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        d,
      );
    return `${fmt(monday)} – ${fmt(last)}`;
  }, [days, monday, locale]);

  const hours = Array.from({ length: HOURS }, (_, i) => START_HOUR + i);

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.navGroup)}>
          <div {...stylex.props(styles.navBox)}>
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => goToWeek(addWeeks(monday, -1))}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronLeft" sw={2} {...stylex.props(styles.navBtnIcon)} />
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => goToWeek(addWeeks(monday, 1))}
              {...stylex.props(styles.navBtn)}
            >
              <Icon name="chevronRight" sw={2} {...stylex.props(styles.navBtnIcon)} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => goToWeek(new Date())}
            {...stylex.props(styles.todayBtn)}
          >
            Today
          </button>
          <p {...stylex.props(styles.rangeLabel)}>{rangeLabel}</p>
        </div>

        {canWrite ? (
          <AddPtSessionDrawer
            trainers={trainers}
            // Prefill with whoever the calendar is filtered to; otherwise the staffer
            // picks in the drawer.
            defaultTrainerId={trainerId}
            classTypes={classTypes}
            defaultDate={weekStart}
          />
        ) : null}
      </div>

      <div {...stylex.props(styles.calScroll)}>
        <div {...stylex.props(styles.calGrid)}>
          <div {...stylex.props(styles.corner)}>Time</div>
          {days.map((day) => {
            const isToday = toIsoDate(day) === todayKey;
            return (
              <div
                key={toIsoDate(day)}
                {...stylex.props(styles.dayHead, isToday && styles.dayHeadToday)}
              >
                <span {...stylex.props(styles.weekdayLabel)}>{weekdayShort(day, locale)}</span>
                <span {...stylex.props(styles.dayNum, isToday && styles.dayNumToday)}>
                  {day.getUTCDate()}
                </span>
              </div>
            );
          })}

          <div {...stylex.props(styles.timeCol)}>
            {hours.map((h) => (
              <div key={h} {...stylex.props(styles.timeCell)}>
                <span {...stylex.props(styles.timeLabel)}>{hourLabel(h)}</span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const key = toIsoDate(day);
            const placed = placeSessions(byDay.get(key) ?? []);
            const isToday = key === todayKey;
            return (
              <div key={key} {...stylex.props(styles.dayCol, isToday && styles.dayColToday)}>
                {placed.map((ev) => (
                  <SessionBlock
                    key={ev.session.id}
                    placed={ev}
                    locale={locale}
                    showTrainer={!trainerId}
                    onOpen={openSession}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <PtSessionDetail
        drawer={detail}
        session={selected}
        locale={locale}
        canWrite={canWrite}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

/** One positioned PT session block: time, workout type, trainer, status. */
function SessionBlock({
  placed,
  locale,
  showTrainer,
  onOpen,
}: {
  placed: PlacedSession;
  locale: string;
  /** True when the calendar is unfiltered, so the block has to say whose session it is. */
  showTrainer: boolean;
  onOpen: (session: AdminPtSession) => void;
}) {
  const { session } = placed;
  const dimmed = session.status !== 'SCHEDULED';
  const title = session.classTypeName ?? 'PT session';
  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      aria-label={`View ${title} with ${session.trainerName} at ${formatTime(session.startsAt, locale)}`}
      {...stylex.props(styles.event, dimmed && styles.eventDimmed)}
      style={{
        top: `${placed.topRem}rem`,
        height: `${placed.heightRem}rem`,
        left: `calc(${placed.leftPct}% + 0.125rem)`,
        width: `calc(${placed.widthPct}% - 0.25rem)`,
      }}
    >
      <span {...stylex.props(styles.eventTime)}>
        {formatTime(session.startsAt, locale)}–{formatTime(session.endsAt, locale)}
      </span>
      <p {...stylex.props(styles.eventTitle)}>{title}</p>
      {showTrainer ? (
        <span {...stylex.props(styles.eventTrainer)}>{session.trainerName}</span>
      ) : null}
    </button>
  );
}

/** The session detail drawer — workout type, time, status, notes + cancel / complete. */
function PtSessionDetail({
  drawer,
  session,
  locale,
  canWrite,
  onChanged,
}: {
  drawer: ReturnType<typeof useSlideDrawer>;
  session: AdminPtSession | null;
  locale: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;

  const status = STATUS_TONES[session.status];
  const isScheduled = session.status === 'SCHEDULED';

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>): void {
    if (!session) return;
    setError(null);
    const id = session.id;
    startTransition(async () => {
      const result = await action(id);
      if (result.ok) {
        onChanged();
        drawer.requestClose();
      } else {
        setError(result.error ?? 'Something went wrong');
      }
    });
  }

  return (
    <Dialog
      isOpen={drawer.isOpen}
      onOpenChange={drawer.handleOpenChange}
      purpose="info"
      aria-label="PT session"
      width="30rem"
      maxHeight="100dvh"
      position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
      padding={6}
      xstyle={[styles.drawer, drawer.motion]}
    >
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="PT session"
            hasDivider={false}
            onOpenChange={drawer.handleOpenChange}
            xstyle={styles.drawerHead}
          />
        }
        content={
          <LayoutContent padding={0} isScrollable xstyle={styles.drawerContent}>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>Workout type</span>
              <span {...stylex.props(styles.detailValue)}>{session.classTypeName ?? '—'}</span>
            </div>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>When</span>
              <span {...stylex.props(styles.detailValue)}>
                {formatTime(session.startsAt, locale)}–{formatTime(session.endsAt, locale)} ·{' '}
                {session.durationMinutes} min
              </span>
            </div>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>Status</span>
              <span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </span>
            </div>
            {session.notes ? (
              <div {...stylex.props(styles.detailRow)}>
                <span {...stylex.props(styles.detailLabel)}>Notes</span>
                <span {...stylex.props(styles.detailValue)}>{session.notes}</span>
              </div>
            ) : null}

            {error ? (
              <Card variant="default" padding={0} xstyle={styles.errorCard}>
                <Icon name="info" {...stylex.props(styles.errorIcon)} />
                <p role="alert" {...stylex.props(styles.errorText)}>
                  {error}
                </p>
              </Card>
            ) : null}

            {canWrite && isScheduled ? (
              <div {...stylex.props(styles.detailActions)}>
                <Btn
                  v="primary"
                  size="md"
                  disabled={pending}
                  onClick={() => run(completePtSessionAction)}
                >
                  Mark complete
                </Btn>
                <Btn
                  v="outline"
                  size="md"
                  disabled={pending}
                  onClick={() => run(cancelPtSessionAction)}
                >
                  Cancel session
                </Btn>
              </div>
            ) : null}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
