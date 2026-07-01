import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplate } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { ClassTemplateForm } from '../../class-template-form';
import { loadRelationOptions } from '../../options';

export const metadata: Metadata = {
  title: 'Edit class — Fit Admin',
};

// Reflects the staff session and writes live template state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-class-template page (T5.2). Like {@link NewClassTemplatePage} it gates on
 * the `ClassWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link ClassTemplateForm} prefilled from `GET /admin/classes/:id` — the
 * stored `rrule` is re-parsed into the visual recurrence editor. A `404` from the
 * API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditClassTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ClassWrite)) {
    redirect('/403');
  }

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

  const { trainers, locations } = await loadRelationOptions();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/classes/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to class
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Edit class
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Update {template.title}’s details, schedule, capacity, duration, and default trainer and
          location.
        </p>
      </header>

      <ClassTemplateForm
        mode="edit"
        templateId={id}
        trainers={trainers}
        locations={locations}
        initial={{
          title: template.title,
          description: template.description,
          category: template.category,
          trainerId: template.trainerId,
          locationId: template.locationId,
          room: template.room,
          capacity: template.capacity,
          durationMinutes: template.durationMinutes,
          rrule: template.rrule,
          color: template.color,
          validFrom: template.validFrom,
          validUntil: template.validUntil,
        }}
      />
    </div>
  );
}
