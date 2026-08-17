import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplate } from '@/lib/api';
import { Badge, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { STATUS_STYLES, formatDate, formatDateTime, formatDuration } from '../format';
import { TemplateActions } from './template-actions';

export const metadata: Metadata = {
  title: 'Class - Fit Admin',
};

// The detail reflects live template state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

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
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  swatch: {
    height: '1rem',
    width: '1rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  recurrence: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  infoCard: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: '2.5rem',
    rowGap: '1rem',
    padding: '1.25rem',
    fontSize: '0.875rem',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  statLabel: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  statValue: {
    color: 'var(--color-text-primary)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  descSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  codeBox: {
    width: 'fit-content',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  descText: {
    margin: 0,
    maxWidth: '42rem',
    whiteSpace: 'pre-line',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  footerText: {
    margin: 0,
    fontSize: '0.75rem',
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

/**
 * The class-template detail page (T5.2). Server-fetches `GET /admin/classes/:id`
 * and renders the identity header (colour + title + status), the recurrence
 * summary, the capacity / duration, the validity window, the default trainer /
 * location / room, and the description, plus the write controls for `ClassWrite`
 * staff. A `404` from the API — unknown or cross-tenant id — becomes Next's
 * `notFound()`; any other failure surfaces inline.
 */
export default async function ClassTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let template;
  try {
    template = await fetchClassTemplate(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this class (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/classes" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          Back to classes
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

  const status = STATUS_STYLES[template.status] ?? {
    label: template.status,
    tone: 'ink' as const,
  };

  // Write controls (edit + pause) are a `ClassWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/classes" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        Back to classes
      </Link>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <div {...stylex.props(styles.titleRow)}>
            <span
              aria-hidden
              {...stylex.props(styles.swatch)}
              style={{ backgroundColor: template.color }}
            />
            <h1 {...stylex.props(styles.title)}>{template.title}</h1>
            <Badge tone={status.tone} label={status.label} />
            {template.category ? <Badge tone="neutral" label={template.category} /> : null}
          </div>
          <p {...stylex.props(styles.recurrence)}>{template.recurrence}</p>
        </div>
        {canWrite ? <TemplateActions templateId={template.id} status={template.status} /> : null}
      </header>

      <Card padding="none" xstyle={styles.infoCard}>
        <div {...stylex.props(styles.stat)}>
          <span {...stylex.props(styles.statLabel)}>Capacity</span>
          <span {...stylex.props(styles.statValue)}>{template.capacity} spots</span>
        </div>
        <div {...stylex.props(styles.stat)}>
          <span {...stylex.props(styles.statLabel)}>Duration</span>
          <span {...stylex.props(styles.statValue)}>
            {formatDuration(template.durationMinutes)}
          </span>
        </div>
        <div {...stylex.props(styles.stat)}>
          <span {...stylex.props(styles.statLabel)}>Trainer</span>
          <span {...stylex.props(styles.statValue)}>{template.trainerName ?? '—'}</span>
        </div>
        <div {...stylex.props(styles.stat)}>
          <span {...stylex.props(styles.statLabel)}>Location</span>
          <span {...stylex.props(styles.statValue)}>
            {template.locationName ?? '—'}
            {template.room ? ` · ${template.room}` : ''}
          </span>
        </div>
        <div {...stylex.props(styles.stat)}>
          <span {...stylex.props(styles.statLabel)}>Runs</span>
          <span {...stylex.props(styles.statValue)}>
            {formatDate(template.validFrom)} –{' '}
            {template.validUntil ? formatDate(template.validUntil) : 'open-ended'}
          </span>
        </div>
      </Card>

      <section {...stylex.props(styles.section)}>
        <span {...stylex.props(styles.sectionLabel)}>Recurrence rule</span>
        <code {...stylex.props(styles.codeBox)}>{template.rrule}</code>
      </section>

      {template.description ? (
        <section {...stylex.props(styles.descSection)}>
          <h2 {...stylex.props(styles.sectionLabel)}>Description</h2>
          <p {...stylex.props(styles.descText)}>{template.description}</p>
        </section>
      ) : null}

      <p {...stylex.props(styles.footerText)}>Added {formatDateTime(template.createdAt)}.</p>
    </div>
  );
}
