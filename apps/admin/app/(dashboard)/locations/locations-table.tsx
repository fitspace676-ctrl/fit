'use client';

import { useEffect, useState, useTransition, type SVGProps } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminLocationRow, LocationStatus } from '@fit/types';
import { Badge, Btn, Card, Dot, Icon, type Tone } from '@/components/ui';
import { setLocationActiveAction } from './actions';

/** Visual treatment per location status — green active, ink inactive. */
const STATUS_STYLES: Record<LocationStatus, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', dot: 'bg-success-400' },
  INACTIVE: { label: 'Inactive', tone: 'ink', dot: 'bg-ink-400' },
};

/** The engine gradient shared by the primary surfaces (Planflow "formacore"). */
const ENGINE_GRADIENT = 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)]';

/** Stroke paths the shared icon set lacks, lifted from the reference artboard. */
const PATHS = {
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  phone:
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.9 2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.9.7 2 2 0 0 1 1.7 2Z',
} as const;

/** A one-off stroke icon on the same 24×24 grid as the shared set. */
function Stroke({
  d,
  className = 'h-4 w-4',
  sw = 2.1,
  ...rest
}: { d: string; sw?: number } & SVGProps<SVGSVGElement>) {
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
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** One row-menu / menu-item treatment, shared by the card menu's links + button. */
const MENU_ITEM =
  'flex h-9 items-center gap-2.5 rounded-btn px-2.5 text-left text-sm font-medium text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.06]';

/**
 * One location card in the image-led grid: the photo header (status badge, row
 * menu, name + address on a scrim), then the added date / phone row and the
 * amenity pills. The menu's write items only render for `LocationWrite` staff.
 */
function LocationCard({
  location,
  canWrite,
  menuOpen,
  pending,
  onToggleMenu,
  onCloseMenu,
  onSetActive,
}: {
  location: AdminLocationRow;
  canWrite: boolean;
  menuOpen: boolean;
  pending: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSetActive: () => void;
}) {
  const status = STATUS_STYLES[location.status];
  return (
    <Card className="flex flex-col">
      <div className="relative h-36">
        {location.photoUrl ? (
          <img
            src={location.photoUrl}
            alt={location.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className={`absolute inset-0 grid place-items-center ${ENGINE_GRADIENT}`}>
            <Icon name="pin" className="h-8 w-8 text-white/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/20 to-transparent" />

        <div className="absolute left-3 top-3">
          <Badge tone={status.tone}>
            <Dot c={status.dot} />
            {status.label}
          </Badge>
        </div>

        <div className="absolute right-2 top-2">
          <div className="relative flex justify-end">
            {canWrite ? (
              <button
                type="button"
                aria-label={`Actions for ${location.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={onToggleMenu}
                className="grid h-9 w-9 place-items-center rounded-btn bg-ink-950/30 text-white/90 backdrop-blur transition hover:bg-ink-950/50"
              >
                <Stroke d={PATHS.dots} className="h-5 w-5" />
              </button>
            ) : (
              <Link
                href={`/locations/${location.id}`}
                aria-label={`Open ${location.name}`}
                className="grid h-9 w-9 place-items-center rounded-btn bg-ink-950/30 text-white/90 backdrop-blur transition hover:bg-ink-950/50"
              >
                <Stroke d={PATHS.dots} className="h-5 w-5" />
              </Link>
            )}
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={onCloseMenu} />
                <div
                  role="menu"
                  className="absolute right-0 top-10 z-40 w-44 rounded-card bg-white p-1.5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.6)] ring-1 ring-ink-200 backdrop-blur-xl dark:bg-ink-900/95 dark:ring-white/10"
                >
                  <Link
                    role="menuitem"
                    href={`/locations/${location.id}/edit`}
                    onClick={onCloseMenu}
                    className={MENU_ITEM}
                  >
                    <Stroke d={PATHS.pencil} className="h-4 w-4" />
                    Edit details
                  </Link>
                  <Link
                    role="menuitem"
                    href={`/locations/${location.id}`}
                    onClick={onCloseMenu}
                    className={MENU_ITEM}
                  >
                    <Icon name="clock" className="h-4 w-4" />
                    Opening hours
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={onSetActive}
                    className={`${MENU_ITEM} w-full disabled:pointer-events-none disabled:opacity-40`}
                  >
                    <Icon name="check" className="h-4 w-4" />
                    {location.status === 'ACTIVE' ? 'Set as inactive' : 'Set as active'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="font-display text-lg font-extrabold tracking-tight text-white">
            <Link href={`/locations/${location.id}`} className="hover:text-brand-200">
              {location.name}
            </Link>
          </h3>
          {location.address ? (
            <p className="flex items-center gap-1.5 text-xs text-white/75">
              <Icon name="pin" className="h-3.5 w-3.5 shrink-0" sw={2} />
              {location.address}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-ink-600 dark:text-ink-300">
            <Icon name="calendar" className="h-4 w-4 text-ink-500 dark:text-ink-400" sw={2} />
            Added {formatDate(location.createdAt)}
          </span>
          {location.phone ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-600 dark:text-ink-300">
              <Stroke
                d={PATHS.phone}
                className="h-4 w-4 shrink-0 text-ink-500 dark:text-ink-400"
                sw={2}
              />
              <span className="truncate">{location.phone}</span>
            </span>
          ) : null}
        </div>

        {location.amenities.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {location.amenities.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-7 items-center rounded-pill bg-ink-50 px-2.5 text-[11px] font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.03] dark:text-ink-300 dark:ring-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * The locations grid (T4.5), reskinned to the Planflow "formacore" reference:
 * an image-led card per branch with a status badge, a row menu (edit / hours /
 * set active-inactive), the added date + phone, and the amenity pills. Server-
 * rendered data, client-side interaction: the menu's status toggle calls the
 * real Server Action and refreshes the route, and the pager reads/writes the
 * URL search params so the server page stays the single source of truth.
 */
export function LocationsGrid({
  locations,
  total,
  page,
  limit,
  canWrite,
}: {
  locations: AdminLocationRow[];
  total: number;
  page: number;
  limit: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [statusPending, startStatusTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // The open row menu closes on Escape, mirroring the reference artboard.
  useEffect(() => {
    if (menuFor === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuFor]);

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

  /** Deactivate / reactivate a branch via the real Server Action, then refresh. */
  function setActive(location: AdminLocationRow): void {
    setMenuFor(null);
    setActionError(null);
    startStatusTransition(async () => {
      const result = await setLocationActiveAction(location.id, location.status === 'INACTIVE');
      if (result.ok) {
        router.refresh();
      } else {
        setActionError(result.error);
      }
    });
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (locations.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-4 py-14 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon name="pin" className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium text-ink-700 dark:text-ink-200">No locations yet</p>
        <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
          {canWrite
            ? 'Add your first branch, or adjust the filters above.'
            : 'No locations match your filters yet.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {actionError ? (
        <Card className="bg-danger-50 px-3 py-2 dark:bg-danger-500/10">
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {actionError}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {locations.map((location) => (
          <LocationCard
            key={location.id}
            location={location}
            canWrite={canWrite}
            menuOpen={menuFor === location.id}
            pending={statusPending}
            onToggleMenu={() => setMenuFor(menuFor === location.id ? null : location.id)}
            onCloseMenu={() => setMenuFor(null)}
            onSetActive={() => setActive(location)}
          />
        ))}
      </div>

      {/* Pager — only when the roster spills past one page. */}
      {total > limit ? (
        <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
          <span className="font-mono tabular-nums">
            Showing {from}–{to} of {total} locations
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
      ) : null}
    </div>
  );
}
