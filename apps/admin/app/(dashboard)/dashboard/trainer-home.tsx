import { getLocale, getTranslations } from 'next-intl/server';
import type { TrainerClientRow } from '@fit/types';
import {
  fetchAdminServiceSessions,
  fetchMyProfile,
  fetchMyScheduleTrainer,
  fetchPtSessions,
  fetchSchedule,
  fetchTrainer,
  fetchTrainerClients,
} from '@/lib/api';
import { gymCalendarContext } from '@/lib/gym-time';
import { addDays, dayWindow, zonedToday } from '../classes/schedule/week';
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
  Upcoming,
  WorkArea,
  greetingLine,
  makeFormatters,
  type Formatters,
  type T,
} from './home-parts';
import { buildTrainerHome, sortClients, type TrainerHomeModel } from './trainer-home-model';

/** Days the home view looks ahead, today included. */
const WINDOW_DAYS = 7;
const CLIENTS_LIMIT = 5;

/**
 * The trainer's landing page: their own day and week, from the endpoints a
 * TRAINER already holds — classes they teach (`ClassRead`), their PT sessions
 * (`PtSessionRead`) and their PT clients (`TrainerRead` + `MemberRead`). Nothing
 * gym-wide and nothing about money. Each source fails on its own: a section whose
 * fetch failed says so, the rest still render.
 */
export async function TrainerHome() {
  const [t, locale, calendar, profile, link] = await Promise.all([
    getTranslations('admin.dashboard'),
    getLocale(),
    gymCalendarContext(),
    fetchMyProfile().catch(() => null),
    fetchMyScheduleTrainer().catch(() => ({ trainerId: null })),
  ]);
  const { timeZone } = calendar;
  const now = new Date();
  const today = zonedToday(now, timeZone);
  const todayWindow = dayWindow(today, timeZone);
  const window = {
    from: todayWindow.from,
    to: dayWindow(addDays(today, WINDOW_DAYS - 1), timeZone).to,
  };

  const fmt = makeFormatters(locale, timeZone);
  const greeting = greetingLine(t, locale, timeZone, profile?.profile.name, now);

  const header = (
    <HomeHeader
      title={greeting.title}
      subtitle={t('trainer.subtitle', { date: greeting.longDate })}
    />
  );

  const trainerId = link.trainerId;
  if (!trainerId) {
    return (
      <HomePage>
        {header}
        <EmptyNote>{t('trainer.notLinked')}</EmptyNote>
      </HomePage>
    );
  }

  const [classes, pt, clients, slots] = await Promise.allSettled([
    fetchSchedule({ ...window, trainerId }),
    fetchPtSessions({ ...window, trainerId }),
    fetchTrainerClients(trainerId),
    // The PT members actually book are service slots, keyed by the coach's staff record.
    fetchTrainer(trainerId).then((trainer) =>
      trainer.staffId
        ? fetchAdminServiceSessions({ ...window, staffId: trainer.staffId })
        : { sessions: [] },
    ),
  ]);
  const scheduleFailed = classes.status === 'rejected' || pt.status === 'rejected';
  const model = buildTrainerHome({
    classes: classes.status === 'fulfilled' ? classes.value.instances : [],
    ptSessions: pt.status === 'fulfilled' ? pt.value.sessions : [],
    slots: slots.status === 'fulfilled' ? slots.value.sessions : [],
    todayEnd: todayWindow.to,
    now,
  });
  const clientRows = clients.status === 'fulfilled' ? clients.value.clients : null;

  return (
    <HomePage>
      {header}
      <Metrics t={t} fmt={fmt} model={model} clients={clientRows} />
      <WorkArea
        main={
          <Agenda
            t={t}
            fmt={fmt}
            items={model.today}
            failed={scheduleFailed}
            title={t('trainer.agenda.title')}
            emptyText={t('trainer.agenda.empty')}
          />
        }
        rail={
          <>
            <Upcoming t={t} fmt={fmt} items={model.upcoming} failed={scheduleFailed} />
            <Clients t={t} fmt={fmt} rows={clientRows} trainerId={trainerId} />
          </>
        }
      />
    </HomePage>
  );
}

function Metrics({
  t,
  fmt,
  model,
  clients,
}: {
  t: T;
  fmt: Formatters;
  model: TrainerHomeModel;
  clients: TrainerClientRow[] | null;
}) {
  const m = model.metrics;
  const cells = [
    {
      label: t('trainer.metrics.todayClasses'),
      value: fmt.number(m.todayClasses),
      foot:
        m.todayCapacity > 0
          ? t('trainer.metrics.seats', {
              booked: fmt.number(m.todayBooked),
              capacity: fmt.number(m.todayCapacity),
            })
          : t('trainer.metrics.noClasses'),
    },
    {
      label: t('trainer.metrics.todayPt'),
      value: fmt.number(m.todayPt),
      foot: t('trainer.metrics.ptFoot'),
    },
    {
      label: t('trainer.metrics.week'),
      value: fmt.number(m.weekSessions),
      foot: t('trainer.metrics.hours', { hours: fmt.number(m.weekMinutes / 60) }),
    },
    {
      label: t('trainer.metrics.clients'),
      value: clients ? fmt.number(clients.length) : '',
      foot: clients
        ? t('trainer.metrics.clientsFoot', {
            count: clients.filter((c) => c.nextSessionAt).length,
          })
        : t('trainer.loadError'),
    },
  ];
  return <MetricStrip cells={cells} />;
}

function Clients({
  t,
  fmt,
  rows,
  trainerId,
}: {
  t: T;
  fmt: Formatters;
  rows: TrainerClientRow[] | null;
  trainerId: string;
}) {
  const shown = rows ? sortClients(rows).slice(0, CLIENTS_LIMIT) : [];
  return (
    <SectionCard
      title={t('trainer.clients.title')}
      action={
        rows && rows.length > 0 ? (
          <CardLink href={`/trainers/${encodeURIComponent(trainerId)}`}>
            {t('trainer.clients.seeAll')}
          </CardLink>
        ) : null
      }
    >
      {rows === null ? (
        <EmptyNote>{t('trainer.loadError')}</EmptyNote>
      ) : shown.length === 0 ? (
        <EmptyNote>{t('trainer.clients.empty')}</EmptyNote>
      ) : (
        <PersonList>
          {shown.map((client) => (
            <PersonRow
              key={client.memberId}
              name={client.name}
              sub={
                client.nextSessionAt
                  ? t('trainer.clients.next', { date: fmt.date(client.nextSessionAt) })
                  : t('trainer.clients.noNext')
              }
              aside={t('trainer.clients.sessions', { count: client.sessionCount })}
            />
          ))}
        </PersonList>
      )}
    </SectionCard>
  );
}
