import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { LocationForm } from '../location-form';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  backLink: {
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

export const metadata: Metadata = {
  title: 'New location — Fit Admin',
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
    <div {...stylex.props(styles.page)}>
      <Link href="/locations" {...stylex.props(styles.backLink)}>
        ← Back to locations
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>New location</h1>
        <p {...stylex.props(styles.subtitle)}>
          Add a branch to your gym. Set its address, opening hours, and amenities so members can
          find and choose where to train.
        </p>
      </header>

      <LocationForm mode="create" />
    </div>
  );
}
