import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Avatar } from '@astryxdesign/core/Avatar';
import { getServerSession } from '@/lib/session';
import { getActiveGymSlug } from '@/lib/active-gym';

export const metadata: Metadata = {
  title: 'Profile - Fit Admin',
  description: 'Your account and the gym you are managing.',
};

// The profile reflects the live staff session, so it must never be statically
// rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '42rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  headerText: {
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
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  sectionLabel: {
    margin: 0,
    marginBlockEnd: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 650,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '1rem',
    paddingBlock: '0.625rem',
    borderBlockStartWidth: '1px',
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: 'var(--color-border)',
  },
  rowKey: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  rowValue: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  rowValueMono: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 500,
  },
});

/** Title-case a role token (`OWNER` → `Owner`). */
function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/**
 * The signed-in staffer's profile. The `/profile` route is already gated to an
 * authenticated session by `middleware.ts`, so this simply reflects the verified
 * session identity (role, user id) and the gym currently being managed. There is
 * no gym-scoped API call — everything shown comes from the session token itself.
 */
export default async function ProfilePage() {
  const t = await getTranslations('admin.profile');
  const [session, gymSlug] = await Promise.all([getServerSession(), getActiveGymSlug()]);

  const role = session?.role ?? 'MEMBER';
  const name = roleLabel(role);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <Avatar name={name} size={64} />
        <div {...stylex.props(styles.headerText)}>
          <h1 {...stylex.props(styles.title)}>{name}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        </div>
      </header>

      <Card variant="default" padding={4} xstyle={styles.card}>
        <p {...stylex.props(styles.sectionLabel)}>{t('accountSection')}</p>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.rowKey)}>{t('role')}</span>
          <span {...stylex.props(styles.rowValue)}>{name}</span>
        </div>
        <div {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.rowKey)}>{t('gym')}</span>
          <span {...stylex.props(styles.rowValue)}>{gymSlug ?? t('noGym')}</span>
        </div>
        {session?.userId ? (
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowKey)}>{t('userId')}</span>
            <span {...stylex.props(styles.rowValue, styles.rowValueMono)}>{session.userId}</span>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
