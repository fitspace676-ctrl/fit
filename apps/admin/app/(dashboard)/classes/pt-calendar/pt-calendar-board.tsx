'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminPtSession, AdminServiceSession, ClassInstanceStatus } from '@fit/types';
import { Badge, Button, Card, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import {
  CalendarBoard,
  FilterSelect,
  type CalendarEvent,
  type ScheduleOption,
  type ScheduleView,
} from '../schedule/calendar-board';
import { zonedClock } from '../schedule/week';
import { AddSlotDrawer, type ServiceOption, type SlotSeed } from './add-slot-drawer';
import { SlotDetail } from './slot-detail';
import { cancelPtSessionAction, completePtSessionAction } from './pt-session-actions';

const STATUS_TONES: Record<ClassInstanceStatus, BadgeTone> = {
  SCHEDULED: 'positive',
  COMPLETED: 'neutral',
  CANCELED: 'danger',
};

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
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

/**
 * One thing on the PT calendar, in the shape the shared calendar draws, still
 * holding the record it came from so the right detail drawer can open on it:
 * a session on the trainer calendar, or a service slot a member can book.
 */
export type PtCalendarEvent = CalendarEvent &
  ({ kind: 'session'; session: AdminPtSession } | { kind: 'slot'; slot: AdminServiceSession });

/**
 * A stable hue for a name, so the same trainer wears the same colour on every
 * card without anyone having to pick one. Sessions with a workout type wear
 * that type's colour instead, exactly as a class does.
 */
function hueOf(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function colorFor(name: string): string {
  return `hsl(${hueOf(name)} 55% 42%)`;
}

/** The service slot's own states, in the calendar's three-word vocabulary. */
function slotStatus(slot: AdminServiceSession): ClassInstanceStatus {
  switch (slot.status) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELED';
    default:
      return 'SCHEDULED';
  }
}

/**
 * The Classes hub's PT Calendar: the shared {@link CalendarBoard} - the same
 * toolbar, the same day / week / month / list views as the class Schedule -
 * drawn over every trainer's one-to-one sessions and every service slot in the
 * window, with a trainer filter, the "Open a slot" drawer (seeded by
 * click-to-create), and a detail drawer per kind of record.
 *
 * Two kinds of record share the calendar because the product records a PT
 * session in two places: the trainer calendar (`PtSession` - a trainer and a
 * time) and a service slot (`ServiceSession` - a staff member, a time, and the
 * member who booked it). The trainer filter narrows the first kind only: a
 * slot is keyed by staff member, not trainer profile, and there is no link to
 * narrow it by. The category filter narrows the second kind only: a category
 * belongs to a service, and the trainer calendar has none.
 */
export function PtCalendarBoard({
  view,
  weekStart,
  monthAnchor,
  dayAnchor,
  sessions,
  slots,
  services,
  trainers,
  trainerId,
  categories,
  categoryId,
  canWrite,
  timeZone,
  openHour,
  closeHour,
}: {
  view: ScheduleView;
  weekStart: string;
  monthAnchor: string;
  dayAnchor: string;
  sessions: AdminPtSession[];
  /** The service slots (open / booked / done) in the same window. */
  slots: AdminServiceSession[];
  /** ACTIVE services the "Open a slot" drawer can pick from. */
  services: ServiceOption[];
  /** The trainer filter's options. */
  trainers: ScheduleOption[];
  /** The trainer the URL narrows to, or '' for everyone. */
  trainerId: string;
  /** The service-category filter's options (the gym's own categories, from Services). */
  categories: ScheduleOption[];
  /** The category the URL narrows to, or '' for all. */
  categoryId: string;
  canWrite: boolean;
  /** The gym's IANA zone - the grid's rows and clock labels are read on it. */
  timeZone: string;
  /** The gym's opening window, from Settings > Business hours. */
  openHour: number;
  closeHour: number;
}) {
  const t = useTranslations('admin.ptCalendar');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Both kinds mapped into one ordered list, so the calendar buckets and sorts
  // them together the way it does classes.
  const events = useMemo<PtCalendarEvent[]>(() => {
    const fallbackTitle = t('session.title');
    const openLabel = t('slot.open');
    const mapped: PtCalendarEvent[] = [
      ...sessions.map(
        (session): PtCalendarEvent => ({
          kind: 'session',
          session,
          id: `session:${session.id}`,
          title: session.classTypeName ?? fallbackTitle,
          color: session.classTypeColor ?? colorFor(session.trainerName),
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          durationMinutes: session.durationMinutes,
          trainerName: session.trainerName,
          locationName: null,
          room: null,
          capacity: null,
          bookedCount: null,
          status: session.status,
          subtitle: null,
        }),
      ),
      ...slots.map(
        (slot): PtCalendarEvent => ({
          kind: 'slot',
          slot,
          id: `slot:${slot.id}`,
          title: slot.serviceName,
          color: colorFor(slot.staffName),
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          durationMinutes: slot.durationMinutes,
          trainerName: slot.staffName,
          locationName: null,
          room: null,
          capacity: null,
          bookedCount: null,
          status: slotStatus(slot),
          subtitle: slot.status === 'OPEN' ? openLabel : slot.memberName,
        }),
      ),
    ];
    return mapped.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [sessions, slots, t]);

  const [selected, setSelected] = useState<AdminPtSession | null>(null);
  const detail = useSlideDrawer();
  const [selectedSlot, setSelectedSlot] = useState<AdminServiceSession | null>(null);
  const slotDetail = useSlideDrawer();

  const openEvent = useCallback(
    (event: PtCalendarEvent) => {
      if (event.kind === 'session') {
        setSelected(event.session);
        detail.open();
      } else {
        setSelectedSlot(event.slot);
        slotDetail.open();
      }
    },
    [detail, slotDetail],
  );

  // Click-to-create: the slot the operator pointed at, and a counter that asks
  // the "Open a slot" drawer to open on it - the class schedule's own mechanism.
  const [slotSeed, setSlotSeed] = useState<SlotSeed | undefined>(undefined);
  const [slotRequests, setSlotRequests] = useState(0);
  const pickSlot = useCallback((dayIso: string, startTime: string) => {
    setSlotSeed({ date: dayIso, time: startTime });
    setSlotRequests((count) => count + 1);
  }, []);

  /** Push a new URL with a batch of params set (or removed when null/empty). */
  const setParams = useCallback(
    (entries: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(entries)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const hasFilters = trainerId !== '' || categoryId !== '';

  return (
    <CalendarBoard
      view={view}
      weekStart={weekStart}
      monthAnchor={monthAnchor}
      dayAnchor={dayAnchor}
      events={events}
      filtered={hasFilters}
      timeZone={timeZone}
      openHour={openHour}
      closeHour={closeHour}
      t={t}
      onOpen={openEvent}
      onPickSlot={canWrite ? pickSlot : null}
      action={
        canWrite ? (
          <AddSlotDrawer
            services={services}
            defaultDate={weekStart}
            timeZone={timeZone}
            seed={slotSeed}
            openToken={slotRequests}
          />
        ) : null
      }
      filters={
        <>
          <FilterSelect
            label={t('filters.trainer')}
            value={trainerId}
            allLabel={t('filters.allTrainers')}
            options={trainers}
            onChange={(value) => setParams({ trainerId: value })}
          />
          <FilterSelect
            label={t('filters.category')}
            value={categoryId}
            allLabel={t('filters.allCategories')}
            options={categories}
            onChange={(value) => setParams({ categoryId: value })}
          />
          {hasFilters ? (
            <Button
              variant="ghost"
              size="inline"
              onClick={() => setParams({ trainerId: null, categoryId: null })}
              icon={<Icon name="x" {...stylex.props(styles.kitGlyph)} />}
              label={t('filters.clear')}
            />
          ) : null}
        </>
      }
    >
      <PtSessionDetail
        drawer={detail}
        session={selected}
        timeZone={timeZone}
        canWrite={canWrite}
        onChanged={() => router.refresh()}
      />
      <SlotDetail
        drawer={slotDetail}
        slot={selectedSlot}
        locale={locale}
        timeZone={timeZone}
        canWrite={canWrite}
        onChanged={() => router.refresh()}
      />
    </CalendarBoard>
  );
}

/** The session detail drawer - workout type, time, status, notes + cancel / complete. */
function PtSessionDetail({
  drawer,
  session,
  timeZone,
  canWrite,
  onChanged,
}: {
  drawer: ReturnType<typeof useSlideDrawer>;
  session: AdminPtSession | null;
  timeZone: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('admin.ptCalendar');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;

  const isScheduled = session.status === 'SCHEDULED';
  const clock = (iso: string) => zonedClock(new Date(iso), timeZone);

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
        setError(result.error ?? t('session.unexpected'));
      }
    });
  }

  return (
    <Dialog
      isOpen={drawer.isOpen}
      onOpenChange={drawer.handleOpenChange}
      purpose="info"
      aria-label={t('session.title')}
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
            title={t('session.title')}
            hasDivider={false}
            onOpenChange={drawer.handleOpenChange}
            xstyle={styles.drawerHead}
          />
        }
        content={
          <LayoutContent padding={0} isScrollable xstyle={styles.drawerContent}>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>{t('session.trainer')}</span>
              <span {...stylex.props(styles.detailValue)}>{session.trainerName}</span>
            </div>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>{t('session.workoutType')}</span>
              <span {...stylex.props(styles.detailValue)}>{session.classTypeName ?? '-'}</span>
            </div>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>{t('session.when')}</span>
              <span {...stylex.props(styles.detailValue)}>
                {clock(session.startsAt)}-{clock(session.endsAt)} ·{' '}
                {t('day.minutes', { count: session.durationMinutes })}
              </span>
            </div>
            <div {...stylex.props(styles.detailRow)}>
              <span {...stylex.props(styles.detailLabel)}>{t('session.status')}</span>
              <span>
                <Badge tone={STATUS_TONES[session.status]} label={t(`status.${session.status}`)} />
              </span>
            </div>
            {session.notes ? (
              <div {...stylex.props(styles.detailRow)}>
                <span {...stylex.props(styles.detailLabel)}>{t('session.notes')}</span>
                <span {...stylex.props(styles.detailValue)}>{session.notes}</span>
              </div>
            ) : null}

            {error ? (
              <Card padding="none" xstyle={styles.errorCard}>
                <Icon name="info" {...stylex.props(styles.errorIcon)} />
                <p role="alert" {...stylex.props(styles.errorText)}>
                  {error}
                </p>
              </Card>
            ) : null}

            {canWrite && isScheduled ? (
              <div {...stylex.props(styles.detailActions)}>
                <Button
                  variant="primary"
                  size="card"
                  onClick={() => run(completePtSessionAction)}
                  disabled={pending}
                  label={t('session.markComplete')}
                />
                <Button
                  variant="secondary"
                  size="card"
                  onClick={() => run(cancelPtSessionAction)}
                  disabled={pending}
                  label={t('session.cancel')}
                />
              </div>
            ) : null}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
