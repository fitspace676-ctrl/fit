'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminTrainerRow, AdminTrainerSummary, TrainerStatus } from '@fit/types';
import { Badge, Btn, Card, CountUp, Dot, Icon, type IconName, type Tone } from '@/components/ui';

/** Visual treatment per trainer status — success active, warning on leave. */
const STATUS_STYLES: Record<TrainerStatus, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', dot: 'bg-success-400' },
  INACTIVE: { label: 'On leave', tone: 'warning', dot: 'bg-warning-400' },
};

/** The soft inset tile/chip surface (Planflow "formacore" `soft`). */
const SOFT = 'bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:ring-white/10';

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

/** One roster KPI card — toned icon, animated headline value, micro label. */
function KpiCard({
  label,
  value,
  icon,
  tone,
  decimals = false,
}: {
  label: string;
  value: number;
  icon: IconName;
  tone: string;
  decimals?: boolean;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <Icon name={icon} className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {decimals ? value.toFixed(1) : <CountUp to={value} />}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
    </Card>
  );
}

/** A compact stat tile inside a trainer card (Classes / wk · Reviews). */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={`rounded-card p-2.5 ${SOFT}`}>
      <p className="font-display text-lg font-extrabold tabular-nums text-ink-900 dark:text-white">
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
    </div>
  );
}

/** A single trainer card in the roster grid. */
function TrainerCard({ trainer }: { trainer: AdminTrainerRow }) {
  const status = STATUS_STYLES[trainer.status];
  return (
    <Card className="p-5 transition-colors dark:hover:bg-white/[0.06]">
      <div className="flex items-start gap-3.5">
        <Link href={`/trainers/${trainer.id}`} className="shrink-0">
          {trainer.photoUrl ? (
            <img
              src={trainer.photoUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:bg-brand-500/15 dark:text-brand-200 dark:ring-offset-ink-950">
              {initialsOf(trainer.name)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/trainers/${trainer.id}`}
            className="block truncate font-display text-base font-bold tracking-tight text-ink-900 transition-colors hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
          >
            {trainer.name}
          </Link>
          {trainer.headline ? (
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{trainer.headline}</p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-warning-600 dark:text-warning-300">
              <Icon name="star" className="h-3.5 w-3.5" sw={1.8} />
              {trainer.rating.toFixed(1)}
            </span>
            <span className="font-mono text-[11px] text-ink-400 dark:text-ink-500">
              · {trainer.reviewCount} {trainer.reviewCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={status.tone}>
            <Dot c={status.dot} className="mr-1.5" />
            {status.label}
          </Badge>
          <Link
            href={`/trainers/${trainer.id}`}
            aria-label={`Open ${trainer.name}`}
            className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <span aria-hidden className="text-lg leading-none">
              ⋯
            </span>
          </Link>
        </div>
      </div>

      {trainer.specialties.length > 0 ? (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {trainer.specialties.map((tag) => (
            <span
              key={tag}
              className={`inline-flex h-6 items-center rounded-pill px-2 text-[11px] font-semibold text-ink-600 dark:text-ink-300 ${SOFT}`}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <StatTile label="Classes / wk" value={String(trainer.classesThisWeek)} />
        <StatTile label="Reviews" value={String(trainer.reviewCount)} />
      </div>

      <div className="mt-3.5 flex items-center gap-2 border-t border-ink-200 pt-3.5 dark:border-white/10">
        <Icon
          name="calendar"
          className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
          sw={2}
        />
        <span className="truncate text-xs text-ink-500 dark:text-ink-400">
          {trainer.nextClass
            ? `${formatNextClass(trainer.nextClass.startsAt)} · ${trainer.nextClass.title}`
            : 'No upcoming class'}
        </span>
        <Link
          href={`/trainers/${trainer.id}`}
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600 transition-opacity hover:opacity-80 dark:text-brand-300"
        >
          View
          <Icon name="arrow" className="h-3.5 w-3.5" sw={2.2} />
        </Link>
      </div>
    </Card>
  );
}

/**
 * The trainers roster (client): the four gym-wide KPI cards, a specialty
 * segmented filter + search, and the responsive card grid with a pager. The KPI
 * figures and each card's live numbers are backed by real tenant-scoped queries
 * (they arrive on the server response). The specialty segment + search filter the
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
    <div className="flex flex-col gap-5">
      {/* Gym-wide KPI cards — real aggregates over the whole filtered roster. */}
      <section aria-label="Roster metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Trainers" value={summary.total} icon="users" tone="text-brand-400" />
        <KpiCard
          label="Classes / week"
          value={summary.classesPerWeek}
          icon="calendar"
          tone="text-accent-400"
        />
        <KpiCard
          label="Avg rating"
          value={summary.avgRating}
          icon="star"
          tone="text-warning-400"
          decimals
        />
        <KpiCard
          label="Reviews"
          value={trainers.reduce((sum, t) => sum + t.reviewCount, 0)}
          icon="message"
          tone="text-iris-400"
        />
      </section>

      {/* Specialty segment + search. */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filter by specialty"
          className="inline-flex overflow-x-auto rounded-btn bg-ink-100 p-1 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.06] dark:ring-white/10"
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
                className={`h-9 whitespace-nowrap rounded-[7px] px-3.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-white text-ink-900 shadow-sm dark:text-ink-950 dark:shadow-none'
                    : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex h-10 w-full items-center gap-2.5 rounded-field bg-ink-50 px-3.5 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:ring-white/10 sm:w-64">
          <label htmlFor="trainer-search" className="sr-only">
            Search trainers by name or headline
          </label>
          <Icon
            name="search"
            className="h-[18px] w-[18px] shrink-0 text-ink-500 dark:text-ink-400"
            sw={2}
          />
          <input
            id="trainer-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search trainers…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-white dark:placeholder:text-ink-500"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="text-ink-400 transition-colors hover:text-ink-900 dark:text-ink-500 dark:hover:text-white"
            >
              <Icon name="x" className="h-4 w-4" sw={2.2} />
            </button>
          ) : null}
        </div>
      </div>

      {/* The trainer card grid. */}
      {trainers.length === 0 ? (
        <Card className="px-4 py-16 text-center">
          <Icon name="users" className="mx-auto h-9 w-9 text-ink-400 dark:text-ink-500" sw={1.8} />
          <p className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-white">
            No trainers yet
          </p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {canWrite
              ? 'Add your first coach to build the roster.'
              : 'Your gym has no trainers on the roster yet.'}
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="px-4 py-16 text-center">
          <Icon name="search" className="mx-auto h-9 w-9 text-ink-400 dark:text-ink-500" sw={1.8} />
          <p className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-white">
            No trainers found
          </p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Try another specialty or search term.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
