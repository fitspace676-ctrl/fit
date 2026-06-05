import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer } from '@/lib/api';
import { TrainerForm } from '../../trainer-form';

export const metadata: Metadata = {
  title: 'Edit trainer — Fit Admin',
};

// Reflects the staff session and writes live trainer state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-trainer page (T4.4). Like {@link NewTrainerPage} it gates on the
 * `TrainerWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link TrainerForm} prefilled from `GET /admin/trainers/:id`. A `404`
 * from the API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditTrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.TrainerWrite)) {
    redirect('/403');
  }

  let trainer;
  try {
    trainer = await fetchTrainer(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this trainer (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link href="/trainers" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to trainers
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
        href={`/trainers/${id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to trainer
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit trainer</h1>
        <p className="text-sm text-slate-500">Update {trainer.name}’s profile and photo.</p>
      </header>

      <TrainerForm
        mode="edit"
        trainerId={id}
        initial={{
          name: trainer.name,
          headline: trainer.headline,
          bio: trainer.bio,
          photoUrl: trainer.photoUrl,
          specialties: trainer.specialties,
        }}
      />
    </div>
  );
}
