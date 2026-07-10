'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { LoyaltyRewardType, RedemptionRow } from '@fit/types';
import {
  Badge,
  Btn,
  DataTable,
  FilterBar,
  FilterChips,
  Icon,
  Select,
  type Column,
  type FilterChip,
} from '@/components/ui';
import {
  REWARD_TYPE_ICONS,
  REDEMPTION_STATUS_TONES,
  formatDate,
  formatPoints,
} from './loyalty-meta';

/** The status chips, mapped to the `status` URL param ('' = all). */
const STATUS_TABS: readonly string[] = ['', 'pending', 'fulfilled', 'cancelled'];

/** The reward types the type filter offers, in display order. */
const TYPE_OPTIONS: readonly LoyaltyRewardType[] = [
  'pt_session',
  'day_pass',
  'guest_pass',
  'merchandise',
  'drink',
  'discount',
  'other',
];

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  header: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  headingTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  headingHint: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  memberName: { fontWeight: 500, color: 'var(--color-text-primary)' },
  rewardCell: { display: 'inline-flex', alignItems: 'center', gap: '0.375rem' },
  rewardIcon: { width: '0.875rem', height: '0.875rem', flexShrink: 0 },
  points: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  dateMono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  typeSelect: { minWidth: '11rem' },
  pagerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  pagerCount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  pagerBtns: { display: 'flex', gap: '0.5rem' },
  emptyWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    textAlign: 'center',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  emptyIconSvg: { width: '1.5rem', height: '1.5rem' },
  emptyTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The Redemptions tab (T12.11): the gym's reward redemptions on the Astryx
 * DataTable — member, reward (+ type), points spent, status and date — filtered
 * by status and reward type and server-paginated. Read-only; the filters and
 * page live in the URL, so the server page stays the single source of truth and
 * re-renders on change.
 */
export function RedemptionsView({
  redemptions,
  total,
  page,
  limit,
  status,
  type,
}: {
  redemptions: RedemptionRow[];
  total: number;
  page: number;
  limit: number;
  status: string;
  type: string;
}) {
  const t = useTranslations('admin.loyalty');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    // The Redemptions tab is `?tab=redemptions`; keep it across filter changes.
    params.set('tab', 'redemptions');
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function commit(key: string, value: string): void {
    startTransition(() => router.replace(hrefWith({ [key]: value, page: '' })));
  }

  const chips: FilterChip[] = STATUS_TABS.map((value) => ({
    value,
    label: value === '' ? t('redemptions.statusAll') : t(`redemptions.status.${value}`),
  }));

  const columns: ReadonlyArray<Column<RedemptionRow>> = [
    {
      key: 'member',
      header: t('redemptions.columns.member'),
      cell: (r) => <span {...stylex.props(styles.memberName)}>{r.memberName}</span>,
    },
    {
      key: 'reward',
      header: t('redemptions.columns.reward'),
      cell: (r) => (
        <span {...stylex.props(styles.rewardCell)}>
          <Icon name={REWARD_TYPE_ICONS[r.rewardType]} {...stylex.props(styles.rewardIcon)} />
          {r.rewardName}
        </span>
      ),
    },
    {
      key: 'points',
      header: t('redemptions.columns.points'),
      align: 'right',
      cell: (r) => (
        <span {...stylex.props(styles.points)}>
          {t('redemptions.pointsValue', { points: formatPoints(r.pointsSpent, locale) })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('redemptions.columns.status'),
      cell: (r) => (
        <Badge tone={REDEMPTION_STATUS_TONES[r.status]}>
          {t(`redemptions.status.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: 'redeemedAt',
      header: t('redemptions.columns.date'),
      align: 'right',
      cell: (r) => (
        <span {...stylex.props(styles.dateMono)}>{formatDate(r.redeemedAt, locale)}</span>
      ),
    },
  ];

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  const emptyState = (
    <div {...stylex.props(styles.emptyWrap)}>
      <span {...stylex.props(styles.emptyIcon)}>
        <Icon name="ticket" {...stylex.props(styles.emptyIconSvg)} />
      </span>
      <p {...stylex.props(styles.emptyTitle)}>{t('redemptions.emptyTitle')}</p>
      <p {...stylex.props(styles.emptyHint)}>{t('redemptions.emptyHint')}</p>
    </div>
  );

  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.header)}>
        <h2 {...stylex.props(styles.headingTitle)}>{t('redemptions.heading')}</h2>
        <p {...stylex.props(styles.headingHint)}>{t('redemptions.subheading')}</p>
      </div>

      <FilterChips
        chips={chips}
        active={status}
        onSelect={(value) => commit('status', value)}
        ariaLabel={t('redemptions.statusFilterLabel')}
      />

      <FilterBar>
        <div {...stylex.props(styles.typeSelect)}>
          <Select
            value={type}
            onChange={(e) => commit('type', e.target.value)}
            aria-label={t('redemptions.typeFilterLabel')}
          >
            <option value="">{t('redemptions.typeAll')}</option>
            {TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`rewardTypes.${value}`)}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <DataTable<RedemptionRow>
        columns={columns}
        rows={redemptions}
        rowKey={(r) => r.id}
        empty={emptyState}
        caption={t('redemptions.caption')}
      />

      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>
          {t('redemptions.showing', { from, to, total })}
        </span>
        <div {...stylex.props(styles.pagerBtns)}>
          <Btn
            v="outline"
            size="sm"
            icon="chevronLeft"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
          >
            {t('redemptions.previous')}
          </Btn>
          <Btn
            v="outline"
            size="sm"
            iconRight="chevronRight"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
          >
            {t('redemptions.next')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
