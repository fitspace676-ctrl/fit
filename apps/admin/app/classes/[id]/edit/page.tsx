import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplate } from '@/lib/api';
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
        <Link href="/classes" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to classes
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  const { trainers, locations } = await loadRelationOptions();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/classes/${id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to class
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit class</h1>
        <p className="text-sm text-slate-500">
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
