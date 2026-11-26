import { getLocale, getTranslations } from 'next-intl/server';
import type { CheckInRow } from '@fit/types';
import {
  fetchAdminServiceSessions,
  fetchCheckInStats,
  fetchMyProfile,
  fetchPtSessions,
  fetchSchedule,
  fetchTodayCheckIns,
} from '@/lib/api';
import { gymCalendarContext } from '@/lib/gym-time';
import { fetchPermittedLocations, getActiveLocationId } from '@/lib/active-location-server';
import { dayWindow, zonedToday } from '../classes/schedule/week';
import {
  Agenda,
  CardLink,
  EmptyNote,
  HomeHeader,
  HomePage,
  MetricStrip,
  PersonList,
  PersonRow,
  SectionCard,
  WorkArea,
  greetingLine,
  makeFormatters,
  type Formatters,
  type T,
} from './home-parts';
import { buildTrainerHome } from './trainer-home-model';
import { QuickCheckIn } from './quick-check-in';

/** How many of today's arrivals the feed lists. */
const ARRIVALS_LIMIT = 8;

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The front desk's landing page, scoped to the branch in the top bar: check a
 * member in, today's arrivals, and the branch's classes and PT for the day. Built
 * only from what a RECEPTIONIST holds — check-ins (`MemberCheckinRead` /
 * `MemberWrite`), the class and PT calendars (`ClassRead`, `PtSessionRead`) — so
 * no revenue and nothing gym-wide. Each source fails on its own.
 */
export async function ReceptionHome({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, calendar, profile, locationId, locations] = await Promise.all([
    getTranslations('admin.dashboard'),
    getLocale(),
    gymCalendarContext(),
    fetchMyProfile().catch(() => null),
    getActiveLocationId(searchParams),
    fetchPermittedLocations().catch(() => []),
  ]);
  const { timeZone } = calendar;
  const now = new Date();
  const today = dayWindow(zonedToday(now, timeZone), timeZone);
  const fmt = makeFormatters(locale, timeZone);
  const greeting = greetingLine(t, locale, timeZone, profile?.profile.name, now);
  const branch = locations.find((location) => location.id === locationId)?.name ?? null;

  const [stats, arrivals, classes, pt, slots] = await Promise.allSettled([
    fetchCheckInStats(locationId),
    fetchTodayCheckIns(locationId),
    fetchSchedule({ ...today, locationId }),
    fetchPtSessions({ ...today, locationId }),
    fetchAdminServiceSessions({ ...today, locationId }),
  ]);
  const scheduleFailed = classes.status === 'rejected';
  const model = buildTrainerHome({
    classes: classes.status === 'fulfilled' ? classes.value.instances : [],
    ptSessions: pt.status === 'fulfilled' ? pt.value.sessions : [],
    // The slot fetcher may not forward the branch yet; narrow here as well.
    slots:
      slots.status === 'fulfilled'
        ? slots.value.sessions.filter((slot) => !locationId || slot.locationId === locationId)
        : [],
    todayEnd: today.to,
    now,
  });
  const s = stats.status === 'fulfilled' ? stats.value : null;
  const m = model.metrics;
  const bookedPt = model.today.filter((item) => item.kind === 'pt' && !item.open).length;

  return (
    <HomePage>
      <HomeHeader
        title={greeting.title}
        subtitle={
          branch
            ? t('reception.subtitleBranch', { date: greeting.longDate, branch })
            : t('reception.subtitle', { date: greeting.longDate })
        }
      />
      <MetricStrip
        cells={[
          {
            label: t('reception.metrics.checkedIn'),
            value: s ? fmt.number(s.checkedInToday) : '',
            foot: s ? t('reception.metrics.peak', { count: s.peakToday }) : t('trainer.loadError'),
          },
          {
            label: t('reception.metrics.inGym'),
            value: s ? fmt.number(s.inGymNow) : '',
            foot: t('reception.metrics.inGymFoot'),
          },
          {
            label: t('reception.metrics.classes'),
            value: fmt.number(m.todayClasses),
            foot:
              m.todayCapacity > 0
                ? t('trainer.metrics.seats', {
                    booked: fmt.number(m.todayBooked),
                    capacity: fmt.number(m.todayCapacity),
                  })
                : t('reception.metrics.noClasses'),
          },
          {
            label: t('reception.metrics.pt'),
            value: fmt.number(m.todayPt),
            foot: t('reception.metrics.ptFoot', { count: bookedPt }),
          },
        ]}
      />
      <WorkArea
        main={
          <>
            <QuickCheckIn locationId={locationId ?? null} />
            <Agenda
              t={t}
              fmt={fmt}
              items={model.today}
              failed={scheduleFailed}
              title={t('reception.agenda.title')}
              emptyText={t('reception.agenda.empty')}
              showWho
            />
          </>
        }
        rail={
          <Arrivals
            t={t}
            fmt={fmt}
            rows={arrivals.status === 'fulfilled' ? arrivals.value.checkIns : null}
          />
        }
      />
    </HomePage>
  );
}

function Arrivals({ t, fmt, rows }: { t: T; fmt: Formatters; rows: CheckInRow[] | null }) {
  const shown = rows ? rows.slice(0, ARRIVALS_LIMIT) : [];
  return (
    <SectionCard
      title={t('reception.arrivals.title')}
      action={
        rows && rows.length > 0 ? (
          <CardLink href="/members">{t('reception.arrivals.members')}</CardLink>
        ) : null
      }
    >
      {rows === null ? (
        <EmptyNote>{t('trainer.loadError')}</EmptyNote>
      ) : shown.length === 0 ? (
        <EmptyNote>{t('reception.arrivals.empty')}</EmptyNote>
      ) : (
        <PersonList>
          {shown.map((row) => (
            <PersonRow
              key={row.id}
              name={row.name}
              href={`/members/${encodeURIComponent(row.gymMemberId)}`}
              sub={t(`reception.arrivals.method.${row.method}`)}
              aside={fmt.time(row.checkedInAt)}
            />
          ))}
        </PersonList>
      )}
    </SectionCard>
  );
}
