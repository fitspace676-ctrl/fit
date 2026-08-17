import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMember } from '@/lib/api';
import { Icon } from '@/components/ui';
import { MemberForm } from '../../member-form';

export const metadata: Metadata = {
  title: 'Edit member - Fit Admin',
};

// Reflects the staff session and writes live member state — never cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  errorPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
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
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: 'var(--color-error-muted)',
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
 * Edit-a-member page (T4.3). Like {@link NewMemberPage} it gates on the
 * `MemberWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link MemberForm} prefilled from `GET /members/:id`. A `404` from the
 * API — unknown or cross-tenant id — becomes Next's `notFound()`; the email is
 * shown read-only as the immutable auth identity.
 */
export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.MemberWrite)) {
    redirect('/403');
  }

  const t = await getTranslations('admin.members');

  let member;
  try {
    member = await fetchMember(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? t('errors.loadMember', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/members" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          {t('nav.backToMembers')}
        </Link>
        <Card padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <Link href="/members" {...stylex.props(styles.crumbLink)}>
          {t('breadcrumb.members')}
        </Link>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <Link href={`/members/${id}`} {...stylex.props(styles.crumbLink)}>
          {member.name}
        </Link>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{t('editPage.breadcrumb')}</span>
      </nav>

      <Link href={`/members/${id}`} {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('nav.backToMember')}
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('editPage.title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('editPage.subtitle', { name: member.name })}</p>
      </header>

      <MemberForm
        mode="edit"
        memberId={id}
        initial={{
          name: member.name,
          email: member.email,
          phone: member.phone ?? '',
          // The date input needs a `YYYY-MM-DD` value, so trim the ISO instant.
          dateOfBirth: member.dateOfBirth ? member.dateOfBirth.slice(0, 10) : '',
          personalId: member.personalId ?? '',
          gender: member.gender ?? '',
          address: member.address ?? '',
          emergencyContactName: member.emergencyContactName ?? '',
          emergencyContactPhone: member.emergencyContactPhone ?? '',
          medicalNotes: member.medicalNotes ?? '',
        }}
      />
    </div>
  );
}
