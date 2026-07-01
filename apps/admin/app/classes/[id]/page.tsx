import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplate } from '@/lib/api';
import { Badge, Card, Icon } from '@/components/ui';
import { STATUS_STYLES, formatDate, formatDateTime, formatDuration } from '../format';
import { TemplateActions } from './template-actions';

export const metadata: Metadata = {
  title: 'Class — Fit Admin',
};

// The detail reflects live template state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

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
      <div className="flex flex-col gap-4">
        <Link
          href="/classes"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          Back to classes
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

  const status = STATUS_STYLES[template.status] ?? {
    label: template.status,
    tone: 'ink' as const,
  };

  // Write controls (edit + pause) are a `ClassWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  const labelClass =
    'font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/classes"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to classes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: template.color }}
            />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              {template.title}
            </h1>
            <Badge tone={status.tone}>{status.label}</Badge>
            {template.category ? <Badge tone="ink">{template.category}</Badge> : null}
          </div>
          <p className="text-sm text-ink-600 dark:text-ink-300">{template.recurrence}</p>
        </div>
        {canWrite ? <TemplateActions templateId={template.id} status={template.status} /> : null}
      </header>

      <Card className="flex flex-wrap gap-x-10 gap-y-4 p-5 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className={labelClass}>Capacity</span>
          <span className="text-ink-800 dark:text-ink-100">{template.capacity} spots</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={labelClass}>Duration</span>
          <span className="text-ink-800 dark:text-ink-100">
            {formatDuration(template.durationMinutes)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={labelClass}>Trainer</span>
          <span className="text-ink-800 dark:text-ink-100">{template.trainerName ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={labelClass}>Location</span>
          <span className="text-ink-800 dark:text-ink-100">
            {template.locationName ?? '—'}
            {template.room ? ` · ${template.room}` : ''}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={labelClass}>Runs</span>
          <span className="text-ink-800 dark:text-ink-100">
            {formatDate(template.validFrom)} –{' '}
            {template.validUntil ? formatDate(template.validUntil) : 'open-ended'}
          </span>
        </div>
      </Card>

      <section className="flex flex-col gap-1">
        <span className={labelClass}>Recurrence rule</span>
        <code className="w-fit rounded-field bg-ink-50 px-2 py-1 font-mono text-xs text-ink-500 dark:bg-white/5 dark:text-ink-400">
          {template.rrule}
        </code>
      </section>

      {template.description ? (
        <section className="flex flex-col gap-2">
          <h2 className={labelClass}>Description</h2>
          <p className="max-w-2xl whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">
            {template.description}
          </p>
        </section>
      ) : null}

      <p className="text-xs text-ink-400">Added {formatDateTime(template.createdAt)}.</p>
    </div>
  );
}
