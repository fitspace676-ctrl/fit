import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, WEEKDAYS, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocation } from '@/lib/api';
import { formatDayHours, weekdayLabel } from '../format-hours';
import { LocationActions } from './location-actions';

export const metadata: Metadata = {
  title: 'Location — Fit Admin',
};

// The detail reflects live location state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { label: 'Inactive', className: 'bg-slate-100 text-slate-600' },
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
        <Link href="/locations" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to locations
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  const status = STATUS_LABELS[location.status] ?? {
    label: location.status,
    className: 'bg-slate-100 text-slate-600',
  };

  // Write controls (edit + deactivate) are a `LocationWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.LocationWrite);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/locations" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to locations
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{location.name}</h1>
            <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
          {location.address ? <p className="text-sm text-slate-500">{location.address}</p> : null}
          {location.phone ? <p className="text-sm text-slate-500">{location.phone}</p> : null}
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
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Amenities</h2>
        {location.amenities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {location.amenities.map((tag) => (
              <span
                key={tag}
                className="rounded-card bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No amenities listed.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Opening hours</h2>
        <dl className="max-w-sm divide-y divide-slate-100 rounded-card border border-slate-200">
          {WEEKDAYS.map((day) => (
            <div key={day} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <dt className="text-slate-600">{weekdayLabel(day)}</dt>
              <dd
                className={
                  location.hours[day].closed
                    ? 'text-slate-400'
                    : 'tabular-nums font-medium text-slate-800'
                }
              >
                {formatDayHours(location.hours[day])}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-slate-400">Added {formatDate(location.createdAt)}.</p>
    </div>
  );
}
