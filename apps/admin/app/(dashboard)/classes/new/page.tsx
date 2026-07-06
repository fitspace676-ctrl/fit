import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Icon } from '@/components/ui';
import { ClassTemplateForm } from '../class-template-form';
import { loadRelationOptions } from '../options';

export const metadata: Metadata = {
  title: 'New class — Fit Admin',
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
    color: 'var(--color-text-accent)',
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
 * Create-a-class-template page (T5.2). The middleware already requires a staff
 * session to reach `/classes`, but creating is a `ClassWrite` capability that
 * isn't linear by role (a MANAGER has it, a RECEPTIONIST does not), so the page
 * itself gates on the permission and bounces an under-privileged staffer to
 * `/403`. The form and the Server Action it calls both re-check, and the API
 * enforces it again. The gym's active trainers + locations are loaded for the
 * form's optional default-assignment selects.
 */
export default async function NewClassTemplatePage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ClassWrite)) {
    redirect('/403');
  }

  const { trainers, locations } = await loadRelationOptions();

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/classes" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        Back to classes
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>New class</h1>
        <p {...stylex.props(styles.subtitle)}>
          Add a recurring class to your gym. Set its capacity and duration, build the schedule with
          the visual recurrence editor, and pick a default trainer and location.
        </p>
      </header>

      <ClassTemplateForm mode="create" trainers={trainers} locations={locations} />
    </div>
  );
}
