import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplate } from '@/lib/api';
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
        <Link href="/classes" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to classes
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  const status = STATUS_STYLES[template.status] ?? {
    label: template.status,
    className: 'bg-slate-100 text-slate-600',
  };

  // Write controls (edit + pause) are a `ClassWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/classes" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to classes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: template.color }}
            />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{template.title}</h1>
            <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
            {template.category ? (
              <span className="rounded-card bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {template.category}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">{template.recurrence}</p>
        </div>
        {canWrite ? <TemplateActions templateId={template.id} status={template.status} /> : null}
      </header>

      <section className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">Capacity</span>
          <span className="text-slate-800">{template.capacity} spots</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">Duration</span>
          <span className="text-slate-800">{formatDuration(template.durationMinutes)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">Trainer</span>
          <span className="text-slate-800">{template.trainerName ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">Location</span>
          <span className="text-slate-800">
            {template.locationName ?? '—'}
            {template.room ? ` · ${template.room}` : ''}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">Runs</span>
          <span className="text-slate-800">
            {formatDate(template.validFrom)} –{' '}
            {template.validUntil ? formatDate(template.validUntil) : 'open-ended'}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-slate-500">Recurrence rule</span>
        <code className="w-fit rounded-card bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">
          {template.rrule}
        </code>
      </section>

      {template.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">Description</h2>
          <p className="max-w-2xl whitespace-pre-line text-sm text-slate-700">
            {template.description}
          </p>
        </section>
      ) : null}

      <p className="text-xs text-slate-400">Added {formatDateTime(template.createdAt)}.</p>
    </div>
  );
}
