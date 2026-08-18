import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, WEEKDAYS, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocation } from '@/lib/api';
import { Badge, Card, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { formatDayHours, weekdayLabel } from '../format-hours';
import { LocationActions } from './location-actions';
import { createDateTimeFormat, defaultLocale } from '@fit/i18n';

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
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  metaLine: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  photo: {
    maxHeight: '16rem',
    width: '100%',
    maxWidth: '36rem',
    borderRadius: 'var(--radius-container)',
    objectFit: 'cover',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionHeading: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  amenityWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  amenityTag: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  hoursList: {
    margin: 0,
    maxWidth: '24rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  hoursRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: '0.875rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    borderTopWidth: {
      default: '1px',
      ':first-child': 0,
    },
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  hoursDay: {
    color: 'var(--color-text-secondary)',
  },
  hoursClosed: {
    color: 'var(--color-text-secondary)',
  },
  hoursOpen: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  footnote: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export const metadata: Metadata = {
  title: 'Location - FormaCore Admin',
};

// The detail reflects live location state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '-'
    : createDateTimeFormat(defaultLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
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
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/locations" {...stylex.props(styles.backLink)}>
          ← Back to locations
        </Link>
        <Card padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }

  const status = STATUS_LABELS[location.status] ?? {
    label: location.status,
    tone: 'ink' as BadgeTone,
  };

  // Write controls (edit + deactivate) are a `LocationWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.LocationWrite);

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/locations" {...stylex.props(styles.backLink)}>
        ← Back to locations
      </Link>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headText)}>
          <div {...stylex.props(styles.titleRow)}>
            <h1 {...stylex.props(styles.title)}>{location.name}</h1>
            <Badge tone={status.tone} label={status.label} />
          </div>
          {location.address ? <p {...stylex.props(styles.metaLine)}>{location.address}</p> : null}
          {location.phone ? <p {...stylex.props(styles.metaLine)}>{location.phone}</p> : null}
        </div>
        {canWrite ? <LocationActions locationId={location.id} status={location.status} /> : null}
      </header>

      {location.photoUrl ? (
        <img
          src={location.photoUrl}
          alt={`${location.name} photo`}
          {...stylex.props(styles.photo)}
        />
      ) : null}

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Amenities</h2>
        {location.amenities.length > 0 ? (
          <div {...stylex.props(styles.amenityWrap)}>
            {location.amenities.map((tag) => (
              <span key={tag} {...stylex.props(styles.amenityTag)}>
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p {...stylex.props(styles.emptyText)}>No amenities listed.</p>
        )}
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Opening hours</h2>
        <dl {...stylex.props(styles.hoursList)}>
          {WEEKDAYS.map((day) => (
            <div key={day} {...stylex.props(styles.hoursRow)}>
              <dt {...stylex.props(styles.hoursDay)}>{weekdayLabel(day)}</dt>
              <dd
                {...stylex.props(
                  location.hours[day].closed ? styles.hoursClosed : styles.hoursOpen,
                )}
              >
                {formatDayHours(location.hours[day])}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p {...stylex.props(styles.footnote)}>Added {formatDate(location.createdAt)}.</p>
    </div>
  );
}
