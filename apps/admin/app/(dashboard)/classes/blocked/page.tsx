import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import { Permission, type AdminBookingBlock } from '@fit/types';
import { Card } from '@fit/ui-kit';
import { ClassesTabs } from '@/components/classes-tabs';
import { consoleCan } from '@/lib/console-permissions';
import { getConsolePermissions } from '@/lib/permissions-server';
import { gymCalendarContext } from '@/lib/gym-time';
import { listBookingBlocks } from '@/lib/api';
import { BookingBlocksTable } from './booking-blocks-table';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  const t = await getTranslations('admin.bookingBlocks');
  return { title: t('title') };
}
const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  description: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  error: {
    padding: '1rem',
    color: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
});
export default async function BlockedMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('admin.bookingBlocks');
  const { timeZone } = await gymCalendarContext();
  const showPast = (await searchParams).status === 'all';
  const canLift = consoleCan(await getConsolePermissions(), Permission.ClassAttendance);
  if (!canLift) redirect('/403');
  let blocks: AdminBookingBlock[] = [];
  let failed = false;
  try {
    ({ blocks } = await listBookingBlocks({ status: showPast ? 'all' : 'active' }));
  } catch {
    failed = true;
  }
  return (
    <div {...stylex.props(styles.page)}>
      <ClassesTabs />
      <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
      <p {...stylex.props(styles.description)}>{t('description')}</p>
      {failed ? (
        <Card xstyle={styles.error}>
          <p role="alert">{t('loadFailed')}</p>
        </Card>
      ) : (
        <BookingBlocksTable
          blocks={blocks}
          timeZone={timeZone}
          showPast={showPast}
          canLift={canLift}
        />
      )}
    </div>
  );
}
