import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocation } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { LocationForm } from '../../location-form';

export const metadata: Metadata = {
  title: 'Edit location — Fit Admin',
};

// Reflects the staff session and writes live location state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-location page (T4.5). Like {@link NewLocationPage} it gates on the
 * `LocationWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link LocationForm} prefilled from `GET /admin/locations/:id`. A `404`
 * from the API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.LocationWrite)) {
    redirect('/403');
  }

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

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/locations/${id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        ← Back to location
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Edit location
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Update {location.name}’s details, hours, amenities, and photo.
        </p>
      </header>

      <LocationForm
        mode="edit"
        locationId={id}
        initial={{
          name: location.name,
          address: location.address,
          phone: location.phone,
          photoUrl: location.photoUrl,
          amenities: location.amenities,
          hours: location.hours,
        }}
      />
    </div>
  );
}
