'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminTrainerDetail } from '@fit/types';
import { Card, Icon, type IconName } from '@/components/ui';

/** The detail tabs, matching the Planflow "formacore" reference order. */
const TABS = ['Overview', 'Schedule', 'Clients', 'Reviews', 'Availability'] as const;
type Tab = (typeof TABS)[number];

/** The engine gradient shared by the primary controls (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** The soft inset tile/chip surface (Planflow "formacore" `soft`). */
const SOFT = 'bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10';

/** The section micro-label (Specialties / Certifications / …). */
const SECTION_LABEL =
  'text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400';

/** The card heading (About / This week / …). */
const CARD_HEADING = 'font-display text-base font-bold tracking-tight text-ink-900 dark:text-white';

/** Format an ISO instant as a local "HH:MM" + short weekday pair, or null. */
function timeAndDay(iso: string): { time: string; day: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    day: date.toLocaleDateString(undefined, { weekday: 'short' }),
  };
}

/** One "This week" row in the Overview side card. */
function WeekRow({ label, value, icon }: { label: string; value: number; icon: IconName }) {
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} className="h-5 w-5 text-brand-600 dark:text-brand-300" sw={2} />
      <span className="flex-1 text-sm text-ink-600 dark:text-ink-300">{label}</span>
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
  const [active, setActive] = useState<Tab>('Overview');

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        className="flex items-center gap-1 overflow-x-auto border-b border-ink-200 dark:border-white/10"
      >
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              className={`relative h-11 shrink-0 whitespace-nowrap px-4 text-sm font-semibold transition-colors ${
                isActive
                  ? 'text-ink-900 dark:text-white'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
              }`}
            >
              {tab}
              {isActive ? (
                <span
                  aria-hidden
                  className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full ${ENGINE_GRADIENT}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {active === 'Overview' && <OverviewPanel trainer={trainer} />}
        {active === 'Schedule' && <SchedulePanel trainer={trainer} />}
        {active === 'Clients' && <ClientsPanel />}
        {active === 'Reviews' && <ReviewsPanel trainer={trainer} />}
        {active === 'Availability' && <AvailabilityPanel trainer={trainer} />}
      </div>
    </div>
  );
}

/** Overview — the About card plus the "This week" side card. */
function OverviewPanel({ trainer }: { trainer: AdminTrainerDetail }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 sm:gap-5">
      <Card className="p-5 sm:p-6 lg:col-span-2">
        <h3 className={CARD_HEADING}>About</h3>
        {trainer.bio ? (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            {trainer.bio}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-400">No bio yet.</p>
        )}

        <p className={`mt-5 mb-2 ${SECTION_LABEL}`}>Specialties</p>
        {trainer.specialties.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {trainer.specialties.map((tag) => (
              <span
                key={tag}
                className={`inline-flex h-8 items-center rounded-pill px-3 text-xs font-semibold text-ink-600 dark:text-ink-300 ${SOFT}`}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">No specialties listed.</p>
        )}

        <p className={`mt-5 mb-2 ${SECTION_LABEL}`}>Certifications</p>
        {trainer.specialties.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {trainer.specialties.map((tag) => (
              <div key={tag} className={`flex items-center gap-2.5 rounded-card p-3 ${SOFT}`}>
                <Icon
                  name="award"
                  className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300"
                  sw={2}
                />
                <span className="text-sm font-medium text-ink-900 dark:text-white">
                  Certified · {tag}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">
            No certifications recorded — this gym tracks specialties, not formal certificates.
          </p>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className={CARD_HEADING}>This week</h3>
        <div className="mt-4 space-y-3">
          <WeekRow label="Classes led" value={trainer.thisWeek.classesLed} icon="calendar" />
          <WeekRow label="New reviews" value={trainer.thisWeek.newReviews} icon="star" />
          <WeekRow label="Members trained" value={trainer.thisWeek.membersTrained} icon="users" />
        </div>
      </Card>
    </div>
  );
}

/** Schedule — the trainer's next class this cycle (real upcoming occurrence). */
function SchedulePanel({ trainer }: { trainer: AdminTrainerDetail }) {
  const next = trainer.nextClass ? timeAndDay(trainer.nextClass.startsAt) : null;
  return (
    <Card className="p-2">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h3 className={CARD_HEADING}>This week&rsquo;s classes</h3>
        <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
          {trainer.classesThisWeek} {trainer.classesThisWeek === 1 ? 'session' : 'sessions'}
        </span>
      </div>
      {trainer.nextClass && next ? (
        <div className="flex items-center gap-3.5 rounded-btn px-3 py-3 transition-colors hover:bg-ink-50 dark:hover:bg-white/[0.04]">
          <div className="w-14 shrink-0 text-center">
            <div className="font-mono text-sm font-bold text-ink-900 dark:text-white">
              {next.time}
            </div>
            <div className="font-mono text-[10px] text-ink-400 dark:text-ink-500">{next.day}</div>
          </div>
          <div className="w-1 self-stretch rounded-full bg-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900 dark:text-white">
              {trainer.nextClass.title}
            </p>
            <p className="text-xs text-ink-500 dark:text-ink-400">Next class</p>
          </div>
        </div>
      ) : (
        <p className="px-3 py-3 text-sm text-ink-400">No upcoming class scheduled.</p>
      )}
      <p className="px-3 pb-3 pt-1 text-xs text-ink-500 dark:text-ink-400">
        {trainer.classesThisWeek} {trainer.classesThisWeek === 1 ? 'class' : 'classes'} on the
        calendar this week. Manage the full timetable from{' '}
        <Link
          href="/classes"
          className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          Classes
        </Link>
        .
      </p>
    </Card>
  );
}

/**
 * Clients — the schema has no personal-training relationship, so this states that
 * honestly rather than fabricating a client list or count.
 */
function ClientsPanel() {
  return (
    <Card className="px-4 py-16 text-center">
      <Icon name="users" className="mx-auto h-9 w-9 text-ink-400 dark:text-ink-500" sw={1.8} />
      <p className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-white">
        Personal-training clients aren&rsquo;t tracked yet
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">
        This gym doesn&rsquo;t model one-to-one PT relationships, so there&rsquo;s no client roster
        to show here.
      </p>
    </Card>
  );
}

/** Reviews — the live aggregate + a link into the moderation queue. */
function ReviewsPanel({ trainer }: { trainer: AdminTrainerDetail }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="text-center">
        <div className="font-display text-5xl font-black tabular-nums text-ink-900 dark:text-white">
          {trainer.rating.toFixed(1)}
        </div>
        <div className="mt-2 flex items-center justify-center gap-0.5 text-warning-400">
          {[0, 1, 2, 3, 4].map((i) => (
            <Icon key={i} name="star" className="h-4 w-4" sw={1.6} />
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
          {trainer.reviewCount} member {trainer.reviewCount === 1 ? 'review' : 'reviews'} ·{' '}
          {trainer.thisWeek.newReviews} new this week
        </p>
      </div>
      {trainer.reviewCount === 0 ? (
        <p className="mt-5 text-center text-sm text-ink-400">No reviews yet.</p>
      ) : (
        <p className="mt-5 text-center text-sm text-ink-500 dark:text-ink-400">
          Read and moderate individual reviews from the trainer&rsquo;s review queue.
        </p>
      )}
    </Card>
  );
}

/** Availability — a link to the trainer's weekly availability editor. */
function AvailabilityPanel({ trainer }: { trainer: AdminTrainerDetail }) {
  return (
    <Card className="p-5 sm:p-6">
      <h3 className={CARD_HEADING}>Weekly availability</h3>
      <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
        {trainer.name} teaches {trainer.classesThisWeek}{' '}
        {trainer.classesThisWeek === 1 ? 'class' : 'classes'} this week. Set the recurring hours
        they can coach from the availability editor.
      </p>
      <Link
        href={`/trainers/${trainer.id}/edit`}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-opacity hover:opacity-80 dark:text-brand-300"
      >
        Manage availability
        <Icon name="arrow" className="h-3.5 w-3.5" sw={2.2} />
      </Link>
    </Card>
  );
}
