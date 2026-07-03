'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type {
  AdminClassInstanceDetail,
  AdminClassInstanceRosterEntry,
  AdminScheduleInstance,
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
  type Tone,
} from '@/components/ui';
import { cancelInstanceAction, loadInstanceDetailAction } from './actions';

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

  // The header reads from the loaded detail once present, else the clicked
  // summary; the two agree on every shared field.
  const head = detail ?? instance;
  const status = head?.status ?? 'SCHEDULED';
  const canCancel = canWrite && status === 'SCHEDULED';

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
            <Roster t={t} loading={loading} error={error} detail={detail} />
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
}: {
  t: T;
  loading: boolean;
  error: string | null;
  detail: AdminClassInstanceDetail | null;
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
            <RosterRow key={entry.bookingId} entry={entry} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One roster row: avatar initials, name/email, and the booking status. */
function RosterRow({ entry, t }: { entry: AdminClassInstanceRosterEntry; t: T }) {
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
      <Badge tone={ROSTER_TONES[entry.status]} className="shrink-0">
        {entry.status === 'WAITLIST' && entry.waitlistPosition
          ? t('roster.waitlistPosition', { position: entry.waitlistPosition })
          : t(`roster.status.${entry.status}`)}
      </Badge>
    </li>
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
