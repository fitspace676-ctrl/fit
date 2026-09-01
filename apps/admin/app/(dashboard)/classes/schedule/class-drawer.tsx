'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  AdminClassInstanceDetail,
  AdminClassInstanceRosterEntry,
  AdminScheduleInstance,
  AttendanceStatus,
} from '@fit/types';
import { Badge, Button, ConfirmDialog, Drawer, Field, type BadgeTone } from '@fit/ui-kit';
import { Icon, useToast, type IconName } from '@/components/ui';
import {
  bookMemberAction,
  cancelInstanceAction,
  loadInstanceDetailAction,
  markAttendanceAction,
  promoteWaitlistAction,
  searchMembersForBookingAction,
  type MemberSearchResult,
} from './actions';
import { createDateTimeFormat } from '@fit/i18n';
import { zonedClock, zonedIsoDate } from './week';

type T = ReturnType<typeof useTranslations>;

const spin = stylex.keyframes({
  to: { transform: 'rotate(360deg)' },
});

const pulse = stylex.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.5 },
  '100%': { opacity: 1 },
});

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
  editLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  editIcon: {
    width: '1rem',
    height: '1rem',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  cover: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
  },
  statusSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  badgeWrap: {
    alignSelf: 'flex-start',
  },
  detailList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    margin: 0,
    fontSize: '0.875rem',
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    color: 'var(--color-text-primary)',
  },
  detailIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
  },
  detailText: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  description: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  occCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '0.75rem',
  },
  occLabels: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  occSpots: {
    color: 'var(--color-text-primary)',
  },
  occRemaining: {
    color: 'var(--color-text-secondary)',
  },
  barTrack: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  barFill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
  },
  occWaitlist: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  rosterSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  rosterEmpty: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  rosterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.625rem',
  },
  avatar: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  rowText: {
    display: 'flex',
    minWidth: 0,
    flex: 1,
    flexDirection: 'column',
  },
  rowName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  rowEmail: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  markGroup: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.25rem',
  },
  promoteGroup: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
  },
  badgeShrink: {
    flexShrink: 0,
  },
  markBtn: {
    display: 'inline-flex',
    height: '2rem',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.625rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    outlineStyle: 'none',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '150ms',
    opacity: {
      default: 1,
      ':disabled': 0.4,
    },
    pointerEvents: {
      default: 'auto',
      ':disabled': 'none',
    },
  },
  markInactive: {
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  markSuccess: {
    borderColor: 'var(--color-success)',
    backgroundColor: 'var(--color-success)',
    color: 'var(--color-on-success)',
  },
  markWarning: {
    borderColor: 'var(--color-warning)',
    backgroundColor: 'var(--color-warning)',
    color: 'var(--color-on-warning)',
  },
  accentBtn: {
    display: 'inline-flex',
    height: '2rem',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    paddingInline: '0.625rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-accent-muted)',
    },
    cursor: 'pointer',
    outlineStyle: 'none',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
    opacity: {
      default: 1,
      ':disabled': 0.4,
    },
    pointerEvents: {
      default: 'auto',
      ':disabled': 'none',
    },
  },
  btnIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  spinner: {
    width: '0.875rem',
    height: '0.875rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRightColor: 'transparent',
    animationName: spin,
    animationDuration: '0.6s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
  },
  btnLabel: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'inline',
    },
  },
  bookSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '1.25rem',
  },
  hint: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  skeletonAvatar: {
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    animationName: pulse,
    animationDuration: '1.5s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  skeletonLine: {
    height: '0.875rem',
    width: '8rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    animationName: pulse,
    animationDuration: '1.5s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  skeletonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '0.625rem',
  },
});

/** The roster status tones — held seats read calm, no-shows warn, waitlist is muted. */
const ROSTER_TONES: Record<AdminClassInstanceRosterEntry['status'], BadgeTone> = {
  BOOKED: 'accent',
  ATTENDED: 'positive',
  NO_SHOW: 'pending',
  WAITLIST: 'neutral',
};

/** The occurrence-status tones for the drawer header badge. */
const STATUS_TONES: Record<AdminScheduleInstance['status'], BadgeTone> = {
  SCHEDULED: 'positive',
  CANCELED: 'danger',
  COMPLETED: 'neutral',
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
  canBook: canBookMembers,
  canMarkAttendance,
  canManageWaitlist,
  locale,
  timeZone,
}: {
  /** The clicked calendar block — drives the header before the roster loads. */
  instance: AdminScheduleInstance | null;
  open: boolean;
  onClose: () => void;
  /** Whether the staff session holds `ClassWrite` (gates the cancel action). */
  canWrite: boolean;
  /** `BookingManage` — may book a member onto the class. */
  canBook: boolean;
  /** `ClassAttendance` — may mark attendance. */
  canMarkAttendance: boolean;
  /** `ClassWaitlist` — may promote a waitlisted member. */
  canManageWaitlist: boolean;
  locale: string;
  /** The gym's IANA zone — the drawer's day and clock read on it, like the grid. */
  timeZone: string;
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
  // The member the desk is booking onto this class, if any — drives that result
  // row's busy state and, like a mark / promote, freezes the rest of the roster.
  const [bookingMemberId, setBookingMemberId] = useState<string | null>(null);
  const [, startBook] = useTransition();

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

  const runBook = useCallback(
    (memberId: string) => {
      if (id === null) {
        return;
      }
      setBookingMemberId(memberId);
      startBook(async () => {
        const result = await bookMemberAction(id, memberId);
        if (result.ok) {
          setDetail(result.data);
          // Full occurrences waitlist the member rather than refuse the booking —
          // read the member's landing status off the refreshed roster so the toast
          // says which it was.
          const waitlisted =
            result.data.roster.find((entry) => entry.memberId === memberId)?.status === 'WAITLIST';
          toast(t(waitlisted ? 'toast.waitlisted' : 'toast.booked'), {
            tone: 'success',
            icon: 'check',
          });
          // The occupancy / queue changed — refresh the week grid so the block follows.
          router.refresh();
        } else {
          toast(result.error, { tone: 'danger', icon: 'info' });
        }
        setBookingMemberId(null);
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
    canMarkAttendance &&
    status !== 'CANCELED' &&
    head !== null &&
    Date.parse(head.startsAt) <= Date.now();
  // A waitlisted member can be promoted into a seat only while the occurrence is
  // still SCHEDULED (a canceled / completed class is settled) and the staff holds
  // ClassWaitlist — the API re-checks both.
  const canPromote = canManageWaitlist && status === 'SCHEDULED';
  // The desk can book a member onto the class on their behalf while it is still
  // SCHEDULED and the staff holds BookingManage; the API re-checks and honours
  // the capacity/credit rules.
  const canBook = canBookMembers && status === 'SCHEDULED';
  // While any roster write (a mark, a promote, or a desk booking) is recording,
  // every row's controls freeze so the desk only ever has one change in flight.
  const rosterBusy = markingId !== null || promotingId !== null || bookingMemberId !== null;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        label={head?.title ?? t('loading')}
        footer={
          head ? (
            <div {...stylex.props(styles.footer)}>
              <Link href={`/classes/${head.templateId}`} {...stylex.props(styles.editLink)}>
                <Icon name="settings" sw={2} {...stylex.props(styles.editIcon)} />
                {t('actions.edit')}
              </Link>
              {canCancel ? (
                <Button
                  variant="destructive"
                  size="card"
                  onClick={() => setConfirmOpen(true)}
                  icon={<Icon name="x" {...stylex.props(styles.kitGlyph)} />}
                  label={t('actions.cancel')}
                />
              ) : null}
            </div>
          ) : null
        }
      >
        {head ? (
          <div {...stylex.props(styles.body)}>
            {/* The class's cover, when it has one — the visual identity of the
                class, shown before any figures (mirrors the booking modal the
                design references). */}
            {head.imageUrl ? (
              <img src={head.imageUrl} alt="" {...stylex.props(styles.cover)} />
            ) : null}
            {/* Status + when / where. */}
            <div {...stylex.props(styles.statusSection)}>
              <span {...stylex.props(styles.badgeWrap)}>
                <Badge tone={STATUS_TONES[status]} label={t(`status.${status}`)} />
              </span>
              <dl {...stylex.props(styles.detailList)}>
                <DetailRow icon="calendar" text={formatDay(head.startsAt, locale, timeZone)} />
                <DetailRow
                  icon="clock"
                  text={`${formatTime(head.startsAt, locale, timeZone)}–${formatTime(head.endsAt, locale, timeZone)}`}
                />
                {head.trainerName ? <DetailRow icon="user" text={head.trainerName} /> : null}
                {head.locationName || head.room ? (
                  <DetailRow
                    icon="pin"
                    text={[head.locationName, head.room].filter(Boolean).join(' · ')}
                  />
                ) : null}
                {head.category ? <DetailRow icon="tag" text={head.category} /> : null}
                <DetailRow icon="tag" text={pricingLabel(t, head)} />
              </dl>

              {/* The template's blurb, when it has one. */}
              {head.description ? (
                <p {...stylex.props(styles.description)}>{head.description}</p>
              ) : null}
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

            {/* Book a member onto this class from the front desk (T3.7). */}
            {canBook ? (
              <BookMember
                t={t}
                onBook={runBook}
                bookingMemberId={bookingMemberId}
                busy={rosterBusy}
              />
            ) : null}
          </div>
        ) : error ? (
          <p role="alert" {...stylex.props(styles.errorText)}>
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
        description={t('confirm.message', { title: head?.title ?? '' })}
        confirmLabel={t('confirm.confirm')}
        cancelLabel={t('confirm.cancel')}
        confirmVariant="destructive"
        loading={cancelling}
      />
    </>
  );
}

/** A labelled detail line: an icon and its value. */
/**
 * How the class is charged, as one line. The price *amount* needs the gym's
 * currency, which this view does not load, so a `PAID` class shows the rule and
 * the major-unit figure without a symbol rather than guessing one.
 */
function pricingLabel(
  t: ReturnType<typeof useTranslations>,
  head: { pricingRule: string; priceMinor: number | null },
): string {
  if (head.pricingRule === 'PAID' && head.priceMinor !== null) {
    return `${t('details.paid')} · ${(head.priceMinor / 100).toFixed(2)}`;
  }
  if (head.pricingRule === 'INCLUDED') return t('details.included');
  return t('details.free');
}

function DetailRow({
  icon,
  text,
}: {
  icon: 'calendar' | 'clock' | 'user' | 'pin' | 'tag';
  text: string;
}) {
  return (
    <div {...stylex.props(styles.detailRow)}>
      <Icon name={icon} sw={2} {...stylex.props(styles.detailIcon)} />
      <span {...stylex.props(styles.detailText)}>{text}</span>
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
  const barColor =
    pct > 85 ? 'var(--color-error)' : pct > 60 ? 'var(--color-warning)' : 'var(--color-success)';
  const remaining = Math.max(0, capacity - booked);
  return (
    <div {...stylex.props(styles.occCard)}>
      <div {...stylex.props(styles.occLabels)}>
        <span {...stylex.props(styles.occSpots)}>
          {t('occupancy.spots', { booked, cap: capacity })}
        </span>
        <span {...stylex.props(styles.occRemaining)}>
          {remaining === 0 ? t('occupancy.full') : t('occupancy.remaining', { remaining })}
        </span>
      </div>
      <div {...stylex.props(styles.barTrack)}>
        <div
          {...stylex.props(styles.barFill)}
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
        />
      </div>
      {waitlist > 0 ? (
        <p {...stylex.props(styles.occWaitlist)}>{t('occupancy.waitlist', { count: waitlist })}</p>
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
    <div {...stylex.props(styles.rosterSection)}>
      <h3 {...stylex.props(styles.sectionTitle)}>{t('roster.title')}</h3>
      {loading ? (
        <RosterSkeleton />
      ) : error ? (
        <p role="alert" {...stylex.props(styles.errorText)}>
          {error}
        </p>
      ) : !detail || detail.roster.length === 0 ? (
        <p {...stylex.props(styles.rosterEmpty)}>{t('roster.empty')}</p>
      ) : (
        <ul {...stylex.props(styles.rosterList)}>
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
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.avatar)}>{initials(label)}</span>
      <div {...stylex.props(styles.rowText)}>
        <span {...stylex.props(styles.rowName)}>{label}</span>
        {entry.memberName ? (
          <span {...stylex.props(styles.rowEmail)}>{entry.memberEmail}</span>
        ) : null}
      </div>
      {canMark ? (
        <div
          role="group"
          aria-label={t('roster.markGroup', { member: label })}
          {...stylex.props(styles.markGroup)}
        >
          <MarkButton
            icon="check"
            label={t('roster.status.ATTENDED')}
            active={entry.status === 'ATTENDED'}
            activeTone="success"
            busy={marking}
            disabled={busy}
            onClick={() => onMark(entry.bookingId, 'ATTENDED')}
          />
          <MarkButton
            icon="x"
            label={t('roster.status.NO_SHOW')}
            active={entry.status === 'NO_SHOW'}
            activeTone="warning"
            busy={marking}
            disabled={busy}
            onClick={() => onMark(entry.bookingId, 'NO_SHOW')}
          />
        </div>
      ) : canPromote ? (
        // A queued entry the desk can lift into a seat: its position stays visible
        // beside a promote control (which the API turns into a held seat).
        <div {...stylex.props(styles.promoteGroup)}>
          <Badge
            tone={ROSTER_TONES.WAITLIST}
            label={
              entry.waitlistPosition
                ? t('roster.waitlistPosition', { position: entry.waitlistPosition })
                : t('roster.status.WAITLIST')
            }
          />
          <PromoteButton
            text={t('roster.promote')}
            label={t('roster.promoteMember', { member: label })}
            busy={promoting}
            disabled={busy}
            onClick={() => onPromote(entry.bookingId)}
          />
        </div>
      ) : (
        <span {...stylex.props(styles.badgeShrink)}>
          <Badge
            tone={ROSTER_TONES[entry.status]}
            label={
              entry.status === 'WAITLIST' && entry.waitlistPosition
                ? t('roster.waitlistPosition', { position: entry.waitlistPosition })
                : t(`roster.status.${entry.status}`)
            }
          />
        </span>
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
  activeTone,
  busy,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  /** The tone the button carries once it's the set outcome. */
  activeTone: 'success' | 'warning';
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
      {...stylex.props(
        styles.markBtn,
        active
          ? activeTone === 'success'
            ? styles.markSuccess
            : styles.markWarning
          : styles.markInactive,
      )}
    >
      {busy ? (
        <span {...stylex.props(styles.spinner)} aria-hidden />
      ) : (
        <Icon name={icon} sw={2.5} {...stylex.props(styles.btnIcon)} />
      )}
      <span {...stylex.props(styles.btnLabel)}>{label}</span>
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
      {...stylex.props(styles.accentBtn)}
    >
      {busy ? (
        <span {...stylex.props(styles.spinner)} aria-hidden />
      ) : (
        <Icon name="arrow" sw={2.5} {...stylex.props(styles.btnIcon)} />
      )}
      <span {...stylex.props(styles.btnLabel)}>{text}</span>
    </button>
  );
}

/**
 * The front-desk "book a member" panel (T3.7). A debounced search over the gym's
 * members feeds a result list; each result carries a Book control that books that
 * member onto the occurrence on their behalf (the API honours the same
 * capacity/credit rules as a member self-book — a held seat or, when the class is
 * full, a waitlist entry). While any roster write is in flight the whole panel is
 * frozen, matching the mark / promote discipline (one change at a time).
 */
function BookMember({
  t,
  onBook,
  bookingMemberId,
  busy,
}: {
  t: T;
  onBook: (memberId: string) => void;
  /** The member whose booking is in flight, if any — its row shows busy. */
  bookingMemberId: string | null;
  /** Whether any drawer write is recording — freezes the search + controls. */
  busy: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounced member search: a blank query clears the list without a round-trip;
  // otherwise the search fires 250ms after the last keystroke, and a stale
  // in-flight response is dropped (`active`) so results can't land out of order.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    let active = true;
    const handle = setTimeout(() => {
      void searchMembersForBookingAction(trimmed).then((result) => {
        if (!active) {
          return;
        }
        if (result.ok) {
          setResults(result.data);
          setSearchError(null);
        } else {
          setResults([]);
          setSearchError(result.error);
        }
        setSearching(false);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  const trimmed = query.trim();

  return (
    <div {...stylex.props(styles.bookSection)}>
      <h3 {...stylex.props(styles.sectionTitle)}>{t('book.title')}</h3>
      <Field
        label={t('book.searchLabel')}
        labelHidden
        size="chrome"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('book.searchPlaceholder')}
        disabled={busy}
        autoComplete="off"
      />
      {!trimmed ? (
        <p {...stylex.props(styles.hint)}>{t('book.hint')}</p>
      ) : searching ? (
        <p {...stylex.props(styles.hint)}>{t('book.searching')}</p>
      ) : searchError ? (
        <p role="alert" {...stylex.props(styles.errorText)}>
          {searchError}
        </p>
      ) : results.length === 0 ? (
        <p {...stylex.props(styles.hint)}>{t('book.noResults', { query: trimmed })}</p>
      ) : (
        <ul {...stylex.props(styles.rosterList)}>
          {results.map((member) => (
            <BookResultRow
              key={member.id}
              member={member}
              t={t}
              busy={busy}
              booking={bookingMemberId === member.id}
              onBook={onBook}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One member match in the booking search: avatar initials, name/email, and a Book
 * control that books them onto the occurrence. While any drawer write is in flight
 * the control is `disabled`, and the one clicked shows a spinner in place of its
 * icon (mirroring the promote control).
 */
function BookResultRow({
  member,
  t,
  busy,
  booking,
  onBook,
}: {
  member: MemberSearchResult;
  t: T;
  busy: boolean;
  booking: boolean;
  onBook: (memberId: string) => void;
}) {
  const label = member.name?.trim() || member.email;
  return (
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.avatar)}>{initials(label)}</span>
      <div {...stylex.props(styles.rowText)}>
        <span {...stylex.props(styles.rowName)}>{label}</span>
        {member.name ? <span {...stylex.props(styles.rowEmail)}>{member.email}</span> : null}
      </div>
      <button
        type="button"
        aria-label={t('book.bookMember', { member: label })}
        title={t('book.bookMember', { member: label })}
        onClick={() => onBook(member.id)}
        disabled={busy}
        {...stylex.props(styles.accentBtn)}
      >
        {booking ? (
          <span {...stylex.props(styles.spinner)} aria-hidden />
        ) : (
          <Icon name="plus" sw={2.5} {...stylex.props(styles.btnIcon)} />
        )}
        <span {...stylex.props(styles.btnLabel)}>{t('book.action')}</span>
      </button>
    </li>
  );
}

/** A placeholder for the roster while it loads. */
function RosterSkeleton() {
  return (
    <ul {...stylex.props(styles.rosterList)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} {...stylex.props(styles.skeletonRow)}>
          <span {...stylex.props(styles.skeletonAvatar)} />
          <span {...stylex.props(styles.skeletonLine)} />
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

/**
 * Localised full day (e.g. "Monday, Jun 1") on the **gym's** calendar.
 *
 * `createDateTimeFormat` reads every field in UTC by design and ignores the zone
 * it is handed, so passing the gym's zone straight to it dated a 00:30 Tbilisi
 * class to the day before. The gym-local date is resolved first, then formatted
 * as the UTC token it now is — which keeps the ka/en weekday and month names.
 */
function formatDay(iso: string, locale: string, timeZone: string): string {
  const localDay = zonedIsoDate(new Date(iso), timeZone);
  return createDateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${localDay}T00:00:00.000Z`));
}

/** `HH:MM` on the gym's clock — the same reading the grid positions blocks by. */
function formatTime(iso: string, _locale: string, timeZone: string): string {
  return zonedClock(new Date(iso), timeZone);
}
