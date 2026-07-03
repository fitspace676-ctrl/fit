'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminPackagePlanRow, PackagePlanStatus } from '@fit/types';
import { Badge, Btn, Card, Icon, Switch } from '@/components/ui';
import { formatPrice, intervalSuffix, sessionLabel } from './format';
import { setPackagePlanActiveAction } from './actions';

/**
 * Extra stroke glyphs the plan cards need beyond the shared icon set (kebab
 * menu, edit pencil, archive box, unlimited-sessions infinity). Same 24×24
 * Lucide-style grid as `components/ui/icon`, kept local to the billing screens.
 */
const GLYPHS = {
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  archive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M9 12h6',
  infinity:
    'M6.5 9a3.5 3.5 0 1 0 0 6c2 0 3.5-3 5.5-3s4 3 5.5 3a3.5 3.5 0 1 0 0-6c-2 0-3.5 3-5.5 3S8.5 9 6.5 9Z',
} as const;

/** Render one local glyph as a stroke SVG (mirrors the shared `Icon`). */
function Glyph({
  d,
  className = 'h-5 w-5',
  sw = 2.1,
}: {
  d: string;
  className?: string;
  sw?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The reference design gives every plan card an accent tone (a small colour
 * square + a soft glow). The schema carries no colour, so tones are assigned
 * deterministically by row position; archived plans always read as slate.
 * Full literal class strings so Tailwind can see them.
 */
const CARD_TONES: ReadonlyArray<{ dot: string; glow: string | null }> = [
  { dot: 'bg-iris-500', glow: 'bg-iris-500/15' },
  { dot: 'bg-accent-500', glow: 'bg-accent-500/15' },
  { dot: 'bg-brand-500', glow: 'bg-brand-500/15' },
  { dot: 'bg-success-500', glow: 'bg-success-500/15' },
];
const INK_TONE = { dot: 'bg-ink-500', glow: null } as const;

/** The status segments, mapped to the `status` URL param the server page reads. */
const SEGMENTS: ReadonlyArray<{ label: string; status: PackagePlanStatus | '' }> = [
  { label: 'All', status: '' },
  { label: 'Active', status: 'ACTIVE' },
  { label: 'Archived', status: 'INACTIVE' },
];

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * One PT-package plan card, matching the reference "Billing" plan card: tone dot
 * + title + Popular badge, a kebab menu (edit / archive), the display price with
 * its cadence suffix, the session allowance line, and a footer of mini stats
 * plus the Live/Off switch. The switch and the menu's archive item both go
 * through the real {@link setPackagePlanActiveAction}; read-only staff see no
 * write controls.
 */
function PlanCard({
  plan,
  tone,
  canWrite,
  menuOpen,
  onToggleMenu,
}: {
  plan: AdminPackagePlanRow;
  tone: { dot: string; glow: string | null };
  canWrite: boolean;
  menuOpen: boolean;
  onToggleMenu: (id: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isActive = plan.status === 'ACTIVE';

  function setActive(next: boolean): void {
    if (pending) return;
    setError(null);
    onToggleMenu(null);
    startTransition(async () => {
      const result = await setPackagePlanActiveAction(plan.id, next);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card
      glow
      className={`flex flex-col p-5 transition dark:hover:bg-white/[0.06] ${!isActive ? 'opacity-75' : ''}`}
    >
      {tone.glow ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute -top-14 right-0 h-28 w-40 blur-3xl ${tone.glow}`}
        />
      ) : null}

      {/* Title row + kebab menu. */}
      <div className="relative flex items-start justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${tone.dot}`} />
          <Link
            href={`/packages/${plan.id}`}
            className="font-display text-lg font-bold tracking-tight text-ink-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-300"
          >
            {plan.name}
          </Link>
          {plan.popular ? <Badge tone="iris">Popular</Badge> : null}
        </div>
        {canWrite ? (
          <div className="relative">
            <button
              type="button"
              aria-label={`More actions for ${plan.name}`}
              aria-expanded={menuOpen}
              onClick={() => onToggleMenu(menuOpen ? null : plan.id)}
              className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
            >
              <Glyph d={GLYPHS.dots} className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => onToggleMenu(null)} />
                <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-card bg-white p-1.5 shadow-[0_30px_70px_-16px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-ink-200 dark:bg-ink-900/95 dark:ring-white/10">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-white/25 to-transparent dark:block"
                  />
                  <Link
                    href={`/packages/${plan.id}/edit`}
                    className="flex h-9 w-full items-center gap-3 rounded-btn px-2.5 text-sm font-semibold text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]"
                  >
                    <Glyph d={GLYPHS.pencil} className="h-[18px] w-[18px]" sw={2} />
                    Edit plan
                  </Link>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setActive(!isActive)}
                    className="flex h-9 w-full items-center gap-3 rounded-btn px-2.5 text-sm font-semibold text-ink-600 transition hover:bg-ink-100 disabled:opacity-40 dark:text-ink-300 dark:hover:bg-white/[0.06]"
                  >
                    <Glyph d={GLYPHS.archive} className="h-[18px] w-[18px]" sw={2} />
                    {isActive ? 'Archive' : 'Restore'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Price + session allowance. */}
      <div className="relative mt-3 flex items-end gap-1">
        <span className="font-display text-3xl font-black tabular-nums tracking-tight text-ink-900 dark:text-white">
          {formatPrice(plan.priceAmount, plan.currency)}
        </span>
        <span className="mb-1 text-sm font-semibold text-ink-500 dark:text-ink-400">
          {intervalSuffix(plan.billingInterval)}
        </span>
      </div>
      <div className="relative mt-1 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
        {plan.sessionCount === null ? (
          <Glyph
            d={GLYPHS.infinity}
            className="h-4 w-4 text-brand-600 dark:text-brand-300"
            sw={2}
          />
        ) : (
          <Icon name="ticket" className="h-4 w-4 text-brand-600 dark:text-brand-300" sw={2} />
        )}
        {sessionLabel(plan.sessionCount)}
      </div>

      {/* Footer stats + live switch. */}
      <div className="relative mt-4 flex flex-1 items-end gap-3 border-t border-ink-200 pt-4 dark:border-white/10">
        <div>
          <div className="font-display text-base font-extrabold tabular-nums text-ink-900 dark:text-white">
            {plan.featureCount}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
            {plan.featureCount === 1 ? 'feature' : 'features'}
          </div>
        </div>
        <div className="border-l border-ink-200 pl-3 dark:border-white/10">
          <div className="font-display text-base font-extrabold tabular-nums text-ink-900 dark:text-white">
            {formatDate(plan.createdAt)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
            added
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`text-xs font-semibold ${
              isActive ? 'text-success-700 dark:text-success-300' : 'text-ink-400 dark:text-ink-500'
            }`}
          >
            {isActive ? 'Live' : 'Off'}
          </span>
          {canWrite ? (
            <Switch
              checked={isActive}
              onChange={(next) => setActive(next)}
              label={`${plan.name} is ${isActive ? 'live' : 'off'}`}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="relative mt-2 text-xs text-danger-600 dark:text-danger-300">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * The package-plans roster (T4.11), reskinned from a table to the reference
 * "Billing" card grid. Server-rendered data, client-side interaction: the
 * Active/Archived segmented control and pagination read/write the URL search
 * params so the server page stays the single source of truth, while each card's
 * Live switch and kebab menu call the real lifecycle Server Action.
 */
export function PackagePlansTable({
  plans,
  total,
  page,
  limit,
  status,
  canWrite,
}: {
  plans: AdminPackagePlanRow[];
  total: number;
  page: number;
  limit: number;
  status: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  /** Navigate to a status segment, always resetting to page 1. */
  function selectSegment(next: PackagePlanStatus | ''): void {
    setMenuFor(null);
    startTransition(() => router.replace(hrefWith({ status: next, page: '' })));
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  // Cycle the accent tones by row position; archived plans read as slate.
  let colourIndex = 0;
  const toneFor = (plan: AdminPackagePlanRow) =>
    plan.status === 'ACTIVE' ? CARD_TONES[colourIndex++ % CARD_TONES.length]! : INK_TONE;

  const emptyCopy =
    status === 'INACTIVE'
      ? 'Archived packages will appear here.'
      : status === 'ACTIVE'
        ? 'Create your first package to start selling personal training.'
        : 'No packages match your filters yet.';

  return (
    <div className="flex flex-col gap-5">
      {/* Segmented status control + plan count. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter packages by status"
          className="inline-flex rounded-btn bg-ink-100 p-1 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.06] dark:ring-white/10"
        >
          {SEGMENTS.map((segment) => {
            const active = segment.status === status;
            return (
              <button
                key={segment.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectSegment(segment.status)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-[7px] px-3.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-white text-ink-900 shadow-sm dark:text-ink-950'
                    : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
                }`}
              >
                {segment.label}
                {active ? (
                  <span className="font-mono text-[11px] tabular-nums text-ink-400 dark:text-ink-500">
                    {total}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">
          {total} {total === 1 ? 'package' : 'packages'}
        </span>
      </div>

      {/* Plan cards. */}
      {plans.length === 0 ? (
        <Card glow className="py-16 text-center">
          <Glyph
            d={GLYPHS.archive}
            className="mx-auto h-9 w-9 text-ink-400 dark:text-ink-500"
            sw={1.8}
          />
          <p className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-white">
            No {status === 'INACTIVE' ? 'archived' : status === 'ACTIVE' ? 'active' : ''} packages
          </p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{emptyCopy}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              tone={toneFor(plan)}
              canWrite={canWrite}
              menuOpen={menuFor === plan.id}
              onToggleMenu={setMenuFor}
            />
          ))}
        </div>
      )}

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            icon="chevronLeft"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
          >
            Previous
          </Btn>
          <Btn
            v="outline"
            size="sm"
            iconRight="chevronRight"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
          >
            Next
          </Btn>
        </div>
      </div>
    </div>
  );
}
