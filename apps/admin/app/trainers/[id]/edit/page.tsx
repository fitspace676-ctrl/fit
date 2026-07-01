import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
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
        <Link
          href="/trainers"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          Back to trainers
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

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/trainers/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to trainer
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Edit trainer
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Update {trainer.name}’s profile and photo.
        </p>
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
