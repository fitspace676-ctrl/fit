'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { formatBookingBlockDate } from '@/lib/booking-block-format';
import type { AdminBookingBlock } from '@fit/types';
import { Badge, Card, DataTable, Switch, type Column } from '@fit/ui-kit';
import { BookingBlockAction } from '../../members/[id]/booking-block-action';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  link: { color: 'var(--color-text-accent)', fontWeight: 500 },
  empty: { paddingInline: '1rem', paddingBlock: '3rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
});
export function BookingBlocksTable({ blocks, showPast, canLift, timeZone }: {
  blocks: AdminBookingBlock[]; showPast: boolean; canLift: boolean; timeZone: string;
}) {
  const t = useTranslations('admin.bookingBlocks');
  const locale = useLocale();
  const router = useRouter();
  const date = (iso: string) => formatBookingBlockDate(iso, locale, timeZone);
  const columns: ReadonlyArray<Column<AdminBookingBlock>> = [
    { key: 'member', header: t('member'), cell: (block) => <Link href={`/members/${block.memberId}`} {...stylex.props(styles.link)}>{block.memberName || block.memberEmail}</Link> },
    { key: 'count', header: t('count'), cell: (block) => block.noShowCount },
    { key: 'since', header: t('since'), cell: (block) => date(block.startsAt) },
    { key: 'until', header: t('untilColumn'), cell: (block) => date(block.endsAt) },
    ...(showPast ? [{ key: 'history', header: t('history'), cell: (block: AdminBookingBlock) => block.liftedAt
      ? t('liftHistory', { date: date(block.liftedAt), name: block.liftedByName ?? t('automatic'), reason: t(block.liftReason === 'CORRECTION' ? 'correction' : 'staff') })
      : <Badge tone={block.active ? 'pending' : 'neutral'} label={t(block.active ? 'active' : 'expired')} /> }] : []),
    { key: 'action', header: t('actions'), cell: (block) => block.active && canLift ? <BookingBlockAction blockId={block.id} /> : null },
  ];
  return <div {...stylex.props(styles.stack)}>
    <Switch checked={showPast} onChange={(checked) => router.replace(checked ? '/classes/blocked?status=all' : '/classes/blocked')} label={t('includePast')} />
    {blocks.length === 0 ? <Card padding="none" xstyle={styles.empty}>{t(showPast ? 'emptyAll' : 'empty')}</Card>
      : <DataTable columns={columns} rows={blocks} rowKey={(block) => block.id} />}
  </div>;
}
