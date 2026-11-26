import { ChangePasswordForm } from './change-password-form';
import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Avatar } from '@astryxdesign/core/Avatar';
import { getServerSession } from '@/lib/session';
import { getActiveGymSlug, getGymBrand } from '@/lib/active-gym';
import { consoleBrandAssets } from '@/lib/brand-skins';
import { fetchMyProfile } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Your account and the gym you are managing.',
};

// The profile reflects the live staff session, so it must never be statically
// rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    maxWidth: '42rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.125rem',
    paddingBlockEnd: '0.5rem',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    flex: 1,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
    textWrap: 'balance',
    color: 'var(--color-text-primary)',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  rolePill: {
    display: 'inline-flex',
    alignItems: 'center',
    paddingBlock: '0.1875rem',
    paddingInline: '0.625rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    fontSize: '0.8125rem',
    fontWeight: 650,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
  },
  sectionLabel: {
    margin: 0,
    marginBlockEnd: '0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 650,
    color: 'var(--color-text-secondary)',
  },
  gym: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    minWidth: 0,
  },
  // Fixed height, width follows the logo: a square mark stays square, a
  // wordmark widens up to a cap instead of shrinking into a square.
  gymMark: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '3.5rem',
    maxWidth: 'min(12rem, 45%)',
    height: '3.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  gymLogo: {
    display: 'block',
    width: 'auto',
    maxWidth: '100%',
    height: '100%',
    boxSizing: 'border-box',
    objectFit: 'contain',
    padding: '0.375rem',
  },
  gymInitial: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    color: 'var(--color-text-accent)',
  },
  gymText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    minWidth: 0,
  },
  gymName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '1.0625rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  gymSlug: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  empty: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '1rem',
    paddingBlock: '0.75rem',
    borderBlockStartWidth: '1px',
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: 'var(--color-border)',
  },
  rowKey: {
    flexShrink: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  rowValue: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'end',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  rowValueMono: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 500,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    userSelect: 'all',
  },
});

const STAFF_ROLES = ['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER'] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** Title-case a role token (`OWNER` → `Owner`) for roles without a translation. */
function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/** The signed-in staffer's gym profile and verified session role. */
export default async function ProfilePage() {
  const [t, tStaff, session, hostSlug, profile] = await Promise.all([
    getTranslations('admin.profile'),
    getTranslations('admin.staff'),
    getServerSession(),
    getActiveGymSlug(),
    fetchMyProfile().catch(() => null),
  ]);

  // The host names the gym behind the tenant proxy; opened directly, the
  // session's own gym is the one this staffer works for.
  const gymSlug = hostSlug ?? session?.gymSlug ?? null;
  const gym = await getGymBrand(gymSlug);
  const gymName = gym?.name ?? gymSlug;
  const gymLogo = gym?.logoUrl ?? consoleBrandAssets(gymSlug)?.icon ?? null;

  const role = session?.role ?? 'MEMBER';
  const roleName = isStaffRole(role) ? tStaff(`roles.${role}`) : roleLabel(role);
  const name = profile?.profile.name || roleName;

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <Avatar name={name} size={64} />
        <div {...stylex.props(styles.headerText)}>
          <h1 {...stylex.props(styles.title)}>{name}</h1>
          <div {...stylex.props(styles.meta)}>
            <span {...stylex.props(styles.rolePill)}>{roleName}</span>
            {gymName ? <span>{gymName}</span> : null}
          </div>
        </div>
      </header>

      <Card padding="sm" xstyle={styles.card}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('gym')}</h2>
        {gymName ? (
          <div {...stylex.props(styles.gym)}>
            <div {...stylex.props(styles.gymMark)}>
              {gymLogo ? (
                <img src={gymLogo} alt="" {...stylex.props(styles.gymLogo)} />
              ) : (
                <span aria-hidden {...stylex.props(styles.gymInitial)}>
                  {gymName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div {...stylex.props(styles.gymText)}>
              <span {...stylex.props(styles.gymName)}>{gymName}</span>
              {gymSlug ? <span {...stylex.props(styles.gymSlug)}>{gymSlug}</span> : null}
            </div>
          </div>
        ) : (
          <p {...stylex.props(styles.empty)}>{t('noGym')}</p>
        )}
      </Card>

      <Card padding="sm" xstyle={styles.card}>
        <h2 {...stylex.props(styles.sectionLabel)}>{t('accountSection')}</h2>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.rowKey)}>{t('role')}</span>
          <span {...stylex.props(styles.rowValue)}>{roleName}</span>
        </div>
        {session?.userId ? (
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowKey)}>{t('userId')}</span>
            <span {...stylex.props(styles.rowValue, styles.rowValueMono)}>{session.userId}</span>
          </div>
        ) : null}
      </Card>
      <ChangePasswordForm />
    </div>
  );
}
