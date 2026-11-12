import type { GymOnboardingStatus } from '@fit/types';
import { Badge, type BadgeTone } from '@fit/ui-kit';

const statuses: Record<GymOnboardingStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Link sent', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'pending' },
  CODE_SENT: { label: 'Code sent', tone: 'pending' },
  SUBMITTED: { label: 'Needs approval', tone: 'accent' },
  APPROVED: { label: 'Approved', tone: 'positive' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

export function RequestStatus({ status }: { status: GymOnboardingStatus }) {
  return <Badge {...statuses[status]} />;
}

export function requestDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}
