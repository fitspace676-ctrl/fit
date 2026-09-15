'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  RECURRENCE_WEEKDAYS,
  type AdminClassTypeOption,
  type AdminScheduleInstance,
  type RecurrenceWeekday,
} from '@fit/types';
import { Button } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useActiveLocation } from '@/components/active-location';
import { useOccupancyStream } from '@/hooks/use-occupancy-stream';
import { ClassDrawer } from './class-drawer';
import { AddClassDrawer } from '../add-class-drawer';
import type { RelationOption } from '../class-template-form';
import type { ClassFormSeed } from '../class-template-form';
import {
  CalendarBoard,
  FilterSelect,
  type ScheduleOption,
  type ScheduleView,
} from './calendar-board';

export type { ScheduleOption, ScheduleView } from './calendar-board';

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
});

/**
 * The staff schedule (T3.2): the shared {@link CalendarBoard} drawn over class
 * occurrences, with the trainer filter, the "Add Class" drawer (seeded by
 * click-to-create), live occupancy over SSE, and the class drawer.
 *
 * The calendar itself - toolbar, day / week / month / list - lives in
 * `calendar-board.tsx` and is the same one the PT Calendar draws with.
 *
 * THE BRANCH IS NO LONGER A PAGE FILTER. It belongs to the top-bar switcher and
 * applies console-wide; this board only *reads* it, to say whether an empty day is
 * genuinely empty or merely narrowed. `?locationId=` still works — the server page
 * resolves it ahead of the cookie — but nothing here writes it, and in particular
 * "Clear filters" does not clear it: a page-level control must not silently change
 * a console-wide setting the operator set somewhere else.
 */
export function ScheduleBoard({
  view,
  weekStart,
  monthAnchor,
  dayAnchor,
  instances,
  trainers,
  trainerId,
  canWrite,
  canBook,
  canMarkAttendance,
  canManageWaitlist,
  addClass,
  timeZone,
  openHour,
  closeHour,
}: {
  /** Which surface to render. */
  view: ScheduleView;
  /** The visible week's Monday, `YYYY-MM-DD` (UTC) - drives week + list. */
  weekStart: string;
  /** The visible month's first day, `YYYY-MM-DD` (UTC) - drives month. */
  monthAnchor: string;
  /** The visible day, `YYYY-MM-DD` (UTC) - drives the day agenda. */
  dayAnchor: string;
  instances: AdminScheduleInstance[];
  trainers: ScheduleOption[];
  trainerId: string;
  /** Whether the staff session holds `ClassWrite` (gates the drawer's cancel). */
  canWrite: boolean;
  /** `BookingManage` - the drawer's desk booking. */
  canBook: boolean;
  /** `ClassAttendance` - the drawer's attendance marks. */
  canMarkAttendance: boolean;
  /** `ClassWaitlist` - the drawer's waitlist promote. */
  canManageWaitlist: boolean;
  /** The gym's IANA zone - day columns and clock labels are read on it. */
  timeZone: string;
  /** The gym's opening window, from Settings > Business hours. */
  openHour: number;
  closeHour: number;
  /** Class-relation options for the "Add Class" drawer; null when the staffer can't write. */
  addClass: {
    trainers: RelationOption[];
    locations: RelationOption[];
    plans: RelationOption[];
    classTypes: AdminClassTypeOption[];
  } | null;
}) {
  const t = useTranslations('admin.schedule');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Live occupancy (T8.10): refresh the grid as members book / cancel and the
  // desk promotes, pushed over SSE - replacing the schedule's need to poll.
  useOccupancyStream();

  // The occurrence whose detail drawer is open (null when closed).
  const [selected, setSelected] = useState<AdminScheduleInstance | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openInstance = useCallback((instance: AdminScheduleInstance) => {
    setSelected(instance);
    setDrawerOpen(true);
  }, []);

  // Click-to-create: the slot the operator pointed at, and a counter that asks the
  // "New class" drawer to open on it. A counter rather than a flag so clicking the
  // same slot twice reopens the drawer both times.
  const [slotSeed, setSlotSeed] = useState<ClassFormSeed | undefined>(undefined);
  const [slotRequests, setSlotRequests] = useState(0);
  const pickSlot = useCallback((dayIso: string, startTime: string) => {
    setSlotSeed({ startTime, validFrom: dayIso, weekday: weekdayCodeOf(dayIso) });
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

  // Two different questions, deliberately not one flag. `hasPageFilters` decides
  // whether to offer "Clear filters", and so may only count filters this page owns
  // and can actually clear. `narrowed` decides whether an empty day reads as "no
  // classes" or "no classes match", and so must also count the console-wide branch
  // — otherwise selecting a branch would make the other branch's days look like a
  // gym with nothing on.
  const { locationId: activeLocationId } = useActiveLocation();
  const hasPageFilters = trainerId !== '';
  const narrowed = hasPageFilters || activeLocationId !== undefined;

  return (
    <CalendarBoard
      view={view}
      weekStart={weekStart}
      monthAnchor={monthAnchor}
      dayAnchor={dayAnchor}
      events={instances}
      filtered={narrowed}
      timeZone={timeZone}
      openHour={openHour}
      closeHour={closeHour}
      t={t}
      onOpen={openInstance}
      onPickSlot={addClass ? pickSlot : null}
      action={
        addClass ? (
          <AddClassDrawer
            trainers={addClass.trainers}
            locations={addClass.locations}
            plans={addClass.plans}
            classTypes={addClass.classTypes}
            triggerLabel={t('toolbar.addClass')}
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
          {/* The branch select that used to sit beside this one is gone — the
              top-bar switcher owns the branch for the whole console, so Clear
              clears `trainerId` and nothing else. */}
          {hasPageFilters ? (
            <Button
              variant="ghost"
              size="inline"
              onClick={() => setParams({ trainerId: null })}
              icon={<Icon name="x" {...stylex.props(styles.kitGlyph)} />}
              label={t('filters.clear')}
            />
          ) : null}
        </>
      }
    >
      <ClassDrawer
        instance={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canWrite={canWrite}
        canBook={canBook}
        canMarkAttendance={canMarkAttendance}
        canManageWaitlist={canManageWaitlist}
        locale={locale}
        timeZone={timeZone}
      />
    </CalendarBoard>
  );
}

/**
 * The recurrence weekday code for a `YYYY-MM-DD` column key, so a class created
 * by clicking Friday's column repeats on Fridays. The key is a plain calendar
 * date, read in UTC like every other day anchor in this module.
 */
function weekdayCodeOf(dayIso: string): RecurrenceWeekday {
  const day = new Date(`${dayIso}T00:00:00.000Z`).getUTCDay();
  // getUTCDay(): 0 = Sunday. RECURRENCE_WEEKDAYS is Monday-first.
  return RECURRENCE_WEEKDAYS[(day + 6) % 7]!;
}
