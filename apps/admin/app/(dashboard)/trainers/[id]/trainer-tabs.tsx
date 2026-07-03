'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AdminTrainerDetail } from '@fit/types';
import { Card, Icon } from '@/components/ui';

type T = ReturnType<typeof useTranslations>;

/** The detail tabs, matching the Planflow "formacore" reference order. */
const TABS = ['Overview', 'Schedule', 'Clients', 'Reviews', 'Availability'] as const;
type Tab = (typeof TABS)[number];

/** Translation key per tab. */
const TAB_LABEL_KEYS: Record<Tab, string> = {
  Overview: 'tabs.overview',
  Schedule: 'tabs.schedule',
  Clients: 'tabs.clients',
  Reviews: 'tabs.reviews',
  Availability: 'tabs.availability',
};

/** Format an ISO instant as a short local date-time, or an em dash when absent. */
function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** One "This week" row in the Overview side card. */
function WeekRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-ink-500 dark:text-ink-400">{label}</span>
      <span className="font-display text-base font-extrabold tabular-nums text-ink-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

/**
 * The trainer detail tab strip + panels (client). Local state mirrors the
 * members detail pattern. The Overview panel renders the real About card + the
 * trainer's live "This week" counts; the other tabs surface real, tenant-scoped
 * facts (next class, rating, review moderation, availability editor) or state
 * honestly where the schema has no source (PT clients aren't modelled).
 */
export function TrainerTabs({ trainer }: { trainer: AdminTrainerDetail }) {
  const t = useTranslations('admin.trainers');
  const locale = useLocale();
  const [active, setActive] = useState<Tab>('Overview');

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" className="flex gap-1 border-b border-ink-200 dark:border-white/10">
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
              }`}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {active === 'Overview' && <OverviewPanel trainer={trainer} t={t} />}
        {active === 'Schedule' && <SchedulePanel trainer={trainer} t={t} locale={locale} />}
        {active === 'Clients' && <ClientsPanel t={t} />}
        {active === 'Reviews' && <ReviewsPanel trainer={trainer} t={t} />}
        {active === 'Availability' && <AvailabilityPanel trainer={trainer} t={t} />}
      </div>
    </div>
  );
}

/** Overview — the About card plus the "This week" side card. */
function OverviewPanel({ trainer, t }: { trainer: AdminTrainerDetail; t: T }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="flex flex-col gap-5 p-5 lg:col-span-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
            {t('tabs.about')}
          </h3>
          {trainer.bio ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700 dark:text-ink-200">
              {trainer.bio}
            </p>
          ) : (
            <p className="text-sm text-ink-400">{t('tabs.noBio')}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
            {t('tabs.specialties')}
          </h3>
          {trainer.specialties.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {trainer.specialties.map((tag) => (
                <span
                  key={tag}
                  className="rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-white/10 dark:text-ink-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-400">{t('tabs.noSpecialties')}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
            <Icon name="award" className="h-3.5 w-3.5" />
            {t('tabs.certifications')}
          </h3>
          {trainer.specialties.length > 0 ? (
            <ul className="flex flex-col divide-y divide-ink-100 dark:divide-white/10">
              {trainer.specialties.map((tag) => (
                <li key={tag} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    <Icon name="award" className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-ink-800 dark:text-ink-100">
                    {t('tabs.certified', { tag })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">{t('tabs.noCertifications')}</p>
          )}
        </div>
      </Card>

      <Card className="flex h-full flex-col gap-1 p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          {t('tabs.thisWeek')}
        </h3>
        <div className="mt-1 flex flex-col divide-y divide-ink-100 dark:divide-white/10">
          <WeekRow label={t('tabs.classesLed')} value={trainer.thisWeek.classesLed} />
          <WeekRow label={t('tabs.newReviews')} value={trainer.thisWeek.newReviews} />
          <WeekRow label={t('tabs.membersTrained')} value={trainer.thisWeek.membersTrained} />
        </div>
      </Card>
    </div>
  );
}

/** Schedule — the trainer's next class this cycle (real upcoming occurrence). */
function SchedulePanel({
  trainer,
  t,
  locale,
}: {
  trainer: AdminTrainerDetail;
  t: T;
  locale: string;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {t('tabs.nextClass')}
      </h3>
      {trainer.nextClass ? (
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Icon name="calendar" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-900 dark:text-white">
              {trainer.nextClass.title}
            </p>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {formatDateTime(trainer.nextClass.startsAt, locale)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-400">{t('tabs.noUpcomingClass')}</p>
      )}
      <p className="text-xs text-ink-500 dark:text-ink-400">
        {t.rich('tabs.scheduleCalendarNote', {
          count: trainer.classesThisWeek,
          link: (chunks) => (
            <Link
              href="/classes"
              className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </Card>
  );
}

/**
 * Clients — the schema has no personal-training relationship, so this states that
 * honestly rather than fabricating a client list or count.
 */
function ClientsPanel({ t }: { t: T }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-500 dark:bg-white/10 dark:text-ink-300">
        <Icon name="users" className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{t('tabs.clientsTitle')}</p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">{t('tabs.clientsBody')}</p>
    </Card>
  );
}

/** Reviews — the live aggregate + a link into the moderation queue. */
function ReviewsPanel({ trainer, t }: { trainer: AdminTrainerDetail; t: T }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Icon name="star" className="h-6 w-6 text-amber-500" />
          <span className="font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">
            {trainer.rating.toFixed(1)}
          </span>
        </div>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {t('tabs.reviewsSummary', {
            count: trainer.reviewCount,
            newReviews: trainer.thisWeek.newReviews,
          })}
        </p>
      </div>
      {trainer.reviewCount === 0 ? (
        <p className="text-sm text-ink-400">{t('tabs.noReviews')}</p>
      ) : (
        <p className="text-sm text-ink-500 dark:text-ink-400">{t('tabs.reviewsModerate')}</p>
      )}
    </Card>
  );
}

/** Availability — a link to the trainer's weekly availability editor. */
function AvailabilityPanel({ trainer, t }: { trainer: AdminTrainerDetail; t: T }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {t('tabs.weeklyAvailability')}
      </h3>
      <p className="text-sm text-ink-500 dark:text-ink-400">
        {t('tabs.availabilityBody', { name: trainer.name, count: trainer.classesThisWeek })}
      </p>
      <Link
        href={`/trainers/${trainer.id}/edit`}
        className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        {t('tabs.manageAvailability')}
      </Link>
    </Card>
  );
}
