import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, WEEKDAYS, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocation } from '@/lib/api';
import { Badge, Card, Icon, type Tone } from '@/components/ui';
import { formatDayHours, weekdayLabel } from '../format-hours';
import { LocationActions } from './location-actions';

export const metadata: Metadata = {
  title: 'Location — Fit Admin',
};

// The detail reflects live location state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The location detail page (T4.5). Server-fetches `GET /admin/locations/:id` and
 * renders the identity header (name + status), the photo, contact + address, the
 * amenities chips, and the weekly opening hours table, plus the write controls for
 * `LocationWrite` staff. A `404` from the API — unknown or cross-tenant id —
 * becomes Next's `notFound()`; any other failure surfaces inline.
 */
export default async function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let location;
  try {
    location = await fetchLocation(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this location (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/locations"
          className="text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          ← Back to locations
        </Link>
        <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {message}
          </p>
        </Card>
      </div>
    );
  }

  const status = STATUS_LABELS[location.status] ?? {
    label: location.status,
    tone: 'ink' as Tone,
  };

  // Write controls (edit + deactivate) are a `LocationWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.LocationWrite);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/locations"
        className="text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        ← Back to locations
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              {location.name}
            </h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {location.address ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">{location.address}</p>
          ) : null}
          {location.phone ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">{location.phone}</p>
          ) : null}
        </div>
        {canWrite ? <LocationActions locationId={location.id} status={location.status} /> : null}
      </header>

      {location.photoUrl ? (
        <img
          src={location.photoUrl}
          alt={`${location.name} photo`}
          className="max-h-64 w-full max-w-xl rounded-card object-cover"
        />
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          Amenities
        </h2>
        {location.amenities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {location.amenities.map((tag) => (
              <span
                key={tag}
                className="rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-white/10 dark:text-ink-300"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">No amenities listed.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          Opening hours
        </h2>
        <dl className="max-w-sm divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200 bg-white shadow-[0_14px_40px_-18px_rgba(0,0,0,0.18)] dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.035] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] dark:backdrop-blur-xl">
          {WEEKDAYS.map((day) => (
            <div key={day} className="flex items-center justify-between px-3.5 py-2 text-sm">
              <dt className="text-ink-600 dark:text-ink-300">{weekdayLabel(day)}</dt>
              <dd
                className={
                  location.hours[day].closed
                    ? 'text-ink-400'
                    : 'font-mono font-medium tabular-nums text-ink-800 dark:text-ink-100'
                }
              >
                {formatDayHours(location.hours[day])}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-ink-400">Added {formatDate(location.createdAt)}.</p>
    </div>
  );
}
