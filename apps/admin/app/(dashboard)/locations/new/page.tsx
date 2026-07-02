import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { LocationForm } from '../location-form';

export const metadata: Metadata = {
  title: 'Add location — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-location page (T4.5). The middleware already requires a staff session to
 * reach `/locations`, but creating is a `LocationWrite` capability that isn't
 * linear by role (a MANAGER has it, a RECEPTIONIST does not), so the page itself
 * gates on the permission and bounces an under-privileged staffer to `/403`. The
 * form and the Server Action it calls both re-check, and the API enforces it again.
 */
export default async function NewLocationPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.LocationWrite)) {
    redirect('/403');
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/locations"
        className="text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        ← Back to locations
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Add location
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
          A new Iron Gym site — set its address, opening hours, and amenities so members can find
          and choose where to train.
        </p>
      </header>

      <LocationForm mode="create" />
    </div>
  );
}
