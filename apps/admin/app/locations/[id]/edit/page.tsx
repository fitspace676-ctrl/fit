import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocation } from '@/lib/api';
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
        <Link href="/locations" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to locations
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/locations/${id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to location
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit location</h1>
        <p className="text-sm text-slate-500">
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
