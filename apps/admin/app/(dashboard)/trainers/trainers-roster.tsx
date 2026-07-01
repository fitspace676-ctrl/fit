'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminTrainerRow, AdminTrainerSummary, TrainerStatus } from '@fit/types';
import { Badge, Btn, Card, CountUp, Icon, type IconName, type Tone } from '@/components/ui';

/** Visual treatment per trainer status — success active, ink inactive. */
const STATUS_STYLES: Record<TrainerStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'On leave', tone: 'warning' },
};

/** The engine gradient shared by the primary controls (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Format an upcoming class instant into the card's "next class" footer, e.g.
 * "Today 18:00", "Tomorrow 07:30", or "Mon 18:00". Local to the staff member.
 */
function formatNextClass(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  const day =
    dayDiff === 0
      ? 'Today'
      : dayDiff === 1
        ? 'Tomorrow'
        : date.toLocaleDateString(undefined, { weekday: 'short' });
  return `${day} ${time}`;
}

/** One roster KPI card — icon tile, animated headline value, label, and context. */
function KpiCard({
  label,
  value,
  context,
  icon,
  decimals = false,
}: {
  label: string;
  value: number;
  context: string;
  icon: IconName;
  decimals?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {decimals ? value.toFixed(1) : <CountUp to={value} />}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 text-xs tabular-nums text-ink-500 dark:text-ink-400">{context}</p>
    </Card>
  );
}

/** A compact stat tile inside a trainer card (Classes / wk · PT clients). */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-btn border border-ink-100 bg-ink-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="font-display text-lg font-extrabold tabular-nums leading-none text-ink-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        {label}
      </p>
    </div>
  );
}

/** A single trainer card in the 2-up grid. */
function TrainerCard({ trainer }: { trainer: AdminTrainerRow }) {
  const status = STATUS_STYLES[trainer.status];
  return (
    <Card className="flex flex-col gap-4 p-5 transition-colors hover:border-brand-300 dark:hover:border-brand-500/50">
      <div className="flex items-start gap-3">
        {trainer.photoUrl ? (
          <img
            src={trainer.photoUrl}
            alt=""
            className="h-12 w-12 rounded-full object-cover ring-1 ring-ink-200 dark:ring-white/10"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
            {initialsOf(trainer.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/trainers/${trainer.id}`}
              className="truncate font-semibold text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
            >
              {trainer.name}
            </Link>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {trainer.headline ? (
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{trainer.headline}</p>
          ) : null}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
            <Icon name="star" className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-semibold tabular-nums text-ink-700 dark:text-ink-200">
              {trainer.rating.toFixed(1)}
            </span>
            <span>
              · {trainer.reviewCount} {trainer.reviewCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>
        </div>
        <Link
          href={`/trainers/${trainer.id}`}
          aria-label={`Open ${trainer.name}`}
          className="grid h-8 w-8 place-items-center rounded-btn text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <span aria-hidden className="text-lg leading-none">
            ⋯
          </span>
        </Link>
      </div>

      {trainer.specialties.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {trainer.specialties.map((tag) => (
            <span
              key={tag}
              className="rounded-pill bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 dark:bg-white/10 dark:text-ink-300"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Classes / wk" value={String(trainer.classesThisWeek)} />
        <StatTile label="Reviews" value={String(trainer.reviewCount)} />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-3 text-xs dark:border-white/10">
        <span className="flex items-center gap-1.5 text-ink-500 dark:text-ink-400">
          <Icon name="calendar" className="h-3.5 w-3.5" />
          {trainer.nextClass ? (
            <span className="truncate">
              {formatNextClass(trainer.nextClass.startsAt)} · {trainer.nextClass.title}
            </span>
          ) : (
            <span>No upcoming class</span>
          )}
        </span>
        <Link
          href={`/trainers/${trainer.id}`}
          className="shrink-0 font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          View →
        </Link>
      </div>
    </Card>
  );
}

/**
 * The trainers roster (client): the four gym-wide KPI cards, a specialty
 * segmented filter + search, and the 2-up card grid with a pager. The KPI figures
 * and each card's live numbers are backed by real tenant-scoped queries (they
 * arrive on the server response). The specialty segment + search filter the
 * *current page* client-side over real specialties; sort/pagination stay on the
 * server via the URL. Renders correctly with an empty roster.
 */
export function TrainersRoster({
  trainers,
  summary,
  total,
  page,
  limit,
  canWrite,
}: {
  trainers: AdminTrainerRow[];
  summary: AdminTrainerSummary;
  total: number;
  page: number;
  limit: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [specialty, setSpecialty] = useState<string>('All');
  const [search, setSearch] = useState('');

  // The segment options are the real specialties present on this page, so nothing
  // is hardcoded — "All" plus each distinct tag, in first-seen order.
  const specialties = useMemo(() => {
    const seen: string[] = [];
    for (const trainer of trainers) {
      for (const tag of trainer.specialties) {
        if (!seen.includes(tag)) seen.push(tag);
      }
    }
    return ['All', ...seen];
  }, [trainers]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return trainers.filter((trainer) => {
      const matchesSpecialty = specialty === 'All' || trainer.specialties.includes(specialty);
      const matchesSearch =
        needle === '' ||
        trainer.name.toLowerCase().includes(needle) ||
        trainer.headline.toLowerCase().includes(needle);
      return matchesSpecialty && matchesSearch;
    });
  }, [trainers, specialty, search]);

  function pageHref(next: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div className="flex flex-col gap-6">
      {/* Gym-wide KPI cards — real aggregates over the whole filtered roster. */}
      <section
        aria-label="Roster metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="Trainers"
          value={summary.total}
          context={`${summary.active} active`}
          icon="users"
        />
        <KpiCard
          label="Classes / week"
          value={summary.classesPerWeek}
          context="across the roster"
          icon="calendar"
        />
        <KpiCard
          label="Avg rating"
          value={summary.avgRating}
          context="from member reviews"
          icon="star"
          decimals
        />
        <KpiCard
          label="Reviews"
          value={trainers.reduce((sum, t) => sum + t.reviewCount, 0)}
          context="on this page"
          icon="message"
        />
      </section>

      {/* Specialty segment + search. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filter by specialty"
          className="inline-flex flex-wrap gap-1 rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
        >
          {specialties.map((option) => {
            const active = option === specialty;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSpecialty(option)}
                className={`rounded-btn px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? `${ENGINE_GRADIENT} text-white shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]`
                    : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>

        <div className="relative lg:w-72">
          <label htmlFor="trainer-search" className="sr-only">
            Search trainers by name or headline
          </label>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            id="trainer-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search coaches…"
            className="h-11 w-full rounded-field border border-ink-200 bg-white pl-9 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
      </div>

      {/* The 2-up card grid. */}
      {trainers.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Icon name="users" className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-ink-700 dark:text-ink-200">No trainers yet</p>
          <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
            {canWrite
              ? 'Add your first coach to build the roster.'
              : 'Your gym has no trainers on the roster yet.'}
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400">
          No coaches match this filter.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((trainer) => (
            <TrainerCard key={trainer.id} trainer={trainer} />
          ))}
        </div>
      )}

      {/* Server-side pager (the search/segment are client-side over this page). */}
      {total > limit ? (
        <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
          <span className="font-mono tabular-nums">
            {from}–{to} of {total}
          </span>
          <div className="flex gap-2">
            <Btn
              v="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => startTransition(() => router.replace(pageHref(page - 1)))}
            >
              Previous
            </Btn>
            <Btn
              v="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => startTransition(() => router.replace(pageHref(page + 1)))}
            >
              Next
            </Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}
