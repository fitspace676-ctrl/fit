import * as stylex from '@stylexjs/stylex';
import { Badge, type BadgeTone } from '@fit/ui-kit';
import type { GymOnboardingStatus } from '@fit/types';

const STATUS: Record<GymOnboardingStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'pending' },
  COMPLETED: { label: 'Completed', tone: 'positive' },
  EXPIRED: { label: 'Expired', tone: 'danger' },
};

const styles = stylex.create({
  avatar: {
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
    flexShrink: 0,
    borderRadius: '999px',
    backgroundColor: 'var(--ops-ink-100)',
    color: 'var(--ops-ink-700)',
    fontSize: '0.71875rem',
    fontWeight: 700,
  },
  owner: {
    width: '2.75rem',
    height: '2.75rem',
    backgroundColor: 'var(--ops-forma-950)',
    color: 'var(--ops-white)',
    fontSize: '0.875rem',
  },
});

export function InitialsAvatar({
  name,
  email,
  owner = false,
}: {
  name: string | null;
  email: string;
  owner?: boolean;
}) {
  const initials = name?.trim()
    ? name
        .trim()
        .split(/\s+/)
        .map((word) => Array.from(word)[0])
        .slice(0, 2)
        .join('')
    : Array.from(email)[0];
  return (
    <span aria-hidden="true" {...stylex.props(styles.avatar, owner && styles.owner)}>
      {initials?.toUpperCase()}
    </span>
  );
}

export function OnboardingStatusBadge({ status }: { status: GymOnboardingStatus }) {
  return <Badge label={STATUS[status].label} tone={STATUS[status].tone} />;
}
