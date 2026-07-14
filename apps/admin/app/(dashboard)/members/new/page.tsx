import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, gymMemberIntakeSettingsSchema, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { fetchGymSettings } from '@/lib/api';
import { Icon } from '@/components/ui';
import { MemberForm } from '../member-form';

export const metadata: Metadata = {
  title: 'New member — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbLink: {
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
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
 * Create-a-member page (T4.3). The middleware already requires a staff session to
 * reach `/members`, but creating is a `MemberWrite` capability that isn't linear
 * by role (a RECEPTIONIST has it, a TRAINER does not), so the page itself gates on
 * the permission and bounces an under-privileged staffer to `/403`. The form and
 * the Server Action it calls both re-check, and the API enforces it again.
 */
export default async function NewMemberPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.MemberWrite)) {
    redirect('/403');
  }

  const t = await getTranslations('admin.members');

  // The form's field visibility is config-driven (Settings → Membership); fall back to
  // schema defaults if the settings fetch fails so the form still renders.
  const memberIntake = await fetchGymSettings()
    .then((s) => s.memberIntake)
    .catch(() => gymMemberIntakeSettingsSchema.parse({}));

  return (
    <div {...stylex.props(styles.page)}>
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <Link href="/members" {...stylex.props(styles.crumbLink)}>
          {t('breadcrumb.members')}
        </Link>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{t('list.addMember')}</span>
      </nav>

      <Link href="/members" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('nav.backToMembers')}
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('list.addMember')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('newPage.subtitle')}</p>
      </header>

      <MemberForm mode="create" intake={memberIntake} />
    </div>
  );
}
