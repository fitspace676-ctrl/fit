'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type {
  AdminClassInstanceDetail,
  AdminClassInstanceRosterEntry,
  AdminScheduleInstance,
  AttendanceStatus,
} from '@fit/types';
import {
  Badge,
  Btn,
  buttonClasses,
  ConfirmDialog,
  Drawer,
  Icon,
  Progress,
  useToast,
  type IconName,
  type Tone,
} from '@/components/ui';
import {
  cancelInstanceAction,
  loadInstanceDetailAction,
  markAttendanceAction,
  promoteWaitlistAction,
} from './actions';

type T = ReturnType<typeof useTranslations>;

/** The roster status tones — held seats read calm, no-shows warn, waitlist is muted. */
const ROSTER_TONES: Record<AdminClassInstanceRosterEntry['status'], Tone> = {
  BOOKED: 'brand',
  ATTENDED: 'success',
  NO_SHOW: 'warning',
  WAITLIST: 'ink',
};

/** The occurrence-status tones for the drawer header badge. */
const STATUS_TONES: Record<AdminScheduleInstance['status'], Tone> = {
  SCHEDULED: 'success',
  CANCELED: 'danger',
  COMPLETED: 'ink',
};

/**
 * The class-instance detail drawer (T3.3). Opening a class on the week calendar
 * slides this in with the occurrence's detail, its live occupancy bar, the
 * booking roster (held seats then the waitlist), and the staff quick actions —
 * edit the recurring template, or cancel this one occurrence (which releases every
 * booking and refunds each held seat's credit). The clicked summary renders the
 * header instantly while the full roster is fetched; a cancel re-renders in place
 * from the refreshed detail and refreshes the underlying grid.
 */
export function ClassDrawer({
  instance,
  open,
  onClose,
  canWrite,
  locale,
}: {
  /** The clicked calendar block — drives the header before the roster loads. */
  instance: AdminScheduleInstance | null;
  open: boolean;
  onClose: () => void;
  /** Whether the staff session holds `ClassWrite` (gates the cancel action). */
  canWrite: boolean;
  locale: string;
}) {
  const t = useTranslations('admin.schedule.drawer');
  const { toast } = useToast();
  const router = useRouter();

  const [detail, setDetail] = useState<AdminClassInstanceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, startCancel] = useTransition();
  // The booking whose attendance mark is currently in flight (drives the row's
  // busy state and disables the other rows' controls while one is recording).
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [, startMark] = useTransition();
  // The waitlist entry whose promotion is currently in flight (same freeze-all
  // discipline as a mark — one write to the roster at a time).
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [, startPromote] = useTransition();

  const id = instance?.id ?? null;

  // Fetch the full detail (roster + waitlist) whenever a new occurrence opens.
  useEffect(() => {
    if (!open || id === null) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setDetail(null);
    void loadInstanceDetailAction(id).then((result) => {
      if (!active) {
        return;
      }
      if (result.ok) {
        setDetail(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, id]);

  const runCancel = useCallback(() => {
    if (id === null) {
      return;
    }
    startCancel(async () => {
      const result = await cancelInstanceAction(id);
      if (result.ok) {
        setDetail(result.data);
        setConfirmOpen(false);
        toast(t('toast.canceled'), { tone: 'success', icon: 'check' });
        // The block's occupancy / status changed — refresh the week grid.
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }, [id, router, t, toast]);

  const runMark = useCallback(
    (bookingId: string, status: AttendanceStatus) => {
      if (id === null) {
        return;
      }
      setMarkingId(bookingId);
      startMark(async () => {
        const result = await markAttendanceAction(id, bookingId, status);
        if (result.ok) {
          setDetail(result.data);
          // The occurrence is now COMPLETED and its tallies changed — refresh
          // the underlying week grid so the block's badge follows.
          router.refresh();
        } else {
          toast(result.error, { tone: 'danger', icon: 'info' });
        }
        setMarkingId(null);
      });
    },
    [id, router, toast],
  );

  const runPromote = useCallback(
    (bookingId: string) => {
      if (id === null) {
        return;
      }
      setPromotingId(bookingId);
      startPromote(async () => {
        const result = await promoteWaitlistAction(id, bookingId);
        if (result.ok) {
          setDetail(result.data);
          toast(t('toast.promoted'), { tone: 'success', icon: 'check' });
          // The occupancy grew by a seat — refresh the week grid so the block's
          // count follows.
          router.refresh();
        } else {
          toast(result.error, { tone: 'danger', icon: 'info' });
        }
        setPromotingId(null);
      });
    },
    [id, router, t, toast],
  );

  // The header reads from the loaded detail once present, else the clicked
  // summary; the two agree on every shared field.
  const head = detail ?? instance;
  const status = head?.status ?? 'SCHEDULED';
  const canCancel = canWrite && status === 'SCHEDULED';
  // Attendance can be marked once the class has started and while it isn't
  // canceled; the API re-checks and a mark flips the occurrence to COMPLETED.
  const canMark =
    canWrite && status !== 'CANCELED' && head !== null && Date.parse(head.startsAt) <= Date.now();
  // A waitlisted member can be promoted into a seat only while the occurrence is
  // still SCHEDULED (a canceled / completed class is settled) and the staff holds
  // ClassWrite — the API re-checks both.
  const canPromote = canWrite && status === 'SCHEDULED';
  // While any roster write (a mark or a promote) is recording, every row's
  // controls freeze so the desk only ever has one change in flight.
  const rosterBusy = markingId !== null || promotingId !== null;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        accent={head?.color}
        title={head?.title ?? t('loading')}
        footer={
          head ? (
            <div className="flex items-center justify-end gap-2">
              <Link href={`/classes/${head.templateId}`} className={buttonClasses('outline', 'md')}>
                <Icon name="settings" className="h-4 w-4" sw={2} />
                {t('actions.edit')}
              </Link>
              {canCancel ? (
                <Btn v="danger" icon="x" onClick={() => setConfirmOpen(true)}>
                  {t('actions.cancel')}
                </Btn>
              ) : null}
            </div>
          ) : null
        }
      >
        {head ? (
          <div className="flex flex-col gap-5">
            {/* Status + when / where. */}
            <div className="flex flex-col gap-3">
              <Badge tone={STATUS_TONES[status]} className="self-start">
                {t(`status.${status}`)}
              </Badge>
              <dl className="flex flex-col gap-2.5 text-sm">
                <DetailRow icon="calendar" text={formatDay(head.startsAt, locale)} />
                <DetailRow
                  icon="clock"
                  text={`${formatTime(head.startsAt, locale)}–${formatTime(head.endsAt, locale)}`}
                />
                {head.trainerName ? <DetailRow icon="user" text={head.trainerName} /> : null}
                {head.locationName || head.room ? (
                  <DetailRow
                    icon="pin"
                    text={[head.locationName, head.room].filter(Boolean).join(' · ')}
                  />
                ) : null}
              </dl>
            </div>

            {/* Occupancy bar. */}
            <Occupancy
              t={t}
              booked={head.bookedCount}
              capacity={head.capacity}
              waitlist={detail?.waitlistCount ?? 0}
            />

            {/* Roster. */}
            <Roster
              t={t}
              loading={loading}
              error={error}
              detail={detail}
              canMark={canMark}
              canPromote={canPromote}
              markingId={markingId}
              promotingId={promotingId}
              rosterBusy={rosterBusy}
              onMark={runMark}
              onPromote={runPromote}
            />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-danger-600 dark:text-danger-300">
            {error}
          </p>
        ) : (
          <RosterSkeleton />
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => (cancelling ? undefined : setConfirmOpen(false))}
        onConfirm={runCancel}
        title={t('confirm.title')}
        message={t('confirm.message', { title: head?.title ?? '' })}
        confirmLabel={t('confirm.confirm')}
        cancelLabel={t('confirm.cancel')}
        danger
        busy={cancelling}
      />
    </>
  );
}

/** A labelled detail line: an icon and its value. */
function DetailRow({ icon, text }: { icon: 'calendar' | 'clock' | 'user' | 'pin'; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-ink-700 dark:text-ink-200">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-ink-400" sw={2} />
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}

/** The occupancy bar: a fill over "booked / capacity" plus any waitlist tally. */
function Occupancy({
  t,
  booked,
  capacity,
  waitlist,
}: {
  t: T;
  booked: number;
  capacity: number;
  waitlist: number;
}) {
  const pct = capacity > 0 ? (booked / capacity) * 100 : 0;
  const tone = pct > 85 ? 'bg-danger-500' : pct > 60 ? 'bg-warning-500' : 'bg-success-500';
  const remaining = Math.max(0, capacity - booked);
  return (
    <div className="flex flex-col gap-2 rounded-card border border-ink-100 p-3 dark:border-white/10">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="text-ink-700 dark:text-ink-200">
          {t('occupancy.spots', { booked, cap: capacity })}
        </span>
        <span className="text-ink-400">
          {remaining === 0 ? t('occupancy.full') : t('occupancy.remaining', { remaining })}
        </span>
      </div>
      <Progress value={pct} tone={tone} />
      {waitlist > 0 ? (
        <p className="text-xs font-medium text-ink-500 dark:text-ink-400">
          {t('occupancy.waitlist', { count: waitlist })}
        </p>
      ) : null}
    </div>
  );
}

/** The booking roster: held seats, then the waitlist. */
function Roster({
  t,
  loading,
  error,
  detail,
  canMark,
  canPromote,
  markingId,
  promotingId,
  rosterBusy,
  onMark,
  onPromote,
}: {
  t: T;
  loading: boolean;
  error: string | null;
  detail: AdminClassInstanceDetail | null;
  /** Whether attendance can be marked (occurrence started, not canceled, ClassWrite). */
  canMark: boolean;
  /** Whether a waitlist entry can be promoted (occurrence scheduled, ClassWrite). */
  canPromote: boolean;
  /** The booking whose attendance is recording, if any — its controls show busy. */
  markingId: string | null;
  /** The waitlist entry being promoted, if any — its control shows busy. */
  promotingId: string | null;
  /** Whether any roster write is in flight — freezes every row's controls. */
  rosterBusy: boolean;
  onMark: (bookingId: string, status: AttendanceStatus) => void;
  onPromote: (bookingId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
        {t('roster.title')}
      </h3>
      {loading ? (
        <RosterSkeleton />
      ) : error ? (
        <p role="alert" className="text-sm text-danger-600 dark:text-danger-300">
          {error}
        </p>
      ) : !detail || detail.roster.length === 0 ? (
        <p className="rounded-card border border-dashed border-ink-100 py-8 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
          {t('roster.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {detail.roster.map((entry) => (
            <RosterRow
              key={entry.bookingId}
              entry={entry}
              t={t}
              // Only held seats are markable; a waitlisted entry never got one.
              canMark={canMark && entry.status !== 'WAITLIST'}
              // Only a queued entry is promotable into a seat.
              canPromote={canPromote && entry.status === 'WAITLIST'}
              // While any roster write is in flight, freeze every row's controls.
              busy={rosterBusy}
              marking={markingId === entry.bookingId}
              promoting={promotingId === entry.bookingId}
              onMark={onMark}
              onPromote={onPromote}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One roster row: avatar initials, name/email, and the booking status. For a
 * held-seat booking on a started occurrence (`canMark`), the status badge is
 * replaced by an attended / no-show toggle so staff record attendance inline;
 * the current outcome stays highlighted and is re-markable for corrections. For a
 * queued booking on a scheduled occurrence (`canPromote`), the position badge is
 * joined by a promote control that lifts the member into a held seat (T3.6).
 */
function RosterRow({
  entry,
  t,
  canMark,
  canPromote,
  busy,
  marking,
  promoting,
  onMark,
  onPromote,
}: {
  entry: AdminClassInstanceRosterEntry;
  t: T;
  canMark: boolean;
  canPromote: boolean;
  busy: boolean;
  marking: boolean;
  promoting: boolean;
  onMark: (bookingId: string, status: AttendanceStatus) => void;
  onPromote: (bookingId: string) => void;
}) {
  const label = entry.memberName?.trim() || entry.memberEmail;
  return (
    <li className="flex items-center gap-3 rounded-card border border-ink-100 bg-white p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-bold uppercase text-ink-500 dark:bg-white/10 dark:text-ink-300">
        {initials(label)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-ink-900 dark:text-white">{label}</span>
        {entry.memberName ? (
          <span className="truncate text-xs text-ink-400">{entry.memberEmail}</span>
        ) : null}
      </div>
      {canMark ? (
        <div
          role="group"
          aria-label={t('roster.markGroup', { member: label })}
          className="flex shrink-0 items-center gap-1"
        >
          <MarkButton
            icon="check"
            label={t('roster.status.ATTENDED')}
            active={entry.status === 'ATTENDED'}
            activeClass="border-success-500 bg-success-500 text-white"
            busy={marking}
            disabled={busy}
            onClick={() => onMark(entry.bookingId, 'ATTENDED')}
          />
          <MarkButton
            icon="x"
            label={t('roster.status.NO_SHOW')}
            active={entry.status === 'NO_SHOW'}
            activeClass="border-warning-500 bg-warning-500 text-white"
            busy={marking}
            disabled={busy}
            onClick={() => onMark(entry.bookingId, 'NO_SHOW')}
          />
        </div>
      ) : canPromote ? (
        // A queued entry the desk can lift into a seat: its position stays visible
        // beside a promote control (which the API turns into a held seat).
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={ROSTER_TONES.WAITLIST}>
            {entry.waitlistPosition
              ? t('roster.waitlistPosition', { position: entry.waitlistPosition })
              : t('roster.status.WAITLIST')}
          </Badge>
          <PromoteButton
            text={t('roster.promote')}
            label={t('roster.promoteMember', { member: label })}
            busy={promoting}
            disabled={busy}
            onClick={() => onPromote(entry.bookingId)}
          />
        </div>
      ) : (
        <Badge tone={ROSTER_TONES[entry.status]} className="shrink-0">
          {entry.status === 'WAITLIST' && entry.waitlistPosition
            ? t('roster.waitlistPosition', { position: entry.waitlistPosition })
            : t(`roster.status.${entry.status}`)}
        </Badge>
      )}
    </li>
  );
}

/**
 * One outcome toggle in a roster row's attendance control. `aria-pressed`
 * reflects the current outcome so a screen reader announces which is set; the
 * active button carries its tone fill, the inactive one a neutral outline. While
 * any mark in the drawer is recording every button is `disabled`, and the one
 * that was clicked shows a spinner in place of its icon.
 */
function MarkButton({
  icon,
  label,
  active,
  activeClass,
  busy,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  activeClass: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1 rounded-btn border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-brand-500/30 disabled:opacity-40 disabled:pointer-events-none ${
        active
          ? activeClass
          : 'border-ink-200 text-ink-500 hover:bg-ink-50 dark:border-white/15 dark:text-ink-300 dark:hover:bg-white/10'
      }`}
    >
      {busy ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : (
        <Icon name={icon} className="h-3.5 w-3.5" sw={2.5} />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * The promote control on a waitlisted roster row: lifts the queued member into a
 * held seat. A compact brand-outline button scaled to the row (matching the
 * attendance toggles); while any roster write is in flight it is `disabled`, and
 * the one clicked shows a spinner in place of its arrow.
 */
function PromoteButton({
  text,
  label,
  busy,
  disabled,
  onClick,
}: {
  /** The short visible verb ("Promote"), hidden on the narrowest rows. */
  text: string;
  /** The full accessible label ("Promote {member} into a seat"). */
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1 rounded-btn border border-brand-500 px-2.5 text-xs font-semibold text-brand-600 outline-none transition-colors hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-40 dark:border-brand-400/60 dark:text-brand-300 dark:hover:bg-brand-500/10"
    >
      {busy ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : (
        <Icon name="arrow" className="h-3.5 w-3.5" sw={2.5} />
      )}
      <span className="hidden sm:inline">{text}</span>
    </button>
  );
}

/** A placeholder for the roster while it loads. */
function RosterSkeleton() {
  return (
    <ul className="flex flex-col gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-card border border-ink-100 p-2.5 dark:border-white/10"
        >
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-ink-100 dark:bg-white/10" />
          <span className="h-3.5 w-32 animate-pulse rounded-pill bg-ink-100 dark:bg-white/10" />
        </li>
      ))}
    </ul>
  );
}

/** Up to two uppercase initials from a display label (name or email). */
function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

/** Localised full day (e.g. "Monday, Jun 1"), read in UTC to match the grid. */
function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** Localised `HH:MM` for an ISO instant, read in UTC to match the grid. */
function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
