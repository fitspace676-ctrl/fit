import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer } from '@/lib/api';
import { Icon } from '@/components/ui';
import { TrainerForm } from '../../trainer-form';

export const metadata: Metadata = {
  title: 'Edit trainer - FormaCore Admin',
};

// Reflects the staff session and writes live trainer state — never cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-text-primary)',
    },
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
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
  errorStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    padding: '1rem',
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
 * Edit-a-trainer page (T4.4). Like {@link NewTrainerPage} it gates on the
 * `TrainerWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link TrainerForm} prefilled from `GET /admin/trainers/:id`. A `404`
 * from the API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditTrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('admin.trainers');

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
        ? t('errors.loadTrainer', { status: error.status, message: error.message })
        : t('errors.unreachable');
    return (
      <div {...stylex.props(styles.errorStack)}>
        <Link href="/trainers" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          {t('form.backToTrainers')}
        </Link>
        <div {...stylex.props(styles.errorCard)}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <Link href={`/trainers/${id}`} {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('form.backToTrainer')}
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('form.editTitle')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('form.editSubtitle', { name: trainer.name })}</p>
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
