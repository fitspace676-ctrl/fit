import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Icon } from '@/components/ui';
import { TrainerForm } from '../trainer-form';

export const metadata: Metadata = {
  title: 'New trainer - FormaCore Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
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
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Create-a-trainer page (T4.4). The middleware already requires a staff session to
 * reach `/trainers`, but creating is a `TrainerWrite` capability that isn't linear
 * by role (a MANAGER has it, a RECEPTIONIST does not), so the page itself gates on
 * the permission and bounces an under-privileged staffer to `/403`. The form and
 * the Server Action it calls both re-check, and the API enforces it again.
 */
export default async function NewTrainerPage() {
  const t = await getTranslations('admin.trainers');
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.TrainerWrite)) {
    redirect('/403');
  }

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/trainers" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('form.backToTrainers')}
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('form.newTitle')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('form.newSubtitle')}</p>
      </header>

      <TrainerForm mode="create" />
    </div>
  );
}
