import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocation } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { LocationForm } from '../../location-form';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  errorPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
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
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

export const metadata: Metadata = {
  title: 'Edit location - Fit Admin',
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
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/locations" {...stylex.props(styles.backLink)}>
          ← Back to locations
        </Link>
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <Link href={`/locations/${id}`} {...stylex.props(styles.backLink)}>
        ← Back to location
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Edit location</h1>
        <p {...stylex.props(styles.subtitle)}>
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
